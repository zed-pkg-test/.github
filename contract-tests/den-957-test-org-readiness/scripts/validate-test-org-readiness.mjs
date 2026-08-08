import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('missing-test-orgs.json', root), 'utf8'));
const errors = [];
const credentialPrefixes = [
  ['gh', 'p_'],
  ['github', '_pat_'],
  ['cf', 'at_'],
  ['lin', '_api_'],
].map((parts) => parts.join(''));

if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
if (manifest.issue !== 'DEN-957') errors.push('issue must be DEN-957');
if (manifest.followUpIssueUrl !== 'https://github.com/ORESoftware/mcp-rust-libs/issues/20') {
  errors.push('unexpected follow-up issue URL');
}
if (manifest.requirements?.repository !== 'mcp-contract-e2e') {
  errors.push('required repository must be mcp-contract-e2e');
}
if (manifest.requirements?.pullRequestCredentials !== false) {
  errors.push('pull-request credentials must remain disabled');
}
if (manifest.requirements?.credentialFreeSnapshots !== true) {
  errors.push('credential-free snapshots must be required');
}

const targets = manifest.targets ?? [];
if (targets.length !== 4) errors.push(`expected 4 targets, got ${targets.length}`);
const organizations = new Set();
const repositories = new Set();
for (const target of targets) {
  if (!target.testOrganization?.endsWith('-test')) {
    errors.push(`test organization must end in -test: ${target.testOrganization}`);
  }
  if (target.expectedHttpStatus !== 404) {
    errors.push(`expected status must remain 404 until migration: ${target.testOrganization}`);
  }
  if (!target.productionRepository?.includes('/')) {
    errors.push(`invalid production repository: ${target.productionRepository}`);
  }
  if (organizations.has(target.testOrganization)) errors.push(`duplicate test organization: ${target.testOrganization}`);
  if (repositories.has(target.productionRepository)) errors.push(`duplicate production repository: ${target.productionRepository}`);
  organizations.add(target.testOrganization);
  repositories.add(target.productionRepository);
}

const serialized = JSON.stringify(manifest);
if (credentialPrefixes.some((prefix) => serialized.includes(prefix))) {
  errors.push('credential-shaped value found in readiness manifest');
}

if (process.argv.includes('--live')) {
  for (const target of targets) {
    const response = await fetch(`https://api.github.com/orgs/${encodeURIComponent(target.testOrganization)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'den-957-test-org-readiness',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'error',
    });
    if (response.status !== target.expectedHttpStatus) {
      errors.push(
        `${target.testOrganization}: expected HTTP ${target.expectedHttpStatus}, got ${response.status}; ` +
        'if the organization now exists, install the GitHub App, create mcp-contract-e2e, and migrate it to the full provenance harness',
      );
    } else {
      console.log(`${target.testOrganization}: HTTP ${response.status} (administrative prerequisite still open)`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}

console.log(`validated ${targets.length} DEN-957 test-organization prerequisites`);
