const chalk = require('chalk');
const gitService = require('../services/git');
const dockerService = require('../services/docker');
const vtexService = require('../services/vtex');
const envUtils = require('../utils/env');
const logger = require('../utils/logger');
const validators = require('../utils/validators');
const { addAutomationOptions, confirm, runAction, CliError } = require('../utils/cli');

/**
 * Registra comandos relacionados a tasks
 * @param {Object} program instância do commander
 */
function registerTaskCommands(program) {
  // Comando task:create
  addAutomationOptions(program
    .command('task:create <nome> <numero>')
    .description('Cria uma nova task com branch, Docker e setup VTEX')
    .option('-f, --force', 'Força a criação mesmo se a branch já existir'))
    .action(async (nome, numero, options) => {
      await runAction(() => createTask(nome, numero, options), 'Erro ao criar task:');
    });

  // Comando task:status
  program
    .command('task:status')
    .description('Exibe status da task atual')
    .action(async () => {
      await runAction(() => showTaskStatus(), 'Erro ao obter status da task:');
    });

  // Comando task:list
  program
    .command('task:list')
    .description('Lista todas as branches de task')
    .action(async () => {
      await runAction(() => listTasks(), 'Erro ao listar tasks:');
    });

  // Comando task:switch
  addAutomationOptions(program
    .command('task:switch <branch>')
    .description('Muda para uma branch de task existente'))
    .action(async (branch, options) => {
      await runAction(() => switchTask(branch, options), 'Erro ao mudar para task:');
    });
}

/**
 * Cria uma nova task
 * @param {string} nome nome da task
 * @param {string} numero número da task
 * @param {Object} options opções do comando
 */
async function createTask(nome, numero, options = {}) {
  logger.welcome();
  logger.title('Criando Nova Task');

  // Validar parâmetros
  const nameValidation = validators.taskName(nome);
  if (nameValidation !== true) {
    throw new CliError(`Nome da task inválido: ${nameValidation}`, 2);
  }

  const numberValidation = validators.taskNumber(numero);
  if (numberValidation !== true) {
    throw new CliError(`Número da task inválido: ${numberValidation}`, 2);
  }

  // Verificar se estamos em um repositório Git
  if (!await gitService.isGitRepository()) {
    throw new CliError('Este diretório não é um repositório Git', 2);
  }

  // Carregar configuração
  const config = envUtils.loadEnv();
  if (!config.QA_ACCOUNT || !config.VTEX_QA_APPKEY || !config.VTEX_QA_APPTOKEN) {
    throw new CliError('Configuração VTEX não encontrada. Execute: vtex-deploy config:init', 2);
  }

  const branchName = `task-${nome}-${numero}`;
  
  logger.info(`Criando task: ${chalk.cyan(branchName)}`);
  logger.newLine();

  try {
    // 1. Verificar se a branch já existe
    const branchExists = await gitService.branchExists(branchName);
    if (branchExists && !options.force) {
      const shouldContinue = await confirm(options, {
        type: 'confirm',
        name: 'shouldContinue',
        message: `A branch '${branchName}' já existe. Deseja fazer checkout para ela?`,
        default: false
      }, {
        autoYes: Boolean(options.force),
        errorMessage: `Modo não interativo: a branch '${branchName}' já existe. Use --force para fazer checkout explicitamente.`
      });

      if (!shouldContinue) {
        logger.warn('Operação cancelada pelo usuário');
        return;
      }

      // Fazer checkout para branch existente
      logger.startSpinner('Fazendo checkout para branch existente...');
      await gitService.checkoutBranch(branchName);
      logger.succeedSpinner(`Checkout realizado para: ${chalk.cyan(branchName)}`);
    } else {
      // 2. Verificar se há mudanças não commitadas
      const hasUncommittedChanges = await gitService.hasUncommittedChanges();
      if (hasUncommittedChanges) {
        const shouldStash = await confirm(options, {
          type: 'confirm',
          name: 'shouldStash',
          message: 'Há mudanças não commitadas. Deseja fazer stash delas?',
          default: true
        }, {
          errorMessage: 'Modo não interativo: há mudanças não commitadas. Faça commit/stash antes de continuar.'
        });

        if (shouldStash) {
          logger.startSpinner('Fazendo stash das mudanças...');
          await gitService.stash();
          logger.succeedSpinner('Mudanças salvas em stash');
        } else {
          logger.warn('Continuando com mudanças não commitadas...');
        }
      }

      // 3. Criar e fazer checkout da nova branch
      logger.startSpinner('Criando nova branch...');
      await gitService.createAndCheckoutBranch(branchName);
      logger.succeedSpinner(`Branch criada: ${chalk.cyan(branchName)}`);
    }

    // 4. Verificar se Docker está disponível
    logger.startSpinner('Verificando Docker...');
    const dockerAvailable = await dockerService.isDockerAvailable();
    if (!dockerAvailable) {
      logger.failSpinner('Docker não está disponível');
      throw new CliError('Docker é necessário para executar os comandos VTEX', 1);
    }
    logger.succeedSpinner('Docker disponível');

    // 5. Iniciar containers Docker
    logger.startSpinner('Iniciando containers Docker...');
    await dockerService.startContainers();
    logger.succeedSpinner('Containers Docker iniciados');

    // 6. Aguardar containers ficarem prontos
    logger.startSpinner('Aguardando containers ficarem prontos...');
    await dockerService.waitForContainers();
    logger.succeedSpinner('Containers prontos');

    // 7. Executar deploy VTEX para QA
    logger.startSpinner('Iniciando deploy VTEX para QA...');
    const deploySuccess = await vtexService.deployToQA(config.QA_ACCOUNT, config.VTEX_QA_APPKEY, config.VTEX_QA_APPTOKEN);
    
    if (!deploySuccess) {
      logger.failSpinner('Erro durante o deploy VTEX');
      throw new CliError('Erro durante o deploy VTEX', 1);
    }
    
    logger.succeedSpinner('Deploy VTEX realizado com sucesso');

    // 8. Usar workspace da branch
    logger.startSpinner(`Usando workspace: ${branchName}...`);
    await vtexService.use(branchName);
    logger.succeedSpinner(`Workspace ativo: ${chalk.cyan(branchName)}`);

    // 9. Fazer link da aplicação
    logger.startSpinner('Fazendo link da aplicação...');
    const linkResult = await vtexService.link();
    logger.succeedSpinner('Aplicação linkada com sucesso');

    // 10. Obter informações do workspace
    const workspaceInfo = await vtexService.getWorkspaceInfo();
    
    logger.newLine();
    logger.complete('Task criada com sucesso!');
    
    // Exibir informações da task
    logger.subtitle('Informações da Task');
    logger.list([
      `Branch: ${chalk.cyan(branchName)}`,
      `Workspace VTEX: ${chalk.cyan(workspaceInfo.workspace)}`,
      `Conta: ${chalk.cyan(workspaceInfo.account)}`,
      `Ambiente: ${chalk.cyan('QA')}`
    ]);

    // Exibir URL de preview se disponível
    if (linkResult && linkResult.previewUrl) {
      logger.newLine();
      logger.url('URL de Preview', linkResult.previewUrl);
    }

    // Próximos passos
    logger.nextSteps([
      'Desenvolva suas alterações',
      'Teste localmente usando a URL de preview',
      'Commit suas mudanças: git add . && git commit -m "sua mensagem"',
      'Push da branch: git push origin ' + branchName,
      'Crie um PR quando estiver pronto: vtex-deploy pr:create qa'
    ]);

  } catch (error) {
    // Tentar fazer rollback
    try {
      logger.warn('Tentando fazer rollback...');
      const currentBranch = await gitService.getCurrentBranch();
      if (currentBranch === branchName) {
        await gitService.checkoutBranch('main');
        logger.info('Voltou para branch main');
      }
    } catch (rollbackError) {
      logger.error('Erro no rollback:', rollbackError);
    }
    
    throw error;
  }
}

