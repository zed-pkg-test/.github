#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { detectRuntimes, validateApiSurface } from './lib.mjs';
import {
  CONCURRENCY,
  GH_TOKEN,
  LINEAR_API_TOKEN,
  LINEAR_ISSUE,
  MODE,
  OUTPUT_DIR,
  REQUIRED_RUNTIME_COUNT,
  RUN_CONSUMERS,
  RUN_LANGUAGE_BUILDS,
  RUN_URL,
  cloneRepository,
  discoverRepositories,
  finding,
  isDirectory,
  isFile,
  redact,
  writeJson,
  writeText,
} from './support.mjs';
import {
  auditConsumers,
  prepareZedTips,
  runRuntimeBuild,
  runZedChecks,
} from './execution.mjs';
import { hardenRepository, upsertGapIssue } from './hardening.mjs';

async function auditRepository(repo, zed) {
  const report = {
    repository: repo.fullName,
    owner: repo.owner,
    testOrg: repo.testOrg,
    defaultBranch: repo.defaultBranch,
    private: repo.private,
    sourceSha: '',
    runtimes: [],
    apiSurface: null,
    zedChecks: [],
    languageChecks: [],
    consumers: [],
    findings: [],
    hardening: null,
    gapIssue: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    localPath: '',
  };
  const destination = path.join(WORK_DIR, 'clients', repo.owner, repo.name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  report.localPath = destination;
  const clone = await cloneRepository(repo.fullName, repo.defaultBranch, destination);
  if (!clone.ok) {
    report.findings.push(finding('error', 'checkout-failed', `Could not check out ${repo.fullName}.`, { log: clone.stderr.slice(-5000) }));
    report.finishedAt = new Date().toISOString();
    return report;
  }
  report.sourceSha = clone.stdout.trim();

  if (!isFile(path.join(destination, '.zpkg.toml'))) report.findings.push(finding('error', 'zpkg-manifest-missing', 'Missing root .zpkg.toml.'));
  if (!isFile(path.join(destination, '.zpkg.lock'))) report.findings.push(finding('error', 'zpkg-lock-missing', 'Missing committed root .zpkg.lock.'));
  if (!isDirectory(path.join(destination, 'clients'))) report.findings.push(finding('error', 'clients-root-missing', 'Missing top-level clients/ directory.'));

  const runtimes = detectRuntimes(destination);
  report.runtimes = runtimes.map(({ id, relativeRoot, image }) => ({ id, root: relativeRoot, image }));
  if (runtimes.length < REQUIRED_RUNTIME_COUNT) report.findings.push(finding('error', 'runtime-count', `Detected ${runtimes.length} substantive languages/runtimes under clients/; require at least ${REQUIRED_RUNTIME_COUNT}.`));

  const apiSurface = validateApiSurface(destination, runtimes);
  report.apiSurface = {
    schemaPath: apiSurface.schemaPath ? path.relative(destination, apiSurface.schemaPath).split(path.sep).join('/') : null,
    documentPath: apiSurface.documentPath ? path.relative(destination, apiSurface.documentPath).split(path.sep).join('/') : null,
    symbols: apiSurface.symbols,
  };
  report.findings.push(...apiSurface.findings);

  if (zed.zedBinary) {
    const checks = await runZedChecks(destination, zed.zedBinary);
    report.zedChecks = checks.map(({ name, result }) => ({ name, ok: result.ok, log: `${result.stdout}\n${result.stderr}`.slice(-6000) }));
    for (const check of report.zedChecks) if (!check.ok) report.findings.push(finding('error', `zed-${check.name}`, `zed ${check.name} failed against current zed-cli tip ${zed.tips.cli.sha}.`));
  } else {
    report.findings.push(finding('error', 'zed-cli-unavailable', 'Current zed-cli tip was not available for validation.'));
  }

  if (RUN_LANGUAGE_BUILDS) {
    for (const runtime of runtimes) {
      const result = await runRuntimeBuild(runtime, destination);
      report.languageChecks.push({ runtime: runtime.id, root: runtime.relativeRoot, ok: result.ok, log: `${result.stdout}\n${result.stderr}`.slice(-8000) });
      if (!result.ok) report.findings.push(finding('error', 'runtime-build', `${runtime.id} failed to compile or test from ${runtime.relativeRoot}.`));
    }
  }

  if (RUN_CONSUMERS) {
    try { await auditConsumers(repo, destination, zed.zedBinary, report); }
    catch (error) { report.findings.push(finding('error', 'consumer-audit', error.message)); }
  }

  if (MODE === 'harden') {
    try { report.hardening = await hardenRepository(repo, report.sourceSha, runtimes, report); }
    catch (error) { report.findings.push(finding('error', 'hardening-pr', `Unable to create/update safe hardening PR: ${error.message}`)); }
  }
  if (report.findings.length) {
    try { report.gapIssue = await upsertGapIssue(repo, report, report.hardening); }
    catch (error) { report.findings.push(finding('warning', 'gap-issue', `Unable to create/update repository gap issue: ${error.message}`)); }
  }

  report.localPath = undefined;
  report.finishedAt = new Date().toISOString();
  return report;
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function markdownSummary(state) {
  const errors = state.globalFindings.filter((item) => item.severity === 'error').length + state.reports.reduce((sum, report) => sum + report.findings.filter((item) => item.severity === 'error').length, 0);
  const warnings = state.globalFindings.filter((item) => item.severity === 'warning').length + state.reports.reduce((sum, report) => sum + report.findings.filter((item) => item.severity === 'warning').length, 0);
  const lines = [
    '# DEN-3475 nightly `*-clients` fleet audit',
    '',
    `- Mode: **${state.mode}**`,
    `- Started: ${state.startedAt}`,
    `- Finished: ${state.finishedAt}`,
    `- Client repositories: **${state.reports.length}**`,
    `- Errors: **${errors}**`,
    `- Warnings: **${warnings}**`,
    `- Current zed-cli tip: \`${state.zed.tips.cli.sha}\``,
    `- Current zed-api-server tip: \`${state.zed.tips.api.sha}\``,
    `- Current zed-interfaces tip: \`${state.zed.tips.interfaces.sha}\``,
    RUN_URL ? `- Run: ${RUN_URL}` : '',
    '',
    '| Repository | runtimes | symbols | consumers | errors | hardening |',
    '|---|---:|---:|---:|---:|---|',
  ].filter(Boolean);
  for (const report of state.reports) {
    const reportErrors = report.findings.filter((item) => item.severity === 'error').length;
    lines.push(`| ${report.repository} | ${report.runtimes.length} | ${report.apiSurface?.symbols || 0} | ${report.consumers.length} | ${reportErrors} | ${report.hardening?.url ? `[PR](${report.hardening.url})` : '—'} |`);
  }
  if (state.globalFindings.length) {
    lines.push('', '## Fleet-level findings', '');
    for (const item of state.globalFindings) lines.push(`- **${item.severity.toUpperCase()} / ${item.code}** — ${item.message}`);
  }
  lines.push('', 'Absence of this evidence is treated as a missed run. Missing implementations, missing consumers, and skipped checks are never reported as success.');
  return `${lines.join('\n')}\n`;
}

async function postLinearComment(summary) {
  if (!LINEAR_API_TOKEN) return { ok: false, skipped: true, reason: 'LINEAR_API_TOKEN is not configured' };
  async function query(queryText, variables) {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: LINEAR_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryText, variables }),
    });
    const data = await response.json();
    if (!response.ok || data.errors) throw new Error(redact(JSON.stringify(data.errors || data)));
    return data.data;
  }
  const issue = await query('query Issue($id: String!) { issue(id: $id) { id identifier } }', { id: LINEAR_ISSUE });
  const body = summary.length > 45000 ? `${summary.slice(0, 44500)}\n\nTruncated; see run artifact.` : summary;
  const result = await query('mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id } } }', { input: { issueId: issue.issue.id, body } });
  return { ok: Boolean(result.commentCreate.success), commentId: result.commentCreate.comment?.id };
}

