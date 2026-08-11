import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME_SPECS, scanFilesForReferences } from './lib.mjs';
import {
  GH_TOKEN,
  MAX_CONSUMERS,
  RUN_CONSUMERS,
  RUN_LANGUAGE_BUILDS,
  RUN_ZED_TIP_CHECKS,
  WORK_DIR,
  cloneRepository,
  finding,
  githubRequest,
  isDirectory,
  isFile,
  paginate,
  parsePackageCoordinate,
  resolveTip,
  run,
  writeJson,
  writeText,
} from './support.mjs';

export async function prepareZedTips(globalFindings) {
  const tips = {
    cli: await resolveTip('zed-pkg/zed-cli'),
    api: await resolveTip('zed-pkg/zed-api-server.rs'),
    interfaces: await resolveTip('zed-pkg/zed-interfaces'),
  };
  writeJson('zed-tips.json', tips);
  if (!RUN_ZED_TIP_CHECKS) return { tips, zedBinary: '' };

  const root = path.join(WORK_DIR, 'zed-tip');
  fs.mkdirSync(root, { recursive: true });
  const clones = [
    ['cli', tips.cli, path.join(root, 'zed-cli')],
    ['api', tips.api, path.join(root, 'zed-api-server')],
    ['interfaces', tips.interfaces, path.join(root, 'zed-interfaces')],
  ];
  for (const [label, tip, destination] of clones) {
    const result = await cloneRepository(tip.repository, tip.ref, destination, tip.sha);
    if (!result.ok) globalFindings.push(finding('error', `zed-${label}-checkout`, `Failed to check out ${tip.repository}@${tip.sha}`, { log: result.stderr.slice(-4000) }));
  }

  const cliRoot = path.join(root, 'zed-cli');
  const apiRoot = path.join(root, 'zed-api-server');
  const interfacesRoot = path.join(root, 'zed-interfaces');
  let zedBinary = '';
  if (isDirectory(cliRoot)) {
    const build = await run('build current zed-cli tip', 'cargo', ['build', '--release', '--locked'], { cwd: cliRoot, timeoutMs: 60 * 60 * 1000 });
    if (!build.ok) globalFindings.push(finding('error', 'zed-cli-tip-build', 'Current zed-cli tip failed to build.', { log: `${build.stdout}\n${build.stderr}`.slice(-8000) }));
    else {
      zedBinary = path.join(cliRoot, 'target', 'release', process.platform === 'win32' ? 'zed.exe' : 'zed');
      const version = await run('record zed-cli version', zedBinary, ['--version'], { timeoutMs: 60_000 });
      writeText('zed-version.txt', version.stdout || version.stderr || 'unknown');
    }
  }
  for (const [label, directory] of [['api', apiRoot], ['interfaces', interfacesRoot]]) {
    if (!isDirectory(directory)) continue;
    const check = await run(`compile current zed-${label} tip`, 'cargo', ['check', '--locked', '--workspace', '--all-targets'], { cwd: directory, timeoutMs: 60 * 60 * 1000 });
    if (!check.ok) globalFindings.push(finding('error', `zed-${label}-tip-check`, `Current zed ${label} tip failed cargo check.`, { log: `${check.stdout}\n${check.stderr}`.slice(-8000) }));
  }
  return { tips, zedBinary };
}

export function runtimeMatrixDisabled(detected) {
  const available = new Set(detected.map((runtime) => runtime.id));
  const matrix = [
    ['gleamlang', 'gleam'], ['erlang', 'erlang'], ['elixir', 'elixir'], ['dart', 'dart'],
    ['rust', 'rust'], ['java', 'java'], ['golang', 'go'], ['python3', 'python'], ['ruby', 'ruby'],
    ['php', 'php'], ['typescript-nodejs', 'typescript-node'], ['typescript-deno', 'typescript-deno'],
    ['typescript-bun', 'typescript-bun'], ['typescript-edge', 'typescript-edge'], ['kotlin', 'kotlin'],
    ['swift', 'swift'], ['zig', 'zig'], ['cpp', 'cpp'],
  ];
  return matrix.filter(([, runtime]) => !available.has(runtime)).map(([id]) => id).join(',');
}