/**
 * Exibe status da task atual
 */
async function showTaskStatus() {
  logger.title('Status da Task Atual');

  try {
    // Verificar se estamos em um repositório Git
    if (!await gitService.isGitRepository()) {
      throw new CliError('Este diretório não é um repositório Git', 2);
    }

    // Obter branch atual
    const currentBranch = await gitService.getCurrentBranch();
    logger.info(`Branch atual: ${chalk.cyan(currentBranch)}`);

    // Verificar se é uma branch de task
    const isTaskBranch = currentBranch.startsWith('task-');
    if (!isTaskBranch) {
      logger.warn('Você não está em uma branch de task');
      return;
    }

    // Carregar configuração
    const config = envUtils.loadEnv();
    if (!config.QA_ACCOUNT) {
      throw new CliError('Configuração VTEX não encontrada', 2);
    }

    // Status do Git
    logger.subtitle('Status do Git');
    const hasUncommitted = await gitService.hasUncommittedChanges();
    const status = {
      'Mudanças não commitadas': hasUncommitted ? 'Sim' : 'Não',
      'Branch sincronizada': await gitService.isBranchSynced(currentBranch) ? 'Sim' : 'Não'
    };

    Object.entries(status).forEach(([key, value]) => {
      const icon = value === 'Sim' ? 
        (key.includes('não commitadas') ? chalk.yellow('⚠') : chalk.green('✓')) : 
        chalk.green('✓');
      console.log(`  ${icon} ${key}: ${value}`);
    });

    // Status do Docker
    logger.subtitle('Status do Docker');
    const dockerStatus = await dockerService.getStatus();
    logger.status({
      'Docker disponível': dockerStatus.available,
      'Containers rodando': dockerStatus.running
    });

    // Status do VTEX
    if (dockerStatus.running) {
      logger.subtitle('Status do VTEX');
      try {
        const workspaceInfo = await vtexService.getWorkspaceInfo();
        logger.workspace(workspaceInfo);
      } catch (error) {
        logger.warn('Não foi possível obter informações do workspace VTEX');
        logger.debug('Erro VTEX:', error);
      }
    }

    // Informações da branch remota
    logger.subtitle('Informações Remotas');
    const remoteBranchExists = await gitService.remoteBranchExists(currentBranch);
    console.log(`  ${remoteBranchExists ? chalk.green('✓') : chalk.red('✗')} Branch existe no remoto: ${remoteBranchExists ? 'Sim' : 'Não'}`);

    if (remoteBranchExists && config.BITBUCKET_WORKSPACE && config.BITBUCKET_REPOSITORY) {
      // Verificar se há PR aberto
      try {
        const bitbucketService = require('../services/bitbucket');
        const prs = await bitbucketService.searchPRsByBranch(currentBranch);
        
        if (prs.length > 0) {
          logger.subtitle('Pull Requests');
          prs.forEach(pr => {
            logger.pullRequest(pr);
          });
        } else {
          console.log(`  ${chalk.yellow('⚠')} Nenhum PR encontrado para esta branch`);
        }
      } catch (error) {
        logger.debug('Erro ao buscar PRs:', error);
      }
    }

  } catch (error) {
    throw error;
  }
}

