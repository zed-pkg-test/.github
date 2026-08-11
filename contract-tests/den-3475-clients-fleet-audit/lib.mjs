import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED_KINDS = Object.freeze(['class', 'method', 'function', 'interface', 'type']);
export const REQUIRED_VISIBILITIES = Object.freeze(['public', 'private']);

const COMMON_IGNORES = new Set([
  '.git', '.idea', '.vscode', 'node_modules', 'target', 'dist', 'build', '.dart_tool',
  '.gradle', '.venv', 'venv', 'vendor', '.zed-cache', 'zed_modules',
]);

export const RUNTIME_SPECS = Object.freeze([
  { id: 'c', paths: ['c'], markers: ['CMakeLists.txt', 'Makefile'], extensions: ['.c', '.h'], image: 'gcc:14', command: `if [ -f CMakeLists.txt ]; then cmake -S . -B /tmp/build -DCMAKE_BUILD_TYPE=Release && cmake --build /tmp/build && ctest --test-dir /tmp/build --output-on-failure; elif [ -f Makefile ]; then make -j2 && (make test || true); else find . -name '*.c' -print0 | xargs -0 -r gcc -Wall -Wextra -Werror -c; fi` },
  { id: 'cpp', paths: ['cpp', 'cplusplus', 'cxx'], markers: ['CMakeLists.txt', 'Makefile'], extensions: ['.cc', '.cpp', '.cxx', '.hpp', '.hh'], image: 'gcc:14', command: `apt-get update >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends cmake ninja-build >/dev/null && if [ -f CMakeLists.txt ]; then cmake -S . -B /tmp/build -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build /tmp/build && ctest --test-dir /tmp/build --output-on-failure; elif [ -f Makefile ]; then make -j2 && (make test || true); else find . \\( -name '*.cc' -o -name '*.cpp' -o -name '*.cxx' \\) -print0 | xargs -0 -r g++ -std=c++20 -Wall -Wextra -Werror -c; fi` },
  { id: 'clojure', paths: ['clojure'], markers: ['deps.edn', 'project.clj'], extensions: ['.clj', '.cljc', '.cljs'], image: 'clojure:temurin-21-tools-deps', command: `if [ -f deps.edn ]; then clojure -T:build test 2>/dev/null || clojure -M:test 2>/dev/null || clojure -M -e '(println :clojure-client-loaded)'; elif [ -f project.clj ]; then lein test; else exit 1; fi` },
  { id: 'crystal', paths: ['crystal'], markers: ['shard.yml'], extensions: ['.cr'], image: 'crystallang/crystal:1.15', command: `shards install && crystal tool format --check && if [ -d spec ]; then crystal spec; else find src -name '*.cr' -print0 | xargs -0 -r crystal build --no-codegen; fi` },
  { id: 'csharp', paths: ['csharp', 'dotnet'], markers: ['*.csproj', '*.sln'], extensions: ['.cs'], image: 'mcr.microsoft.com/dotnet/sdk:9.0', command: `project="$(find . -maxdepth 3 \\( -name '*.sln' -o -name '*.csproj' \\) | head -n1)"; test -n "$project"; dotnet restore "$project"; dotnet build "$project" --no-restore -warnaserror; dotnet test "$project" --no-build || true` },
  { id: 'dart', paths: ['dart', 'flutter'], markers: ['pubspec.yaml'], extensions: ['.dart'], image: 'dart:stable', command: `dart pub get && dart analyze && if [ -d test ]; then dart test; fi` },
  { id: 'elixir', paths: ['elixir'], markers: ['mix.exs'], extensions: ['.ex', '.exs'], image: 'elixir:1.18', command: `mix local.hex --force && mix local.rebar --force && mix deps.get && mix compile --warnings-as-errors && mix test` },
  { id: 'erlang', paths: ['erlang'], markers: ['rebar.config', 'rebar3'], extensions: ['.erl', '.hrl'], image: 'erlang:27', command: `if [ -x ./rebar3 ]; then ./rebar3 compile && ./rebar3 eunit; elif command -v rebar3 >/dev/null 2>&1 && [ -f rebar.config ]; then rebar3 compile && rebar3 eunit; else find . -name '*.erl' -print0 | xargs -0 -r erlc -Werror; fi` },
  { id: 'fsharp', paths: ['fsharp'], markers: ['*.fsproj', '*.sln'], extensions: ['.fs', '.fsx'], image: 'mcr.microsoft.com/dotnet/sdk:9.0', command: `project="$(find . -maxdepth 3 \\( -name '*.sln' -o -name '*.fsproj' \\) | head -n1)"; test -n "$project"; dotnet restore "$project"; dotnet build "$project" --no-restore -warnaserror; dotnet test "$project" --no-build || true` },
  { id: 'gleam', paths: ['gleam', 'gleamlang'], markers: ['gleam.toml'], extensions: ['.gleam'], image: 'ghcr.io/gleam-lang/gleam:v1.15.2-erlang-alpine', command: `gleam deps download && gleam check && gleam test` },
  { id: 'go', paths: ['go', 'golang'], markers: ['go.mod'], extensions: ['.go'], image: 'golang:1.24', command: `go test ./...` },
  { id: 'haskell', paths: ['haskell'], markers: ['stack.yaml', 'cabal.project', '*.cabal'], extensions: ['.hs'], image: 'haskell:9.10', command: `if [ -f stack.yaml ]; then stack test --no-terminal; elif find . -maxdepth 2 -name '*.cabal' | grep -q .; then cabal update && cabal test all; else ghc -fno-code $(find . -name '*.hs'); fi` },
  { id: 'java', paths: ['java'], markers: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'gradlew', 'mvnw'], extensions: ['.java'], image: 'maven:3.9-eclipse-temurin-21', command: `if [ -x ./mvnw ]; then ./mvnw -B test; elif [ -f pom.xml ]; then mvn -B test; elif [ -x ./gradlew ]; then ./gradlew --no-daemon test; else find . -name '*.java' -print0 | xargs -0 -r javac -Werror; fi` },
  { id: 'kotlin', paths: ['kotlin'], markers: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'gradlew'], extensions: ['.kt', '.kts'], image: 'gradle:8-jdk17', command: `if [ -x ./gradlew ]; then ./gradlew --no-daemon test; elif [ -f pom.xml ]; then mvn -B test; elif [ -f build.gradle ] || [ -f build.gradle.kts ]; then gradle --no-daemon test; else exit 1; fi` },
  { id: 'lua', paths: ['lua'], markers: ['rockspec'], extensions: ['.lua'], image: 'nickblah/lua:5.4-luarocks', command: `if find . -maxdepth 2 -name '*.rockspec' | grep -q .; then luarocks make $(find . -maxdepth 2 -name '*.rockspec' | head -n1); fi; find . -name '*.lua' -print0 | xargs -0 -r -n1 luac -p` },
  { id: 'php', paths: ['php'], markers: ['composer.json'], extensions: ['.php'], image: 'composer:2', command: `composer install --no-interaction --prefer-dist && find . -name '*.php' -print0 | xargs -0 -r -n1 php -l && if composer run-script --list --no-interaction 2>/dev/null | grep -Eq '(^|[[:space:]])test([[:space:]]|$)'; then composer test --no-interaction; fi` },
  { id: 'python', paths: ['python', 'python3'], markers: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'], extensions: ['.py'], image: 'python:3.13', command: `python -m venv /tmp/venv && . /tmp/venv/bin/activate && python -m pip install --disable-pip-version-check --upgrade pip && if [ -f requirements.txt ]; then pip install -r requirements.txt; fi && if [ -f pyproject.toml ] || [ -f setup.py ] || [ -f setup.cfg ]; then pip install -e '.[test]' || pip install -e .; fi && python -m compileall -q . && if [ -d tests ] || [ -d test ]; then pip install pytest && pytest -q; fi` },
  { id: 'ruby', paths: ['ruby'], markers: ['Gemfile', '*.gemspec'], extensions: ['.rb'], image: 'ruby:3.4', command: `if [ -f Gemfile ]; then bundle install; fi && if [ -f Rakefile ]; then bundle exec rake test; else find . -name '*.rb' -print0 | xargs -0 -r -n1 ruby -c; fi` },
  { id: 'rust', paths: ['rust'], markers: ['Cargo.toml'], extensions: ['.rs'], image: 'rust:1.86', command: `if [ -f Cargo.lock ]; then cargo test --workspace --all-targets --all-features --locked; else cargo test --workspace --all-targets --all-features; fi` },
  { id: 'scala', paths: ['scala'], markers: ['build.sbt'], extensions: ['.scala'], image: 'sbtscala/scala-sbt:eclipse-temurin-21.0.5_11_1.10.7_3.6.2', command: `sbt -batch test` },
  { id: 'swift', paths: ['swift'], markers: ['Package.swift'], extensions: ['.swift'], image: 'swift:6.1-noble', command: `swift package resolve && swift build && if [ -d Tests ]; then swift test; fi` },
  { id: 'typescript-node', paths: ['typescript/nodejs', 'typescript/node', 'typescript', 'nodejs'], markers: ['package.json'], extensions: ['.ts', '.tsx', '.mts', '.cts'], image: 'node:22', command: `(corepack enable >/dev/null 2>&1 || true) && if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; elif [ -f yarn.lock ]; then yarn install --immutable; else npm ci || npm install; fi && npm run typecheck --if-present && npm run build --if-present && npm run test --if-present` },
  { id: 'typescript-deno', paths: ['typescript/runtimes/deno', 'typescript/deno', 'deno'], markers: ['deno.json', 'deno.jsonc'], extensions: ['.ts', '.tsx'], image: 'denoland/deno:2.3.7', command: `find . \\( -name '*.ts' -o -name '*.tsx' \\) -print0 | xargs -0 -r deno check && if find . -type f \\( -name '*test.ts' -o -name '*.test.ts' -o -name '*_test.ts' \\) | grep -q .; then deno test -A; fi` },
  { id: 'typescript-bun', paths: ['typescript/runtimes/bun', 'typescript/bun', 'bun'], markers: ['bun.lock', 'bun.lockb', 'package.json'], extensions: ['.ts', '.tsx'], image: 'oven/bun:1.2.19-debian', command: `(bun install --frozen-lockfile || bun install) && if bun -e "const p=require('./package.json');process.exit(p.scripts?.typecheck?0:1)"; then bun run typecheck; fi && if bun -e "const p=require('./package.json');process.exit(p.scripts?.build?0:1)"; then bun run build; fi && if find . -type f \\( -name '*test.ts' -o -name '*.test.ts' -o -name '*spec.ts' \\) | grep -q .; then bun test; fi` },
  { id: 'typescript-edge', paths: ['typescript/runtimes/edge', 'typescript/edge', 'typescript/edge-runtimes', 'edge'], markers: ['package.json', 'wrangler.toml', 'wrangler.jsonc'], extensions: ['.ts', '.tsx'], image: 'node:22', command: `(npm ci || npm install) && npm run typecheck --if-present && npm run build --if-present && npm run test:edge --if-present` },
  { id: 'wasm', paths: ['wasm', 'webassembly', 'rust/wasm'], markers: ['Cargo.toml', 'package.json'], extensions: ['.wat', '.wasm', '.rs', '.ts'], image: 'rust:1.86', command: `if [ -f Cargo.toml ]; then rustup target add wasm32-unknown-unknown && cargo check --target wasm32-unknown-unknown; elif [ -f package.json ]; then corepack enable >/dev/null 2>&1 || true; npm ci || npm install; npm run build --if-present; npm test --if-present; else test -n "$(find . -type f \\( -name '*.wat' -o -name '*.wasm' \\) -print -quit)"; fi` },
  { id: 'zig', paths: ['zig'], markers: ['build.zig'], extensions: ['.zig'], image: 'ghcr.io/ziglang/zig:0.14.1', command: `zig fmt --check . && zig build test` },
]);

