const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { freshRequire } = require('../test-helpers');

const envModule = path.resolve(__dirname, '../../utils/env.js');

test('utils/env parses .env files, strips quotes, and keeps defaults', () => {
  const cwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtex-env-'));
  fs.writeFileSync(
    path.join(dir, '.env'),
    [
      '# comment',
      'QA_ACCOUNT="qa-store"',
      "VTEX_QA_APPKEY='app-key'",
      'EMPTY=',
      'PROD_ACCOUNT=prod'
    ].join('\n')
  );

  process.chdir(dir);
  const env = freshRequire(envModule);

  assert.equal(env.get('QA_ACCOUNT'), 'qa-store');
  assert.equal(env.get('VTEX_QA_APPKEY'), 'app-key');
  assert.equal(env.get('MISSING', 'fallback'), 'fallback');
  assert.deepEqual(env.validateRequired(['QA_ACCOUNT', 'MISSING']), {
    valid: false,
    missing: ['MISSING'],
    present: ['QA_ACCOUNT']
  });

  process.chdir(cwd);
});

test('utils/env creates .env content and exposes typed config helpers', () => {
  const cwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtex-env-create-'));
  process.chdir(dir);
  const env = freshRequire(envModule);

  const created = env.createEnvFile({
    vtexQaAccount: 'qa',
    vtexQaAppkey: 'qa-key',
    vtexQaApptoken: 'qa-token',
    bitbucketWorkspace: 'team',
    bitbucketRepository: 'repo',
    bitbucketToken: 'bb-token'
  });

  assert.equal(created, true);
  assert.equal(env.envFileExists(), true);
  assert.equal(env.getVtexConfig().qaAccount, 'qa');
  assert.deepEqual(env.getBitbucketConfig(), {
    workspace: 'team',
    repository: 'repo',
    token: 'bb-token'
  });

  process.chdir(cwd);
});
