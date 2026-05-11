const inquirer = require('inquirer');
const chalk = require('chalk');
const gitService = require('../services/git');
const dockerService = require('../services/docker');
const vtexService = require('../services/vtex');
const envUtils = require('../utils/env');
const logger = require('../utils/logger');
const validators = require('../utils/validators');

/**
 * Registra comandos relacionados a deploy
 * @param {Object} program instância do commander
 */
function registerDeployCommands(program) {
  // Comando deploy
  program
    .command('deploy <ambiente>')
    .description('Executa deploy VTEX para QA ou Produção')
    .option('-w, --workspace <workspace>', 'Workspace específico (padrão: branch atual)')
    .option('-f, --force', 'Força o deploy sem confirmação')
    .option('--skip-release', 'Pula a etapa de release')
    .option('--skip-publish', 'Pula a etapa de publish')
    .option('--only-link', 'Executa apenas o link da aplicação')
    .action(async (ambiente, options) => {
      try {
        await executeDeploy(ambiente, options);
      } catch (error) {
        logger.error('Erro durante o deploy:', error);
        process.exit(1);
      }
    });

  // Comando deploy:status
  program
    .command('deploy:status')
    .description('Verifica status do último deploy')
    .option('-e, --environment <env>', 'Ambiente específico (qa ou prod)')
    .action(async (options) => {
      try {
        await showDeployStatus(options);
      } catch (error) {
        logger.error('Erro ao verificar status do deploy:', error);
        process.exit(1);
      }
    });

  // Comando deploy:rollback
  program
    .command('deploy:rollback <ambiente>')
    .description('Faz rollback do último deploy')
    .option('-v, --version <version>', 'Versão específica para rollback')
    .action(async (ambiente, options) => {
      try {
        await rollbackDeploy(ambiente, options);
      } catch (error) {
        logger.error('Erro durante o rollback:', error);
        process.exit(1);
      }
    });

  // Comando deploy:logs
  program
    .command('deploy:logs')
    .description('Exibe logs do deploy atual')
    .option('-f, --follow', 'Acompanha logs em tempo real')
    .option('-n, --lines <number>', 'Número de linhas a exibir', '50')
    .action(async (options) => {
      try {
        await showDeployLogs(options);
      } catch (error) {
        logger.error('Erro ao exibir logs:', error);
        process.exit(1);
      }
    });
}

/**
 * Executa deploy para o ambiente especificado
 * @param {string} ambiente ambiente (qa ou prod)
 * @param {Object} options opções do comando
 */
