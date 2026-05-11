const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertLogged,
  createMockLogger,
  createProgramHarness,
  makeConfig,
  mockRequire,
  freshRequire
} = require('../test-helpers');

function setupCommand(commandFile, services = {}) {
  const logger = services.logger || createMockLogger();
  const restorers = [
    mockRequire(require.resolve('../../utils/logger'), logger),
    mockRequire(
      require.resolve('../../utils/env'),
      services.env || { loadEnv: () => makeConfig() }
    ),
    mockRequire(
      require.resolve('../../utils/validators'),
      services.validators || require('../../utils/validators')
    ),
    mockRequire(require.resolve('inquirer'), services.inquirer || { prompt: async () => ({}) }),
    mockRequire(
      require.resolve('../../services/git'),
      services.git || {
        isGitRepository: async () => true,
        getCurrentBranch: async () => 'task-123-feature',
        hasUncommittedChanges: async () => false,
        validateBranchForPR: async () => ({ valid: true }),
        isBranchSynced: async () => true,
        createAndCheckoutBranch: async () => true,
        branchExistsRemotely: async () => false,
        branchExists: async () => false,
        getRepositoryInfo: async () => ({
          name: 'repo',
          remoteUrl: 'git@example.com:team/repo.git'
        }),
        getLastCommit: async () => null,
        isBranchSynced: async () => true,
        remoteBranchExists: async () => true
      }
    ),
    mockRequire(
      require.resolve('../../services/docker'),
      services.docker || {
        getStatus: async () => ({ available: true, running: true }),
        startContainers: async () => true,
        waitForContainers: async () => true,
        isDockerAvailable: async () => true,
        listContainers: async () => [],
        getLogs: async () => []
      }
    ),
    mockRequire(
      require.resolve('../../services/vtex'),
      services.vtex || {
        deployToQA: async () => true,
        deployToProduction: async () => true,
        use: async () => true,
        link: async () => ({ previewUrl: 'https://preview.example.com' }),
        release: async () => true,
        publish: async () => true,
        install: async () => true,
        deploy: async () => true,
        getWorkspaceInfo: async () => ({
          workspace: 'task-123-feature',
          account: 'qa-account',
          environment: 'qa'
        })
      }
    ),
    mockRequire(
      require.resolve('../../services/bitbucket'),
      services.bitbucket || {
        isConfigured: () => true,
        configure: () => {},
        searchPRsByBranch: async () => [],
        searchPullRequestsByBranch: async () => [],
        listPullRequests: async () => [],
        createPullRequest: async () => ({
          id: 1,
          title: 'PR',
          state: 'OPEN',
          sourceBranch: 'task-123-feature',
          destinationBranch: 'staging',
          author: 'Dev',
          createdOn: '11/05/2026',
          url: 'https://bitbucket/pr/1'
        }),
        getBuildStatus: async () => []
      }
    )
  ];

  const { program, actions } = createProgramHarness();
  const register = freshRequire(require.resolve(`../../commands/${commandFile}`));
  register(program);

  return {
    actions,
    logger,
    cleanup() {
      restorers.forEach((restore) => restore());
      delete require.cache[require.resolve(`../../commands/${commandFile}`)];
    }
  };
}

test('commands/deploy covers success, configuration error, cancellation, and external failure', async () => {
  let vtexCalls = 0;
  let context = setupCommand('deploy.js', {
    vtex: {
      deployToQA: async () => {
        vtexCalls += 1;
        return true;
      },
      use: async () => true,
      link: async () => ({ previewUrl: 'https://preview.example.com' }),
      release: async () => true,
      publish: async () => true,
      install: async () => true,
      deploy: async () => true,
      getWorkspaceInfo: async () => ({
        workspace: 'task-123-feature',
        account: 'qa-account',
        environment: 'qa'
      })
    }
  });
  await context.actions.get('deploy')('qa', { force: true, onlyLink: true });
  assert.equal(vtexCalls, 1);
  assertLogged(context.logger, 'complete', 'Deploy para QA concluído');
  context.cleanup();

  context = setupCommand('deploy.js', { env: { loadEnv: () => ({}) } });
  await context.actions.get('deploy')('qa', {});
  assertLogged(context.logger, 'error', 'Configuração VTEX para QA não encontrada');
  context.cleanup();

  context = setupCommand('deploy.js', {
    inquirer: { prompt: async () => ({ shouldProceed: false }) }
  });
  await context.actions.get('deploy')('qa', {});
  assertLogged(context.logger, 'info', 'Deploy cancelado pelo usuário');
  context.cleanup();

  context = setupCommand('deploy.js', {
    vtex: { deployToQA: async () => false }
  });
  await context.actions.get('deploy')('qa', { force: true });
  assertLogged(context.logger, 'failSpinner', 'Erro durante o deploy VTEX');
  context.cleanup();
});

