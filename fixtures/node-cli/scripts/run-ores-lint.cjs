'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const lintScript = path.join(repositoryRoot, '.ores-lint', 'lint.sh');

if (!fs.statSync(lintScript, { throwIfNoEntry: false })?.isFile()) {
  console.log('ores-lint not installed');
  process.exit(0);
}

const result = childProcess.spawnSync('sh', [lintScript], {
  cwd: repositoryRoot,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
