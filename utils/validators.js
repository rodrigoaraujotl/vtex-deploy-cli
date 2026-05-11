const chalk = require('chalk');

/**
 * Validadores para diferentes tipos de dados
 */
class Validators {
  /**
   * Valida se uma string não está vazia
   * @param {string} value valor a validar
   * @param {string} fieldName nome do campo (para mensagem de erro)
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static required(value, fieldName = 'Campo') {
    if (!value || value.trim() === '') {
      return `${fieldName} é obrigatório`;
    }
    return true;
  }

  /**
   * Valida formato de email
   * @param {string} email email a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static email(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Email deve ter um formato válido';
    }
    return true;
  }

  /**
   * Valida token VTEX
   * @param {string} token token a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static vtexToken(token) {
    if (!token || token.trim() === '') {
      return 'Token VTEX é obrigatório';
    }
    if (token.length < 10) {
      return 'Token VTEX deve ter pelo menos 10 caracteres';
    }
    return true;
  }


  /**
   * Valida nome de serviço Docker Compose.
   * @param {string} service serviço a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static dockerService(service) {
    if (!service || service.trim() === '') {
      return 'Serviço Docker é obrigatório';
    }
    const serviceRegex = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;
    if (!serviceRegex.test(service)) {
      return 'Serviço Docker deve conter apenas letras, números, pontos, underscore e hífens, sem iniciar com símbolo';
    }
    return true;
  }

  /**
   * Valida nome de workspace VTEX.
   * @param {string} workspace workspace a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static vtexWorkspace(workspace) {
    if (!workspace || workspace.trim() === '') {
      return 'Workspace VTEX é obrigatório';
    }
    const workspaceRegex = /^[a-z0-9][a-z0-9-]{0,127}$/;
    if (!workspaceRegex.test(workspace)) {
      return 'Workspace VTEX deve conter apenas letras minúsculas, números e hífens, sem iniciar com hífen';
    }
    return true;
  }

  /**
   * Valida nome de app VTEX (vendor.name ou vendor.name@version).
   * @param {string} appName app a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static vtexAppName(appName) {
    if (!appName || appName.trim() === '') {
      return 'Nome da aplicação VTEX é obrigatório';
    }
    const appRegex = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*(?:@[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?)?$/;
    if (!appRegex.test(appName)) {
      return 'Aplicação VTEX deve usar o formato vendor.name ou vendor.name@x.y.z';
    }
    return true;
  }

  /**
   * Valida versão semântica.
   * @param {string} version versão a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static version(version) {
    if (!version || version.trim() === '') {
      return 'Versão é obrigatória';
    }
    const versionRegex = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?$/;
    if (!versionRegex.test(version)) {
      return 'Versão deve seguir o formato semântico x.y.z';
    }
    return true;
  }

  /**
   * Lança erro quando uma validação falha.
   * @param {boolean|string} result resultado do validador
   */
  static assert(result) {
    if (result !== true) {
      throw new Error(result);
    }
  }

