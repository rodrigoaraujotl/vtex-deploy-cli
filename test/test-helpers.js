const assert = require('node:assert/strict');

function freshRequire(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(modulePath);
}

function mockRequire(modulePath, exportsValue) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue
  };
  return () => {
    delete require.cache[resolved];
  };
}

function createMockLogger() {
  const calls = [];
  const record =
    (method) =>
    (...args) =>
      calls.push({ method, args });
  return {
    calls,
    welcome: record('welcome'),
    title: record('title'),
    subtitle: record('subtitle'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    success: record('success'),
    debug: record('debug'),
    startSpinner: record('startSpinner'),
    succeedSpinner: record('succeedSpinner'),
    failSpinner: record('failSpinner'),
    warnSpinner: record('warnSpinner'),
    updateSpinner: record('updateSpinner'),
    newLine: record('newLine'),
    list: record('list'),
    status: record('status'),
    url: record('url'),
    pullRequest: record('pullRequest'),
    workspace: record('workspace'),
    complete: record('complete'),
    nextSteps: record('nextSteps'),
    separator: record('separator'),
    table: record('table')
  };
}

function createProgramHarness() {
  const actions = new Map();
  const program = {
    command(name) {
      const commandName = name.split(' ')[0];
      const chain = {
        description() {
          return chain;
        },
        option() {
          return chain;
        },
        action(fn) {
          actions.set(commandName, fn);
          return chain;
        }
      };
      return chain;
    }
  };
  return { program, actions };
}

function makeConfig(overrides = {}) {
  return {
    QA_ACCOUNT: 'qa-account',
    VTEX_QA_APPKEY: 'qa-appkey-12345',
    VTEX_QA_APPTOKEN: 'qa-apptoken-12345',
    PROD_ACCOUNT: 'prod-account',
    VTEX_PROD_APPKEY: 'prod-appkey-12345',
    VTEX_PROD_APPTOKEN: 'prod-apptoken-12345',
    BITBUCKET_WORKSPACE: 'workspace',
    BITBUCKET_REPOSITORY: 'repository',
    BITBUCKET_TOKEN: 'token-12345678901234567890',
    ...overrides
  };
}

function assertLogged(logger, method, text) {
  assert.ok(
    logger.calls.some((call) => call.method === method && call.args.join(' ').includes(text)),
    `Expected logger.${method} to include ${text}. Calls: ${JSON.stringify(logger.calls)}`
  );
}

module.exports = {
  assertLogged,
  createMockLogger,
  createProgramHarness,
  freshRequire,
  makeConfig,
  mockRequire
};