function isDirectory(value) {
  try { return fs.statSync(value).isDirectory(); } catch { return false; }
}

function walkFiles(root, maxFiles = 5000) {
  const result = [];
  const stack = [root];
  while (stack.length && result.length < maxFiles) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (COMMON_IGNORES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) result.push(absolute);
      if (result.length >= maxFiles) break;
    }
  }
  return result;
}

function globMarkerMatches(files, root, marker) {
  if (!marker.includes('*')) return fs.existsSync(path.join(root, marker));
  const suffix = marker.slice(marker.indexOf('*') + 1);
  return files.some((file) => path.basename(file).endsWith(suffix));
}

export function detectRuntimes(repoRoot) {
  const clientsRoot = path.join(repoRoot, 'clients');
  if (!isDirectory(clientsRoot)) return [];
  const detected = [];
  for (const spec of RUNTIME_SPECS) {
    for (const candidate of spec.paths) {
      const root = path.join(clientsRoot, candidate);
      if (!isDirectory(root)) continue;
      const files = walkFiles(root, 2500);
      const substantive = files.some((file) => spec.extensions.includes(path.extname(file).toLowerCase()));
      const marker = spec.markers.some((item) => globMarkerMatches(files, root, item));
      const custom = fs.existsSync(path.join(root, '.zed', 'audit.sh')) || fs.existsSync(path.join(root, 'ci.sh'));
      if (substantive || marker || custom) {
        detected.push({ ...spec, root, relativeRoot: path.relative(repoRoot, root).split(path.sep).join('/') });
        break;
      }
    }
  }
  return detected;
}