export async function runRuntimeBuild(runtime, repoRoot) {
  const custom = [path.join(runtime.root, '.zed', 'audit.sh'), path.join(runtime.root, 'ci.sh')].find(isFile);
  if (custom) {
    return await run(`${runtime.id} custom client audit`, 'bash', [custom], {
      cwd: runtime.root,
      env: { CLIENTS_REPOSITORY_ROOT: repoRoot },
      timeoutMs: 30 * 60 * 1000,
    });
  }
  const docker = await run(`compile/test ${runtime.id}`, 'docker', [
    'run', '--rm', '--init', '--entrypoint', 'sh',
    '-v', `${runtime.root}:/work`, '-w', '/work',
    runtime.image, '-lc', runtime.command,
  ], { timeoutMs: 35 * 60 * 1000 });
  return docker;
}

export async function runZedChecks(repoRoot, zedBinary) {
  const results = [];
  if (!zedBinary || !isFile(zedBinary)) return results;
  for (const [name, commandArgs] of [
    ['validate', ['validate', '--manifest', '.zpkg.toml', '--lock', '.zpkg.lock', '--require-lock', '--json']],
    ['release-plan', ['release', 'plan', '--json']],
    ['pack', ['pack']],
  ]) {
    results.push({ name, result: await run(`zed ${name}`, zedBinary, commandArgs, { cwd: repoRoot, env: { GH_TOKEN }, timeoutMs: 30 * 60 * 1000 }) });
  }
  return results;
}

export function detectConsumerRuntime(root) {
  const candidates = [
    ['rust', 'Cargo.toml'], ['go', 'go.mod'], ['typescript-node', 'package.json'], ['python', 'pyproject.toml'],
    ['python', 'setup.py'], ['dart', 'pubspec.yaml'], ['gleam', 'gleam.toml'], ['elixir', 'mix.exs'],
    ['java', 'pom.xml'], ['swift', 'Package.swift'], ['zig', 'build.zig'], ['php', 'composer.json'],
  ];
  for (const [runtimeId, marker] of candidates) {
    if (!isFile(path.join(root, marker))) continue;
    return RUNTIME_SPECS.find((spec) => spec.id === runtimeId) || null;
  }
  if (fs.readdirSync(root).some((name) => name.endsWith('.csproj'))) return RUNTIME_SPECS.find((spec) => spec.id === 'csharp');
  return null;
}

