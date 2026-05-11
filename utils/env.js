const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class EnvUtils {
  constructor() {
    this.envPath = path.join(process.cwd(), '.env');
    this.envVars = {};
    this.loadEnvFile();
  }

  /**
   * Carrega variáveis do arquivo .env
   */
  loadEnvFile() {
    try {
      if (fs.existsSync(this.envPath)) {
        const envContent = fs.readFileSync(this.envPath, 'utf8');
        this.parseEnvContent(envContent);
      }
    } catch (error) {
      console.error(chalk.red('Erro ao carregar arquivo .env:'), error.message);
    }
  }

  /**
   * Faz parse do conteúdo do arquivo .env
   * @param {string} content conteúdo do arquivo
   */
  parseEnvContent(content) {
    const lines = content.split('\n');

    lines.forEach((line) => {
      const trimmedLine = line.trim();

      // Ignora linhas vazias e comentários
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return;
      }

      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmedLine.substring(0, equalIndex).trim();
        let value = trimmedLine.substring(equalIndex + 1).trim();

        // Remove aspas se existirem
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        this.envVars[key] = value;
      }
    });
  }

  /**
   * Obtém uma variável de ambiente
   * @param {string} key chave da variável
   * @param {string} defaultValue valor padrão
   * @returns {string} valor da variável
   */
  get(key, defaultValue = null) {
    // Primeiro verifica process.env, depois o arquivo .env
    return process.env[key] || this.envVars[key] || defaultValue;
  }


  /**
   * Carrega variáveis combinadas de process.env e arquivo .env.
   * @returns {Object} variáveis disponíveis
   */
  loadEnv() {
    return {
      ...this.envVars,
      ...process.env
    };
  }

  /**
   * Obtém a configuração VTEX canônica de um ambiente.
   * @param {string} environment 'qa' ou 'prod'
   * @param {Object} config variáveis previamente carregadas (opcional)
   * @returns {Object} configuração com account, appkey e apptoken
   */
  getEnvironmentConfig(environment, config = this.loadEnv()) {
    const env = String(environment || '').toLowerCase();
    const envConfigKeys = {
      qa: {
        account: 'QA_ACCOUNT',
        appkey: 'VTEX_QA_APPKEY',
        apptoken: 'VTEX_QA_APPTOKEN'
      },
      prod: {
        account: 'PROD_ACCOUNT',
        appkey: 'VTEX_PROD_APPKEY',
        apptoken: 'VTEX_PROD_APPTOKEN'
      }
    };

    const keys = envConfigKeys[env];
    if (!keys) {
      return { name: env, account: null, appkey: null, apptoken: null };
    }

    return {
      name: env,
      account: config[keys.account] || null,
      appkey: config[keys.appkey] || null,
      apptoken: config[keys.apptoken] || null
    };
  }

  /**
   * Verifica se uma configuração VTEX de ambiente está completa.
   * @param {Object} environmentConfig configuração do ambiente
   * @returns {boolean} true se account, appkey e apptoken estão presentes
   */
  isEnvironmentConfigured(environmentConfig) {
    return !!(environmentConfig.account && environmentConfig.appkey && environmentConfig.apptoken);
  }

  /**
   * Lista ambientes VTEX configurados.
   * @param {Object} config variáveis previamente carregadas (opcional)
   * @returns {Array<Object>} ambientes com configuração completa
   */
  getConfiguredEnvironments(config = this.loadEnv()) {
    return ['qa', 'prod']
      .map(environment => this.getEnvironmentConfig(environment, config))
      .filter(environmentConfig => this.isEnvironmentConfigured(environmentConfig));
  }

  /**
   * Verifica se uma variável existe
   * @param {string} key chave da variável
   * @returns {boolean} true se existe
   */
  has(key) {
    return !!(process.env[key] || this.envVars[key]);
  }

  /**
   * Obtém todas as variáveis VTEX
   * @returns {Object} variáveis VTEX
   */
  getVtexConfig() {
    return {
      qaAccount: this.get('QA_ACCOUNT'),
      qaAppkey: this.get('VTEX_QA_APPKEY'),
      qaApptoken: this.get('VTEX_QA_APPTOKEN'),
      prodAccount: this.get('PROD_ACCOUNT'),
      prodAppkey: this.get('VTEX_PROD_APPKEY'),
      prodApptoken: this.get('VTEX_PROD_APPTOKEN')
    };
  }

  /**
   * Obtém configuração do Bitbucket
   * @returns {Object} configuração do Bitbucket
   */
  getBitbucketConfig() {
    return {
      workspace: this.get('BITBUCKET_WORKSPACE'),
      repository: this.get('BITBUCKET_REPOSITORY') || this.get('BITBUCKET_REPO'),
      token: this.get('BITBUCKET_TOKEN')
    };
  }

  /**
   * Valida se todas as variáveis necessárias estão configuradas
   * @param {Array<string>} requiredVars variáveis obrigatórias
   * @returns {Object} resultado da validação
   */
  validateRequired(requiredVars) {
    const missing = [];
    const present = [];

    requiredVars.forEach((varName) => {
      if (this.has(varName)) {
        present.push(varName);
      } else {
        missing.push(varName);
      }
    });

    return {
      valid: missing.length === 0,
      missing,
      present
    };
  }

  /**
   * Valida configuração VTEX para um ambiente
   * @param {string} environment 'qa' ou 'prod'
   * @returns {Object} resultado da validação
   */
  validateVtexConfig(environment) {
    const envUpper = environment.toUpperCase();
    const requiredVars = [
      `${envUpper}_ACCOUNT`,
      `VTEX_${envUpper}_APPKEY`,
      `VTEX_${envUpper}_APPTOKEN`
    ];

    return this.validateRequired(requiredVars);
  }

  /**
   * Valida configuração do Bitbucket
   * @returns {Object} resultado da validação
   */
  validateBitbucketConfig() {
    const requiredVars = ['BITBUCKET_WORKSPACE', 'BITBUCKET_REPOSITORY', 'BITBUCKET_TOKEN'];

    return this.validateRequired(requiredVars);
  }

  /**
   * Cria arquivo .env com configurações
   * @param {Object} config configurações
   * @returns {boolean} true se sucesso
   */
  createEnvFile(config) {
    try {
      const envContent = this.generateEnvContent(config);
      fs.writeFileSync(this.envPath, envContent, 'utf8');

      // Recarrega as variáveis
      this.loadEnvFile();

      return true;
    } catch (error) {
      console.error(chalk.red('Erro ao criar arquivo .env:'), error.message);
      return false;
    }
  }

  /**
   * Gera conteúdo do arquivo .env
   * @param {Object} config configurações
   * @returns {string} conteúdo do arquivo
   */
  generateEnvContent(config) {
    const lines = [
      '# Configurações VTEX Deploy CLI',
      '# Gerado automaticamente pelo comando config:init',
      '',
      '# Configurações VTEX QA',
      `QA_ACCOUNT=${config.vtexQaAccount || ''}`,
      `VTEX_QA_APPKEY=${config.vtexQaAppkey || ''}`,
      `VTEX_QA_APPTOKEN=${config.vtexQaApptoken || ''}`,
      '',
      '# Configurações VTEX Produção',
      `PROD_ACCOUNT=${config.vtexProdAccount || ''}`,
      `VTEX_PROD_APPKEY=${config.vtexProdAppkey || ''}`,
      `VTEX_PROD_APPTOKEN=${config.vtexProdApptoken || ''}`,
      '',
      '# Configurações Bitbucket',
      `BITBUCKET_WORKSPACE=${config.bitbucketWorkspace || ''}`,
      `BITBUCKET_REPOSITORY=${config.bitbucketRepository || ''}`,
      `BITBUCKET_TOKEN=${config.bitbucketToken || ''}`,
      ''
    ];

    return lines.join('\n');
  }


  /**
   * Retorna todas as variáveis carregadas combinando process.env e arquivo .env.
   * @returns {Object} variáveis de ambiente disponíveis
   */
  loadEnv() {
    return {
      ...this.envVars,
      ...process.env
    };
  }

  /**
   * Verifica se o arquivo .env existe
   * @returns {boolean} true se existe
   */
  envFileExists() {
    return fs.existsSync(this.envPath);
  }

  /**
   * Obtém o caminho do arquivo .env
   * @returns {string} caminho do arquivo
   */
  getEnvPath() {
    return this.envPath;
  }

  /**
   * Carrega e normaliza as variáveis esperadas pelos comandos.
   * @returns {Object} objeto plano com configuração VTEX e Bitbucket
   */
  loadEnv() {
    this.envVars = {};
    this.loadEnvFile();

    const config = {
      ...this.getAllVars(),
      QA_ACCOUNT: this.get('QA_ACCOUNT'),
      VTEX_QA_APPKEY: this.get('VTEX_QA_APPKEY'),
      VTEX_QA_APPTOKEN: this.get('VTEX_QA_APPTOKEN'),
      PROD_ACCOUNT: this.get('PROD_ACCOUNT'),
      VTEX_PROD_APPKEY: this.get('VTEX_PROD_APPKEY'),
      VTEX_PROD_APPTOKEN: this.get('VTEX_PROD_APPTOKEN'),
      BITBUCKET_WORKSPACE: this.get('BITBUCKET_WORKSPACE'),
      BITBUCKET_REPOSITORY: this.get('BITBUCKET_REPOSITORY') || this.get('BITBUCKET_REPO'),
      BITBUCKET_TOKEN: this.get('BITBUCKET_TOKEN')
    };

    // Aliases usados por alguns comandos legados.
    config.QA_APPKEY = config.VTEX_QA_APPKEY;
    config.QA_APPTOKEN = config.VTEX_QA_APPTOKEN;
    config.PROD_APPKEY = config.VTEX_PROD_APPKEY;
    config.PROD_APPTOKEN = config.VTEX_PROD_APPTOKEN;
    config.VTEX_QA_ACCOUNT = config.QA_ACCOUNT;
    config.VTEX_PROD_ACCOUNT = config.PROD_ACCOUNT;

    return config;
  }

  /**
   * Lista todas as variáveis carregadas
   * @returns {Object} todas as variáveis
   */
  getAllVars() {
    return { ...this.envVars };
  }

  /**
   * Exibe status das configurações
   */
  displayConfigStatus() {
    console.log(chalk.blue('\n📋 Status das Configurações:\n'));

    // VTEX QA
    const vtexQaValid = this.validateVtexConfig('qa');
    console.log(chalk.yellow('VTEX QA:'));
    console.log(
      `  Account: ${vtexQaValid.present.includes('QA_ACCOUNT') ? chalk.green('✓') : chalk.red('✗')}`
    );
    console.log(
      `  Appkey: ${vtexQaValid.present.includes('VTEX_QA_APPKEY') ? chalk.green('✓') : chalk.red('✗')}`
    );
    console.log(
      `  Apptoken: ${vtexQaValid.present.includes('VTEX_QA_APPTOKEN') ? chalk.green('✓') : chalk.red('✗')}`
    );

    // VTEX Prod
    const vtexProdValid = this.validateVtexConfig('prod');
    console.log(chalk.yellow('\nVTEX Produção:'));
    console.log(
      `  Account: ${vtexProdValid.present.includes('PROD_ACCOUNT') ? chalk.green('✓') : chalk.red('✗')}`
    );
    console.log(
      `  Appkey: ${vtexProdValid.present.includes('VTEX_PROD_APPKEY') ? chalk.green('✓') : chalk.red('✗')}`
    );
    console.log(
      `  Apptoken: ${vtexProdValid.present.includes('VTEX_PROD_APPTOKEN') ? chalk.green('✓') : chalk.red('✗')}`
    );

    // Bitbucket
    const bitbucketValid = this.validateBitbucketConfig();
    console.log(chalk.yellow('\nBitbucket:'));
    console.log(
      `  Workspace: ${bitbucketValid.present.includes('BITBUCKET_WORKSPACE') ? chalk.green('✓') : chalk.red('✗')}`
    );
    console.log(
      `  Repository: ${bitbucketValid.present.includes('BITBUCKET_REPOSITORY') ? chalk.green('✓') : chalk.red('✗')}`
    );
    console.log(
      `  Token: ${bitbucketValid.present.includes('BITBUCKET_TOKEN') ? chalk.green('✓') : chalk.red('✗')}`
    );

    console.log();
  }
}

module.exports = new EnvUtils();
