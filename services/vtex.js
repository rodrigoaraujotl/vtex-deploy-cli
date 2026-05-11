const ora = require('ora');
const chalk = require('chalk');
const axios = require('axios');
const dockerService = require('./docker');
const Validators = require('../utils/validators');
const logger = require('../utils/logger');

class VtexService {
  constructor() {
    this.defaultService = 'app'; // nome padrão do serviço no docker-compose
  }

  /**
   * Executa comando VTEX dentro do container sem montar uma string de shell.
   * @param {string} command comando VTEX a ser executado
   * @param {Array<string>} args argumentos do comando VTEX
   * @param {string} service nome do serviço Docker (opcional)
   * @returns {Promise<Object>} resultado do comando
   */
  async execVtexCommand(command, args = [], service = this.defaultService) {
    const commandText = `vtex ${[command, ...args].join(' ')}`.trim();
    const safeCommandText = logger.redactSensitive(commandText);
    const spinner = ora(`Executando: ${safeCommandText}`).start();
    
    try {
      Validators.assert(Validators.dockerService(service));

      if (!command || typeof command !== 'string' || !/^[a-z][a-z-]*$/i.test(command)) {
        throw new Error('Comando VTEX inválido');
      }

      if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
        throw new Error('Argumentos VTEX devem ser strings');
      }

      const result = await dockerService.execInContainer(service, 'vtex', [command, ...args]);
      
      if (result.success) {
        spinner.succeed(`Comando ${safeCommandText} executado com sucesso`);
        return { success: true, output: result.stdout };
      }

      spinner.fail(`Erro ao executar ${safeCommandText}`);
      console.error(chalk.red('Erro:'), logger.redactSensitive(result.error));
      return { success: false, error: logger.redactSensitive(result.error) };
    } catch (error) {
      spinner.fail(`Erro ao executar ${safeCommandText}`);
      console.error(chalk.red('Erro:'), logger.redactSensitive(error.message));
      return { success: false, error: logger.redactSensitive(error.message) };
    }
  }

  /**
   * Gera token VTEX usando appkey e apptoken
   * @param {string} account conta VTEX
   * @param {string} appkey chave da aplicação
   * @param {string} apptoken token da aplicação
   * @returns {Promise<string|null>} token gerado ou null em caso de erro
   */
  async generateToken(account, appkey, apptoken) {
    const spinner = ora(`Gerando token para conta ${account}...`).start();
    
    try {
      Validators.assert(Validators.vtexAccount(account));

      const response = await axios.post(
        `http://api.vtexcommercestable.com.br/api/vtexid/apptoken/login?an=${encodeURIComponent(account)}`,
        {
          appkey: appkey,
          apptoken: apptoken
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data && response.data.token) {
        spinner.succeed(`Token gerado com sucesso para conta ${account}`);
        return response.data.token;
      } else {
        spinner.fail(`Erro ao gerar token para conta ${account}`);
        console.error(chalk.red('Resposta inválida da API'));
        return null;
      }
    } catch (error) {
      spinner.fail(`Erro ao gerar token para conta ${account}`);
      console.error(chalk.red('Erro:'), logger.redactSensitive(error.response?.data || error.message));
      return null;
    }
  }

  /**
   * Faz login no VTEX usando token
   * @param {string} account conta VTEX
   * @param {string} token token de acesso
   * @returns {Promise<boolean>} true se sucesso
   */
  async login(account, token) {
    const spinner = ora(`Fazendo login na conta ${account}...`).start();
    
    try {
      Validators.assert(Validators.vtexAccount(account));

      // Primeiro, faz logout para limpar sessão anterior
      await this.execVtexCommand('logout');
      
      // A VTEX CLI usada por este projeto recebe token via --token; portanto o
      // token é passado como argumento separado e redigido em spinners/logs/erros.
      const result = await this.execVtexCommand('login', [account, '--token', token]);
      
      if (result.success) {
        spinner.succeed(`Login realizado com sucesso na conta ${account}`);
        return true;
      } else {
        spinner.fail(`Erro ao fazer login na conta ${account}`);
        return false;
      }
    } catch (error) {
      spinner.fail(`Erro ao fazer login na conta ${account}`);
      console.error(chalk.red('Erro:'), logger.redactSensitive(error.message));
      return false;
    }
  }

  /**
   * Seleciona workspace VTEX
   * @param {string} workspace nome do workspace
   * @returns {Promise<boolean>} true se sucesso
   */
  async useWorkspace(workspace) {
    Validators.assert(Validators.vtexWorkspace(workspace));
    const result = await this.execVtexCommand('use', [workspace]);
    return result.success;
  }

  async use(workspace) {
    return this.useWorkspace(workspace);
  }

  /**
   * Faz link da aplicação
   * @returns {Promise<Object>} resultado do link com URL de preview
   */
  async linkApp() {
    const spinner = ora('Fazendo link da aplicação...').start();
    
    try {
      const result = await this.execVtexCommand('link');
      
      if (result.success) {
        // Extrai URL de preview do output
        const previewUrl = this.extractPreviewUrl(result.output);
        
        spinner.succeed('Link da aplicação realizado com sucesso');
        
        if (previewUrl) {
          console.log(chalk.green('URL de Preview:'), chalk.cyan(previewUrl));
        }
        
        return { success: true, previewUrl, output: result.output };
      } else {
        spinner.fail('Erro ao fazer link da aplicação');
        return { success: false, error: result.error };
      }
    } catch (error) {
      spinner.fail('Erro ao fazer link da aplicação');
      console.error(chalk.red('Erro:'), logger.redactSensitive(error.message));
      return { success: false, error: logger.redactSensitive(error.message) };
    }
  }

  async link() {
    return this.linkApp();
  }

  /**
   * Executa release da aplicação
   * @returns {Promise<boolean>} true se sucesso
   */
  async release() {
    const result = await this.execVtexCommand('release');
    return result.success;
  }

  /**
   * Publica a aplicação
   * @returns {Promise<boolean>} true se sucesso
   */
  async publish() {
    const result = await this.execVtexCommand('publish');
    return result.success;
  }

  /**
   * Instala a aplicação
   * @param {string} appName nome da aplicação (opcional)
   * @returns {Promise<boolean>} true se sucesso
   */
  async install(appName = '') {
    const args = [];
    if (appName) {
      Validators.assert(Validators.vtexAppName(appName));
      args.push(appName);
    }
    const result = await this.execVtexCommand('install', args);
    return result.success;
  }

  async installVersion(version) {
    Validators.assert(Validators.version(version));
    const result = await this.execVtexCommand('install', [version]);
    return result.success;
  }

  /**
   * Faz deploy da aplicação
   * @returns {Promise<boolean>} true se sucesso
   */
  async deploy() {
    const result = await this.execVtexCommand('deploy');
    return result.success;
  }

  async listApps() {
    const result = await this.execVtexCommand('list');
    if (!result.success) return [];
    return result.output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [nameVersion] = line.split(/\s+/);
        const [name, version] = nameVersion.split('@');
        return { name, version: version || '' };
      });
  }

  async listVersions() {
    const result = await this.execVtexCommand('deprecate', ['--help']);
    return result.success ? [] : [];
  }

  /**
   * Obtém informações do workspace atual
   * @returns {Promise<Object>} informações do workspace
   */
  async getWorkspaceInfo() {
    try {
      const result = await this.execVtexCommand('whoami');
      
      if (result.success) {
        return this.parseWorkspaceInfo(result.output);
      }
      
      return null;
    } catch (error) {
      console.error(chalk.red('Erro ao obter informações do workspace:'), logger.redactSensitive(error.message));
      return null;
    }
  }

  /**
   * Extrai URL de preview do output do vtex link
   * @param {string} output output do comando vtex link
   * @returns {string|null} URL de preview ou null
   */
  extractPreviewUrl(output) {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = output.match(urlRegex);
    
    if (urls && urls.length > 0) {
      // Procura por URL que contenha workspace
      const previewUrl = urls.find(url => url.includes('--'));
      return previewUrl || urls[0];
    }
    
    return null;
  }

  /**
   * Faz parse das informações do workspace
   * @param {string} output output do comando whoami
   * @returns {Object} informações parseadas
   */
  parseWorkspaceInfo(output) {
    const lines = output.split('\n');
    const info = {};
    
    lines.forEach(line => {
      if (line.includes('Account:')) {
        info.account = line.split(':')[1]?.trim();
      }
      if (line.includes('Workspace:')) {
        info.workspace = line.split(':')[1]?.trim();
      }
      if (line.includes('Environment:')) {
        info.environment = line.split(':')[1]?.trim();
      }
    });
    
    return info;
  }

  /**
   * Executa fluxo completo de deploy para QA usando appkey/apptoken
   * @param {string} account conta VTEX
   * @param {string} appkey chave da aplicação
   * @param {string} apptoken token da aplicação
   * @returns {Promise<boolean>} true se sucesso
   */
  async deployToQA(account, appkey, apptoken) {
    console.log(chalk.blue('Iniciando deploy para QA...'));
    Validators.assert(Validators.vtexAccount(account));
    
    // Gera token
    const token = await this.generateToken(account, appkey, apptoken);
    if (!token) return false;
    
    // Login
    const loginSuccess = await this.login(account, token);
    if (!loginSuccess) return false;
    
    // Release
    const releaseSuccess = await this.release();
    if (!releaseSuccess) return false;
    
    // Publish
    const publishSuccess = await this.publish();
    if (!publishSuccess) return false;
    
    console.log(chalk.green('Deploy para QA concluído com sucesso!'));
    return true;
  }

  /**
   * Executa fluxo completo de deploy para Produção usando appkey/apptoken
   * @param {string} account conta VTEX
   * @param {string} appkey chave da aplicação
   * @param {string} apptoken token da aplicação
   * @returns {Promise<boolean>} true se sucesso
   */
  async deployToProduction(account, appkey, apptoken) {
    console.log(chalk.blue('Iniciando deploy para Produção...'));
    Validators.assert(Validators.vtexAccount(account));
    
    // Gera token
    const token = await this.generateToken(account, appkey, apptoken);
    if (!token) return false;
    
    // Login
    const loginSuccess = await this.login(account, token);
    if (!loginSuccess) return false;
    
    // Release
    const releaseSuccess = await this.release();
    if (!releaseSuccess) return false;
    
    // Publish
    const publishSuccess = await this.publish();
    if (!publishSuccess) return false;
    
    // Install/Deploy
    const deploySuccess = await this.deploy();
    if (!deploySuccess) return false;
    
    console.log(chalk.green('Deploy para Produção concluído com sucesso!'));
    return true;
  }
}

module.exports = new VtexService();