async function executeDeploy(ambiente, options = {}) {
  logger.welcome();
  logger.title(`Deploy para ${ambiente.toUpperCase()}`);

  // Validar ambiente
  const envValidation = validators.environment(ambiente);
  if (envValidation !== true) {
    logger.error('Ambiente inválido:', envValidation);
    return;
  }

  // Carregar configuração
  const config = envUtils.loadEnv();
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
    logger.error(
      `Configuração VTEX para ${ambiente.toUpperCase()} não encontrada. Execute: vtex-deploy config:init`
    );
    return;
  }

  try {
    // 1. Verificar se estamos em um repositório Git
    let currentBranch = 'unknown';
    let workspace = options.workspace;

    if (await gitService.isGitRepository()) {
      currentBranch = await gitService.getCurrentBranch();

      if (!workspace) {
        workspace = currentBranch;
      }

      logger.info(`Branch atual: ${chalk.cyan(currentBranch)}`);

      // Verificar se há mudanças não commitadas
      const hasUncommitted = await gitService.hasUncommittedChanges();
      if (hasUncommitted && !options.force) {
        logger.warn('Há mudanças não commitadas');

        const { shouldContinue } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldContinue',
            message: 'Deseja continuar mesmo assim?',
            default: false
          }
        ]);

        if (!shouldContinue) {
          logger.info('Deploy cancelado');
          return;
        }
      }
    }

    if (!workspace) {
      workspace = 'main';
    }

    logger.info(`Workspace: ${chalk.cyan(workspace)}`);
    logger.info(`Conta VTEX: ${chalk.cyan(vtexConfig.account)}`);

    // 2. Verificar se Docker está disponível e rodando
    logger.startSpinner('Verificando Docker...');
    const dockerStatus = await dockerService.getStatus();

    if (!dockerStatus.available) {
      logger.failSpinner('Docker não está disponível');
      logger.error('Docker é necessário para executar os comandos VTEX');
      return;
    }

    if (!dockerStatus.running) {
      logger.updateSpinner('Iniciando containers Docker...');
      await dockerService.startContainers();
      await dockerService.waitForContainers();
      logger.succeedSpinner('Docker iniciado e pronto');
    } else {
      logger.succeedSpinner('Docker disponível e rodando');
    }

    // 3. Confirmar deploy (se não forçado)
    if (!options.force) {
      logger.newLine();
      logger.subtitle('Resumo do Deploy');
      logger.list([
        `Ambiente: ${chalk.yellow(ambiente.toUpperCase())}`,
        `Workspace: ${chalk.cyan(workspace)}`,
        `Conta VTEX: ${chalk.cyan(vtexConfig.account)}`,
        `Branch: ${chalk.cyan(currentBranch)}`,
        `Apenas link: ${options.onlyLink ? chalk.green('Sim') : chalk.red('Não')}`,
        `Pular release: ${options.skipRelease ? chalk.yellow('Sim') : chalk.green('Não')}`,
        `Pular publish: ${options.skipPublish ? chalk.yellow('Sim') : chalk.green('Não')}`
      ]);

      const { shouldProceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldProceed',
          message: `Confirma o deploy para ${ambiente.toUpperCase()}?`,
          default: ambiente === 'qa' // Mais cauteloso para prod
        }
      ]);

      if (!shouldProceed) {
        logger.info('Deploy cancelado pelo usuário');
        return;
      }
    }

    // 4. Executar deploy VTEX (com geração automática de token)
    logger.newLine();
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
      logger.failSpinner('Erro durante o deploy VTEX');
      return;
    }

    logger.succeedSpinner('Deploy VTEX realizado com sucesso');

    // 5. Usar workspace
    logger.startSpinner(`Usando workspace: ${workspace}...`);
    await vtexService.use(workspace);
    logger.succeedSpinner(`Workspace ativo: ${chalk.cyan(workspace)}`);

    // 6. Executar etapas do deploy
    const startTime = Date.now();

    if (options.onlyLink) {
      // Apenas link
      logger.startSpinner('Fazendo link da aplicação...');
      const linkResult = await vtexService.link();
      logger.succeedSpinner('Link realizado com sucesso');

      if (linkResult && linkResult.previewUrl) {
        logger.newLine();
        logger.url('URL de Preview', linkResult.previewUrl);
      }
    } else {
      // Deploy completo
      await executeFullDeploy(ambiente, options);
    }

    // 7. Obter informações finais
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    const workspaceInfo = await vtexService.getWorkspaceInfo();

    logger.newLine();
    logger.complete(`Deploy para ${ambiente.toUpperCase()} concluído!`);

    // Exibir resumo
    logger.subtitle('Resumo do Deploy');
    logger.list([
      `Duração: ${chalk.cyan(duration + 's')}`,
      `Workspace: ${chalk.cyan(workspaceInfo.workspace)}`,
      `Conta: ${chalk.cyan(workspaceInfo.account)}`,
      `Ambiente: ${chalk.cyan(workspaceInfo.environment)}`
    ]);

    // Próximos passos
    const nextSteps = [];
    if (ambiente === 'qa') {
      nextSteps.push('Teste a aplicação no ambiente de QA');
      nextSteps.push('Valide as funcionalidades implementadas');
      nextSteps.push('Quando aprovado, faça deploy para produção');
    } else {
      nextSteps.push('Monitore a aplicação em produção');
      nextSteps.push('Verifique métricas e logs');
      nextSteps.push('Comunique a equipe sobre o deploy');
    }

    logger.nextSteps(nextSteps);
  } catch (error) {
    logger.error('Erro durante o deploy:', error);

    // Sugerir ações de recuperação
    logger.newLine();
    logger.subtitle('Ações de Recuperação');
    logger.list([
      'Verifique os logs: vtex-deploy deploy:logs',
      'Verifique o status: vtex-deploy deploy:status',
      'Se necessário, faça rollback: vtex-deploy deploy:rollback ' + ambiente
    ]);

    throw error;
  }
}

/**
 * Executa deploy completo
 * @param {string} ambiente ambiente
 * @param {Object} options opções
 */
