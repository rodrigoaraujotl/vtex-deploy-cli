const chalk = require('chalk');
const ora = require('ora');

class Logger {
  constructor() {
    this.spinner = null;
  }

  /**
   * Log de informação
   * @param {string} message mensagem
   * @param {any} data dados adicionais (opcional)
   */
  info(message, data = null) {
    console.log(chalk.blue('ℹ'), message);
    if (data) {
      console.log(data);
    }
  }

  /**
   * Log de sucesso
   * @param {string} message mensagem
   * @param {any} data dados adicionais (opcional)
   */
  success(message, data = null) {
    console.log(chalk.green('✓'), message);
    if (data) {
      console.log(data);
    }
  }

  /**
   * Log de aviso
   * @param {string} message mensagem
   * @param {any} data dados adicionais (opcional)
   */
  warn(message, data = null) {
    console.log(chalk.yellow('⚠'), message);
    if (data) {
      console.log(data);
    }
  }

  /**
   * Log de erro
   * @param {string} message mensagem
   * @param {any} error erro (opcional)
   */
  error(message, error = null) {
    console.log(chalk.red('✗'), message);
    if (error) {
      if (error.stack) {
        console.error(chalk.red(error.stack));
      } else {
        console.error(chalk.red(error));
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
      console.log(chalk.gray('🐛'), chalk.gray(message));
      if (data) {
        console.log(chalk.gray(JSON.stringify(data, null, 2)));
      }
    }
  }

  /**
   * Inicia um spinner
   * @param {string} message mensagem do spinner
   * @returns {Object} instância do spinner
   */
  startSpinner(message) {
    this.spinner = ora(message).start();
    return this.spinner;
  }

  /**
   * Para o spinner com sucesso
   * @param {string} message mensagem de sucesso
   */
  succeedSpinner(message) {
    if (this.spinner) {
      this.spinner.succeed(message);
      this.spinner = null;
    }
  }

  /**
   * Para o spinner com erro
   * @param {string} message mensagem de erro
   */
  failSpinner(message) {
    if (this.spinner) {
      this.spinner.fail(message);
      this.spinner = null;
    }
  }

  /**
   * Para o spinner com aviso
   * @param {string} message mensagem de aviso
   */
  warnSpinner(message) {
    if (this.spinner) {
      this.spinner.warn(message);
      this.spinner = null;
    }
  }

  /**
   * Atualiza texto do spinner
   * @param {string} message nova mensagem
   */
  updateSpinner(message) {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  /**
   * Exibe título de seção
   * @param {string} title título
   */
  title(title) {
    console.log();
    console.log(chalk.bold.cyan(`🚀 ${title}`));
    console.log(chalk.cyan('─'.repeat(title.length + 3)));
  }

  /**
   * Exibe subtítulo
   * @param {string} subtitle subtítulo
   */
  subtitle(subtitle) {
    console.log();
    console.log(chalk.bold.yellow(`📋 ${subtitle}`));
  }

  /**
   * Exibe linha separadora
   */
  separator() {
    console.log(chalk.gray('─'.repeat(50)));
  }

  /**
   * Exibe linha em branco
   */
  newLine() {
    console.log();
  }

  /**
   * Exibe lista de itens
   * @param {Array} items lista de itens
   * @param {string} symbol símbolo para cada item
   */
  list(items, symbol = '•') {
    items.forEach((item) => {
      console.log(`  ${chalk.cyan(symbol)} ${item}`);
    });
  }

  /**
   * Exibe tabela simples
   * @param {Array} rows linhas da tabela
   * @param {Array} headers cabeçalhos (opcional)
   */
  table(rows, headers = null) {
    if (headers) {
      console.log(chalk.bold(headers.join('\t')));
      console.log(chalk.gray('─'.repeat(headers.join('\t').length)));
    }

    rows.forEach((row) => {
      if (Array.isArray(row)) {
        console.log(row.join('\t'));
      } else {
        console.log(row);
      }
    });
  }

  /**
   * Exibe informações de status
   * @param {Object} status objeto com informações de status
   */
  status(status) {
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
    console.log(`${chalk.green(label)}: ${chalk.cyan.underline(url)}`);
  }

  /**
   * Exibe comando a ser executado
   * @param {string} command comando
   */
  command(command) {
    console.log(`${chalk.yellow('$')} ${chalk.white(command)}`);
  }

  /**
   * Exibe informações de Pull Request
   * @param {Object} pr dados do PR
   */
  pullRequest(pr) {
    this.subtitle(`Pull Request #${pr.id}`);
    console.log(`  ${chalk.yellow('Título:')} ${pr.title}`);
    console.log(`  ${chalk.yellow('Estado:')} ${this.formatPRState(pr.state)}`);
    console.log(
      `  ${chalk.yellow('Branch:')} ${chalk.cyan(pr.sourceBranch)} → ${chalk.cyan(pr.destinationBranch)}`
    );
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
    this.subtitle('Workspace VTEX');
    console.log(`  ${chalk.yellow('Conta:')} ${chalk.cyan(workspace.account)}`);
    console.log(`  ${chalk.yellow('Workspace:')} ${chalk.cyan(workspace.workspace)}`);
    console.log(`  ${chalk.yellow('Ambiente:')} ${chalk.cyan(workspace.environment)}`);
  }

  /**
   * Exibe banner de boas-vindas
   */
  welcome() {
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
    console.log();
    console.log(chalk.bold.green('🎉 ' + message));
    console.log();
  }

  /**
   * Exibe próximos passos
   * @param {Array} steps lista de passos
   */
  nextSteps(steps) {
    this.subtitle('Próximos Passos');
    steps.forEach((step, index) => {
      console.log(`  ${chalk.cyan(index + 1 + '.')} ${step}`);
    });
    console.log();
  }
}

module.exports = new Logger();
