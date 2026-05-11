const inquirer = require('inquirer');
const chalk = require('chalk');
const gitService = require('../services/git');
const dockerService = require('../services/docker');
const vtexService = require('../services/vtex');
const bitbucketService = require('../services/bitbucket');
const envUtils = require('../utils/env');
const logger = require('../utils/logger');
const validators = require('../utils/validators');

/**
 * Registra comandos relacionados a status
 * @param {Object} program instância do commander
 */
function registerStatusCommands(program) {
  // Comando task:status
  program
    .command('task:status')
    .description('Exibe status da task atual (workspace VTEX e branch Git)')
    .option('-v, --verbose', 'Exibe informações detalhadas')
    .option('-e, --environment <env>', 'Ambiente específico (qa ou prod)')
    .action(async (options) => {
      try {
        await showTaskStatus(options);
      } catch (error) {
        logger.error('Erro ao verificar status da task:', error);
        process.exit(1);
      }
    });

  // Comando pr:status
  program
    .command('pr:status')
    .description('Exibe status dos Pull Requests da branch atual')
    .option('-a, --all', 'Exibe todos os PRs, não apenas da branch atual')
    .option('-s, --state <state>', 'Filtrar por estado (OPEN, MERGED, DECLINED)', 'OPEN')
    .option('--limit <number>', 'Limite de PRs a exibir', '10')
    .action(async (options) => {
      try {
        await showPRStatus(options);
      } catch (error) {
        logger.error('Erro ao verificar status dos PRs:', error);
        process.exit(1);
      }
    });

  // Comando status (geral)
  program
    .command('status')
    .description('Exibe status geral do projeto (Git, Docker, VTEX, PRs)')
    .option('-q, --quick', 'Exibe apenas informações básicas')
    .action(async (options) => {
      try {
        await showGeneralStatus(options);
      } catch (error) {
        logger.error('Erro ao verificar status geral:', error);
        process.exit(1);
      }
    });

  // Comando workspace:status
  program
    .command('workspace:status')
    .description('Exibe status detalhado dos workspaces VTEX')
    .option('-e, --environment <env>', 'Ambiente específico (qa ou prod)')
    .action(async (options) => {
      try {
        await showWorkspaceStatus(options);
      } catch (error) {
        logger.error('Erro ao verificar status dos workspaces:', error);
        process.exit(1);
      }
    });
}

/**
 * Exibe status da task atual
 * @param {Object} options opções do comando
 */
async function showTaskStatus(options = {}) {
  logger.welcome();
  logger.title('Status da Task');

  try {
    // Carregar configuração
    const config = envUtils.loadEnv();

    // 1. Status do Git
    logger.subtitle('Git');

    if (await gitService.isGitRepository()) {
      const currentBranch = await gitService.getCurrentBranch();
      const hasUncommitted = await gitService.hasUncommittedChanges();
      const repoInfo = await gitService.getRepositoryInfo();

      logger.status({
        'Branch atual': chalk.cyan(currentBranch),
        'Mudanças não commitadas': hasUncommitted ? chalk.yellow('Sim') : chalk.green('Não'),
        Repositório: chalk.blue(repoInfo.name || 'N/A'),
        'Remote URL': chalk.gray(repoInfo.remoteUrl || 'N/A')
      });

      // Verificar se é uma task branch
      if (currentBranch.startsWith('task-')) {
        const taskInfo = parseTaskBranch(currentBranch);
        if (taskInfo) {
          logger.newLine();
          logger.subtitle('Informações da Task');
          logger.list([
            `Nome: ${chalk.cyan(taskInfo.name)}`,
            `Número: ${chalk.cyan(taskInfo.number)}`,
            `Branch: ${chalk.cyan(taskInfo.branch)}`
          ]);
        }
      }

      // Informações adicionais se verbose
      if (options.verbose) {
        const lastCommit = await gitService.getLastCommit();
        if (lastCommit) {
          logger.newLine();
          logger.subtitle('Último Commit');
          logger.list([
            `Hash: ${chalk.gray(lastCommit.hash)}`,
            `Autor: ${chalk.blue(lastCommit.author)}`,
            `Data: ${chalk.gray(lastCommit.date)}`,
            `Mensagem: ${chalk.white(lastCommit.message)}`
          ]);
        }
      }
    } else {
      logger.warn('Não é um repositório Git');
    }

    // 2. Status do Docker
    logger.newLine();
    logger.subtitle('Docker');

    const dockerStatus = await dockerService.getStatus();
    logger.status({
      'Docker disponível': dockerStatus.available,
      'Containers rodando': dockerStatus.running
    });

    if (dockerStatus.running && options.verbose) {
      const containers = await dockerService.listContainers();
      if (containers && containers.length > 0) {
        logger.newLine();
        logger.info('Containers ativos:');
        containers.forEach((container) => {
          console.log(`  ${chalk.green('•')} ${container.name} (${container.status})`);
        });
      }
    }

    // 3. Status VTEX
    logger.newLine();
    logger.subtitle('VTEX');

    if (!dockerStatus.running) {
      logger.warn('Docker não está rodando - informações VTEX indisponíveis');
    } else {
      await showVTEXStatus(config, options);
    }

    // 4. Próximos passos sugeridos
    if (!options.quick) {
      const suggestions = generateTaskSuggestions(config, dockerStatus);
      if (suggestions.length > 0) {
        logger.newLine();
        logger.nextSteps(suggestions);
      }
    }
  } catch (error) {
    logger.error('Erro ao obter status da task:', error);
  }
}