export async function auditConsumers(repo, repoRoot, zedBinary, report) {
  const orgResponse = await githubRequest(`/orgs/${repo.testOrg}`, { allow404: true });
  if (orgResponse.status === 404) {
    report.findings.push(finding('error', 'test-org-missing', `Matching test organization ${repo.testOrg} does not exist or is not visible.`));
    return;
  }
  const all = await paginate(`/orgs/${repo.testOrg}/repos?type=all&sort=full_name&direction=asc`);
  const candidates = all
    .filter((candidate) => !candidate.archived && candidate.name !== '.github')
    .filter((candidate) => /(client|consumer|sdk|contract|package|matrix|e2e|test)/i.test(candidate.name))
    .slice(0, Math.max(MAX_CONSUMERS * 3, 30));
  const coordinate = parsePackageCoordinate(repoRoot, repo.fullName);
  const needles = [repo.fullName, `https://github.com/${repo.fullName}`, `${repo.fullName}.git`, repo.name, coordinate];
  const consumerRoot = path.join(WORK_DIR, 'consumers', repo.owner, repo.name);
  fs.mkdirSync(consumerRoot, { recursive: true });
  const discovered = [];

  for (const candidate of candidates) {
    if (discovered.length >= MAX_CONSUMERS) break;
    const destination = path.join(consumerRoot, candidate.name);
    const clone = await cloneRepository(candidate.full_name, candidate.default_branch, destination);
    if (!clone.ok) {
      report.findings.push(finding('error', 'consumer-checkout', `Unable to check out candidate consumer ${candidate.full_name}.`, { log: clone.stderr.slice(-3000) }));
      continue;
    }
    const references = scanFilesForReferences(destination, needles, 6000);
    if (!references.length) continue;
    const consumer = {
      repository: candidate.full_name,
      defaultBranch: candidate.default_branch,
      private: candidate.private,
      references: references.slice(0, 10).map((match) => path.relative(destination, match.file).split(path.sep).join('/')),
      checks: [],
      ok: true,
    };

    if (isFile(path.join(destination, '.zpkg.toml'))) {
      if (!isFile(path.join(destination, '.zpkg.lock'))) {
        consumer.checks.push({ name: 'zed-lock', ok: false, message: 'missing .zpkg.lock' });
        consumer.ok = false;
      } else if (zedBinary) {
        const validate = await run(`consumer zed validate ${candidate.full_name}`, zedBinary, ['validate', '--manifest', '.zpkg.toml', '--lock', '.zpkg.lock', '--require-lock', '--json'], { cwd: destination, env: { GH_TOKEN }, timeoutMs: 10 * 60 * 1000 });
        consumer.checks.push({ name: 'zed-validate', ok: validate.ok, log: `${validate.stdout}\n${validate.stderr}`.slice(-5000) });
        if (!validate.ok) consumer.ok = false;
        const install = await run(`consumer zed install ${candidate.full_name}`, zedBinary, ['install', '--frozen'], { cwd: destination, env: { GH_TOKEN }, timeoutMs: 30 * 60 * 1000 });
        consumer.checks.push({ name: 'zed-install-frozen', ok: install.ok, log: `${install.stdout}\n${install.stderr}`.slice(-5000) });
        if (!install.ok) consumer.ok = false;
      }
    } else {
      consumer.checks.push({ name: 'zed-manifest', ok: false, message: 'consumer does not use .zpkg.toml' });
      consumer.ok = false;
    }

    const custom = path.join(destination, '.zed', 'audit-consumer.sh');
    if (isFile(custom)) {
      const native = await run(`consumer native audit ${candidate.full_name}`, 'bash', [custom], { cwd: destination, env: { GH_TOKEN }, timeoutMs: 30 * 60 * 1000 });
      consumer.checks.push({ name: 'native', ok: native.ok, log: `${native.stdout}\n${native.stderr}`.slice(-5000) });
      if (!native.ok) consumer.ok = false;
    } else {
      const runtime = detectConsumerRuntime(destination);
      if (runtime) {
        const native = await run(`consumer native test ${candidate.full_name}`, 'docker', [
          'run', '--rm', '--init', '--entrypoint', 'sh', '-v', `${destination}:/work`, '-w', '/work', runtime.image, '-lc', runtime.command,
        ], { timeoutMs: 35 * 60 * 1000 });
        consumer.checks.push({ name: `native-${runtime.id}`, ok: native.ok, log: `${native.stdout}\n${native.stderr}`.slice(-5000) });
        if (!native.ok) consumer.ok = false;
      } else {
        consumer.checks.push({ name: 'native', ok: false, message: 'no supported consumer build contract detected' });
        consumer.ok = false;
      }
    }
    discovered.push(consumer);
  }

  report.consumers = discovered;
  if (!discovered.length) report.findings.push(finding('error', 'consumer-missing', `No explicit consumer of ${repo.fullName} was found in ${repo.testOrg}.`));
  for (const consumer of discovered) {
    if (!consumer.ok) report.findings.push(finding('error', 'consumer-failed', `${consumer.repository} failed Zed install, compile, or tests.`));
  }
}

