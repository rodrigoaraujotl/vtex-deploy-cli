const test = require('node:test');
const assert = require('node:assert/strict');
const Validators = require('../../utils/validators');

test('utils/validators accepts valid values', () => {
  assert.equal(Validators.required('value'), true);
  assert.equal(Validators.email('dev@example.com'), true);
  assert.equal(Validators.vtexAccount('my-store-1'), true);
  assert.equal(Validators.bitbucketWorkspace('team_name-1'), true);
  assert.equal(Validators.repository('repo.name_1'), true);
  assert.equal(Validators.branchName('feature/task-1'), true);
  assert.equal(Validators.environment('qa'), true);
  assert.equal(Validators.taskNumber('42'), true);
  assert.equal(Validators.taskName('task_name-1'), true);
  assert.equal(Validators.url('https://example.com'), true);
  assert.equal(Validators.port(8080), true);
});

test('utils/validators returns first validation error for invalid values', () => {
  assert.equal(Validators.required(' ', 'Nome'), 'Nome é obrigatório');
  assert.equal(Validators.email('invalid'), 'Email deve ter um formato válido');
  assert.equal(
    Validators.vtexAccount('Store'),
    'Conta VTEX deve conter apenas letras minúsculas, números e hífens'
  );
  assert.equal(
    Validators.branchName('/feature'),
    'Nome da branch não pode começar ou terminar com barra'
  );
  assert.equal(Validators.environment('dev'), 'Ambiente deve ser um dos seguintes: qa, prod');
  assert.equal(Validators.validate('', [Validators.required]), 'Campo é obrigatório');
  assert.ok(Object.keys(Validators.validateConfig({})).includes('QA_ACCOUNT'));
});
