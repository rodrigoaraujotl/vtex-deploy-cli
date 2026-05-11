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
 * Registra comandos relacionados a Pull Requests
 * @param {Object} program instância do commander
 */
function registerPRCommands(program) {
  // Comando pr:create
  program
    .command('pr:create <ambiente>')
    .description('Cria Pull Request para QA ou Produção')
    .option('-t, --title <title>', 'Título do Pull Request')
    .option('-d, --description <description>', 'Descrição do Pull Request')
    .option('--no-deploy', 'Não executar deploy antes de criar o PR')
    .action(async (ambiente, options) => {
      try {
        await createPullRequest(ambiente, options);
      } catch (error) {
        logger.error('Erro ao criar Pull Request:', error);
        process.exit(1);
      }
    });

  // Comando pr:status
  program
    .command('pr:status')
    .description('Exibe status dos Pull Requests da branch atual')
    .action(async () => {
      try {
        await showPRStatus();
      } catch (error) {
        logger.error('Erro ao obter status do PR:', error);
        process.exit(1);
      }
    });

  // Comando pr:list
  program
    .command('pr:list')
    .description('Lista todos os Pull Requests abertos')
    .option('-a, --author <author>', 'Filtrar por autor')
    .option('-s, --state <state>', 'Filtrar por estado (OPEN, MERGED, DECLINED)')
    .action(async (options) => {
      try {
        await listPullRequests(options);
      } catch (error) {
        logger.error('Erro ao listar Pull Requests:', error);
        process.exit(1);
      }
    });

  // Comando pr:merge
  program
    .command('pr:merge <prId>')
    .description('Faz merge de um Pull Request')
    .option('--close-branch', 'Fechar branch após merge')
    .action(async (prId, options) => {
      try {
        await mergePullRequest(prId, options);
      } catch (error) {
        logger.error('Erro ao fazer merge do PR:', error);
        process.exit(1);
      }
    });
}

/**
 * Cria um Pull Request
 * @param {string} ambiente ambiente (qa ou prod)
 * @param {Object} options opções do comando
 */
