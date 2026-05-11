const inquirer = require('inquirer');
const logger = require('./logger');

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

function addAutomationOptions(command) {
  return command
    .option('--ci', 'Executa em modo CI: sem prompts e exigindo confirmações explícitas para ações destrutivas')
    .option('-y, --yes', 'Responde automaticamente "sim" para confirmações não destrutivas')
    .option('--non-interactive', 'Desabilita prompts interativos');
}

function getArgvOption(name) {
  const flagByName = {
    ci: ['--ci'],
    nonInteractive: ['--non-interactive'],
    yes: ['--yes', '-y'],
    confirmMerge: ['--confirm-merge'],
    confirmRollback: ['--confirm-rollback']
  };

  const flags = flagByName[name] || [];
  return flags.some(flag => process.argv.includes(flag));
}

function getOption(options, name) {
  if (!options) return false;
  if (Object.prototype.hasOwnProperty.call(options, name)) {
    return options[name];
  }
  if (typeof options.optsWithGlobals === 'function') {
    const globals = options.optsWithGlobals();
    if (globals && Object.prototype.hasOwnProperty.call(globals, name)) {
      return globals[name];
    }
  }
  if (typeof options.opts === 'function') {
    const commandOptions = options.opts();
    if (commandOptions && Object.prototype.hasOwnProperty.call(commandOptions, name)) {
      return commandOptions[name];
    }
  }
  if (options.parent && typeof options.parent.opts === 'function') {
    const parentOptions = options.parent.opts();
    return parentOptions ? parentOptions[name] : false;
  }
  return getArgvOption(name);
}

function isCIEnvironment() {
  return ['1', 'true', 'yes'].includes(String(process.env.CI || '').toLowerCase());
}

function isNonInteractive(options = {}) {
  return Boolean(
    getOption(options, 'ci') ||
    getOption(options, 'nonInteractive') ||
    getOption(options, 'yes') ||
    isCIEnvironment()
  );
}

function shouldAutoYes(options = {}) {
  return Boolean(getOption(options, 'yes'));
}

async function confirm(options, promptConfig, { autoYes = false, allowYes = true, errorMessage } = {}) {
  if ((allowYes && shouldAutoYes(options)) || autoYes) {
    return true;
  }

  if (isNonInteractive(options)) {
    throw new CliError(errorMessage || `Modo não interativo: informe uma flag explícita para continuar sem o prompt "${promptConfig.message}".`, 2);
  }

  const answer = await inquirer.prompt([promptConfig]);
  return Boolean(answer[promptConfig.name]);
}

async function choose(options, promptConfig, { errorMessage } = {}) {
  if (isNonInteractive(options)) {
    throw new CliError(errorMessage || `Modo não interativo: informe o parâmetro obrigatório para evitar o prompt "${promptConfig.message}".`, 2);
  }

  const answer = await inquirer.prompt([promptConfig]);
  return answer[promptConfig.name];
}

function requireCIFlag(options, flagName, flagSyntax, operation) {
  if ((getOption(options, 'ci') || isCIEnvironment() || getOption(options, 'nonInteractive')) && !getOption(options, flagName)) {
    throw new CliError(`Modo CI/não interativo: a operação destrutiva "${operation}" exige a flag explícita ${flagSyntax}.`, 2);
  }
}

async function runAction(action, contextMessage) {
  try {
    await action();
  } catch (error) {
    const exitCode = error.exitCode || 1;
    if (error instanceof CliError) {
      logger.error(error.message);
    } else {
      logger.error(contextMessage, error);
    }
    process.exit(exitCode);
  }
}

module.exports = {
  CliError,
  addAutomationOptions,
  confirm,
  choose,
  getOption,
  isNonInteractive,
  requireCIFlag,
  runAction
};