/**
 * Exibe status dos Pull Requests
 * @param {Object} options opções do comando
 */
async function showPRStatus(options = {}) {
  logger.welcome();
  logger.title('Status dos Pull Requests');

  try {
    // Carregar configuração
    const config = envUtils.loadEnv();

    // Verificar configuração do Bitbucket
    if (!bitbucketService.isConfigured(config)) {
      logger.error('Configuração do Bitbucket não encontrada. Execute: vtex-deploy config:init');
      return;
    }

    // Configurar Bitbucket
    bitbucketService.configure({
      workspace: config.BITBUCKET_WORKSPACE,
      repository: config.BITBUCKET_REPOSITORY,
      token: config.BITBUCKET_TOKEN
    });

    // Obter branch atual (se disponível)
    let currentBranch = null;
    if (await gitService.isGitRepository()) {
      currentBranch = await gitService.getCurrentBranch();
      logger.info(`Branch atual: ${chalk.cyan(currentBranch)}`);
    }

    // Buscar PRs
    logger.startSpinner('Buscando Pull Requests...');

    let prs;
    if (options.all || !currentBranch) {
      // Buscar todos os PRs
      prs = await bitbucketService.listPullRequests({
        state: options.state,
        limit: parseInt(options.limit)
      });
    } else {
      // Buscar PRs da branch atual
      prs = await bitbucketService.searchPullRequestsByBranch(currentBranch, {
        state: options.state
      });
    }

    logger.succeedSpinner('Pull Requests obtidos');
    logger.newLine();

    if (!prs || prs.length === 0) {
      const scope = options.all ? 'nenhum PR' : `nenhum PR para a branch ${currentBranch}`;
      logger.info(`Não foi encontrado ${scope} com estado ${options.state}`);
      return;
    }

    // Exibir PRs
    logger.subtitle(`Pull Requests (${prs.length})`);

    for (const pr of prs) {
      logger.pullRequest(pr);

      // Informações adicionais se verbose
      if (options.verbose) {
        // Buscar status de build
        try {
          const buildStatus = await bitbucketService.getBuildStatus(pr.id);
          if (buildStatus && buildStatus.length > 0) {
            logger.info('  Status de Build:');
            buildStatus.forEach((build) => {
              const status =
                build.state === 'SUCCESSFUL'
                  ? chalk.green(build.state)
                  : build.state === 'FAILED'
                    ? chalk.red(build.state)
                    : chalk.yellow(build.state);
              console.log(`    ${status} - ${build.name}`);
            });
          }
        } catch (error) {
          // Ignorar erros de build status
        }
      }

      logger.newLine();
    }

    // Estatísticas
    if (prs.length > 1) {
      const stats = calculatePRStats(prs);
      logger.subtitle('Estatísticas');
      logger.list([
        `Total de PRs: ${chalk.cyan(prs.length)}`,
        `Abertos: ${chalk.green(stats.open)}`,
        `Aprovados: ${chalk.blue(stats.approved)}`,
        `Com conflitos: ${chalk.red(stats.conflicts)}`
      ]);
    }
  } catch (error) {
    logger.error('Erro ao obter status dos PRs:', error);
  }
}