/**
 * Lista todas as branches de task
 */
async function listTasks() {
  logger.title('Lista de Tasks');

  try {
    if (!await gitService.isGitRepository()) {
      throw new CliError('Este diretório não é um repositório Git', 2);
    }

    const branches = await gitService.listBranches();
    const taskBranches = branches.filter(branch => branch.startsWith('task-'));

    if (taskBranches.length === 0) {
      logger.info('Nenhuma branch de task encontrada');
      return;
    }

    const currentBranch = await gitService.getCurrentBranch();
    
    logger.subtitle('Branches de Task');
    taskBranches.forEach(branch => {
      const isCurrent = branch === currentBranch;
      const icon = isCurrent ? chalk.green('→') : ' ';
      const branchName = isCurrent ? chalk.green.bold(branch) : chalk.cyan(branch);
      console.log(`  ${icon} ${branchName}`);
    });

    logger.newLine();
    logger.info(`Total: ${taskBranches.length} task(s)`);
    
    if (currentBranch.startsWith('task-')) {
      logger.info(`Atual: ${chalk.green(currentBranch)}`);
    }

  } catch (error) {
    throw error;
  }
}

/**
 * Muda para uma branch de task existente
 * @param {string} branch nome da branch
 */
async function switchTask(branch, options = {}) {
  logger.title('Mudando para Task');

  try {
    // Validar nome da branch
    const branchValidation = validators.branchName(branch);
    if (branchValidation !== true) {
      throw new CliError(`Nome da branch inválido: ${branchValidation}`, 2);
    }

    if (!await gitService.isGitRepository()) {
      throw new CliError('Este diretório não é um repositório Git', 2);
    }

    // Verificar se a branch existe
    const branchExists = await gitService.branchExists(branch);
    if (!branchExists) {
      logger.error(`Branch '${branch}' não existe`);
      
      // Sugerir branches similares
      const branches = await gitService.listBranches();
      const taskBranches = branches.filter(b => b.startsWith('task-'));
      
      if (taskBranches.length > 0) {
        logger.info('Branches de task disponíveis:');
        taskBranches.forEach(b => {
          console.log(`  ${chalk.cyan(b)}`);
        });
      }
      throw new CliError(`Branch '${branch}' não existe`, 2);
    }

    // Verificar mudanças não commitadas
    const hasUncommitted = await gitService.hasUncommittedChanges();
    if (hasUncommitted) {
      const shouldStash = await confirm(options, {
        type: 'confirm',
        name: 'shouldStash',
        message: 'Há mudanças não commitadas. Deseja fazer stash delas?',
        default: true
      }, {
        errorMessage: 'Modo não interativo: há mudanças não commitadas. Faça commit/stash antes de trocar de branch.'
      });

      if (shouldStash) {
        logger.startSpinner('Fazendo stash das mudanças...');
        await gitService.stash();
        logger.succeedSpinner('Mudanças salvas em stash');
      }
    }

    // Fazer checkout
    logger.startSpinner(`Mudando para branch: ${branch}...`);
    await gitService.checkoutBranch(branch);
    logger.succeedSpinner(`Agora em: ${chalk.cyan(branch)}`);

    // Se for uma branch de task, configurar ambiente
    if (branch.startsWith('task-')) {
      const config = envUtils.loadEnv();
      if (config.VTEX_QA_ACCOUNT && config.VTEX_QA_TOKEN) {
        // Verificar se Docker está rodando
        const dockerStatus = await dockerService.getStatus();
        
        if (dockerStatus.running) {
          logger.startSpinner('Configurando workspace VTEX...');
          try {
            await vtexService.use(branch);
            logger.succeedSpinner(`Workspace ativo: ${chalk.cyan(branch)}`);
          } catch (error) {
            logger.warnSpinner('Não foi possível configurar workspace VTEX');
            logger.debug('Erro VTEX:', error);
          }
        } else {
          logger.warn('Docker não está rodando. Execute: docker-compose up -d');
        }
      }
    }

    logger.complete(`Mudança para task '${branch}' concluída!`);

  } catch (error) {
    throw error;
  }
}

module.exports = registerTaskCommands;