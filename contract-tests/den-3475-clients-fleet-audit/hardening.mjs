import fs from 'node:fs';
import path from 'node:path';
import { buildScaffoldWorkflow } from './lib.mjs';
import { runtimeMatrixDisabled } from './execution.mjs';
import {
  REQUIRED_RUNTIME_COUNT,
  REUSABLE_WORKFLOW_REF,
  RUN_URL,
  encodePathSegment,
  githubRequest,
  isDirectory,
  isFile,
  schemaText,
} from './support.mjs';

export async function getContent(fullName, filePath, ref) {
  return await githubRequest(`/repos/${fullName}/contents/${encodePathSegment(filePath)}?ref=${encodeURIComponent(ref)}`, { allow404: true });
}

export async function putContent(fullName, filePath, branch, message, content) {
  return await githubRequest(`/repos/${fullName}/contents/${encodePathSegment(filePath)}`, {
    method: 'PUT',
    body: { message, content: Buffer.from(content).toString('base64'), branch },
  });
}

export async function hardenRepository(repo, sourceSha, runtimes, report) {
  const changes = [];
  if (report.findings.some((item) => item.code === 'api-schema-missing')) {
    changes.push({ path: 'schema/api-surface.schema.json', content: schemaText });
    changes.push({
      path: 'schema/API_SURFACE_CONTRACT.md',
      content: `# Polyglot client API surface\n\nTracked by DEN-3475.\n\nCreate \`schema/api-surface.json\` from the adjacent JSON Schema. Declare every public and private class, method, function, interface, and type with a stable symbol ID. Each detected runtime under \`clients/\` must have an \`implemented\` mapping or an explicit, justified \`not-applicable\` mapping. Do not copy generated language names back into the canonical signature; the canonical contract is authoritative.\n`,
    });
  }
  const workflowsDir = path.join(report.localPath, '.github', 'workflows');
  let hasMatrix = false;
  if (isDirectory(workflowsDir)) {
    for (const name of fs.readdirSync(workflowsDir)) {
      const file = path.join(workflowsDir, name);
      if (isFile(file) && fs.readFileSync(file, 'utf8').includes('sdk-client-language-matrix.yml')) hasMatrix = true;
    }
  }
  if (!hasMatrix) {
    changes.push({
      path: '.github/workflows/clients-contract.yml',
      content: buildScaffoldWorkflow({
        repository: repo.fullName,
        disabledLanguages: runtimeMatrixDisabled(runtimes),
        reusableRef: REUSABLE_WORKFLOW_REF,
        defaultBranch: repo.defaultBranch,
      }),
    });
  }
  if (!changes.length) return null;

  const branch = 'automation/den-3475-clients-contract';
  const refPath = `/repos/${repo.fullName}/git/ref/heads/${encodePathSegment(branch)}`;
  const existingRef = await githubRequest(refPath, { allow404: true });
  if (existingRef.status === 404) {
    await githubRequest(`/repos/${repo.fullName}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: sourceSha } });
  }
  const applied = [];
  for (const change of changes) {
    const existing = await getContent(repo.fullName, change.path, branch);
    if (existing.status !== 404) continue;
    await putContent(repo.fullName, change.path, branch, 'ci: add DEN-3475 client conformance scaffold', change.content);
    applied.push(change.path);
  }
  const pulls = await githubRequest(`/repos/${repo.fullName}/pulls?state=open&head=${encodeURIComponent(`${repo.owner}:${branch}`)}&per_page=20`);
  let pull = Array.isArray(pulls.data) ? pulls.data[0] : null;
  if (!pull && (applied.length || changes.length)) {
    const body = [
      '## Summary',
      '',
      'Adds deterministic conformance scaffolding for the nightly `*-clients` audit tracked by DEN-3475.',
      '',
      '- canonical JSON Schema for public/private classes, methods, functions, interfaces, and types;',
      '- pinned reusable polyglot compile/test workflow;',
      '- no fabricated package-specific API symbols.',
      '',
      'The remaining semantic gaps are recorded in the repository issue and must be completed against the real source/API contract.',
      '',
      `Source tip audited: \`${sourceSha}\`.`,
      RUN_URL ? `Audit run: ${RUN_URL}` : '',
    ].filter(Boolean).join('\n');
    const created = await githubRequest(`/repos/${repo.fullName}/pulls`, {
      method: 'POST',
      body: { title: 'ci: add clients conformance scaffold (DEN-3475)', head: branch, base: repo.defaultBranch, body, draft: true },
    });
    pull = created.data;
  }
  return pull ? { url: pull.html_url, number: pull.number, applied } : { applied };
}

export async function upsertGapIssue(repo, report, hardening) {
  const title = '[DEN-3475] Nightly clients conformance gaps';
  const issues = await githubRequest(`/repos/${repo.fullName}/issues?state=open&per_page=100`);
  const existing = issues.data.find((issue) => !issue.pull_request && issue.title === title);
  const errors = report.findings.filter((item) => item.severity === 'error');
  const warnings = report.findings.filter((item) => item.severity === 'warning');
  const body = [
    'Tracked by Linear DEN-3475.',
    '',
    `Audited source: \`${report.sourceSha}\``,
    `Detected runtimes: **${report.runtimes.length}** (minimum ${REQUIRED_RUNTIME_COUNT})`,
    `Explicit test-org consumers: **${report.consumers.length}**`,
    `Errors: **${errors.length}**; warnings: **${warnings.length}**`,
    hardening?.url ? `Draft hardening PR: ${hardening.url}` : '',
    RUN_URL ? `Latest audit run: ${RUN_URL}` : '',
    '',
    '## Current findings',
    '',
    ...report.findings.slice(0, 80).map((item) => `- **${item.severity.toUpperCase()} / ${item.code}** — ${item.message}`),
    report.findings.length > 80 ? `- … ${report.findings.length - 80} additional findings are in the run artifact.` : '',
    '',
    'This issue is updated in place. The automation never marks missing implementations as passing and never fabricates API symbols.',
  ].filter(Boolean).join('\n');
  if (existing) {
    const updated = await githubRequest(`/repos/${repo.fullName}/issues/${existing.number}`, { method: 'PATCH', body: { body } });
    return updated.data.html_url;
  }
  const created = await githubRequest(`/repos/${repo.fullName}/issues`, { method: 'POST', body: { title, body } });
  return created.data.html_url;
}
