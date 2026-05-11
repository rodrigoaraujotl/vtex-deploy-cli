const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { freshRequire, mockRequire } = require('../test-helpers');

const vtexPath = require.resolve('../../services/vtex');

test('services/vtex executes commands through the Docker service', async () => {
  const dockerMock = {
    execInContainer: async (_service, command) => ({ success: true, stdout: `${command} ok` })
  };
  const restoreDocker = mockRequire(require.resolve('../../services/docker'), dockerMock);
  const vtex = freshRequire(vtexPath);

  assert.deepEqual(await vtex.execVtexCommand('whoami'), {
    success: true,
    output: 'vtex whoami ok'
  });
  assert.equal(await vtex.useWorkspace('task-1'), true);
  restoreDocker();
});

test('services/vtex generates tokens and parses CLI output', async () => {
  const originalPost = axios.post;
  axios.post = async () => ({ data: { token: 'vtex-token' } });
  const restoreDocker = mockRequire(require.resolve('../../services/docker'), {
    execInContainer: async () => ({
      success: true,
      stdout: 'preview https://task--store.myvtex.com\n'
    })
  });
  const vtex = freshRequire(vtexPath);

  assert.equal(await vtex.generateToken('store', 'key', 'token'), 'vtex-token');
  assert.equal(
    vtex.extractPreviewUrl('open https://task--store.myvtex.com'),
    'https://task--store.myvtex.com'
  );
  assert.deepEqual(
    vtex.parseWorkspaceInfo('Account: store\nWorkspace: master\nEnvironment: prod'),
    {
      account: 'store',
      workspace: 'master',
      environment: 'prod'
    }
  );

  axios.post = originalPost;
  restoreDocker();
});

test('services/vtex short-circuits deployment when an external step fails', async () => {
  const restoreDocker = mockRequire(require.resolve('../../services/docker'), {
    execInContainer: async () => ({ success: false, error: 'vtex failed' })
  });
  const vtex = freshRequire(vtexPath);
  vtex.generateToken = async () => 'token';
  vtex.login = async () => false;

  assert.equal(await vtex.deployToQA('store', 'key', 'token'), false);
  restoreDocker();
});
