import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildScaffoldWorkflow, detectRuntimes, validateApiSurface } from './lib.mjs';

const schema = JSON.parse(fs.readFileSync(new URL('./schema/api-surface.schema.json', import.meta.url), 'utf8'));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'den3475-'));
  const runtimes = [
    ['c', 'client.c'], ['cpp', 'client.cpp'], ['csharp', 'Client.cs'], ['dart', 'client.dart'],
    ['elixir', 'client.ex'], ['erlang', 'client.erl'], ['fsharp', 'Client.fs'], ['gleam', 'client.gleam'],
    ['go', 'client.go'], ['java', 'Client.java'], ['kotlin', 'Client.kt'], ['php', 'client.php'],
    ['python', 'client.py'], ['ruby', 'client.rb'], ['rust', 'client.rs'], ['swift', 'Client.swift'],
  ];
  for (const [runtime, file] of runtimes) {
    const dir = path.join(root, 'clients', runtime);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), '// fixture\n');
  }
  fs.mkdirSync(path.join(root, 'schema'), { recursive: true });
  fs.writeFileSync(path.join(root, 'schema', 'api-surface.schema.json'), JSON.stringify(schema, null, 2));
  const detected = detectRuntimes(root);
  const implementations = detected.map((runtime) => ({
    runtime: runtime.id,
    status: 'implemented',
    path: `${runtime.relativeRoot}/${path.basename(fs.readdirSync(runtime.root)[0])}`,
    symbol: 'Client',
    signature: 'Client.request(Request): Response',
  }));
  fs.writeFileSync(path.join(root, 'schema', 'api-surface.json'), JSON.stringify({
    $schema: './api-surface.schema.json',
    schemaVersion: '1.0.0',
    package: 'fixture/fixture-clients',
    runtimes: detected.map((runtime) => ({ id: runtime.id, root: runtime.relativeRoot })),
    symbols: [{
      id: 'client.request', kind: 'method', visibility: 'public', name: 'request',
      signature: 'Client.request(Request): Response', implementations,
    }],
  }, null, 2));
  return root;
}

test('detects at least fifteen substantive runtimes', () => {
  const root = fixture();
  assert.ok(detectRuntimes(root).length >= 15);
});

test('accepts a cross-runtime API surface with stable ids and signatures', () => {
  const root = fixture();
  const result = validateApiSurface(root, detectRuntimes(root));
  assert.deepEqual(result.findings, []);
  assert.equal(result.symbols, 1);
});

test('fails closed when one runtime mapping is omitted', () => {
  const root = fixture();
  const file = path.join(root, 'schema', 'api-surface.json');
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  document.symbols[0].implementations.pop();
  fs.writeFileSync(file, JSON.stringify(document));
  const result = validateApiSurface(root, detectRuntimes(root));
  assert.ok(result.findings.some((finding) => finding.code === 'symbol-runtime-missing'));
});

test('generates a pinned reusable workflow and explicit disabled runtime list', () => {
  const workflow = buildScaffoldWorkflow({
    repository: 'example/example-clients',
    disabledLanguages: 'typescript-deno,zig',
    reusableRef: '9b8b69c47c6a3704a33707d9162cd27cdf92c7d7',
    defaultBranch: 'trunk',
  });
  assert.match(workflow, /sdk-client-language-matrix\.yml@9b8b69c/);
  assert.match(workflow, /disabled_languages: 'typescript-deno,zig'/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /branches: \[trunk, dev\]/);
});
