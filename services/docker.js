const { execFile } = require('child_process');
const { promisify } = require('util');
const ora = require('ora');
const chalk = require('chalk');
const Validators = require('../utils/validators');
const logger = require('../utils/logger');

const execFileAsync = promisify(execFile);

class DockerService {
  constructor() {
    this.composeCommand = 'docker-compose';
  }

  async runCompose(args, options = {}) {
    const { stdout, stderr } = await execFileAsync(this.composeCommand, args, {
      maxBuffer: 10 * 1024 * 1024,
      ...options
    });
    return { stdout, stderr };
  }

  /**
   * Inicia os containers Docker usando docker-compose
   * @returns {Promise<boolean>} true se sucesso, false caso contrário
   */
  async startContainers() {
    const spinner = ora('Iniciando containers Docker...').start();

    try {
      await this.runCompose(['up', '-d']);
      spinner.succeed('Containers Docker iniciados com sucesso');

      // Aguarda um pouco para garantir que os containers estejam prontos
      await this.waitForContainers();

      return true;
    } catch (error) {
      spinner.fail('Erro ao iniciar containers Docker');
      console.error(chalk.red('Erro:'), logger.redactSensitive(error.message));
      return false;
    }
  }

  /**
   * Para os containers Docker
   * @returns {Promise<boolean>} true se sucesso, false caso contrário
   */
  async stopContainers() {
    const spinner = ora('Parando containers Docker...').start();

    try {
      await this.runCompose(['down']);
      spinner.succeed('Containers Docker parados com sucesso');
      return true;
    } catch (error) {
      spinner.fail('Erro ao parar containers Docker');
      console.error(chalk.red('Erro:'), logger.redactSensitive(error.message));
      return false;
    }
  }

  /**
   * Verifica o status dos containers
   * @returns {Promise<Object>} status dos containers
   */
  async getContainerStatus() {
    try {
      const { stdout } = await this.runCompose(['ps', '--format', 'json']);
      return JSON.parse(stdout);
    } catch (error) {
      console.error(chalk.red('Erro ao verificar status dos containers:'), logger.redactSensitive(error.message));
      return null;
    }
  }

  /**
   * Verifica disponibilidade do Docker e se há containers em execução.
   * @returns {Promise<Object>} status consolidado com contrato estável
   */
  async getStatus() {
    const available = await this.isDockerAvailable();

    if (!available) {
      return { available: false, running: false, containers: [] };
    }

    const containers = await this.listContainers();
    const running = containers.some(container => container.running);

    return { available: true, running, containers };
  }

  /**
   * Lista containers do docker-compose atual.
   * @returns {Promise<Array>} containers normalizados
   */
  async listContainers() {
    try {
      const { stdout } = await execAsync('docker-compose ps --format json');
      return this.parseComposePs(stdout);
    } catch (error) {
      console.error(chalk.red('Erro ao listar containers:'), error.message);
      return [];
    }
  }

  /**
   * Obtém logs dos containers do docker-compose.
   * @param {Object} options opções de logs
   * @returns {Promise<Array<string>>} linhas de log
   */
  async getLogs(options = {}) {
    const lines = Number.isInteger(options.lines) ? options.lines : parseInt(options.lines, 10) || 50;
    const follow = options.follow ? '--follow' : '';

    try {
      const { stdout } = await execAsync(`docker-compose logs --tail=${lines} ${follow}`.trim());
      return stdout.split('\n').filter(line => line.length > 0);
    } catch (error) {
      console.error(chalk.red('Erro ao obter logs dos containers:'), error.message);
      return [];
    }
  }

  /**
   * Normaliza a saída do docker-compose ps.
   * @param {string} output saída do comando
   * @returns {Array<Object>} containers normalizados
   */
  parseComposePs(output) {
    if (!output || !output.trim()) {
      return [];
    }

    const parseContainer = (container) => {
      const state = container.State || container.Status || '';
      return {
        name: container.Name || container.Service || container.name || 'unknown',
        service: container.Service || container.service || container.Name || 'unknown',
        state,
        status: container.Status || state,
        running: String(state).toLowerCase().includes('running') || String(container.Status || '').toLowerCase().includes('up')
      };
    };

    try {
      const parsed = JSON.parse(output);
      return Array.isArray(parsed) ? parsed.map(parseContainer) : [parseContainer(parsed)];
    } catch (error) {
      return output
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          try {
            return parseContainer(JSON.parse(line));
          } catch (parseError) {
            return { name: line, service: line, state: line, status: line, running: /running|up/i.test(line) };
          }
        });
    }
  }

  /**
   * Aguarda os containers ficarem ativos
   * @param {number} maxWaitTime tempo máximo de espera em ms
   * @returns {Promise<boolean>} true se containers estão ativos
   */
  async waitForContainers(maxWaitTime = 30000) {
    const spinner = ora('Aguardando containers ficarem ativos...').start();
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const { stdout } = await execAsync(
          'docker-compose ps --services --filter "status=running"'
        );
        const runningServices = stdout
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        if (runningServices.length > 0) {
          spinner.succeed('Containers estão ativos e prontos');
          return true;
        }

        // Aguarda 2 segundos antes de verificar novamente
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        // Continua tentando
      }
    }

    spinner.fail('Timeout: containers não ficaram ativos no tempo esperado');
    return false;
  }

  /**
   * Executa um comando dentro do container sem usar shell.
   * @param {string} service nome do serviço
   * @param {string} command comando a ser executado
   * @param {Array<string>} args argumentos do comando
   * @returns {Promise<Object>} resultado do comando
   */
  async execInContainer(service, command, args = []) {
    try {
      Validators.assert(Validators.dockerService(service));

      if (!command || typeof command !== 'string') {
        throw new Error('Comando do container é obrigatório');
      }

      if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
        throw new Error('Argumentos do container devem ser strings');
      }

      const { stdout, stderr } = await this.runCompose(['exec', '-T', service, command, ...args]);
      return { success: true, stdout, stderr };
    } catch (error) {
      return { success: false, error: logger.redactSensitive(error.message) };
    }
  }

  /**
   * Verifica se o Docker está instalado e funcionando
   * @returns {Promise<boolean>} true se Docker está disponível
   */
  async isDockerAvailable() {
    try {
      await execFileAsync('docker', ['--version']);
      await execFileAsync(this.composeCommand, ['--version']);
      return true;
    } catch (error) {
      console.error(
        chalk.red('Docker ou docker-compose não estão instalados ou não estão funcionando')
      );
      return false;
    }
  }
}

module.exports = new DockerService();