  /**
   * Valida nome de conta VTEX
   * @param {string} account conta a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static vtexAccount(account) {
    if (!account || account.trim() === '') {
      return 'Conta VTEX é obrigatória';
    }
    const accountRegex = /^[a-z0-9][a-z0-9-]{0,127}$/;
    if (!accountRegex.test(account)) {
      return 'Conta VTEX deve conter apenas letras minúsculas, números e hífens, sem iniciar com hífen';
    }
    return true;
  }

  /**
   * Valida nome de workspace Bitbucket
   * @param {string} workspace workspace a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static bitbucketWorkspace(workspace) {
    if (!workspace || workspace.trim() === '') {
      return 'Workspace Bitbucket é obrigatório';
    }
    const workspaceRegex = /^[a-zA-Z0-9_-]+$/;
    if (!workspaceRegex.test(workspace)) {
      return 'Workspace Bitbucket deve conter apenas letras, números, underscore e hífens';
    }
    return true;
  }

  /**
   * Valida nome de repositório
   * @param {string} repo repositório a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static repository(repo) {
    if (!repo || repo.trim() === '') {
      return 'Repositório é obrigatório';
    }
    const repoRegex = /^[a-zA-Z0-9._-]+$/;
    if (!repoRegex.test(repo)) {
      return 'Repositório deve conter apenas letras, números, pontos, underscore e hífens';
    }
    return true;
  }

  /**
   * Valida token Bitbucket
   * @param {string} token token a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static bitbucketToken(token) {
    if (!token || token.trim() === '') {
      return 'Token Bitbucket é obrigatório';
    }
    if (token.length < 20) {
      return 'Token Bitbucket deve ter pelo menos 20 caracteres';
    }
    return true;
  }

  /**
   * Valida nome de branch
   * @param {string} branch branch a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static branchName(branch) {
    if (!branch || branch.trim() === '') {
      return 'Nome da branch é obrigatório';
    }
    const branchRegex = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,254}$/;
    if (!branchRegex.test(branch)) {
      return 'Nome da branch deve conter apenas letras, números, pontos, underscore, hífens e barras, sem iniciar com símbolo';
    }
    if (branch.startsWith('/') || branch.endsWith('/') || branch.includes('//')) {
      return 'Nome da branch não pode começar/terminar com barra nem conter barras duplicadas';
    }
    if (branch.includes('..') || branch.includes('@{') || branch.endsWith('.lock') || branch.split('/').some(part => part.startsWith('.') || part.endsWith('.'))) {
      return 'Nome da branch contém sequência reservada pelo Git';
    }
    return true;
  }

  /**
   * Valida ambiente (qa ou prod)
   * @param {string} environment ambiente a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static environment(environment) {
    const validEnvironments = ['qa', 'prod'];
    if (!validEnvironments.includes(environment)) {
      return `Ambiente deve ser um dos seguintes: ${validEnvironments.join(', ')}`;
    }
    return true;
  }

  /**
   * Valida número de task
   * @param {string|number} taskNumber número da task
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static taskNumber(taskNumber) {
    const num = parseInt(taskNumber);
    if (isNaN(num) || num <= 0) {
      return 'Número da task deve ser um número positivo';
    }
    return true;
  }

  /**
   * Valida nome de task
   * @param {string} taskName nome da task
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static taskName(taskName) {
    if (!taskName || taskName.trim() === '') {
      return 'Nome da task é obrigatório';
    }
    const taskNameRegex = /^[a-zA-Z0-9-_]+$/;
    if (!taskNameRegex.test(taskName)) {
      return 'Nome da task deve conter apenas letras, números, hífens e underscore';
    }
    if (taskName.length > 50) {
      return 'Nome da task deve ter no máximo 50 caracteres';
    }
    return true;
  }

  /**
   * Valida URL
   * @param {string} url URL a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static url(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return 'URL deve ter um formato válido';
    }
  }

  /**
   * Valida porta
   * @param {string|number} port porta a validar
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static port(port) {
    const num = parseInt(port);
    if (isNaN(num) || num < 1 || num > 65535) {
      return 'Porta deve ser um número entre 1 e 65535';
    }
    return true;
  }

  /**
   * Valida se um valor está em uma lista de opções
   * @param {any} value valor a validar
   * @param {Array} options lista de opções válidas
   * @param {string} fieldName nome do campo
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static oneOf(value, options, fieldName = 'Valor') {
    if (!options.includes(value)) {
      return `${fieldName} deve ser um dos seguintes: ${options.join(', ')}`;
    }
    return true;
  }

  /**
   * Valida comprimento mínimo
   * @param {string} value valor a validar
   * @param {number} minLength comprimento mínimo
   * @param {string} fieldName nome do campo
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static minLength(value, minLength, fieldName = 'Campo') {
    if (!value || value.length < minLength) {
      return `${fieldName} deve ter pelo menos ${minLength} caracteres`;
    }
    return true;
  }

  /**
   * Valida comprimento máximo
   * @param {string} value valor a validar
   * @param {number} maxLength comprimento máximo
   * @param {string} fieldName nome do campo
   * @returns {boolean|string} true se válido, string com erro se inválido
   */
  static maxLength(value, maxLength, fieldName = 'Campo') {
    if (value && value.length > maxLength) {
      return `${fieldName} deve ter no máximo ${maxLength} caracteres`;
    }
    return true;
  }

  /**
   * Executa múltiplas validações em um valor
   * @param {any} value valor a validar
   * @param {Array} validators lista de validadores
   * @returns {boolean|string} true se válido, primeira mensagem de erro se inválido
   */
  static validate(value, validators) {
    for (const validator of validators) {
      const result = validator(value);
      if (result !== true) {
        return result;
      }
    }
    return true;
  }

  /**
   * Valida objeto de configuração completo
   * @param {Object} config configuração a validar
   * @returns {Object} objeto com erros encontrados
   */
  static validateConfig(config) {
    const errors = {};

    // Validar contas VTEX
    const qaAccountResult = this.vtexAccount(config.QA_ACCOUNT);
    if (qaAccountResult !== true) {
      errors.QA_ACCOUNT = qaAccountResult;
    }

    const prodAccountResult = this.vtexAccount(config.PROD_ACCOUNT);
    if (prodAccountResult !== true) {
      errors.PROD_ACCOUNT = prodAccountResult;
    }

    // Validar appkeys VTEX
    const qaAppkeyResult = this.vtexToken(config.VTEX_QA_APPKEY);
    if (qaAppkeyResult !== true) {
      errors.VTEX_QA_APPKEY = qaAppkeyResult;
    }

    const prodAppkeyResult = this.vtexToken(config.VTEX_PROD_APPKEY);
    if (prodAppkeyResult !== true) {
      errors.VTEX_PROD_APPKEY = prodAppkeyResult;
    }

    // Validar apptokens VTEX
    const qaApptokenResult = this.vtexToken(config.VTEX_QA_APPTOKEN);
    if (qaApptokenResult !== true) {
      errors.VTEX_QA_APPTOKEN = qaApptokenResult;
    }

    const prodApptokenResult = this.vtexToken(config.VTEX_PROD_APPTOKEN);
    if (prodApptokenResult !== true) {
      errors.VTEX_PROD_APPTOKEN = prodApptokenResult;
    }

    // Validar Bitbucket
    const workspaceResult = this.bitbucketWorkspace(config.BITBUCKET_WORKSPACE);
    if (workspaceResult !== true) {
      errors.BITBUCKET_WORKSPACE = workspaceResult;
    }

    const repoResult = this.repository(config.BITBUCKET_REPOSITORY);
    if (repoResult !== true) {
      errors.BITBUCKET_REPOSITORY = repoResult;
    }

    const tokenResult = this.bitbucketToken(config.BITBUCKET_TOKEN);
    if (tokenResult !== true) {
      errors.BITBUCKET_TOKEN = tokenResult;
    }

    return errors;
  }
}

module.exports = Validators;
