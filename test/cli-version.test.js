const assert = require('node:assert/strict');
const test = require('node:test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

const execFileAsync = promisify(execFile);

test('vtex-deploy --version usa a versão do package.json', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const pkg = require(path.join(repoRoot, 'package.json'));
  const cliPath = path.join(repoRoot, 'bin', 'index.js');

  const { stdout } = await execFileAsync(process.execPath, [cliPath, '--version'], {
    cwd: repoRoot,
  });

  assert.equal(stdout.trim(), pkg.version);
});