test('commands/pr covers success, configuration error, cancellation, and external failure', async () => {
  let created = false;
  let context = setupCommand('pr.js', {
    inquirer: { prompt: async () => ({ shouldProceed: true }) },
    bitbucket: {
      searchPRsByBranch: async () => [],
      createPullRequest: async () => {
        created = true;
        return {
          id: 1,
          title: 'PR',
          state: 'OPEN',
          sourceBranch: 'task-123-feature',
          destinationBranch: 'staging',
          author: 'Dev',
          createdOn: '11/05/2026',
          url: 'https://bitbucket/pr/1'
        };
      }
    }
  });
  await context.actions.get('pr:create')('qa', { deploy: false, title: 'PR', description: 'Body' });
  assert.equal(created, true);
  assertLogged(context.logger, 'complete', 'Pull Request criado');
  context.cleanup();

  context = setupCommand('pr.js', { env: { loadEnv: () => makeConfig({ BITBUCKET_TOKEN: '' }) } });
  await context.actions.get('pr:create')('qa', {});
  assertLogged(context.logger, 'error', 'Configuração Bitbucket não encontrada');
  context.cleanup();

  context = setupCommand('pr.js', { inquirer: { prompt: async () => ({ shouldProceed: false }) } });
  await context.actions.get('pr:create')('qa', {});
  assertLogged(context.logger, 'info', 'Operação cancelada pelo usuário');
  context.cleanup();

  context = setupCommand('pr.js', {
    git: {
      isGitRepository: async () => true,
      getCurrentBranch: async () => 'task-123-feature',
      validateBranchForPR: async () => ({ valid: true }),
      hasUncommittedChanges: async () => true
    }
  });
  await context.actions.get('pr:create')('qa', {});
  assertLogged(context.logger, 'error', 'Há mudanças não commitadas');
  context.cleanup();
});

test('commands/task covers success, configuration error, cancellation, and external failure', async () => {
  let createdBranch = false;
  let context = setupCommand('task.js', {
    git: {
      isGitRepository: async () => true,
      branchExists: async () => false,
      branchExistsRemotely: async () => false,
      hasUncommittedChanges: async () => false,
      createAndCheckoutBranch: async () => {
        createdBranch = true;
        return true;
      },
      getCurrentBranch: async () => 'task-feature-123'
    }
  });
  await context.actions.get('task:create')('feature', '123', {});
  assert.equal(createdBranch, true);
  assertLogged(context.logger, 'complete', 'Task criada com sucesso');
  context.cleanup();

  context = setupCommand('task.js', { env: { loadEnv: () => ({}) } });
  await context.actions.get('task:create')('feature', '123', {});
  assertLogged(context.logger, 'error', 'Configuração VTEX não encontrada');
  context.cleanup();

  context = setupCommand('task.js', {
    git: {
      isGitRepository: async () => true,
      branchExists: async () => true,
      branchExistsRemotely: async () => true
    },
    inquirer: { prompt: async () => ({ shouldContinue: false }) }
  });
  await context.actions.get('task:create')('feature', '123', {});
  assertLogged(context.logger, 'warn', 'Operação cancelada pelo usuário');
  context.cleanup();

  context = setupCommand('task.js', {
    docker: {
      isDockerAvailable: async () => false
    }
  });
  await context.actions.get('task:create')('feature', '123', {});
  assertLogged(context.logger, 'error', 'Docker é necessário');
  context.cleanup();
});

test('commands/status covers success, configuration error, cancellation-equivalent empty results, and external failure', async () => {
  let context = setupCommand('status.js');
  await context.actions.get('status')({ quick: true });
  assertLogged(context.logger, 'title', 'Status Geral do Projeto');
  context.cleanup();

  context = setupCommand('status.js', {
    env: { loadEnv: () => ({}) },
    bitbucket: { isConfigured: () => false }
  });
  await context.actions.get('pr:status')({ state: 'OPEN', limit: '10' });
  assertLogged(context.logger, 'error', 'Configuração do Bitbucket não encontrada');
  context.cleanup();

  context = setupCommand('status.js', {
    bitbucket: {
      isConfigured: () => true,
      configure: () => {},
      searchPullRequestsByBranch: async () => []
    }
  });
  await context.actions.get('pr:status')({ state: 'OPEN', limit: '10' });
  assertLogged(context.logger, 'info', 'Não foi encontrado');
  context.cleanup();

  context = setupCommand('status.js', {
    docker: {
      getStatus: async () => {
        throw new Error('docker failed');
      }
    }
  });
  await context.actions.get('status')({ quick: false });
  assertLogged(context.logger, 'error', 'Erro ao obter status geral');
  context.cleanup();
});
