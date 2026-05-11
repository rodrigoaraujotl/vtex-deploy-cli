const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const envUtils = require('../utils/env');
const dockerService = require('../services/docker');
const vtexService = require('../services/vtex');

test('envUtils.loadEnv returns flat command configuration with legacy aliases', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtex-env-'));
  const originalCwd = process.cwd();
  const originalEnvPath = envUtils.envPath;
  const originalEnvVars = envUtils.envVars;

  process.chdir(tempDir);
  envUtils.envPath = path.join(tempDir, '.env');
  envUtils.envVars = {};

  fs.writeFileSync(envUtils.envPath, [
    'QA_ACCOUNT=qa-store',
    'VTEX_QA_APPKEY=qa-key',
    'VTEX_QA_APPTOKEN=qa-token',
    'PROD_ACCOUNT=prod-store',
    'VTEX_PROD_APPKEY=prod-key',
    'VTEX_PROD_APPTOKEN=prod-token',
    'BITBUCKET_WORKSPACE=workspace',
    'BITBUCKET_REPOSITORY=repo',
    'BITBUCKET_TOKEN=bb-token'
  ].join('\n'));

  try {
    const config = envUtils.loadEnv();

    assert.strictEqual(config.QA_ACCOUNT, 'qa-store');
    assert.strictEqual(config.VTEX_QA_APPKEY, 'qa-key');
    assert.strictEqual(config.QA_APPKEY, 'qa-key');
    assert.strictEqual(config.QA_APPTOKEN, 'qa-token');
    assert.strictEqual(config.VTEX_QA_ACCOUNT, 'qa-store');
    assert.strictEqual(config.BITBUCKET_REPOSITORY, 'repo');
  } finally {
    envUtils.envPath = originalEnvPath;
    envUtils.envVars = originalEnvVars;
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('dockerService.getStatus exposes a consistent running boolean contract', async () => {
  const originalIsDockerAvailable = dockerService.isDockerAvailable;
  const originalListContainers = dockerService.listContainers;

  dockerService.isDockerAvailable = async () => true;
  dockerService.listContainers = async () => [
    { name: 'app', running: true, status: 'running' }
  ];

  try {
    const status = await dockerService.getStatus();

    assert.deepStrictEqual(status, {
      available: true,
      running: true,
      containers: [{ name: 'app', running: true, status: 'running' }]
    });
  } finally {
    dockerService.isDockerAvailable = originalIsDockerAvailable;
    dockerService.listContainers = originalListContainers;
  }
});

test('vtexService list and install methods delegate to VTEX commands and normalize output', async () => {
  const originalExecVtexCommand = vtexService.execVtexCommand;
  const calls = [];

  vtexService.execVtexCommand = async (command, args = []) => {
    calls.push([command, args]);

    if (command === 'list') {
      return { success: true, output: 'vendor.app@1.2.3 linked\nvtex.service@2.0.0 installed' };
    }

    if (command === 'workspace' && JSON.stringify(args) === JSON.stringify(['list'])) {
      return { success: true, output: '* master production\n  dev development' };
    }

    if (command === 'deps' && JSON.stringify(args) === JSON.stringify(['list'])) {
      return { success: true, output: 'vendor.app@1.2.3 2026-05-11 stable\nvendor.app@1.2.2 2026-05-10 previous' };
    }

    if (command === 'install' && JSON.stringify(args) === JSON.stringify(['vendor.app@1.2.2'])) {
      return { success: true, output: '' };
    }

    return { success: false, error: 'unexpected command' };
  };

  try {
    const apps = await vtexService.listApps();
    const workspaces = await vtexService.listWorkspaces();
    const versions = await vtexService.listVersions();
    const installed = await vtexService.installVersion('vendor.app@1.2.2');

    assert.deepStrictEqual(apps[0], { name: 'vendor.app', version: '1.2.3', linked: true, raw: 'vendor.app@1.2.3 linked' });
    assert.deepStrictEqual(workspaces[0], { name: 'master', current: true, status: 'production', raw: '* master production' });
    assert.strictEqual(versions[0].version, '1.2.3');
    assert.strictEqual(installed, true);
    assert.deepStrictEqual(calls, [['list', []], ['workspace', ['list']], ['deps', ['list']], ['install', ['vendor.app@1.2.2']]]);
  } finally {
    vtexService.execVtexCommand = originalExecVtexCommand;
  }
});
