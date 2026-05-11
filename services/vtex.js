const ora = require('ora');
const chalk = require('chalk');
const { httpClient, formatHttpError } = require('./httpClient');
const dockerService = require('./docker');
const logger = require('../utils/logger');
const Validators = require('../utils/validators');

const VTEX_AUTH_BASE_URL = 'https://api.vtexcommercestable.com.br/api/vtexid/apptoken/login';
const VTEX_AUTH_TIMEOUT_MS = 30000;

function sanitizeErrorMessage(message) {
  if (!message) {
    return message;
  }

  return logger.sanitizeString(message);
}

class VtexService {
  constructor() {
    this.defaultService = 'app';
    this.VTEX_AUTH_BASE_URL = VTEX_AUTH_BASE_URL;
    this.VTEX_AUTH_TIMEOUT_MS = VTEX_AUTH_TIMEOUT_MS;
  }

  /**
   * Executa comando VTEX dentro do container sem montar uma string de shell.
   * @param {string} command comando VTEX a ser executado
   * @param {Array<string>} args argumentos do comando VTEX
   * @param {string} service nome do serviço Docker (opcional)
   * @returns {Promise<Object>} resultado do comando
   */
  async execVtexCommand(command, args = [], service = this.defaultService) {
    if (!command || typeof command !== 'string') {
      return { success: false, error: 'Comando VTEX é obrigatório' };
    }

    if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
      return { success: false, error: 'Argumentos do comando VTEX devem ser strings' };
    }

    const commandText = [command, ...args].join(' ');
    const safeCommand = logger.sanitizeString(commandText);
    const spinner = ora(`Executando: vtex ${safeCommand}`).start();

