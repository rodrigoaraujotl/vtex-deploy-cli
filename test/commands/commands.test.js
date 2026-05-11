const test = require('node:test');
const assert = require('node:assert/strict');
const { createProgramHarness, freshRequire } = require('../test-helpers');

function registeredActions(commandFile) {
  const { program, actions } = createProgramHarness();
  const register = freshRequire(require.resolve(`../../commands/${commandFile}`));
  register(program);
  delete require.cache[require.resolve(`../../commands/${commandFile}`)];
  return actions;
}

test('command modules register their public commands', () => {
  assert.ok(registeredActions('deploy.js').has('deploy'));
  assert.ok(registeredActions('deploy.js').has('deploy:status'));
  assert.ok(registeredActions('pr.js').has('pr:create'));
  assert.ok(registeredActions('pr.js').has('pr:merge'));
  assert.ok(registeredActions('task.js').has('task:create'));
  assert.ok(registeredActions('task.js').has('task:switch'));
  assert.ok(registeredActions('status.js').has('status'));
  assert.ok(registeredActions('status.js').has('workspace:status'));
});
