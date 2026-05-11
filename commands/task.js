const inquirer = require('inquirer');
const chalk = require('chalk');
const gitService = require('../services/git');
const dockerService = require('../services/docker');
const vtexService = require('../services/vtex');
const envUtils = require('../utils/env');
const logger = require('../utils/logger');
const validators = require('../utils/validators');

/**
 * Registra comandos relacionados a tasks
 * @param {Object} program instância do commander
 */
function registerTaskCommands(program) {
  // Comando task:create
  program
    .command('task:create <nome> <numero>')
    .description('Cria uma nova task com branch, Docker e setup VTEX')
    .option('-f, --force', 'Força a criação mesmo se a branch já existir')
    .action(async (nome, numero, options) => {
      try {
        await createTask(nome, numero, options);
      } catch (error) {
        logger.error('Erro ao criar task:', error);
        process.exit(1);
      }
    });

  // Comando task:status
  program
    .command('task:status')
    .description('Exibe status da task atual')
    .action(async () => {
      try {
        await showTaskStatus();
      } catch (error) {
        logger.error('Erro ao obter status da task:', error);
        process.exit(1);
      }
    });

  // Comando task:list
  program
    .command('task:list')
    .description('Lista todas as branches de task')
    .action(async () => {
      try {
        await listTasks();
      } catch (error) {
        logger.error('Erro ao listar tasks:', error);
        process.exit(1);
      }
    });

  // Comando task:switch
  program
    .command('task:switch <branch>')
    .description('Muda para uma branch de task existente')
    .action(async (branch) => {
      try {
        await switchTask(branch);
      } catch (error) {
        logger.error('Erro ao mudar para task:', error);
        process.exit(1);
      }
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
    logger.error('Nome da task inválido:', nameValidation);
    return;
  }

  const numberValidation = validators.taskNumber(numero);
  if (numberValidation !== true) {
    logger.error('Número da task inválido:', numberValidation);
    return;
  }

  // Verificar se estamos em um repositório Git
  if (!(await gitService.isGitRepository())) {
    logger.error('Este diretório não é um repositório Git');
    return;
  }

  // Carregar configuração
  const config = envUtils.loadEnv();
  if (!config.QA_ACCOUNT || !config.VTEX_QA_APPKEY || !config.VTEX_QA_APPTOKEN) {
    logger.error('Configuração VTEX não encontrada. Execute: vtex-deploy config:init');
    return;
  }

  const branchName = `task-${nome}-${numero}`;

  logger.info(`Criando task: ${chalk.cyan(branchName)}`);
  logger.newLine();

  try {
    // 1. Verificar se a branch já existe
    const branchExists = await gitService.branchExists(branchName);
    if (branchExists && !options.force) {
      const { shouldContinue } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldContinue',
          message: `A branch '${branchName}' já existe. Deseja fazer checkout para ela?`,
          default: false
        }
      ]);

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
        const { shouldStash } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldStash',
            message: 'Há mudanças não commitadas. Deseja fazer stash delas?',
            default: true
          }
        ]);

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
      logger.error('Docker é necessário para executar os comandos VTEX');
      return;
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
    const deploySuccess = await vtexService.deployToQA(
      config.QA_ACCOUNT,
      config.VTEX_QA_APPKEY,
      config.VTEX_QA_APPTOKEN
    );

    if (!deploySuccess) {
      logger.failSpinner('Erro durante o deploy VTEX');
      return;
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
    logger.error('Erro durante a criação da task:', error);

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
    if (!(await gitService.isGitRepository())) {
      logger.error('Este diretório não é um repositório Git');
      return;
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
      logger.error('Configuração VTEX não encontrada');
      return;
    }

    // Status do Git
    logger.subtitle('Status do Git');
    const hasUncommitted = await gitService.hasUncommittedChanges();
    const status = {
      'Mudanças não commitadas': hasUncommitted ? 'Sim' : 'Não',
      'Branch sincronizada': (await gitService.isBranchSynced(currentBranch)) ? 'Sim' : 'Não'
    };

    Object.entries(status).forEach(([key, value]) => {
      const icon =
        value === 'Sim'
          ? key.includes('não commitadas')
            ? chalk.yellow('⚠')
            : chalk.green('✓')
          : chalk.green('✓');
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
    console.log(
      `  ${remoteBranchExists ? chalk.green('✓') : chalk.red('✗')} Branch existe no remoto: ${remoteBranchExists ? 'Sim' : 'Não'}`
    );

    if (remoteBranchExists && config.BITBUCKET_WORKSPACE && config.BITBUCKET_REPOSITORY) {
      // Verificar se há PR aberto
      try {
        const bitbucketService = require('../services/bitbucket');
        const prs = await bitbucketService.searchPRsByBranch(currentBranch);

        if (prs.length > 0) {
          logger.subtitle('Pull Requests');
          prs.forEach((pr) => {
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
    logger.error('Erro ao obter status:', error);
  }
}

/**
 * Lista todas as branches de task
 */
async function listTasks() {
  logger.title('Lista de Tasks');

  try {
    if (!(await gitService.isGitRepository())) {
      logger.error('Este diretório não é um repositório Git');
      return;
    }

    const branches = await gitService.listBranches();
    const taskBranches = branches.filter((branch) => branch.startsWith('task-'));

    if (taskBranches.length === 0) {
      logger.info('Nenhuma branch de task encontrada');
      return;
    }

    const currentBranch = await gitService.getCurrentBranch();

    logger.subtitle('Branches de Task');
    taskBranches.forEach((branch) => {
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
    logger.error('Erro ao listar tasks:', error);
  }
}

/**
 * Muda para uma branch de task existente
 * @param {string} branch nome da branch
 */
async function switchTask(branch) {
  logger.title('Mudando para Task');

  try {
    // Validar nome da branch
    const branchValidation = validators.branchName(branch);
    if (branchValidation !== true) {
      logger.error('Nome da branch inválido:', branchValidation);
      return;
    }

    if (!(await gitService.isGitRepository())) {
      logger.error('Este diretório não é um repositório Git');
      return;
    }

    // Verificar se a branch existe
    const branchExists = await gitService.branchExists(branch);
    if (!branchExists) {
      logger.error(`Branch '${branch}' não existe`);

      // Sugerir branches similares
      const branches = await gitService.listBranches();
      const taskBranches = branches.filter((b) => b.startsWith('task-'));

      if (taskBranches.length > 0) {
        logger.info('Branches de task disponíveis:');
        taskBranches.forEach((b) => {
          console.log(`  ${chalk.cyan(b)}`);
        });
      }
      return;
    }

    // Verificar mudanças não commitadas
    const hasUncommitted = await gitService.hasUncommittedChanges();
    if (hasUncommitted) {
      const { shouldStash } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldStash',
          message: 'Há mudanças não commitadas. Deseja fazer stash delas?',
          default: true
        }
      ]);

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
    logger.error('Erro ao mudar para task:', error);
  }
}

module.exports = registerTaskCommands;
