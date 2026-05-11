const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { freshRequire } = require('../test-helpers');

const bitbucketPath = require.resolve('../../services/bitbucket');

test('services/bitbucket configures auth and creates pull requests', async () => {
  const originalPost = axios.post;
  let captured;
  axios.post = async (url, payload, options) => {
    captured = { url, payload, options };
    return { data: { id: 7, links: { html: { href: 'https://bitbucket/pr/7' } } } };
  };
  const bitbucket = freshRequire(bitbucketPath);
  bitbucket.configure('bb-token', 'team', 'repo');

  const result = await bitbucket.createPullRequest({
    title: 'PR title',
    description: 'Body',
    sourceBranch: 'task-1',
    destinationBranch: 'staging'
  });

  assert.equal(result.success, true);
  assert.equal(result.id, 7);
  assert.equal(captured.url, 'https://api.bitbucket.org/2.0/repositories/team/repo/pullrequests');
  assert.equal(captured.options.headers.Authorization, 'Bearer bb-token');
  axios.post = originalPost;
});

test('services/bitbucket lists and formats pull requests', async () => {
  const originalGet = axios.get;
  axios.get = async () => ({ data: { values: [{ id: 1, state: 'OPEN' }] } });
  const bitbucket = freshRequire(bitbucketPath);
  bitbucket.configure('bb-token', 'team', 'repo');

  assert.deepEqual(await bitbucket.listPullRequests({ sourceBranch: 'task-1' }), [
    { id: 1, state: 'OPEN' }
  ]);
  assert.equal(bitbucket.isConfigured(), true);
  assert.deepEqual(
    bitbucket.formatPRForDisplay({
      id: 1,
      title: 'Title',
      state: 'OPEN',
      source: { branch: { name: 'task-1' } },
      destination: { branch: { name: 'staging' } },
      author: { display_name: 'Dev' },
      created_on: '2026-05-11T00:00:00Z',
      links: { html: { href: 'https://bitbucket/pr/1' } },
      description: ''
    }).sourceBranch,
    'task-1'
  );
  axios.get = originalGet;
});

test('services/bitbucket returns failures for missing configuration and API errors', async () => {
  const originalPost = axios.post;
  axios.post = async () => {
    throw new Error('api down');
  };
  const bitbucket = freshRequire(bitbucketPath);
  assert.throws(() => bitbucket.getAuthHeaders(), /Token do Bitbucket não configurado/);
  bitbucket.configure('bb-token', 'team', 'repo');
  assert.deepEqual(
    await bitbucket.createPullRequest({
      title: 'PR',
      sourceBranch: 'task',
      destinationBranch: 'main'
    }),
    { success: false, error: 'api down' }
  );
  axios.post = originalPost;
});