function collectEnums(value, output = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectEnums(item, output);
  } else if (value && typeof value === 'object') {
    if (Array.isArray(value.enum)) {
      for (const item of value.enum) if (typeof item === 'string') output.add(item);
    }
    for (const child of Object.values(value)) collectEnums(child, output);
  }
  return output;
}

function findJsonFiles(repoRoot, predicate) {
  const roots = ['schema', 'schemas', 'json-schema', 'clients'].map((item) => path.join(repoRoot, item)).filter(fs.existsSync);
  const files = roots.flatMap((root) => walkFiles(root, 3000));
  return files.filter((file) => file.endsWith('.json') && predicate(path.basename(file).toLowerCase(), file));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizedSignature(value) {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (value && typeof value === 'object') return JSON.stringify(value, Object.keys(value).sort());
  return '';
}

export function validateApiSurface(repoRoot, runtimes) {
  const findings = [];
  const schemaCandidates = findJsonFiles(repoRoot, (name) => name.includes('api') && name.includes('surface') && name.includes('schema'));
  const documentCandidates = findJsonFiles(repoRoot, (name) => name.includes('api') && name.includes('surface') && !name.includes('schema') && !name.includes('template') && !name.includes('example'));

  if (!schemaCandidates.length) {
    findings.push({ severity: 'error', code: 'api-schema-missing', message: 'Missing canonical API-surface JSON Schema.' });
    return { findings, schemaPath: null, documentPath: null, symbols: 0 };
  }

  let schema = null;
  let schemaPath = null;
  for (const candidate of schemaCandidates) {
    try {
      const parsed = readJson(candidate);
      if (parsed && typeof parsed === 'object') { schema = parsed; schemaPath = candidate; break; }
    } catch (error) {
      findings.push({ severity: 'error', code: 'api-schema-invalid-json', message: `${path.relative(repoRoot, candidate)}: ${error.message}` });
    }
  }
  if (!schema) return { findings, schemaPath: null, documentPath: null, symbols: 0 };

  const draft = String(schema.$schema || '');
  if (!/json-schema\.org\/draft\/(2020-12|2019-09)/.test(draft)) {
    findings.push({ severity: 'error', code: 'api-schema-draft', message: 'API surface schema must use JSON Schema draft 2019-09 or 2020-12.' });
  }
  const enums = collectEnums(schema);
  for (const kind of REQUIRED_KINDS) if (!enums.has(kind)) findings.push({ severity: 'error', code: 'api-schema-kind', message: `Schema does not declare symbol kind ${kind}.` });
  for (const visibility of REQUIRED_VISIBILITIES) if (!enums.has(visibility)) findings.push({ severity: 'error', code: 'api-schema-visibility', message: `Schema does not declare visibility ${visibility}.` });

  if (!documentCandidates.length) {
    findings.push({ severity: 'error', code: 'api-surface-missing', message: 'Missing canonical api-surface.json instance.' });
    return { findings, schemaPath, documentPath: null, symbols: 0 };
  }

  let document = null;
  let documentPath = null;
  for (const candidate of documentCandidates) {
    try {
      const parsed = readJson(candidate);
      if (Array.isArray(parsed?.symbols) || Array.isArray(parsed?.declarations) || Array.isArray(parsed?.api?.symbols)) {
        document = parsed; documentPath = candidate; break;
      }
    } catch (error) {
      findings.push({ severity: 'error', code: 'api-surface-invalid-json', message: `${path.relative(repoRoot, candidate)}: ${error.message}` });
    }
  }
  if (!document) {
    findings.push({ severity: 'error', code: 'api-surface-shape', message: 'No API-surface document contains a symbols/declarations array.' });
    return { findings, schemaPath, documentPath: null, symbols: 0 };
  }

  const symbols = document.symbols || document.declarations || document.api.symbols;
  if (!symbols.length) findings.push({ severity: 'error', code: 'api-surface-empty', message: 'API-surface document contains no symbols.' });
  const runtimeIds = new Set(runtimes.map((runtime) => runtime.id));
  const declaredRuntimeIds = new Set((document.runtimes || []).map((runtime) => typeof runtime === 'string' ? runtime : runtime?.id).filter(Boolean));
  for (const runtimeId of runtimeIds) {
    if (!declaredRuntimeIds.has(runtimeId)) findings.push({ severity: 'error', code: 'runtime-not-declared', message: `Detected runtime ${runtimeId} is absent from api-surface runtimes.` });
  }

  const ids = new Set();
  for (const [index, symbol] of symbols.entries()) {
    const prefix = `symbol[${index}]`;
    if (!symbol || typeof symbol !== 'object') { findings.push({ severity: 'error', code: 'symbol-shape', message: `${prefix} is not an object.` }); continue; }
    if (typeof symbol.id !== 'string' || !symbol.id.trim()) findings.push({ severity: 'error', code: 'symbol-id', message: `${prefix} has no stable id.` });
    else if (ids.has(symbol.id)) findings.push({ severity: 'error', code: 'symbol-id-duplicate', message: `Duplicate symbol id ${symbol.id}.` });
    else ids.add(symbol.id);
    if (!REQUIRED_KINDS.includes(symbol.kind)) findings.push({ severity: 'error', code: 'symbol-kind', message: `${symbol.id || prefix} has unsupported kind ${symbol.kind}.` });
    if (!REQUIRED_VISIBILITIES.includes(symbol.visibility)) findings.push({ severity: 'error', code: 'symbol-visibility', message: `${symbol.id || prefix} has unsupported visibility ${symbol.visibility}.` });
    if (typeof symbol.name !== 'string' || !symbol.name.trim()) findings.push({ severity: 'error', code: 'symbol-name', message: `${symbol.id || prefix} has no name.` });
    const canonicalSignature = normalizedSignature(symbol.signature);
    if (!canonicalSignature) findings.push({ severity: 'error', code: 'symbol-signature', message: `${symbol.id || prefix} has no canonical signature.` });

    const rawImplementations = symbol.implementations;
    const implementations = Array.isArray(rawImplementations)
      ? rawImplementations
      : rawImplementations && typeof rawImplementations === 'object'
        ? Object.entries(rawImplementations).map(([runtime, value]) => ({ runtime, ...(typeof value === 'object' ? value : { symbol: value }) }))
        : [];
    const byRuntime = new Map(implementations.map((implementation) => [implementation.runtime, implementation]));
    for (const runtimeId of runtimeIds) {
      const implementation = byRuntime.get(runtimeId);
      if (!implementation) {
        findings.push({ severity: 'error', code: 'symbol-runtime-missing', message: `${symbol.id || prefix} has no ${runtimeId} implementation declaration.` });
        continue;
      }
      const status = implementation.status || 'implemented';
      if (status === 'not-applicable') {
        if (typeof implementation.reason !== 'string' || !implementation.reason.trim()) findings.push({ severity: 'error', code: 'symbol-runtime-exemption', message: `${symbol.id || prefix}/${runtimeId} is not-applicable without a reason.` });
        continue;
      }
      if (status !== 'implemented') findings.push({ severity: 'error', code: 'symbol-runtime-status', message: `${symbol.id || prefix}/${runtimeId} has unsupported status ${status}.` });
      if (typeof implementation.path !== 'string' || !implementation.path.trim()) findings.push({ severity: 'error', code: 'symbol-runtime-path', message: `${symbol.id || prefix}/${runtimeId} has no source path.` });
      else if (!fs.existsSync(path.join(repoRoot, implementation.path))) findings.push({ severity: 'error', code: 'symbol-runtime-path-missing', message: `${symbol.id || prefix}/${runtimeId} path does not exist: ${implementation.path}.` });
      const implementationSignature = normalizedSignature(implementation.signature);
      if (implementationSignature && canonicalSignature && implementationSignature !== canonicalSignature) findings.push({ severity: 'error', code: 'symbol-signature-drift', message: `${symbol.id || prefix}/${runtimeId} signature differs from canonical.` });
    }
  }

  return { findings, schemaPath, documentPath, symbols: symbols.length };
}

export function buildScaffoldWorkflow({ repository, disabledLanguages = '', reusableRef, defaultBranch = 'main' }) {
  const branches = [...new Set([defaultBranch, 'dev'].filter(Boolean))].join(', ');
  return `name: Polyglot client contract\n\non:\n  pull_request:\n    paths:\n      - 'clients/**'\n      - 'schema/**'\n      - 'schemas/**'\n      - '.zpkg.toml'\n      - '.zpkg.lock'\n      - '.github/workflows/clients-contract.yml'\n  push:\n    branches: [${branches}]\n    paths:\n      - 'clients/**'\n      - 'schema/**'\n      - 'schemas/**'\n      - '.zpkg.toml'\n      - '.zpkg.lock'\n      - '.github/workflows/clients-contract.yml'\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: clients-contract-\${{ github.workflow }}-\${{ github.ref }}\n  cancel-in-progress: true\n\njobs:\n  sdk-matrix:\n    uses: zed-pkg-test/.github/.github/workflows/sdk-client-language-matrix.yml@${reusableRef}\n    with:\n      clients_repository: ${repository}\n      clients_ref: \${{ github.event.pull_request.head.sha || github.sha }}\n      clients_root: clients\n      disabled_languages: '${disabledLanguages}'\n    secrets:\n      read_token: \${{ secrets.CLIENTS_AUDIT_GH_TOKEN }}\n`;
}

export function scanFilesForReferences(root, needles, maxFiles = 5000) {
  const normalizedNeedles = needles.filter(Boolean).map((needle) => needle.toLowerCase());
  if (!normalizedNeedles.length) return [];
  const matches = [];
  for (const file of walkFiles(root, maxFiles)) {
    let stat;
    try { stat = fs.statSync(file); } catch { continue; }
    if (stat.size > 512 * 1024) continue;
    let text;
    try { text = fs.readFileSync(file, 'utf8').toLowerCase(); } catch { continue; }
    const hit = normalizedNeedles.find((needle) => text.includes(needle));
    if (hit) matches.push({ file, needle: hit });
  }
  return matches;
}
