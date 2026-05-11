const chalk = require('chalk');
const gitService = require('../services/git');
const dockerService = require('../services/docker');
const vtexService = require('../services/vtex');
const bitbucketService = require('../services/bitbucket');
const envUtils = require('../utils/env');
const logger = require('../utils/logger');
const validators = require('../utils/validators');
const { addAutomationOptions, confirm, requireCIFlag, runAction, CliError } = require('../utils/cli');

/**
 * Registra comandos relacionados a Pull Requests
 * @param {Object} program instância do commander
 */
function registerPRCommands(program) {
  // Comando pr:create
  addAutomationOptions(program
    .command('pr:create <ambiente>')
    .description('Cria Pull Request para QA ou Produção')
    .option('-t, --title <title>', 'Título do Pull Request')
    .option('-d, --description <description>', 'Descrição do Pull Request')
    .option('--no-deploy', 'Não executar deploy antes de criar o PR')
    .option('--json', 'Emite logs estruturados em JSON Lines')
    .action(async (ambiente, options) => {
      await runAction(() => createPullRequest(ambiente, options), 'Erro ao criar Pull Request:');
    });

  // Comando pr:status
  program
    .command('pr:status')
    .description('Exibe status dos Pull Requests da branch atual')
    .action(async () => {
      await runAction(() => showPRStatus(), 'Erro ao obter status do PR:');
    });

  // Comando pr:list
  program
    .command('pr:list')
    .description('Lista todos os Pull Requests abertos')
    .option('-a, --author <author>', 'Filtrar por autor')
    .option('-s, --state <state>', 'Filtrar por estado (OPEN, MERGED, DECLINED)')
    .action(async (options) => {
      await runAction(() => listPullRequests(options), 'Erro ao listar Pull Requests:');
    });

  // Comando pr:merge
  addAutomationOptions(program
    .command('pr:merge <prId>')
    .description('Faz merge de um Pull Request')
    .option('--close-branch', 'Fechar branch após merge')
    .option('--confirm-merge', 'Confirma explicitamente o merge em modo CI/não interativo'))
    .action(async (prId, options) => {
      await runAction(() => mergePullRequest(prId, options), 'Erro ao fazer merge do PR:');
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
    throw new CliError(`Ambiente inválido: ${envValidation}`, 2);
  }

  // Verificar se estamos em um repositório Git
  if (!await gitService.isGitRepository()) {
    throw new CliError('Este diretório não é um repositório Git', 2);
  }

  // Carregar configuração
  const config = envUtils.loadEnv();
  if (!config.BITBUCKET_WORKSPACE || !config.BITBUCKET_REPOSITORY || !config.BITBUCKET_TOKEN) {
    throw new CliError('Configuração Bitbucket não encontrada. Execute: vtex-deploy config:init', 2);
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
    throw new CliError(`Configuração VTEX para ${ambiente.toUpperCase()} não encontrada`, 2);
  }

  try {
    // 1. Obter branch atual
    const currentBranch = await gitService.getCurrentBranch();
    logger.info(`Branch atual: ${chalk.cyan(currentBranch)}`);

    // 2. Determinar branch de destino e iniciar rastreamento
    const targetBranch = ambiente === 'qa' ? 'staging' : 'main';
    const prContext = {
      environment: ambiente,
      sourceBranch: currentBranch,
      destinationBranch: targetBranch
    };
    logger.info(`Branch de destino: ${chalk.cyan(targetBranch)}`);
    logger.structured('pr_started', prContext);

    // 3. Validar branch atual
    const branchValidation = await gitService.validateBranchForPR();
    if (!branchValidation.valid) {
      logger.structured('pr_finished', { ...prContext, result: 'failed', reason: branchValidation.message }, 'error');
      logger.error('Branch inválida para PR:', branchValidation.message);
      return;
    }

    // 4. Verificar se há mudanças não commitadas
    const hasUncommitted = await gitService.hasUncommittedChanges();
    if (hasUncommitted) {
      logger.structured('pr_finished', { ...prContext, result: 'failed', reason: 'uncommitted_changes' }, 'error');
      logger.error('Há mudanças não commitadas. Commit ou stash suas mudanças antes de criar o PR');
      return;
    }

    // 5. Verificar se a branch está sincronizada
    const isSynced = await gitService.isBranchSynced(currentBranch);
    if (!isSynced) {
      const shouldPush = await confirm(options, {
        type: 'confirm',
        name: 'shouldPush',
        message: 'A branch não está sincronizada com o remoto. Deseja fazer push?',
        default: true
      }, {
        errorMessage: 'Modo não interativo: a branch deve estar sincronizada antes de criar o PR.'
      });

      if (shouldPush) {
        logger.startSpinner('Fazendo push da branch...');
        await gitService.push(currentBranch);
        logger.succeedSpinner('Push realizado com sucesso');
      } else {
        logger.structured('pr_finished', { ...prContext, result: 'failed', reason: 'branch_not_synced' }, 'error');
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
        
        const shouldContinue = await confirm(options, {
          type: 'confirm',
          name: 'shouldContinue',
          message: 'Deseja continuar mesmo assim?',
          default: false
        }, {
          errorMessage: 'Modo não interativo: já existe PR aberto para esta branch. Feche o PR existente ou execute interativamente.'
        });
        
        if (!shouldContinue) {
          logger.structured('pr_finished', { ...prContext, result: 'cancelled_existing_pr' }, 'warn');
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

    const shouldProceed = await confirm(options, {
      type: 'confirm',
      name: 'shouldProceed',
      message: `Confirma a criação do PR para ${ambiente.toUpperCase()}?`,
      default: true
    }, {
      errorMessage: 'Modo não interativo: use --yes para confirmar a criação do PR sem prompt.'
    });

    if (!shouldProceed) {
      logger.structured('pr_finished', { ...prContext, result: 'cancelled_by_user' }, 'warn');
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
        logger.structured('pr_finished', { ...prContext, result: 'failed', reason: 'docker_not_running' }, 'error');
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
        logger.structured('pr_finished', { ...prContext, result: 'failed', reason: 'vtex_deploy_failed' }, 'error');
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
    logger.structured('pr_finished', {
      ...prContext,
      pullRequestId: pr.id,
      pullRequestUrl: pr.url,
      result: 'success'
    }, 'success');

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
    logger.structured('pr_finished', { result: 'error', error }, 'error');
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
      throw new CliError('Configuração Bitbucket não encontrada', 2);
    }

    if (!await gitService.isGitRepository()) {
      throw new CliError('Este diretório não é um repositório Git', 2);
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
    throw error;
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
      throw new CliError('Configuração Bitbucket não encontrada', 2);
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
    throw error;
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
    requireCIFlag(options, 'confirmMerge', '--confirm-merge', 'merge');

    // Verificar configuração
    const config = envUtils.loadEnv();
    if (!config.BITBUCKET_WORKSPACE || !config.BITBUCKET_REPOSITORY) {
      throw new CliError('Configuração Bitbucket não encontrada', 2);
    }

    // Buscar PR
    logger.startSpinner('Buscando Pull Request...');
    const pr = await bitbucketService.getPullRequest(prId);

    if (!pr) {
      logger.failSpinner('Pull Request não encontrado');
      throw new CliError('Pull Request não encontrado', 2);
    }

    logger.succeedSpinner('Pull Request encontrado');
    logger.pullRequest(pr);

    // Verificar se pode fazer merge
    if (pr.state !== 'OPEN') {
      throw new CliError(`PR não está aberto. Estado atual: ${pr.state}`, 2);
    }

    // Confirmar merge
    const shouldMerge = await confirm(options, {
      type: 'confirm',
      name: 'shouldMerge',
      message: 'Confirma o merge deste Pull Request?',
      default: false
    }, {
      autoYes: Boolean(options.confirmMerge),
      allowYes: false,
      errorMessage: 'Modo não interativo: use --confirm-merge para confirmar o merge sem prompt.'
    });

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
    throw error;
  }
}

module.exports = registerPRCommands;