async function createPullRequest(ambiente, options = {}) {
  logger.welcome();
  logger.title('Criando Pull Request');

  // Validar ambiente
  const envValidation = validators.environment(ambiente);
  if (envValidation !== true) {
    logger.error('Ambiente inválido:', envValidation);
    return;
  }

  // Verificar se estamos em um repositório Git
  if (!(await gitService.isGitRepository())) {
    logger.error('Este diretório não é um repositório Git');
    return;
  }

  // Carregar configuração
  const config = envUtils.loadEnv();
  if (!config.BITBUCKET_WORKSPACE || !config.BITBUCKET_REPOSITORY || !config.BITBUCKET_TOKEN) {
    logger.error('Configuração Bitbucket não encontrada. Execute: vtex-deploy config:init');
    return;
  }

  const vtexConfig =
    ambiente === 'qa'
      ? {
          account: config.QA_ACCOUNT,
          appkey: config.VTEX_QA_APPKEY,
          apptoken: config.VTEX_QA_APPTOKEN
        }
      : {
          account: config.PROD_ACCOUNT,
          appkey: config.VTEX_PROD_APPKEY,
          apptoken: config.VTEX_PROD_APPTOKEN
        };

  if (!vtexConfig.account || !vtexConfig.appkey || !vtexConfig.apptoken) {
    logger.error(`Configuração VTEX para ${ambiente.toUpperCase()} não encontrada`);
    return;
  }

  try {
    // 1. Obter branch atual
    const currentBranch = await gitService.getCurrentBranch();
    logger.info(`Branch atual: ${chalk.cyan(currentBranch)}`);

    // 2. Validar branch atual
    const branchValidation = await gitService.validateBranchForPR(currentBranch, ambiente);
    if (!branchValidation.valid) {
      logger.error('Branch inválida para PR:', branchValidation.reason);
      return;
    }

    // 3. Determinar branch de destino
    const targetBranch = ambiente === 'qa' ? 'staging' : 'main';
    logger.info(`Branch de destino: ${chalk.cyan(targetBranch)}`);

    // 4. Verificar se há mudanças não commitadas
    const hasUncommitted = await gitService.hasUncommittedChanges();
    if (hasUncommitted) {
      logger.error('Há mudanças não commitadas. Commit ou stash suas mudanças antes de criar o PR');
      return;
    }

    // 5. Verificar se a branch está sincronizada
    const isSynced = await gitService.isBranchSynced(currentBranch);
    if (!isSynced) {
      const { shouldPush } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldPush',
          message: 'A branch não está sincronizada com o remoto. Deseja fazer push?',
          default: true
        }
      ]);

      if (shouldPush) {
        logger.startSpinner('Fazendo push da branch...');
        await gitService.push(currentBranch);
        logger.succeedSpinner('Push realizado com sucesso');
      } else {
        logger.error('Branch deve estar sincronizada para criar PR');
        return;
      }
    }

    // 6. Verificar se já existe PR para esta branch
    logger.startSpinner('Verificando PRs existentes...');
    const existingPRs = await bitbucketService.searchPRsByBranch(currentBranch);

    if (existingPRs.length > 0) {
      logger.warnSpinner('PR já existe para esta branch');

      const openPRs = existingPRs.filter((pr) => pr.state === 'OPEN');
      if (openPRs.length > 0) {
        logger.warn('PRs abertos encontrados:');
        openPRs.forEach((pr) => {
          logger.pullRequest(pr);
        });

        const { shouldContinue } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldContinue',
            message: 'Deseja continuar mesmo assim?',
            default: false
          }
        ]);

        if (!shouldContinue) {
          logger.info('Operação cancelada');
          return;
        }
      }
    } else {
      logger.succeedSpinner('Nenhum PR existente encontrado');
    }

    // 7. Confirmar ação com o usuário
    logger.newLine();
    logger.subtitle('Resumo da Operação');
    logger.list([
      `Ambiente: ${chalk.yellow(ambiente.toUpperCase())}`,
      `Branch origem: ${chalk.cyan(currentBranch)}`,
      `Branch destino: ${chalk.cyan(targetBranch)}`,
      `Deploy VTEX: ${options.deploy !== false ? chalk.green('Sim') : chalk.red('Não')}`
    ]);

    const { shouldProceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldProceed',
        message: `Confirma a criação do PR para ${ambiente.toUpperCase()}?`,
        default: true
      }
    ]);

    if (!shouldProceed) {
      logger.info('Operação cancelada pelo usuário');
      return;
    }

    // 8. Executar deploy VTEX (se não foi desabilitado)
    if (options.deploy !== false) {
      logger.newLine();
      logger.subtitle('Executando Deploy VTEX');

      // Verificar se Docker está rodando
      const dockerStatus = await dockerService.getStatus();
      if (!dockerStatus.running) {
        logger.error('Docker não está rodando. Execute: docker-compose up -d');
        return;
      }

      // Deploy VTEX com geração automática de token
      logger.startSpinner('Iniciando deploy VTEX...');

      const deploySuccess =
        ambiente === 'qa'
          ? await vtexService.deployToQA(vtexConfig.account, vtexConfig.appkey, vtexConfig.apptoken)
          : await vtexService.deployToProduction(
              vtexConfig.account,
              vtexConfig.appkey,
              vtexConfig.apptoken
            );

      if (!deploySuccess) {
        logger.error('Erro durante o deploy VTEX');
        return;
      }

      logger.succeedSpinner('Deploy VTEX realizado com sucesso');

      // Usar workspace
      logger.startSpinner(`Usando workspace: ${currentBranch}...`);
      await vtexService.use(currentBranch);
      logger.succeedSpinner(`Workspace ativo: ${chalk.cyan(currentBranch)}`);

      // Executar deploy específico do ambiente
      if (ambiente === 'qa') {
        await executeQADeploy();
      } else {
        await executeProdDeploy();
      }
    }

    // 9. Obter informações para o PR
    const prTitle = options.title || (await generatePRTitle(currentBranch, ambiente));
    const prDescription =
      options.description || (await generatePRDescription(currentBranch, ambiente));

    // 10. Criar Pull Request
    logger.newLine();
    logger.startSpinner('Criando Pull Request...');

    const prData = {
      title: prTitle,
      description: prDescription,
      sourceBranch: currentBranch,
      destinationBranch: targetBranch,
      closeSourceBranch: false // Não fechar automaticamente
    };

    const pr = await bitbucketService.createPullRequest(prData);
    logger.succeedSpinner('Pull Request criado com sucesso!');

    // 11. Exibir informações do PR
    logger.newLine();
    logger.complete('Pull Request criado!');
    logger.pullRequest(pr);

    // Próximos passos
    logger.nextSteps([
      'Aguarde a revisão do código',
      'Monitore o status do build/deploy',
      'Responda aos comentários se houver',
      `Acompanhe em: ${pr.url}`
    ]);
  } catch (error) {
    logger.error('Erro durante a criação do PR:', error);
    throw error;
  }
}