/**
 * Exibe status geral do projeto
 * @param {Object} options opções do comando
 */
async function showGeneralStatus(options = {}) {
  logger.welcome();
  logger.title('Status Geral do Projeto');

  try {
    // Carregar configuração
    const config = envUtils.loadEnv();

    // 1. Configuração
    logger.subtitle('Configuração');
    const configStatus = validateConfiguration(config);
    logger.status(configStatus);

    if (!options.quick) {
      // 2. Git
      logger.newLine();
      logger.subtitle('Git');
      await showGitSummary();

      // 3. Docker
      logger.newLine();
      logger.subtitle('Docker');
      const dockerStatus = await dockerService.getStatus();
      logger.status({
        Disponível: dockerStatus.available,
        Rodando: dockerStatus.running
      });

      // 4. VTEX (resumido)
      if (dockerStatus.running) {
        logger.newLine();
        logger.subtitle('VTEX');
        await showVTEXSummary(config);
      }

      // 5. Bitbucket (resumido)
      if (bitbucketService.isConfigured(config)) {
        logger.newLine();
        logger.subtitle('Bitbucket');
        await showBitbucketSummary(config);
      }
    }

    // Recomendações
    const recommendations = generateRecommendations(config, options);
    if (recommendations.length > 0) {
      logger.newLine();
      logger.nextSteps(recommendations);
    }
  } catch (error) {
    logger.error('Erro ao obter status geral:', error);
  }
}

/**
 * Exibe status detalhado dos workspaces
 * @param {Object} options opções do comando
 */
async function showWorkspaceStatus(options = {}) {
  logger.title('Status dos Workspaces VTEX');

  try {
    // Carregar configuração
    const config = envUtils.loadEnv();

    // Verificar Docker
    const dockerStatus = await dockerService.getStatus();
    if (!dockerStatus.running) {
      logger.error('Docker não está rodando. Execute: docker-compose up -d');
      return;
    }

    // Ambientes a verificar
    const environments = [];

    if (config.QA_ACCOUNT && config.QA_APPKEY && config.QA_APPTOKEN) {
      environments.push({
        name: 'qa',
        account: config.QA_ACCOUNT,
        appkey: config.QA_APPKEY,
        apptoken: config.QA_APPTOKEN
      });
    }

    if (config.PROD_ACCOUNT && config.PROD_APPKEY && config.PROD_APPTOKEN) {
      environments.push({
        name: 'prod',
        account: config.PROD_ACCOUNT,
        appkey: config.PROD_APPKEY,
        apptoken: config.PROD_APPTOKEN
      });
    }

    if (environments.length === 0) {
      logger.error('Nenhuma configuração VTEX encontrada. Execute: vtex-deploy config:init');
      return;
    }

    // Verificar cada ambiente
    for (const env of environments) {
      if (options.environment && options.environment !== env.name) {
        continue;
      }

      logger.subtitle(`${env.name.toUpperCase()} - ${env.account}`);

      try {
        // Login com geração automática de token
        logger.startSpinner(`Conectando ao ${env.name.toUpperCase()}...`);
        const token = await vtexService.generateToken(env.account, env.appkey, env.apptoken);
        await vtexService.login(env.account, token);
        logger.succeedSpinner('Conectado');

        // Informações do workspace
        const workspaceInfo = await vtexService.getWorkspaceInfo();
        logger.workspace(workspaceInfo);

        // Listar aplicações
        const apps = await vtexService.listApps();
        if (apps && apps.length > 0) {
          logger.info(`\nAplicações instaladas (${apps.length}):`);

          // Agrupar por tipo
          const appsByType = groupAppsByType(apps);

          Object.keys(appsByType).forEach((type) => {
            console.log(`\n  ${chalk.cyan(type)}:`);
            appsByType[type].forEach((app) => {
              const status = app.linked ? chalk.green('linked') : chalk.gray('installed');
              console.log(`    ${chalk.white('•')} ${app.name}@${app.version} (${status})`);
            });
          });
        }

        // Verificar workspaces disponíveis
        const workspaces = await vtexService.listWorkspaces();
        if (workspaces && workspaces.length > 1) {
          logger.info(`\nWorkspaces disponíveis (${workspaces.length}):`);
          workspaces.slice(0, 5).forEach((ws) => {
            const current =
              ws.name === workspaceInfo.workspace ? chalk.green('• atual') : chalk.gray('•');
            console.log(`    ${current} ${ws.name}`);
          });

          if (workspaces.length > 5) {
            console.log(
              `    ${chalk.gray('... e mais ' + (workspaces.length - 5) + ' workspaces')}`
            );
          }
        }
      } catch (error) {
        logger.failSpinner(`Erro ao conectar ao ${env.name.toUpperCase()}`);
        logger.error(error.message);
      }

      logger.newLine();
    }
  } catch (error) {
    logger.error('Erro ao obter status dos workspaces:', error);
  }
}

