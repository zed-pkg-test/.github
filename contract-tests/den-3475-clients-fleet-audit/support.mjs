import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const REUSABLE_WORKFLOW_REF = process.env.REUSABLE_WORKFLOW_REF || '9b8b69c47c6a3704a33707d9162cd27cdf92c7d7';
export const REQUIRED_RUNTIME_COUNT = Number.parseInt(process.env.REQUIRED_RUNTIME_COUNT || '15', 10);
export const GH_TOKEN = process.env.CLIENTS_AUDIT_GH_TOKEN || process.env.GH_TOKEN || '';
export const LINEAR_API_TOKEN = process.env.LINEAR_API_TOKEN || process.env.LINEAR_TOKEN || '';
export const LINEAR_ISSUE = process.env.LINEAR_ISSUE || 'DEN-3475';
export const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || 'artifacts/den-3475');
export const WORK_DIR = path.resolve(process.env.WORK_DIR || path.join(os.tmpdir(), `den-3475-${process.pid}`));
export const COMMAND_TIMEOUT_MS = Number.parseInt(process.env.COMMAND_TIMEOUT_MS || String(20 * 60 * 1000), 10);
export const MAX_CONSUMERS = Number.parseInt(process.env.MAX_CONSUMERS_PER_PACKAGE || '24', 10);
export const RUN_LANGUAGE_BUILDS = process.env.RUN_LANGUAGE_BUILDS !== '0';
export const RUN_CONSUMERS = process.env.RUN_CONSUMERS !== '0';
export const RUN_ZED_TIP_CHECKS = process.env.RUN_ZED_TIP_CHECKS !== '0';
export const CONCURRENCY = Math.max(1, Number.parseInt(process.env.AUDIT_CONCURRENCY || '1', 10));
export const RUN_URL = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : '';

export const args = process.argv.slice(2);
export function argValue(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
}
export const MODE = argValue('--mode', process.env.AUDIT_MODE || 'audit');
export const MAX_REPOSITORIES = Number.parseInt(argValue('--max-repositories', process.env.MAX_REPOSITORIES || '0'), 10);
if (!['audit', 'harden'].includes(MODE)) throw new Error(`unsupported mode: ${MODE}`);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(WORK_DIR, { recursive: true });

export const schemaText = fs.readFileSync(new URL('./schema/api-surface.schema.json', import.meta.url), 'utf8');
export const secretValues = [GH_TOKEN, LINEAR_API_TOKEN].filter(Boolean);
export function redact(value) {
  let text = String(value ?? '');
  for (const secret of secretValues) text = text.split(secret).join('***');
  return text.replace(/gh[pousr]_[A-Za-z0-9_]+/g, '***').replace(/lin_api_[A-Za-z0-9_]+/g, '***');
}

export function finding(severity, code, message, details = {}) {
  return { severity, code, message: redact(message), ...details };
}

export async function run(label, command, commandArgs, options = {}) {
  const cwd = options.cwd || process.cwd();
  const timeoutMs = options.timeoutMs || COMMAND_TIMEOUT_MS;
  const env = { ...process.env, ...options.env };
  const startedAt = new Date().toISOString();
  process.stdout.write(`::group::${label}\n`);
  process.stdout.write(`cwd=${cwd}\n`);
  return await new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    const cap = 128 * 1024;
    child.stdout.on('data', (chunk) => {
      const text = redact(chunk.toString());
      process.stdout.write(text);
      stdout = (stdout + text).slice(-cap);
    });
    child.stderr.on('data', (chunk) => {
      const text = redact(chunk.toString());
      process.stderr.write(text);
      stderr = (stderr + text).slice(-cap);
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      process.stdout.write('::endgroup::\n');
      resolve({ ok: false, code: null, signal: null, timedOut, stdout, stderr: `${stderr}\n${redact(error.message)}`, startedAt, finishedAt: new Date().toISOString() });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      process.stdout.write('::endgroup::\n');
      resolve({ ok: code === 0 && !timedOut, code, signal, timedOut, stdout, stderr, startedAt, finishedAt: new Date().toISOString() });
    });
  });
}

export function encodePathSegment(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

export async function githubRequest(apiPath, options = {}) {
  const url = apiPath.startsWith('http') ? apiPath : `https://api.github.com${apiPath}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'den-3475-clients-audit',
    ...(options.headers || {}),
  };
  if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok && !(options.allow404 && response.status === 404) && !(options.allow422 && response.status === 422)) {
    const rateRemaining = response.headers.get('x-ratelimit-remaining');
    throw new Error(`GitHub ${response.status} ${options.method || 'GET'} ${apiPath}: ${redact(typeof data === 'string' ? data : JSON.stringify(data))}; rate_remaining=${rateRemaining}`);
  }
  return { status: response.status, data, headers: response.headers };
}

export async function paginate(apiPath) {
  const separator = apiPath.includes('?') ? '&' : '?';
  const output = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await githubRequest(`${apiPath}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(response.data)) throw new Error(`expected array from ${apiPath}`);
    output.push(...response.data);
    if (response.data.length < 100) break;
  }
  return output;
}

