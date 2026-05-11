const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const commandFiles = [
  'commands/deploy.js',
  'commands/pr.js',
  'commands/status.js',
  'commands/task.js'
];

const expectedReferences = {
  'commands/deploy.js': ['envUtils.loadEnv(', 'dockerService.getStatus(', 'vtexService.listApps(', 'vtexService.listVersions(', 'vtexService.installVersion('],
  'commands/pr.js': ['envUtils.loadEnv(', 'dockerService.getStatus('],
  'commands/status.js': ['envUtils.loadEnv(', 'dockerService.getStatus(', 'vtexService.listApps(', 'vtexService.listWorkspaces('],
  'commands/task.js': ['envUtils.loadEnv(', 'dockerService.getStatus(']
};

test('commands that depend on shared service contracts keep using implemented public methods', () => {
  for (const file of commandFiles) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

    for (const reference of expectedReferences[file]) {
      assert.ok(source.includes(reference), `${file} should be covered for ${reference}`);
    }
  }
});

test('shared contracts required by command modules are implemented', () => {
  const envUtils = require('../utils/env');
  const dockerService = require('../services/docker');
  const vtexService = require('../services/vtex');

  assert.strictEqual(typeof envUtils.loadEnv, 'function');
  assert.strictEqual(typeof dockerService.getStatus, 'function');
  assert.strictEqual(typeof dockerService.listContainers, 'function');
  assert.strictEqual(typeof dockerService.getLogs, 'function');
  assert.strictEqual(typeof vtexService.listApps, 'function');
  assert.strictEqual(typeof vtexService.listWorkspaces, 'function');
  assert.strictEqual(typeof vtexService.listVersions, 'function');
  assert.strictEqual(typeof vtexService.installVersion, 'function');
  assert.strictEqual(typeof vtexService.use, 'function');
  assert.strictEqual(typeof vtexService.link, 'function');
});