/**
 * Executa deploy para QA
 */
async function executeQADeploy() {
  logger.startSpinner('Executando release...');
  await vtexService.release();
  logger.succeedSpinner('Release executado');

  logger.startSpinner('Executando publish...');
  await vtexService.publish();
  logger.succeedSpinner('Publish executado');

  logger.startSpinner('Executando install...');
  await vtexService.install();
  logger.succeedSpinner('Install executado');
}

/**
 * Executa deploy para Produção
 */
async function executeProdDeploy() {
  logger.startSpinner('Executando release...');
  await vtexService.release();
  logger.succeedSpinner('Release executado');

  logger.startSpinner('Executando publish...');
  await vtexService.publish();
  logger.succeedSpinner('Publish executado');

  logger.startSpinner('Executando deploy...');
  await vtexService.deploy();
  logger.succeedSpinner('Deploy executado');
}

/**
 * Gera título do PR automaticamente
 * @param {string} branch nome da branch
 * @param {string} ambiente ambiente
 * @returns {string} título do PR
 */
async function generatePRTitle(branch, ambiente) {
  const envPrefix = ambiente === 'qa' ? '[QA]' : '[PROD]';

  if (branch.startsWith('task-')) {
    const taskInfo = branch.replace('task-', '').replace(/-/g, ' ');
    return `${envPrefix} ${taskInfo}`;
  }

  return `${envPrefix} ${branch}`;
}

/**
 * Gera descrição do PR automaticamente
 * @param {string} branch nome da branch
 * @param {string} ambiente ambiente
 * @returns {string} descrição do PR
 */
async function generatePRDescription(branch, ambiente) {
  const lines = [
    `## Deploy para ${ambiente.toUpperCase()}`,
    '',
    `**Branch:** \`${branch}\``,
    `**Ambiente:** ${ambiente.toUpperCase()}`,
    '',
    '### Alterações',
    '- [ ] Descreva as principais alterações',
    '',
    '### Checklist',
    '- [ ] Código testado localmente',
    '- [ ] Deploy VTEX executado com sucesso',
    '- [ ] Documentação atualizada (se necessário)',
    '',
    '### Observações',
    '_Adicione observações relevantes aqui_'
  ];

  return lines.join('\n');
}

/**
 * Exibe status dos PRs da branch atual
 */
async function showPRStatus() {
  logger.title('Status dos Pull Requests');

  try {
    // Verificar configuração
    const config = envUtils.loadEnv();
    if (!config.BITBUCKET_WORKSPACE || !config.BITBUCKET_REPOSITORY) {
      logger.error('Configuração Bitbucket não encontrada');
      return;
    }

    if (!(await gitService.isGitRepository())) {
      logger.error('Este diretório não é um repositório Git');
      return;
    }

    // Obter branch atual
    const currentBranch = await gitService.getCurrentBranch();
    logger.info(`Branch atual: ${chalk.cyan(currentBranch)}`);

    // Buscar PRs da branch atual
    logger.startSpinner('Buscando Pull Requests...');
    const prs = await bitbucketService.searchPRsByBranch(currentBranch);

    if (prs.length === 0) {
      logger.warnSpinner('Nenhum Pull Request encontrado para esta branch');
      return;
    }

    logger.succeedSpinner(`${prs.length} Pull Request(s) encontrado(s)`);
    logger.newLine();

    // Exibir PRs
    prs.forEach((pr, index) => {
      if (index > 0) logger.separator();
      logger.pullRequest(pr);

      // Buscar status de build se disponível
      // TODO: Implementar busca de status de build
    });

    // Informações adicionais
    const openPRs = prs.filter((pr) => pr.state === 'OPEN');
    if (openPRs.length > 0) {
      logger.newLine();
      logger.info(`${openPRs.length} PR(s) aberto(s) aguardando revisão`);
    }
  } catch (error) {
    logger.error('Erro ao obter status dos PRs:', error);
  }
}