export function writeJson(name, value) {
  fs.writeFileSync(path.join(OUTPUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(name, value) {
  fs.writeFileSync(path.join(OUTPUT_DIR, name), value.endsWith('\n') ? value : `${value}\n`);
}

export function isFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

export function isDirectory(directory) {
  try { return fs.statSync(directory).isDirectory(); } catch { return false; }
}

export function parsePackageCoordinate(repoRoot, fallback) {
  const manifest = path.join(repoRoot, '.zpkg.toml');
  if (!isFile(manifest)) return fallback;
  const text = fs.readFileSync(manifest, 'utf8');
  const packageBlock = text.match(/\[package\]([\s\S]*?)(?:\n\[|$)/);
  const block = packageBlock?.[1] || text;
  const name = block.match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1];
  const organization = block.match(/^\s*(?:organization|org|owner)\s*=\s*["']([^"']+)["']/m)?.[1];
  return organization && name ? `${organization}/${name}` : name || fallback;
}

export function makeAskPass() {
  const file = path.join(WORK_DIR, 'git-askpass.sh');
  fs.writeFileSync(file, '#!/bin/sh\ncase "$1" in\n  *Username*) printf "%s\\n" "x-access-token" ;;\n  *) printf "%s\\n" "$GH_TOKEN" ;;\nesac\n');
  fs.chmodSync(file, 0o700);
  return file;
}
export const ASKPASS = makeAskPass();
export const gitEnv = {
  GIT_ASKPASS: ASKPASS,
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_NOSYSTEM: '1',
  GH_TOKEN,
};

export async function cloneRepository(fullName, defaultBranch, destination, expectedSha = '') {
  const clone = await run(`clone ${fullName}`, 'git', [
    '-c', 'protocol.file.allow=never',
    '-c', 'protocol.ext.allow=never',
    'clone', '--no-tags', '--filter=blob:none', '--recurse-submodules', '--shallow-submodules',
    '--depth=1', '--branch', defaultBranch, '--single-branch', '--', `https://github.com/${fullName}.git`, destination,
  ], { env: gitEnv, timeoutMs: 30 * 60 * 1000 });
  if (!clone.ok) return clone;
  if (expectedSha) {
    const current = await run(`read ${fullName} HEAD`, 'git', ['-C', destination, 'rev-parse', 'HEAD'], { env: gitEnv, timeoutMs: 60_000 });
    if (!current.ok) return current;
    if (current.stdout.trim() !== expectedSha) {
      const fetch = await run(`fetch exact ${fullName} tip`, 'git', ['-C', destination, 'fetch', '--no-tags', '--depth=1', 'origin', expectedSha], { env: gitEnv, timeoutMs: 10 * 60 * 1000 });
      if (!fetch.ok) return fetch;
      const detach = await run(`switch ${fullName} to exact tip`, 'git', ['-C', destination, 'switch', '--detach', expectedSha], { env: gitEnv, timeoutMs: 60_000 });
      if (!detach.ok) return detach;
    }
  }
  return await run(`verify ${fullName} HEAD`, 'git', ['-C', destination, 'rev-parse', 'HEAD'], { env: gitEnv, timeoutMs: 60_000 });
}

export async function resolveTip(fullName, ref = 'main') {
  const response = await githubRequest(`/repos/${fullName}/commits/${encodeURIComponent(ref)}`);
  return { repository: fullName, ref, sha: response.data.sha, url: response.data.html_url };
}

export async function discoverRepositories() {
  const repositories = await paginate('/user/repos?visibility=all&affiliation=owner,organization_member&sort=full_name&direction=asc');
  const unique = new Map();
  for (const repo of repositories) {
    if (repo.archived || repo.disabled) continue;
    if (!repo.name?.endsWith('-clients')) continue;
    if (repo.owner?.login?.toLowerCase().endsWith('-test')) continue;
    unique.set(repo.full_name.toLowerCase(), {
      fullName: repo.full_name,
      owner: repo.owner.login,
      name: repo.name,
      defaultBranch: repo.default_branch,
      private: repo.private,
      archived: repo.archived,
      htmlUrl: repo.html_url,
      testOrg: `${repo.owner.login}-test`,
    });
  }
  const sorted = [...unique.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  return MAX_REPOSITORIES > 0 ? sorted.slice(0, MAX_REPOSITORIES) : sorted;
}

