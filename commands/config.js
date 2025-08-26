const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

module.exports = (program) => {
  program
    .command('config:init')
    .description('Configuração inicial do CLI')
    .action(async () => {
      console.log(chalk.cyan('🚀 Configurando CLI de deploy VTEX IO\n'));
      
      const answers = await inquirer.prompt([
        {
          name: 'qaAccount',
          message: 'Conta VTEX QA:',
          validate: input => input ? true : 'Campo obrigatório',
        },
        {
          name: 'prodAccount',
          message: 'Conta VTEX Produção:',
          validate: input => input ? true : 'Campo obrigatório',
        },
        {
          type: 'password',
          name: 'qaAppkey',
          message: 'App Key VTEX QA:',
          mask: '*',
          validate: input => input ? true : 'Campo obrigatório',
        },
        {
          type: 'password',
          name: 'qaApptoken',
          message: 'App Token VTEX QA:',
          mask: '*',
          validate: input => input ? true : 'Campo obrigatório',
        },
        {
          type: 'password',
          name: 'prodAppkey',
          message: 'App Key VTEX Produção:',
          mask: '*',
          validate: input => input ? true : 'Campo obrigatório',
        },
        {
          type: 'password',
          name: 'prodApptoken',
          message: 'App Token VTEX Produção:',
          mask: '*',
          validate: input => input ? true : 'Campo obrigatório',
        },
        {
          name: 'bitbucketWorkspace',
          message: 'Workspace Bitbucket:',
          validate: input => input ? true : 'Campo obrigatório',
        },
        {
          name: 'bitbucketRepo',
          message: 'Repositório Bitbucket:',
          validate: input => input ? true : 'Campo obrigatório',
        },
        {
          type: 'password',
          name: 'bitbucketToken',
          message: 'Token Bitbucket:',
          mask: '*',
          validate: input => input ? true : 'Campo obrigatório',
        },
      ]);

      const envFileContent = `
QA_ACCOUNT=${answers.qaAccount}
PROD_ACCOUNT=${answers.prodAccount}
VTEX_QA_APPKEY=${answers.qaAppkey}
VTEX_QA_APPTOKEN=${answers.qaApptoken}
VTEX_PROD_APPKEY=${answers.prodAppkey}
VTEX_PROD_APPTOKEN=${answers.prodApptoken}
BITBUCKET_WORKSPACE=${answers.bitbucketWorkspace}
BITBUCKET_REPO=${answers.bitbucketRepo}
BITBUCKET_TOKEN=${answers.bitbucketToken}
`.trim();

      fs.writeFileSync(path.resolve(process.cwd(), '.env'), envFileContent);

      console.log(chalk.green('\n✅ Arquivo .env criado com sucesso!'));
      console.log(chalk.yellow('⚠️ Não esqueça de adicionar .env no .gitignore'));
    });
};