// Funções auxiliares

/**
 * Parse informações de uma task branch
 * @param {string} branchName nome da branch
 * @returns {Object|null} informações da task
 */
function parseTaskBranch(branchName) {
  const match = branchName.match(/^task-(.+)-(\d+)$/);
  if (match) {
    return {
      name: match[1],
      number: match[2],
      branch: branchName
    };
  }
  return null;
}

/**
 * Exibe status VTEX resumido
 * @param {Object} config configuração
 * @param {Object} options opções
 */
async function showVTEXStatus(config, options = {}) {
  const environments = [];

  if (config.QA_ACCOUNT && config.QA_APPKEY && config.QA_APPTOKEN) {
    environments.push({
      name: 'qa',
      account: config.QA_ACCOUNT,
      appkey: config.QA_APPKEY,
      apptoken: config.QA_APPTOKEN
    });
  }

  if (config.PROD_ACCOUNT && config.PROD_APPKEY && config.PROD_APPTOKEN) {
    environments.push({
      name: 'prod',
      account: config.PROD_ACCOUNT,
      appkey: config.PROD_APPKEY,
      apptoken: config.PROD_APPTOKEN
    });
  }

  if (environments.length === 0) {
    logger.warn('Configuração VTEX não encontrada');
    return;
  }

  for (const env of environments) {
    if (options.environment && options.environment !== env.name) {
      continue;
    }

    try {
      const token = await vtexService.generateToken(env.account, env.appkey, env.apptoken);
      await vtexService.login(env.account, token);
      const workspaceInfo = await vtexService.getWorkspaceInfo();

      logger.status({
        [`${env.name.toUpperCase()} - Workspace`]: chalk.cyan(workspaceInfo.workspace),
        [`${env.name.toUpperCase()} - Conta`]: chalk.blue(workspaceInfo.account)
      });
    } catch (error) {
      logger.status({
        [`${env.name.toUpperCase()}`]: chalk.red('Erro de conexão')
      });
    }
  }
}

/**
 * Gera sugestões para a task atual
 * @param {Object} config configuração
 * @param {Object} dockerStatus status do docker
 * @returns {Array} lista de sugestões
 */
function generateTaskSuggestions(config, dockerStatus) {
  const suggestions = [];

  if (!dockerStatus.running) {
    suggestions.push('Inicie o Docker: docker-compose up -d');
  }

  if (!config.QA_ACCOUNT || !config.QA_APPKEY || !config.QA_APPTOKEN) {
    suggestions.push('Configure VTEX: vtex-deploy config:init');
  }

  if (dockerStatus.running && config.QA_ACCOUNT) {
    suggestions.push('Faça link da aplicação: vtex-deploy task:create <nome> <numero>');
    suggestions.push('Verifique PRs: vtex-deploy pr:status');
  }

  return suggestions;
}

/**
 * Calcula estatísticas dos PRs
 * @param {Array} prs lista de PRs
 * @returns {Object} estatísticas
 */
function calculatePRStats(prs) {
  return {
    open: prs.filter((pr) => pr.state === 'OPEN').length,
    approved: prs.filter((pr) => pr.reviewers && pr.reviewers.some((r) => r.approved)).length,
    conflicts: prs.filter((pr) => pr.hasConflicts).length
  };
}

/**
 * Valida configuração
 * @param {Object} config configuração
 * @returns {Object} status da configuração
 */