async function main() {
  if (!GH_TOKEN) throw new Error('CLIENTS_AUDIT_GH_TOKEN (or approved fallback secret) is required; refusing a partial public-only audit');
  const state = {
    schemaVersion: 'zed-pkg-test.clients-fleet-audit.v1',
    mode: MODE,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    runUrl: RUN_URL || null,
    globalFindings: [],
    repositories: [],
    zed: null,
    reports: [],
    linear: null,
  };
  const repositories = await discoverRepositories();
  state.repositories = repositories;
  if (!repositories.length) state.globalFindings.push(finding('error', 'repository-discovery-empty', 'No accessible active repositories ending exactly in -clients were discovered.'));
  writeJson('repository-inventory.json', repositories);

  state.zed = await prepareZedTips(state.globalFindings);
  state.reports = await mapLimit(repositories, CONCURRENCY, async (repo, index) => {
    process.stdout.write(`\n=== [${index + 1}/${repositories.length}] ${repo.fullName} ===\n`);
    try { return await auditRepository(repo, state.zed); }
    catch (error) {
      return {
        repository: repo.fullName,
        owner: repo.owner,
        testOrg: repo.testOrg,
        defaultBranch: repo.defaultBranch,
        private: repo.private,
        sourceSha: '',
        runtimes: [], apiSurface: null, zedChecks: [], languageChecks: [], consumers: [],
        findings: [finding('error', 'unhandled-repository-error', error.stack || error.message)],
        hardening: null, gapIssue: null,
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      };
    }
  });
  state.finishedAt = new Date().toISOString();
  const preliminarySummary = markdownSummary(state);
  try { state.linear = await postLinearComment(preliminarySummary); }
  catch (error) {
    state.linear = { ok: false, error: redact(error.message) };
    state.globalFindings.push(finding('warning', 'linear-update', `Unable to update ${LINEAR_ISSUE}: ${error.message}`));
  }
  const summary = markdownSummary(state);
  writeJson('run-ledger.json', state);
  writeText('summary.md', summary);
  writeText('run-ledger.sha256', `${createHash('sha256').update(fs.readFileSync(path.join(OUTPUT_DIR, 'run-ledger.json'))).digest('hex')}  run-ledger.json`);
  writeJson('linear-update.json', state.linear);
  process.stdout.write(summary);
  const errors = state.globalFindings.some((item) => item.severity === 'error') || state.reports.some((report) => report.findings.some((item) => item.severity === 'error'));
  if (errors) process.exitCode = 1;
}

main().catch((error) => {
  const failure = {
    schemaVersion: 'zed-pkg-test.clients-fleet-audit.v1',
    mode: MODE,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    fatal: redact(error.stack || error.message),
  };
  writeJson('fatal.json', failure);
  writeText('summary.md', `# DEN-3475 clients fleet audit failed before completion\n\n${failure.fatal}\n`);
  console.error(failure.fatal);
  process.exitCode = 1;
});
