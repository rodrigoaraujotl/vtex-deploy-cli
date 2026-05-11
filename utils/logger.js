const chalk = require('chalk');
const ora = require('ora');

const SECRET_KEY_PATTERN = /(token|appkey|apptoken|authorization|password|secret)/i;
const MASK = '[MASKED]';

class Logger {
  constructor() {
    this.spinner = null;
    this.consolePatched = false;
    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console)
    };
    this.patchConsole();
  }

  /**
   * Verifica se a saída estruturada em JSON está habilitada.
   * @returns {boolean} true quando LOG_FORMAT=json ou --json foram usados
   */
  isJsonMode() {
    return process.env.LOG_FORMAT === 'json' || process.argv.includes('--json');
  }

  /**
   * Mascara valores secretos conhecidos ou identificados por nome antes de logar.
   * @param {any} value valor a sanitizar
   * @returns {any} valor sanitizado
   */
  sanitize(value) {
    if (value === null || value === undefined) return value;

    if (value instanceof Error) {
      return {
        name: value.name,
        message: this.sanitizeString(value.message),
        stack: this.sanitizeString(value.stack)
      };
    }

    if (Array.isArray(value)) {
      return value.map(item => this.sanitize(item));
    }

    if (typeof value === 'object') {
      const sanitized = {};
      Object.entries(value).forEach(([key, entryValue]) => {
        sanitized[key] = SECRET_KEY_PATTERN.test(key) ? MASK : this.sanitize(entryValue);
      });
      return sanitized;
    }

    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    return value;
  }

  /**
   * Mascara segredos em uma string.
   * @param {string} value texto a sanitizar
   * @returns {string} texto sanitizado
   */
  sanitizeString(value) {
    if (!value) return value;

    let sanitized = String(value);

    Object.entries(process.env)
      .filter(([key, secret]) => SECRET_KEY_PATTERN.test(key) && secret && secret.length >= 4)
      .forEach(([, secret]) => {
        sanitized = sanitized.split(secret).join(MASK);
      });

    return sanitized
      .replace(/(--(?:token|appkey|apptoken)\s+)([^\s,;\"']+)/gi, `$1${MASK}`)
      .replace(/((?:token|appkey|apptoken|authorization|password|secret)\s*[:=]\s*)([^\s,;\"']+)/gi, `$1${MASK}`)
      .replace(/("(?:token|appkey|apptoken|authorization|password|secret)"\s*:\s*")([^"]+)(")/gi, `$1${MASK}$3`);
  }

  /**
   * Garante que logs diretos via console também tenham segredos mascarados.
   */
  patchConsole() {
    if (this.consolePatched || console.__vtexDeployLoggerPatched) return;

    ['log', 'error', 'warn', 'info'].forEach(method => {
      const original = console[method].bind(console);
      console[method] = (...args) => original(...args.map(arg => this.sanitize(arg)));
    });

    console.__vtexDeployLoggerPatched = true;
    this.consolePatched = true;
  }

  /**
   * Emite um evento estruturado em JSON Lines quando habilitado.
   * @param {string} event nome do evento
   * @param {Object} fields campos adicionais
   * @param {string} level nível do log
   */
  structured(event, fields = {}, level = 'info') {
    if (!this.isJsonMode()) return;

    const payload = this.sanitize({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...fields
    });

    this.originalConsole.log(JSON.stringify(payload));
  }

  write(level, icon, color, message, data = null, stream = console.log) {
    if (this.isJsonMode()) {
      this.structured('log', { message, data }, level);
      return;
    }

    stream(color(icon), this.sanitize(message));
    if (data) {
      stream(this.sanitize(data));
    }
  }

  /**
   * Log de informação
   * @param {string} message mensagem
   * @param {any} data dados adicionais (opcional)
   */
  info(message, data = null) {
    this.write('info', 'ℹ', chalk.blue, message, data);
  }

  /**
   * Log de sucesso
   * @param {string} message mensagem
   * @param {any} data dados adicionais (opcional)
   */
  success(message, data = null) {
    this.write('success', '✓', chalk.green, message, data);
  }

  /**
   * Log de aviso
   * @param {string} message mensagem
   * @param {any} data dados adicionais (opcional)
   */
  warn(message, data = null) {
    this.write('warn', '⚠', chalk.yellow, message, data);
  }

  /**
   * Log de erro
   * @param {string} message mensagem
   * @param {any} error erro (opcional)
   */
  error(message, error = null) {
    if (this.isJsonMode()) {
      this.structured('log', { message, error }, 'error');
      return;
    }

    console.log(chalk.red('✗'), this.sanitize(message));
    if (error) {
      if (error.stack) {
        console.error(chalk.red(this.sanitizeString(error.stack)));
      } else {
        console.error(chalk.red(this.sanitize(error)));
      }
    }
  }

  /**
   * Log de debug (apenas em modo debug)
   * @param {string} message mensagem
   * @param {any} data dados adicionais (opcional)
   */
  debug(message, data = null) {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      if (this.isJsonMode()) {
        this.structured('debug', { message, data }, 'debug');
        return;
      }

      console.log(chalk.gray('🐛'), chalk.gray(this.sanitize(message)));
      if (data) {
        console.log(chalk.gray(JSON.stringify(this.sanitize(data), null, 2)));
      }
    }
  }

  /**
   * Inicia um spinner
   * @param {string} message mensagem do spinner
   * @returns {Object} instância do spinner
   */
  startSpinner(message) {
    if (this.isJsonMode()) {
      this.structured('spinner_start', { message });
      this.spinner = null;
      return null;
    }

    this.spinner = ora(this.sanitize(message)).start();
    return this.spinner;
  }

  /**
   * Para o spinner com sucesso
   * @param {string} message mensagem de sucesso
   */
  succeedSpinner(message) {
    if (this.isJsonMode()) {
      this.structured('spinner_success', { message }, 'success');
      return;
    }

    if (this.spinner) {
      this.spinner.succeed(this.sanitize(message));
      this.spinner = null;
    }
  }

  /**
   * Para o spinner com erro
   * @param {string} message mensagem de erro
   */
  failSpinner(message) {
    if (this.isJsonMode()) {
      this.structured('spinner_error', { message }, 'error');
      return;
    }

    if (this.spinner) {
      this.spinner.fail(this.sanitize(message));
      this.spinner = null;
    }
  }

  /**
   * Para o spinner com aviso
   * @param {string} message mensagem de aviso
   */
  warnSpinner(message) {
    if (this.isJsonMode()) {
      this.structured('spinner_warn', { message }, 'warn');
      return;
    }

    if (this.spinner) {
      this.spinner.warn(this.sanitize(message));
      this.spinner = null;
    }
  }

  /**
   * Atualiza texto do spinner
   * @param {string} message nova mensagem
   */
  updateSpinner(message) {
    if (this.isJsonMode()) {
      this.structured('spinner_update', { message });
      return;
    }

    if (this.spinner) {
      this.spinner.text = this.sanitize(message);
    }
  }

  /**
   * Exibe título de seção
   * @param {string} title título
   */
  title(title) {
    if (this.isJsonMode()) {
      this.structured('title', { title });
      return;
    }

    console.log();
    console.log(chalk.bold.cyan(`🚀 ${this.sanitize(title)}`));
    console.log(chalk.cyan('─'.repeat(title.length + 3)));
  }

  /**
   * Exibe subtítulo
   * @param {string} subtitle subtítulo
   */
  subtitle(subtitle) {
    if (this.isJsonMode()) {
      this.structured('subtitle', { subtitle });
      return;
    }

    console.log();
    console.log(chalk.bold.yellow(`📋 ${this.sanitize(subtitle)}`));
  }

  /**
   * Exibe linha separadora
   */
  separator() {
    if (this.isJsonMode()) return;
    console.log(chalk.gray('─'.repeat(50)));
  }

  /**
   * Exibe linha em branco
   */
  newLine() {
    if (this.isJsonMode()) return;
    console.log();
  }

  /**
   * Exibe lista de itens
   * @param {Array} items lista de itens
   * @param {string} symbol símbolo para cada item
   */
  list(items, symbol = '•') {
    if (this.isJsonMode()) {
      this.structured('list', { items });
      return;
    }

    items.forEach(item => {
      console.log(`  ${chalk.cyan(symbol)} ${this.sanitize(item)}`);
    });
  }

  /**
   * Exibe tabela simples
   * @param {Array} rows linhas da tabela
   * @param {Array} headers cabeçalhos (opcional)
   */
  table(rows, headers = null) {
    if (this.isJsonMode()) {
      this.structured('table', { headers, rows });
      return;
    }

    if (headers) {
      console.log(chalk.bold(this.sanitize(headers).join('\t')));
      console.log(chalk.gray('─'.repeat(headers.join('\t').length)));
    }
    
    rows.forEach(row => {
      if (Array.isArray(row)) {
        console.log(this.sanitize(row).join('\t'));
      } else {
        console.log(this.sanitize(row));
      }
    });
  }

  /**
   * Exibe informações de status
   * @param {Object} status objeto com informações de status
   */
  status(status) {
    if (this.isJsonMode()) {
      this.structured('status', { status });
      return;
    }

    this.subtitle('Status Atual');
    
    Object.entries(status).forEach(([key, value]) => {
      const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
      const statusIcon = value ? chalk.green('✓') : chalk.red('✗');
      const statusText = value ? chalk.green('OK') : chalk.red('Erro');
      
      console.log(`  ${statusIcon} ${formattedKey}: ${statusText}`);
    });
  }

  /**
   * Exibe URL destacada
   * @param {string} label rótulo
   * @param {string} url URL
   */
  url(label, url) {
    if (this.isJsonMode()) {
      this.structured('url', { label, url });
      return;
    }

    console.log(`${chalk.green(this.sanitize(label))}: ${chalk.cyan.underline(this.sanitize(url))}`);
  }

  /**
   * Exibe comando a ser executado
   * @param {string} command comando
   */
  command(command) {
    if (this.isJsonMode()) {
      this.structured('command', { command });
      return;
    }

    console.log(`${chalk.yellow('$')} ${chalk.white(this.sanitize(command))}`);
  }

  /**
   * Exibe informações de Pull Request
   * @param {Object} pr dados do PR
   */
  pullRequest(pr) {
    if (this.isJsonMode()) {
      this.structured('pull_request', { pullRequest: pr });
      return;
    }

    this.subtitle(`Pull Request #${pr.id}`);
    console.log(`  ${chalk.yellow('Título:')} ${pr.title}`);
    console.log(`  ${chalk.yellow('Estado:')} ${this.formatPRState(pr.state)}`);
    console.log(`  ${chalk.yellow('Branch:')} ${chalk.cyan(pr.sourceBranch)} → ${chalk.cyan(pr.destinationBranch)}`);
    console.log(`  ${chalk.yellow('Autor:')} ${pr.author}`);
    console.log(`  ${chalk.yellow('Criado:')} ${pr.createdOn}`);
    this.url('URL', pr.url);
  }

  /**
   * Formata estado do PR
   * @param {string} state estado
   * @returns {string} estado formatado
   */
  formatPRState(state) {
    switch (state.toUpperCase()) {
      case 'OPEN':
        return chalk.green('Aberto');
      case 'MERGED':
        return chalk.blue('Merged');
      case 'DECLINED':
        return chalk.red('Rejeitado');
      case 'SUPERSEDED':
        return chalk.yellow('Substituído');
      default:
        return chalk.gray(state);
    }
  }

  /**
   * Exibe informações de workspace VTEX
   * @param {Object} workspace dados do workspace
   */
  workspace(workspace) {
    if (this.isJsonMode()) {
      this.structured('workspace', { workspace });
      return;
    }

    this.subtitle('Workspace VTEX');
    console.log(`  ${chalk.yellow('Conta:')} ${chalk.cyan(workspace.account)}`);
    console.log(`  ${chalk.yellow('Workspace:')} ${chalk.cyan(workspace.workspace)}`);
    console.log(`  ${chalk.yellow('Ambiente:')} ${chalk.cyan(workspace.environment)}`);
  }

  /**
   * Exibe banner de boas-vindas
   */
  welcome() {
    if (this.isJsonMode()) {
      this.structured('welcome', { application: 'VTEX Deploy CLI' });
      return;
    }

    console.log();
    console.log(chalk.bold.cyan('🚀 VTEX Deploy CLI'));
    console.log(chalk.gray('Automatização de deploy para aplicações VTEX IO'));
    console.log();
  }

  /**
   * Exibe mensagem de conclusão
   * @param {string} message mensagem
   */
  complete(message) {
    if (this.isJsonMode()) {
      this.structured('complete', { message }, 'success');
      return;
    }

    console.log();
    console.log(chalk.bold.green('🎉 ' + this.sanitize(message)));
    console.log();
  }

  /**
   * Exibe próximos passos
   * @param {Array} steps lista de passos
   */
  nextSteps(steps) {
    if (this.isJsonMode()) {
      this.structured('next_steps', { steps });
      return;
    }

    this.subtitle('Próximos Passos');
    steps.forEach((step, index) => {
      console.log(`  ${chalk.cyan(index + 1 + '.')} ${step}`);
    });
    console.log();
  }
}

module.exports = new Logger();