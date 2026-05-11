# VTEX Deploy CLI

Uma CLI para automatizar o fluxo de deploy de aplicações VTEX IO, integrando Git, Docker, VTEX CLI e Bitbucket.

## 📋 Pré-requisitos

- Node.js 18+
- Docker e Docker Compose
- Git
- Conta VTEX (QA e/ou Produção)
- Repositório no Bitbucket com acesso via token

## 🚀 Instalação

### Instalação Global

```bash
npm install -g vtex-deploy-cli
```

### Instalação Local

```bash
# Clone o repositório
git clone <repository-url>
cd vtex-deploy-cli

# Instale as dependências
npm install

# Torne o script executável
chmod +x bin/index.js

# Link globalmente (opcional)
npm link
```

## ⚙️ Configuração Inicial

Antes de usar a CLI, execute a configuração inicial:

```bash
vtex-deploy config:init
```

Este comando irá:

- Coletar informações das contas VTEX (QA e Produção)
- Solicitar appkey e apptoken VTEX para cada ambiente
- Configurar workspace, repositório e token do Bitbucket
- Gerar arquivo `.env` com todas as variáveis necessárias
- Instruir para adicionar `.env` ao `.gitignore` (se necessário)

**Nota:** A CLI agora usa appkey/apptoken em vez de tokens diretos. Os tokens VTEX são gerados automaticamente quando necessário usando a API oficial da VTEX.

### Variáveis de Ambiente

O arquivo `.env` gerado conterá:

```env
# VTEX QA
QA_ACCOUNT=sua-conta-qa
VTEX_QA_APPKEY=sua-appkey-qa
VTEX_QA_APPTOKEN=seu-apptoken-qa

# VTEX Produção
PROD_ACCOUNT=sua-conta-prod
VTEX_PROD_APPKEY=sua-appkey-prod
VTEX_PROD_APPTOKEN=seu-apptoken-prod

# Bitbucket
BITBUCKET_WORKSPACE=seu-workspace
BITBUCKET_REPOSITORY=seu-repositorio
BITBUCKET_TOKEN=seu-token
```

### Autenticação VTEX

A CLI utiliza o sistema de appkey/apptoken da VTEX para autenticação:

1. **AppKey e AppToken**: Credenciais permanentes que não expiram
2. **Geração Automática de Tokens**: A CLI gera automaticamente tokens temporários quando necessário
3. **API Oficial**: Utiliza a API oficial da VTEX para geração de tokens: `http://api.vtexcommercestable.com.br/api/vtexid/apptoken/login`

**Como obter AppKey e AppToken:**

1. Acesse o Admin VTEX da sua conta
2. Vá em "Configurações da conta" > "Chaves de aplicação"
3. Crie uma nova chave de aplicação
4. Copie o AppKey e AppToken gerados

## 📚 Comandos Disponíveis

### 🔧 Configuração

#### `config:init`

Configura a CLI interativamente.

```bash
vtex-deploy config:init
```

### 📝 Gerenciamento de Tasks

#### `task:create <nome> <numero>`

Cria uma nova task de desenvolvimento.

```bash
vtex-deploy task:create feature 123
```

**O que faz:**

1. Cria branch `task-feature-123`
2. Faz checkout para a nova branch
3. Inicia Docker via `docker-compose up -d`
4. Aguarda containers ficarem ativos
5. Executa `vtex use task-feature-123`
6. Executa `vtex link`
7. Exibe URL de preview

**Opções:**

- `--no-docker`: Pula a inicialização do Docker
- `--no-link`: Pula o comando `vtex link`
- `--workspace <name>`: Usa workspace específico

#### `task:status`

Exibe status da task atual.

```bash
vtex-deploy task:status
```

**Informações exibidas:**

- Branch Git atual
- Status do workspace VTEX
- Status do Docker
- Mudanças não commitadas
- Próximos passos sugeridos

**Opções:**

- `--verbose`: Informações detalhadas
- `--environment <env>`: Ambiente específico (qa/prod)

### 🔄 Pull Requests

#### `pr:create <ambiente>`

Cria Pull Request para QA ou Produção.

```bash
vtex-deploy pr:create qa
vtex-deploy pr:create prod
```

**O que faz:**

1. Valida branch atual
2. Define branch de destino (`staging` para QA, `main` para Prod)
3. Confirma ação via prompt
4. Executa deploy VTEX correspondente
5. Cria PR no Bitbucket
6. Retorna URL da PR

**Opções:**

- `--title <title>`: Título customizado da PR
- `--description <desc>`: Descrição customizada
- `--reviewers <users>`: Revisores (separados por vírgula)
- `--force`: Pula confirmações

#### `pr:status`

Exibe status dos Pull Requests.

```bash
vtex-deploy pr:status
```

**Opções:**

- `--all`: Exibe todos os PRs, não apenas da branch atual
- `--state <state>`: Filtrar por estado (OPEN, MERGED, DECLINED)
- `--limit <number>`: Limite de PRs a exibir

