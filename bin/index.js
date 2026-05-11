#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ConfigCommand = require('../commands/config');
const TaskCommand = require('../commands/task');
const PrCommand = require('../commands/pr');
const DeployCommand = require('../commands/deploy');
const StatusCommand = require('../commands/status');

const program = new Command();

program
  .name('vtex-deploy')
  .description('CLI para automatizar o fluxo de deploy de aplicações VTEX IO')
  .version('1.0.0');

// Registrar comandos
ConfigCommand(program);
TaskCommand(program);
PrCommand(program);
DeployCommand(program);
StatusCommand(program);

// Tratamento de erros globais
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Erro inesperado:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Promise rejeitada:'), reason);
  process.exit(1);
});

program.parse(process.argv);
