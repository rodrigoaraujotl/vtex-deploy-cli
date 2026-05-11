const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRequire, mockRequire } = require('../test-helpers');

const vtexPath = require.resolve('../../services/vtex');

test('services/vtex executes commands through the Docker service', async () => {
  let captured;
  const dockerMock = {
    execInContainer: async (service, command, args) => {
      captured = { service, command, args };
      return { success: true, stdout: `${command} ${args.join(' ')} ok` };
    }
  };
  const restoreDocker = mockRequire(require.resolve('../../services/docker'), dockerMock);
  const vtex = freshRequire(vtexPath);

  assert.deepEqual(await vtex.execVtexCommand('whoami'), {
    success: true,
    output: 'vtex whoami ok'
  });
  assert.deepEqual(captured, { service: 'app', command: 'vtex', args: ['whoami'] });
  assert.equal(await vtex.useWorkspace('task-1'), true);
  restoreDocker();
});

test('services/vtex generates tokens and parses CLI output', async () => {
  const restoreHttp = mockRequire(require.resolve('../../services/httpClient'), {
    httpClient: { post: async () => ({ data: { token: 'vtex-token' } }) },
    formatHttpError: (_error, message) => message
  });
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

  restoreHttp();
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