### 🚀 Deploy

#### `deploy <ambiente>`

Executa deploy VTEX para o ambiente especificado.

```bash
vtex-deploy deploy qa
vtex-deploy deploy prod
```

**Fluxo QA:**

1. `vtex release`
2. `vtex publish`
3. `vtex install`

**Fluxo Produção:**

1. `vtex release`
2. `vtex publish`
3. `vtex deploy`

**Opções:**

- `--workspace <name>`: Workspace específico
- `--force`: Força deploy sem confirmação
- `--skip-release`: Pula etapa de release
- `--skip-publish`: Pula etapa de publish
- `--only-link`: Executa apenas `vtex link`

#### `deploy:status`

Verifica status do último deploy.

```bash
vtex-deploy deploy:status
```

#### `deploy:rollback <ambiente>`

Faz rollback do último deploy.

```bash
vtex-deploy deploy:rollback qa
vtex-deploy deploy:rollback prod
```

#### `deploy:logs`

Exibe logs do deploy atual.

```bash
vtex-deploy deploy:logs
```

**Opções:**

- `--follow`: Acompanha logs em tempo real
- `--lines <number>`: Número de linhas a exibir

### 📊 Status Geral

#### `status`

Exibe status geral do projeto.

```bash
vtex-deploy status
```

**Informações exibidas:**

- Status da configuração
- Status do Git
- Status do Docker
- Status dos ambientes VTEX
- Status do Bitbucket
- Recomendações

#### `workspace:status`

Exibe status detalhado dos workspaces VTEX.

```bash
vtex-deploy workspace:status
```

## 🐳 Docker

A CLI assume que você tem um `docker-compose.yml` configurado para o ambiente VTEX. Exemplo:

```yaml
version: '3.8'
services:
  vtex:
    image: vtex/toolbelt:latest
    volumes:
      - .:/app
      - vtex_cache:/root/.vtex
    working_dir: /app
    environment:
      - VTEX_ENV=dev
    ports:
      - '3000:3000'
    command: tail -f /dev/null

volumes:
  vtex_cache:
```

## 🔧 Estrutura do Projeto

```
vtex-deploy-cli/
├── bin/
│   └── index.js          # Ponto de entrada da CLI
├── commands/
│   ├── config.js         # Comandos de configuração
│   ├── task.js           # Comandos de task
│   ├── pr.js             # Comandos de PR
│   ├── deploy.js         # Comandos de deploy
│   └── status.js         # Comandos de status
├── services/
│   ├── docker.js         # Gerenciamento Docker
│   ├── vtex.js           # Integração VTEX CLI
│   ├── git.js            # Operações Git
│   └── bitbucket.js      # API Bitbucket
├── utils/
│   ├── env.js            # Gerenciamento .env
│   ├── logger.js         # Logs e cores
│   └── validators.js     # Validações
├── package.json
├── README.md
└── .env                  # Configurações (não versionado)
```

## 🎯 Fluxo de Trabalho Típico

### 1. Configuração Inicial

```bash
vtex-deploy config:init
```

### 2. Criar Nova Task

```bash
vtex-deploy task:create nova-feature 456
```

### 3. Desenvolver e Testar

```bash
# Verificar status
vtex-deploy task:status

# Fazer commits
git add .
git commit -m "feat: implementa nova feature"
git push origin task-nova-feature-456
```

### 4. Deploy para QA

```bash
vtex-deploy pr:create qa
```

### 5. Deploy para Produção

```bash
vtex-deploy pr:create prod
```

### 6. Monitoramento

```bash
# Status geral
vtex-deploy status

# Status dos PRs
vtex-deploy pr:status

# Logs do deploy
vtex-deploy deploy:logs
```

## 🛠️ Troubleshooting

### Problemas Comuns

#### Docker não está rodando

```bash
# Iniciar Docker
docker-compose up -d

# Verificar status
vtex-deploy status
```

#### Erro de autenticação VTEX

```bash
# Reconfigurar
vtex-deploy config:init

# Verificar tokens
vtex-deploy workspace:status
```

#### Problemas com Bitbucket

```bash
# Verificar configuração
vtex-deploy status

# Testar conexão
vtex-deploy pr:status
```

#### Branch não sincronizada

```bash
# Verificar status
vtex-deploy task:status

# Sincronizar
git pull origin main
git push origin current-branch
```

### Logs e Debug

Para debug detalhado, use a variável de ambiente:

```bash
DEBUG=vtex-deploy:* vtex-deploy <comando>
```

### Limpeza

Para limpar configurações:

```bash
# Remover .env
rm .env

# Reconfigurar
vtex-deploy config:init
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'feat: adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🆘 Suporte

Para suporte e dúvidas:

- Abra uma [issue](https://github.com/seu-usuario/vtex-deploy-cli/issues)
- Consulte a [documentação VTEX](https://developers.vtex.com/)
- Verifique os [logs](#logs-e-debug) para debug

---

**Desenvolvido com ❤️ para automatizar deploys VTEX**