function validateConfiguration(config) {
  return {
    'VTEX QA':
      config.QA_ACCOUNT && config.QA_APPKEY && config.QA_APPTOKEN
        ? chalk.green('Configurado')
        : chalk.red('Não configurado'),
    'VTEX Prod':
      config.PROD_ACCOUNT && config.PROD_APPKEY && config.PROD_APPTOKEN
        ? chalk.green('Configurado')
        : chalk.red('Não configurado'),
    Bitbucket: bitbucketService.isConfigured(config)
      ? chalk.green('Configurado')
      : chalk.red('Não configurado')
  };
}

/**
 * Exibe resumo do Git
 */
async function showGitSummary() {
  if (await gitService.isGitRepository()) {
    const currentBranch = await gitService.getCurrentBranch();
    const hasUncommitted = await gitService.hasUncommittedChanges();

    logger.status({
      Branch: chalk.cyan(currentBranch),
      'Mudanças pendentes': hasUncommitted ? chalk.yellow('Sim') : chalk.green('Não')
    });
  } else {
    logger.status({
      'Repositório Git': chalk.red('Não encontrado')
    });
  }
}

/**
 * Exibe resumo do VTEX
 * @param {Object} config configuração
 */
async function showVTEXSummary(config) {
  const hasQA = config.QA_ACCOUNT && config.QA_APPKEY && config.QA_APPTOKEN;
  const hasProd = config.PROD_ACCOUNT && config.PROD_APPKEY && config.PROD_APPTOKEN;

  logger.status({
    'QA configurado': hasQA ? chalk.green('Sim') : chalk.red('Não'),
    'Prod configurado': hasProd ? chalk.green('Sim') : chalk.red('Não')
  });
}

/**
 * Exibe resumo do Bitbucket
 * @param {Object} config configuração
 */
async function showBitbucketSummary(config) {
  try {
    bitbucketService.configure({
      workspace: config.BITBUCKET_WORKSPACE,
      repository: config.BITBUCKET_REPOSITORY,
      token: config.BITBUCKET_TOKEN
    });

    const isConnected = await bitbucketService.testConnection();

    logger.status({
      Conexão: isConnected ? chalk.green('OK') : chalk.red('Falha'),
      Workspace: chalk.cyan(config.BITBUCKET_WORKSPACE),
      Repositório: chalk.cyan(config.BITBUCKET_REPOSITORY)
    });
  } catch (error) {
    logger.status({
      Bitbucket: chalk.red('Erro de conexão')
    });
  }
}

/**
 * Gera recomendações gerais
 * @param {Object} config configuração
 * @param {Object} options opções
 * @returns {Array} recomendações
 */
function generateRecommendations(config, options) {
  const recommendations = [];

  if (!config.QA_ACCOUNT || !config.QA_APPKEY || !config.QA_APPTOKEN) {
    recommendations.push('Configure VTEX: vtex-deploy config:init');
  }

  if (!bitbucketService.isConfigured(config)) {
    recommendations.push('Configure Bitbucket: vtex-deploy config:init');
  }

  if (
    config.QA_ACCOUNT &&
    config.QA_APPKEY &&
    config.QA_APPTOKEN &&
    bitbucketService.isConfigured(config)
  ) {
    recommendations.push('Crie uma nova task: vtex-deploy task:create <nome> <numero>');
    recommendations.push('Verifique PRs: vtex-deploy pr:status');
  }

  return recommendations;
}

/**
 * Agrupa aplicações por tipo
 * @param {Array} apps lista de aplicações
 * @returns {Object} aplicações agrupadas
 */
function groupAppsByType(apps) {
  const groups = {
    Apps: [],
    Themes: [],
    Services: [],
    Others: []
  };

  apps.forEach((app) => {
    if (app.name.includes('theme')) {
      groups.Themes.push(app);
    } else if (app.name.includes('service')) {
      groups.Services.push(app);
    } else if (app.name.startsWith('vtex.')) {
      groups.Services.push(app);
    } else {
      groups.Apps.push(app);
    }
  });

  // Remover grupos vazios
  Object.keys(groups).forEach((key) => {
    if (groups[key].length === 0) {
      delete groups[key];
    }
  });

  return groups;
}

module.exports = registerStatusCommands;