    try {
      const result = await dockerService.execInContainer(service, 'vtex', [command, ...args]);

      if (result.success) {
        spinner.succeed(`Comando vtex ${safeCommand} executado com sucesso`);
        return { success: true, output: result.stdout };
      }

      const safeError = logger.redactSensitive(result.error);
      spinner.fail(`Erro ao executar vtex ${safeCommand}`);
      console.error(chalk.red('Erro:'), safeError);
      return { success: false, error: safeError };
    } catch (error) {
      const safeError = sanitizeErrorMessage(error.message);
      spinner.fail(`Erro ao executar vtex ${safeCommand}`);
      console.error(chalk.red('Erro:'), safeError);
      return { success: false, error: safeError };
    }
  }

  /**
   * Gera token VTEX usando appkey e apptoken.
   * @param {string} account conta VTEX
   * @param {string} appkey chave da aplicação
   * @param {string} apptoken token da aplicação
   * @returns {Promise<string|null>} token gerado ou null em caso de erro
   */
  buildVtexAuthUrl(account) {
    const url = new URL(VTEX_AUTH_BASE_URL);
    url.searchParams.set('an', account);
    return url.toString();
  }

  async generateToken(account, appkey, apptoken) {
    const spinner = ora(`Gerando token para conta ${account}...`).start();

    try {
      Validators.assert(Validators.vtexAccount(account));
      const response = await httpClient.post(
        this.buildVtexAuthUrl(account),
        { appkey, apptoken },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: VTEX_AUTH_TIMEOUT_MS
        }
      );

      if (response.data && response.data.token) {
        spinner.succeed(`Token gerado com sucesso para conta ${account}`);
        return response.data.token;
      }

      spinner.fail(`Erro ao gerar token para conta ${account}`);
      console.error(chalk.red('Resposta inesperada da API de autenticação VTEX'), `(status ${response.status || 'desconhecido'})`);
      return null;
    } catch (error) {
      spinner.fail(`Erro ao gerar token para conta ${account}`);
      console.error(chalk.red('Erro:'), formatHttpError(error, 'Não foi possível gerar o token VTEX.'));
      return null;
    }
  }

  /**
   * Faz login no VTEX usando token.
   * @param {string} account conta VTEX
   * @param {string} token token de acesso
   * @returns {Promise<boolean>} true se sucesso
   */
  async login(account, token) {
    const spinner = ora(`Fazendo login na conta ${account}...`).start();

    try {
      Validators.assert(Validators.vtexAccount(account));
      await this.execVtexCommand('logout');
      const result = await this.execVtexCommand('login', [account, '--token', token]);

      if (result.success) {
        spinner.succeed(`Login realizado com sucesso na conta ${account}`);
        return true;
      }

      spinner.fail(`Erro ao fazer login na conta ${account}`);
      return false;
    } catch (error) {
      spinner.fail(`Erro ao fazer login na conta ${account}`);
      console.error(chalk.red('Erro:'), sanitizeErrorMessage(error.message));
      return false;
    }
  }

  async useWorkspace(workspace) {
    Validators.assert(Validators.vtexWorkspace(workspace));
    const result = await this.execVtexCommand('use', [workspace]);
    return result.success;
  }

  async use(workspace) {
    return this.useWorkspace(workspace);
  }

  async linkApp() {
    const spinner = ora('Fazendo link da aplicação...').start();

    try {
      const result = await this.execVtexCommand('link');

      if (result.success) {
        const previewUrl = this.extractPreviewUrl(result.output);
        spinner.succeed('Link da aplicação realizado com sucesso');

        if (previewUrl) {
          console.log(chalk.green('URL de Preview:'), chalk.cyan(previewUrl));
        }

        return { success: true, previewUrl, output: result.output };
      }

      spinner.fail('Erro ao fazer link da aplicação');
      return { success: false, error: result.error };
    } catch (error) {
      spinner.fail('Erro ao fazer link da aplicação');
      const safeError = sanitizeErrorMessage(error.message);
      console.error(chalk.red('Erro:'), safeError);
      return { success: false, error: safeError };
    }
  }

  async link() {
    return this.linkApp();
  }

  async listApps() {
    const result = await this.execVtexCommand('list');
    return result.success ? this.parseApps(result.output) : [];
  }

  async listWorkspaces() {
    const result = await this.execVtexCommand('workspace', ['list']);
    return result.success ? this.parseWorkspaces(result.output) : [];
  }

  async listVersions() {
    const result = await this.execVtexCommand('deps', ['list']);
    return result.success ? this.parseVersions(result.output) : [];
  }

  async installVersion(version) {
    const validation = Validators.version(version) === true ? true : Validators.vtexAppName(version);
    Validators.assert(validation);
    const result = await this.execVtexCommand('install', [version]);
    return result.success;
  }

  async release() {
    const result = await this.execVtexCommand('release');
    return result.success;
  }

  async publish() {
    const result = await this.execVtexCommand('publish');
    return result.success;
  }

  async install(appName = '') {
    const args = [];
    if (appName) {
      Validators.assert(Validators.vtexAppName(appName));
      args.push(appName);
    }
    const result = await this.execVtexCommand('install', args);
    return result.success;
  }

  async deploy() {
    const result = await this.execVtexCommand('deploy');
    return result.success;
  }

  async getWorkspaceInfo() {
    try {
      const result = await this.execVtexCommand('whoami');
      return result.success ? this.parseWorkspaceInfo(result.output) : null;
    } catch (error) {
      console.error(chalk.red('Erro ao obter informações do workspace:'), sanitizeErrorMessage(error.message));
      return null;
    }
  }

  parseApps(output) {
    return this.parseLines(output)
      .map(line => {
        const cleanLine = line.replace(/^[•*-]\s*/, '').trim();
        const match = cleanLine.match(/^([^\s@]+)@([^\s]+)(.*)$/);

        if (!match) {
          return null;
        }

        return {
          name: match[1],
          version: match[2],
          linked: /linked/i.test(match[3] || ''),
          raw: line
        };
      })
      .filter(Boolean);
  }

  parseWorkspaces(output) {
    return this.parseLines(output)
      .map(line => {
        const cleanLine = line.replace(/^[*>•-]\s*/, '').trim();

        if (!cleanLine || /^name\b/i.test(cleanLine)) {
          return null;
        }

        const [name, ...rest] = cleanLine.split(/\s+/);
        return {
          name,
          current: /^[*>]/.test(line),
          status: rest.join(' '),
          raw: line
        };
      })
      .filter(Boolean);
  }

  parseVersions(output) {
    return this.parseLines(output)
      .map(line => {
        const cleanLine = line.replace(/^[•*-]\s*/, '').trim();
        const versionMatch = cleanLine.match(/(?:@|\b)(\d+\.\d+\.\d+(?:[-+][^\s]+)?)/);

        if (!versionMatch) {
          return null;
        }

        return {
          version: versionMatch[1],
          date: this.extractDate(cleanLine) || 'N/A',
          description: cleanLine,
          raw: line
        };
      })
      .filter(Boolean);
  }

  parseLines(output) {
    return String(output || '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !/^[-=]+$/.test(line));
  }

  extractDate(text) {
    const match = text.match(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/);
    return match ? match[0] : null;
  }

  extractPreviewUrl(output) {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = String(output || '').match(urlRegex);

    if (urls && urls.length > 0) {
      const previewUrl = urls.find((url) => url.includes('--'));
      return previewUrl || urls[0];
    }

    return null;
  }

  parseWorkspaceInfo(output) {
    const lines = String(output || '').split('\n');
    const info = {};

    lines.forEach((line) => {
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

  async deployToQA(account, appkey, apptoken) {
    console.log(chalk.blue('Iniciando deploy para QA...'));

    const token = await this.generateToken(account, appkey, apptoken);
    if (!token) return false;

    const loginSuccess = await this.login(account, token);
    if (!loginSuccess) return false;

    const releaseSuccess = await this.release();
    if (!releaseSuccess) return false;

    const publishSuccess = await this.publish();
    if (!publishSuccess) return false;

    const installSuccess = await this.install();
    if (!installSuccess) return false;

    console.log(chalk.green('Deploy para QA concluído com sucesso!'));
    return true;
  }
}

module.exports = new VtexService();