async function executeFullDeploy(ambiente, options) {
  // Release
  if (!options.skipRelease) {
    logger.startSpinner('Executando release...');
    await vtexService.release();
    logger.succeedSpinner('Release executado com sucesso');
  } else {
    logger.info('Release pulado conforme solicitado');
  }

  // Publish
  if (!options.skipPublish) {
    logger.startSpinner('Executando publish...');
    await vtexService.publish();
    logger.succeedSpinner('Publish executado com sucesso');
  } else {
    logger.info('Publish pulado conforme solicitado');
  }

  // Deploy específico do ambiente
  if (ambiente === 'qa') {
    logger.startSpinner('Executando install para QA...');
    await vtexService.install();
    logger.succeedSpinner('Install executado com sucesso');
  } else {
    logger.startSpinner('Executando deploy para Produção...');
    await vtexService.deploy();
    logger.succeedSpinner('Deploy executado com sucesso');
  }
}

/**
 * Exibe status do deploy
 * @param {Object} options opções
 */
async function showDeployStatus(options = {}) {
  logger.title('Status do Deploy');

  try {
    // Carregar configuração
    const config = envUtils.loadEnv();

    // Verificar Docker
    logger.subtitle('Status do Docker');
    const dockerStatus = await dockerService.getStatus();
    logger.status({
      'Docker disponível': dockerStatus.available,
      'Containers rodando': dockerStatus.running
    });

    if (!dockerStatus.running) {
      logger.warn('Docker não está rodando. Algumas informações podem não estar disponíveis.');
      return;
    }

    // Status VTEX para cada ambiente configurado
    const environments = [];

    if (config.VTEX_QA_ACCOUNT && config.VTEX_QA_TOKEN) {
      environments.push({
        name: 'qa',
        account: config.VTEX_QA_ACCOUNT,
        token: config.VTEX_QA_TOKEN
      });
    }

    if (config.VTEX_PROD_ACCOUNT && config.VTEX_PROD_TOKEN) {
      environments.push({
        name: 'prod',
        account: config.VTEX_PROD_ACCOUNT,
        token: config.VTEX_PROD_TOKEN
      });
    }

    for (const env of environments) {
      if (options.environment && options.environment !== env.name) {
        continue;
      }

      logger.subtitle(`Status VTEX - ${env.name.toUpperCase()}`);

      try {
        // Login
        await vtexService.login(env.account, env.token);

        // Obter informações do workspace
        const workspaceInfo = await vtexService.getWorkspaceInfo();
        logger.workspace(workspaceInfo);

        // Verificar se há aplicações instaladas
        const apps = await vtexService.listApps();
        if (apps && apps.length > 0) {
          logger.info(`Aplicações instaladas: ${apps.length}`);

          // Mostrar apenas as primeiras 5
          const appsToShow = apps.slice(0, 5);
          appsToShow.forEach((app) => {
            console.log(`  ${chalk.cyan('•')} ${app.name}@${app.version}`);
          });

          if (apps.length > 5) {
            console.log(`  ${chalk.gray('... e mais ' + (apps.length - 5) + ' aplicações')}`);
          }
        }
      } catch (error) {
        logger.error(`Erro ao obter status do ${env.name.toUpperCase()}:`, error.message);
      }

      logger.newLine();
    }

    // Status do Git (se disponível)
    if (await gitService.isGitRepository()) {
      logger.subtitle('Status do Git');
      const currentBranch = await gitService.getCurrentBranch();
      const hasUncommitted = await gitService.hasUncommittedChanges();

      logger.list([
        `Branch atual: ${chalk.cyan(currentBranch)}`,
        `Mudanças não commitadas: ${hasUncommitted ? chalk.yellow('Sim') : chalk.green('Não')}`
      ]);
    }
  } catch (error) {
    logger.error('Erro ao obter status do deploy:', error);
  }
}

/**
 * Faz rollback do deploy
 * @param {string} ambiente ambiente
 * @param {Object} options opções
 */
