#!/usr/bin/env node
'use strict';

const HELP = 'portable-node-cli 1.0.0\n\nUsage: portable-node-cli [--help]\n';

function run(arguments) {
  if (arguments.length === 0 || ['--help', '-h'].includes(arguments[0])) {
    return { code: 0, output: HELP };
  }
  return { code: 2, output: 'unsupported argument; use --help\n' };
}

if (require.main === module) {
  const result = run(process.argv.slice(2));
  const stream = result.code === 0 ? process.stdout : process.stderr;
  stream.write(result.output);
  process.exitCode = result.code;
}

module.exports = { HELP, run };
