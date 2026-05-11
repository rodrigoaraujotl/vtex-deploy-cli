const { exec } = require('child_process');
const { promisify } = require('util');
const ora = require('ora');
const chalk = require('chalk');

const execAsync = promisify(exec);

class DockerService {
  /**
   * Inicia os containers Docker usando docker-compose
   * @returns {Promise<boolean>} true se sucesso, false caso contrário
   */
  async startContainers() {
    const spinner = ora('Iniciando containers Docker...').start();

    try {
      await execAsync('docker-compose up -d');
      spinner.succeed('Containers Docker iniciados com sucesso');

      // Aguarda um pouco para garantir que os containers estejam prontos
      await this.waitForContainers();

      return true;
    } catch (error) {
      spinner.fail('Erro ao iniciar containers Docker');
      console.error(chalk.red('Erro:'), error.message);
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
      await execAsync('docker-compose down');
      spinner.succeed('Containers Docker parados com sucesso');
      return true;
    } catch (error) {
      spinner.fail('Erro ao parar containers Docker');
      console.error(chalk.red('Erro:'), error.message);
      return false;
    }
  }

  /**
   * Verifica o status dos containers
   * @returns {Promise<Object>} status dos containers
   */
  async getContainerStatus() {
    try {
      const { stdout } = await execAsync('docker-compose ps --format json');
      return JSON.parse(stdout);
    } catch (error) {
      console.error(chalk.red('Erro ao verificar status dos containers:'), error.message);
      return null;
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
   * Executa um comando dentro do container
   * @param {string} service nome do serviço
   * @param {string} command comando a ser executado
   * @returns {Promise<Object>} resultado do comando
   */
  async execInContainer(service, command) {
    try {
      const { stdout, stderr } = await execAsync(`docker-compose exec -T ${service} ${command}`);
      return { success: true, stdout, stderr };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Verifica se o Docker está instalado e funcionando
   * @returns {Promise<boolean>} true se Docker está disponível
   */
  async isDockerAvailable() {
    try {
      await execAsync('docker --version');
      await execAsync('docker-compose --version');
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
