'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { HELP, run } = require('../cli.js');

test('library contract renders help and rejects unknown arguments', () => {
  assert.deepEqual(run(['--help']), { code: 0, output: HELP });
  assert.equal(run(['--publish']).code, 2);
});

test('real CLI process prints help', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'cli.js'), '--help'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, HELP);
});
