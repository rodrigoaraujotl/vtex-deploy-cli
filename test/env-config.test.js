const assert = require('assert');
const fs = require('fs');
const path = require('path');
const envUtils = require('../utils/env');

const repoRoot = path.resolve(__dirname, '..');
const commandFiles = [
  'commands/status.js',
  'commands/deploy.js',
  'commands/pr.js',
  'commands/task.js'
];

const canonicalConfig = {
  QA_ACCOUNT: 'qa-account',
  VTEX_QA_APPKEY: 'qa-appkey',
  VTEX_QA_APPTOKEN: 'qa-apptoken',
  PROD_ACCOUNT: 'prod-account',
  VTEX_PROD_APPKEY: 'prod-appkey',
  VTEX_PROD_APPTOKEN: 'prod-apptoken'
};

function readRepoFile(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

function assertNoLegacyVtexKeys(file) {
  const source = readRepoFile(file);
  const legacyKeys = ['QA_APPKEY', 'QA_APPTOKEN', 'PROD_APPKEY', 'PROD_APPTOKEN'];

  legacyKeys.forEach((key) => {
    assert(
      !new RegExp(`\\b${key}\\b`).test(source),
      `${file} must not read legacy VTEX key ${key}`
    );
  });
}

function assertGenerateTokenCallsHaveThreeArguments(file) {
  const source = readRepoFile(file);
  const calls = [...source.matchAll(/generateToken\(([^\n)]*)\)/g)];

  calls.forEach(([, args]) => {
    const argumentCount = args.split(',').map((arg) => arg.trim()).filter(Boolean).length;
    assert.strictEqual(
      argumentCount,
      3,
      `${file} must call generateToken(account, appkey, apptoken)`
    );
  });
}

const qa = envUtils.getEnvironmentConfig('qa', canonicalConfig);
assert.deepStrictEqual(qa, {
  name: 'qa',
  account: 'qa-account',
  appkey: 'qa-appkey',
  apptoken: 'qa-apptoken'
});
assert(envUtils.isEnvironmentConfigured(qa));

const prod = envUtils.getEnvironmentConfig('prod', canonicalConfig);
assert.deepStrictEqual(prod, {
  name: 'prod',
  account: 'prod-account',
  appkey: 'prod-appkey',
  apptoken: 'prod-apptoken'
});
assert(envUtils.isEnvironmentConfigured(prod));

assert.deepStrictEqual(
  envUtils.getConfiguredEnvironments(canonicalConfig),
  [qa, prod],
  'QA and production must be assembled from the same canonical VTEX key pattern'
);

commandFiles.forEach((file) => {
  const source = readRepoFile(file);

  assertNoLegacyVtexKeys(file);
  assertGenerateTokenCallsHaveThreeArguments(file);
  assert(
    source.includes('getEnvironmentConfig') || source.includes('getConfiguredEnvironments'),
    `${file} must use centralized VTEX environment config helpers`
  );
});

console.log('VTEX environment configuration tests passed');
