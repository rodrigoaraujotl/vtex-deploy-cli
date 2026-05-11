const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { promisify } = require('node:util');
const { freshRequire } = require('../test-helpers');

const dockerPath = require.resolve('../../services/docker');

function withExecMock(handler, fn) {
  const originalExec = childProcess.exec;
  childProcess.exec = (command, callback) => {
    Promise.resolve()
      .then(() => handler(command))
      .then((result) => callback(null, result.stdout || '', result.stderr || ''))
      .catch((error) => callback(error));
  };
  childProcess.exec[promisify.custom] = async (command) => handler(command);
  delete require.cache[dockerPath];
  return Promise.resolve(fn()).finally(() => {
    childProcess.exec = originalExec;
    delete require.cache[dockerPath];
  });
}

test('services/docker runs docker-compose commands successfully', async () => {
  const commands = [];
  await withExecMock(
    (command) => {
      commands.push(command);
      return { stdout: command.includes('ps --services') ? 'app\n' : '' };
    },
    async () => {
      const docker = freshRequire(dockerPath);
      assert.equal(await docker.startContainers(), true);
      assert.equal(await docker.stopContainers(), true);
      assert.equal(await docker.isDockerAvailable(), true);
    }
  );
  assert.ok(commands.includes('docker-compose up -d'));
  assert.ok(commands.includes('docker-compose down'));
});

test('services/docker parses container status and handles external failures', async () => {
  await withExecMock(
    (command) => {
      if (command.includes('ps --format json')) return { stdout: '{"Service":"app"}' };
      throw new Error('docker unavailable');
    },
    async () => {
      const docker = freshRequire(dockerPath);
      assert.deepEqual(await docker.getContainerStatus(), { Service: 'app' });
      assert.equal(await docker.isDockerAvailable(), false);
      assert.deepEqual(await docker.execInContainer('app', 'vtex whoami'), {
        success: false,
        error: 'docker unavailable'
      });
    }
  );
});
