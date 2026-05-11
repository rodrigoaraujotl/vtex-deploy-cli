const test = require('node:test');
const assert = require('node:assert/strict');
const { freshRequire, mockRequire } = require('../test-helpers');

const gitPath = require.resolve('../../services/git');

test('services/git creates a new branch with simple-git', async () => {
  const gitMock = {
    branchLocal: async () => ({ all: [] }),
    checkoutLocalBranch: async (branch) => {
      gitMock.created = branch;
    }
  };
  const restore = mockRequire('simple-git', () => gitMock);
  const gitService = freshRequire(gitPath);

  assert.equal(await gitService.createAndCheckoutBranch('task-1'), true);
  assert.equal(gitMock.created, 'task-1');
  restore();
});

test('services/git checks out an existing branch and reports validation failures', async () => {
  const gitMock = {
    branchLocal: async () => ({ all: ['task-1'] }),
    checkout: async (branch) => {
      gitMock.checkedOut = branch;
    },
    status: async () => ({ current: 'main', files: [] })
  };
  const restore = mockRequire('simple-git', () => gitMock);
  const gitService = freshRequire(gitPath);

  assert.equal(await gitService.createAndCheckoutBranch('task-1'), true);
  assert.equal(gitMock.checkedOut, 'task-1');
  assert.deepEqual(await gitService.validateBranchForPR(), {
    valid: false,
    message: 'Não é possível criar PR a partir da branch main',
    currentBranch: 'main'
  });
  restore();
});

test('services/git returns safe values when simple-git fails', async () => {
  const gitMock = {
    status: async () => {
      throw new Error('git failed');
    },
    branch: async () => {
      throw new Error('branch failed');
    }
  };
  const restore = mockRequire('simple-git', () => gitMock);
  const gitService = freshRequire(gitPath);

  assert.equal(await gitService.getCurrentBranch(), null);
  assert.equal(await gitService.hasUncommittedChanges(), false);
  assert.equal(await gitService.branchExistsRemotely('task-1'), false);
  restore();
});