/**
 * Lista todos os Pull Requests
 * @param {Object} options opções de filtro
 */
async function listPullRequests(options = {}) {
  logger.title('Lista de Pull Requests');

  try {
    // Verificar configuração
    const config = envUtils.loadEnv();
    if (!config.BITBUCKET_WORKSPACE || !config.BITBUCKET_REPOSITORY) {
      logger.error('Configuração Bitbucket não encontrada');
      return;
    }

    // Buscar PRs
    logger.startSpinner('Buscando Pull Requests...');
    const filters = {
      state: options.state || 'OPEN',
      author: options.author
    };

    const prs = await bitbucketService.listPullRequests(filters);

    if (prs.length === 0) {
      logger.warnSpinner('Nenhum Pull Request encontrado');
      return;
    }

    logger.succeedSpinner(`${prs.length} Pull Request(s) encontrado(s)`);
    logger.newLine();

    // Agrupar por estado
    const prsByState = prs.reduce((acc, pr) => {
      if (!acc[pr.state]) acc[pr.state] = [];
      acc[pr.state].push(pr);
      return acc;
    }, {});

    // Exibir PRs agrupados
    Object.entries(prsByState).forEach(([state, statePRs]) => {
      logger.subtitle(`${logger.formatPRState(state)} (${statePRs.length})`);

      statePRs.forEach((pr) => {
        console.log(`  #${pr.id} ${pr.title}`);
        console.log(`    ${chalk.gray(pr.sourceBranch)} → ${chalk.gray(pr.destinationBranch)}`);
        console.log(`    ${chalk.gray('Por:')} ${pr.author} ${chalk.gray('em')} ${pr.createdOn}`);
        console.log();
      });
    });
  } catch (error) {
    logger.error('Erro ao listar PRs:', error);
  }
}

/**
 * Faz merge de um Pull Request
 * @param {string} prId ID do PR
 * @param {Object} options opções
 */
async function mergePullRequest(prId, options = {}) {
  logger.title('Merge de Pull Request');

  try {
    // Verificar configuração
    const config = envUtils.loadEnv();
    if (!config.BITBUCKET_WORKSPACE || !config.BITBUCKET_REPOSITORY) {
      logger.error('Configuração Bitbucket não encontrada');
      return;
    }

    // Buscar PR
    logger.startSpinner('Buscando Pull Request...');
    const pr = await bitbucketService.getPullRequest(prId);

    if (!pr) {
      logger.failSpinner('Pull Request não encontrado');
      return;
    }

    logger.succeedSpinner('Pull Request encontrado');
    logger.pullRequest(pr);

    // Verificar se pode fazer merge
    if (pr.state !== 'OPEN') {
      logger.error(`PR não está aberto. Estado atual: ${pr.state}`);
      return;
    }

    // Confirmar merge
    const { shouldMerge } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldMerge',
        message: 'Confirma o merge deste Pull Request?',
        default: false
      }
    ]);

    if (!shouldMerge) {
      logger.info('Merge cancelado');
      return;
    }

    // Executar merge
    logger.startSpinner('Executando merge...');
    const mergeResult = await bitbucketService.mergePullRequest(prId, {
      closeSourceBranch: options.closeBranch
    });

    logger.succeedSpinner('Merge executado com sucesso!');
    logger.success(`PR #${prId} foi merged`);

    if (options.closeBranch) {
      logger.info('Branch de origem foi fechada');
    }
  } catch (error) {
    logger.error('Erro ao fazer merge do PR:', error);
  }
}

module.exports = registerPRCommands;
