const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { freshRequire } = require('../test-helpers');

const dockerPath = require.resolve('../../services/docker');

function withExecFileMock(handler, fn) {
  const originalExecFile = childProcess.execFile;
  childProcess.execFile = (command, args, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    Promise.resolve()
      .then(() => handler(command, args || [], options || {}))
      .then((result) => callback(null, result.stdout || '', result.stderr || ''))
      .catch((error) => callback(error));
  };
  delete require.cache[dockerPath];
  return Promise.resolve(fn()).finally(() => {
    childProcess.execFile = originalExecFile;
    delete require.cache[dockerPath];
  });
}

test('services/docker runs docker-compose commands successfully', async () => {
  const commands = [];
  await withExecFileMock(
    (command, args) => {
      commands.push([command, args]);
      return { stdout: args.includes('--services') ? 'app\n' : '' };
    },
    async () => {
      const docker = freshRequire(dockerPath);
      await docker.runCompose(['up', '-d']);
      await docker.runCompose(['down']);
      assert.equal(await docker.isDockerAvailable(), true);
    }
  );
  assert.ok(commands.some(([, args]) => args[0] === 'up' && args[1] === '-d'));
  assert.ok(commands.some(([, args]) => args[0] === 'down'));
});

test('services/docker parses container status and handles external failures', async () => {
  await withExecFileMock(
    (command, args) => {
      if (command === 'docker' && args[0] === '--version') return { stdout: 'Docker version' };
      if (Array.isArray(args) && args[0] === 'ps' && args.includes('--format')) return { stdout: '{"Service":"app"}' };
      throw new Error('docker unavailable');
    },
    async () => {
      const docker = freshRequire(dockerPath);
      assert.equal(docker.parseComposePs('{"Service":"app"}')[0].service, 'app');
      assert.equal(await docker.isDockerAvailable(), false);
      assert.deepEqual(await docker.execInContainer('app', 'vtex', ['whoami']), {
        success: false,
        error: 'docker unavailable'
      });
    }
  );
});