async function rollbackDeploy(ambiente, options = {}) {
  logger.title(`Rollback - ${ambiente.toUpperCase()}`);

  // Validar ambiente
  const envValidation = validators.environment(ambiente);
  if (envValidation !== true) {
    logger.error('Ambiente inválido:', envValidation);
    return;
  }

  try {
    // Carregar configuração
    const config = envUtils.loadEnv();
    const vtexConfig =
      ambiente === 'qa'
        ? { account: config.VTEX_QA_ACCOUNT, token: config.VTEX_QA_TOKEN }
        : { account: config.VTEX_PROD_ACCOUNT, token: config.VTEX_PROD_TOKEN };

    if (!vtexConfig.account || !vtexConfig.appkey || !vtexConfig.apptoken) {
      logger.error(`Configuração VTEX para ${ambiente.toUpperCase()} não encontrada`);
      return;
    }

    // Verificar Docker
    const dockerStatus = await dockerService.getStatus();
    if (!dockerStatus.running) {
      logger.error('Docker não está rodando. Execute: docker-compose up -d');
      return;
    }

    // Login VTEX
    logger.startSpinner('Fazendo login no VTEX...');
    const token = await vtexService.generateToken(vtexConfig.account, vtexConfig.appkey, vtexConfig.apptoken);
    await vtexService.login(vtexConfig.account, token);
    logger.succeedSpinner('Login realizado');

    // Listar versões disponíveis
    logger.startSpinner('Buscando versões disponíveis...');
    const versions = await vtexService.listVersions();
    logger.succeedSpinner('Versões encontradas');

    if (!versions || versions.length === 0) {
      logger.error('Nenhuma versão disponível para rollback');
      return;
    }

    // Selecionar versão
    let targetVersion = options.version;

    if (!targetVersion) {
      const { selectedVersion } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedVersion',
          message: 'Selecione a versão para rollback:',
          choices: versions.map((v) => ({
            name: `${v.version} (${v.date}) - ${v.description || 'Sem descrição'}`,
            value: v.version
          }))
        }
      ]);

      targetVersion = selectedVersion;
    }

    // Confirmar rollback
    logger.warn(`ATENÇÃO: Você está prestes a fazer rollback para a versão ${targetVersion}`);

    const { shouldProceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldProceed',
        message: `Confirma o rollback para ${ambiente.toUpperCase()}?`,
        default: false
      }
    ]);

    if (!shouldProceed) {
      logger.info('Rollback cancelado');
      return;
    }

    // Executar rollback
    logger.startSpinner(`Executando rollback para versão ${targetVersion}...`);
    await vtexService.installVersion(targetVersion);
    logger.succeedSpinner('Rollback executado com sucesso');

    logger.complete(`Rollback para ${ambiente.toUpperCase()} concluído!`);
    logger.info(`Versão ativa: ${chalk.cyan(targetVersion)}`);

    // Próximos passos
    logger.nextSteps([
      'Verifique se a aplicação está funcionando corretamente',
      'Monitore logs e métricas',
      'Comunique a equipe sobre o rollback',
      'Investigue a causa do problema na versão anterior'
    ]);
  } catch (error) {
    logger.error('Erro durante o rollback:', error);
  }
}

/**
 * Exibe logs do deploy
 * @param {Object} options opções
 */
async function showDeployLogs(options = {}) {
  logger.title('Logs do Deploy');

  try {
    // Verificar Docker
    const dockerStatus = await dockerService.getStatus();
    if (!dockerStatus.running) {
      logger.error('Docker não está rodando');
      return;
    }

    // Obter logs
    logger.startSpinner('Obtendo logs...');
    const logs = await dockerService.getLogs({
      lines: parseInt(options.lines) || 50,
      follow: options.follow
    });

    logger.succeedSpinner('Logs obtidos');
    logger.newLine();

    // Exibir logs
    if (logs && logs.length > 0) {
      logs.forEach((log) => {
        // Colorir logs baseado no nível
        if (log.includes('ERROR') || log.includes('error')) {
          console.log(chalk.red(log));
        } else if (log.includes('WARN') || log.includes('warn')) {
          console.log(chalk.yellow(log));
        } else if (log.includes('INFO') || log.includes('info')) {
          console.log(chalk.blue(log));
        } else {
          console.log(log);
        }
      });
    } else {
      logger.info('Nenhum log encontrado');
    }

    if (options.follow) {
      logger.info('Acompanhando logs... (Ctrl+C para sair)');
    }
  } catch (error) {
    logger.error('Erro ao obter logs:', error);
  }
}

module.exports = registerDeployCommands;
