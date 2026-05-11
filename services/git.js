const simpleGit = require('simple-git');
const ora = require('ora');
const chalk = require('chalk');

class GitService {
  constructor() {
    this.git = simpleGit();
  }

  /**
   * Cria uma nova branch e faz checkout
   * @param {string} branchName nome da branch
   * @returns {Promise<boolean>} true se sucesso
   */
  async createAndCheckoutBranch(branchName) {
    const spinner = ora(`Criando e fazendo checkout da branch ${branchName}...`).start();

    try {
      // Verifica se a branch já existe
      const branches = await this.git.branchLocal();

      if (branches.all.includes(branchName)) {
        spinner.warn(`Branch ${branchName} já existe, fazendo checkout...`);
        await this.git.checkout(branchName);
      } else {
        // Cria nova branch e faz checkout
        await this.git.checkoutLocalBranch(branchName);
        spinner.succeed(`Branch ${branchName} criada e checkout realizado`);
      }

      return true;
    } catch (error) {
      spinner.fail(`Erro ao criar/checkout da branch ${branchName}`);
      console.error(chalk.red('Erro:'), error.message);
      return false;
    }
  }

  /**
   * Obtém o nome da branch atual
   * @returns {Promise<string|null>} nome da branch atual
   */
  async getCurrentBranch() {
    try {
      const status = await this.git.status();
      return status.current;
    } catch (error) {
      console.error(chalk.red('Erro ao obter branch atual:'), error.message);
      return null;
    }
  }

  /**
   * Verifica se há mudanças não commitadas
   * @returns {Promise<boolean>} true se há mudanças
   */
  async hasUncommittedChanges() {
    try {
      const status = await this.git.status();
      return status.files.length > 0;
    } catch (error) {
      console.error(chalk.red('Erro ao verificar status:'), error.message);
      return false;
    }
  }

  /**
   * Faz commit das mudanças
   * @param {string} message mensagem do commit
   * @returns {Promise<boolean>} true se sucesso
   */
  async commit(message) {
    const spinner = ora('Fazendo commit das mudanças...').start();

    try {
      // Adiciona todos os arquivos
      await this.git.add('.');

      // Faz commit
      await this.git.commit(message);

      spinner.succeed('Commit realizado com sucesso');
      return true;
    } catch (error) {
      spinner.fail('Erro ao fazer commit');
      console.error(chalk.red('Erro:'), error.message);
      return false;
    }
  }

  /**
   * Faz push da branch atual
   * @param {string} remote nome do remote (padrão: origin)
   * @param {string} branch nome da branch (opcional, usa atual se não especificado)
   * @returns {Promise<boolean>} true se sucesso
   */
  async pushBranch(remote = 'origin', branch = null) {
    const spinner = ora('Fazendo push da branch...').start();

    try {
      const currentBranch = branch || (await this.getCurrentBranch());

      if (!currentBranch) {
        spinner.fail('Não foi possível determinar a branch atual');
        return false;
      }

      // Faz push da branch
      await this.git.push(remote, currentBranch, { '--set-upstream': null });

      spinner.succeed(`Push da branch ${currentBranch} realizado com sucesso`);
      return true;
    } catch (error) {
      spinner.fail('Erro ao fazer push');
      console.error(chalk.red('Erro:'), error.message);
      return false;
    }
  }

  /**
   * Faz pull das mudanças
   * @param {string} remote nome do remote (padrão: origin)
   * @param {string} branch nome da branch (opcional)
   * @returns {Promise<boolean>} true se sucesso
   */
  async pull(remote = 'origin', branch = null) {
    const spinner = ora('Fazendo pull das mudanças...').start();

    try {
      if (branch) {
        await this.git.pull(remote, branch);
      } else {
        await this.git.pull();
      }

      spinner.succeed('Pull realizado com sucesso');
      return true;
    } catch (error) {
      spinner.fail('Erro ao fazer pull');
      console.error(chalk.red('Erro:'), error.message);
      return false;
    }
  }

  /**
   * Lista todas as branches
   * @returns {Promise<Object|null>} informações das branches
   */
  async listBranches() {
    try {
      const local = await this.git.branchLocal();
      const remote = await this.git.branch(['-r']);

      return {
        current: local.current,
        local: local.all,
        remote: remote.all
      };
    } catch (error) {
      console.error(chalk.red('Erro ao listar branches:'), error.message);
      return null;
    }
  }

  /**
   * Verifica se a branch existe remotamente
   * @param {string} branchName nome da branch
   * @param {string} remote nome do remote (padrão: origin)
   * @returns {Promise<boolean>} true se existe
   */
  async branchExistsRemotely(branchName, remote = 'origin') {
    try {
      const branches = await this.git.branch(['-r']);
      const remoteBranchName = `${remote}/${branchName}`;
      return branches.all.includes(remoteBranchName);
    } catch (error) {
      console.error(chalk.red('Erro ao verificar branch remota:'), error.message);
      return false;
    }
  }

  /**
   * Obtém informações do repositório
   * @returns {Promise<Object|null>} informações do repositório
   */
  async getRepoInfo() {
    try {
      const remotes = await this.git.getRemotes(true);
      const status = await this.git.status();

      const originRemote = remotes.find((remote) => remote.name === 'origin');

      return {
        currentBranch: status.current,
        remoteUrl: originRemote ? originRemote.refs.fetch : null,
        hasChanges: status.files.length > 0,
        ahead: status.ahead,
        behind: status.behind
      };
    } catch (error) {
      console.error(chalk.red('Erro ao obter informações do repositório:'), error.message);
      return null;
    }
  }

  /**
   * Faz checkout para uma branch específica
   * @param {string} branchName nome da branch
   * @returns {Promise<boolean>} true se sucesso
   */
  async checkout(branchName) {
    const spinner = ora(`Fazendo checkout para ${branchName}...`).start();

    try {
      await this.git.checkout(branchName);
      spinner.succeed(`Checkout para ${branchName} realizado com sucesso`);
      return true;
    } catch (error) {
      spinner.fail(`Erro ao fazer checkout para ${branchName}`);
      console.error(chalk.red('Erro:'), error.message);
      return false;
    }
  }

  /**
   * Verifica se o diretório atual é um repositório Git
   * @returns {Promise<boolean>} true se é um repositório Git
   */
  async isGitRepository() {
    try {
      await this.git.status();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtém o último commit da branch atual
   * @returns {Promise<Object|null>} informações do último commit
   */
  async getLastCommit() {
    try {
      const log = await this.git.log({ maxCount: 1 });
      return log.latest;
    } catch (error) {
      console.error(chalk.red('Erro ao obter último commit:'), error.message);
      return null;
    }
  }

  /**
   * Valida se a branch atual é válida para criar PR
   * @param {Array<string>} invalidBranches branches que não podem criar PR
   * @returns {Promise<Object>} resultado da validação
   */
  async validateBranchForPR(invalidBranches = ['main', 'master', 'staging', 'develop']) {
    try {
      const currentBranch = await this.getCurrentBranch();

      if (!currentBranch) {
        return { valid: false, message: 'Não foi possível determinar a branch atual' };
      }

      if (invalidBranches.includes(currentBranch)) {
        return {
          valid: false,
          message: `Não é possível criar PR a partir da branch ${currentBranch}`,
          currentBranch
        };
      }

      return { valid: true, currentBranch };
    } catch (error) {
      return { valid: false, message: `Erro ao validar branch: ${error.message}` };
    }
  }
}

module.exports = new GitService();
