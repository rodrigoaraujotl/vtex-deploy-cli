const axios = require('axios');
const ora = require('ora');
const chalk = require('chalk');

class BitbucketService {
  constructor() {
    this.baseUrl = 'https://api.bitbucket.org/2.0';
    this.token = null;
    this.workspace = null;
    this.repository = null;
  }

  /**
   * Configura as credenciais do Bitbucket
   * @param {string} token token de acesso
   * @param {string} workspace workspace do Bitbucket
   * @param {string} repository nome do repositório
   */
  configure(token, workspace, repository) {
    this.token = token;
    this.workspace = workspace;
    this.repository = repository;
  }

  /**
   * Cria headers para autenticação
   * @returns {Object} headers com autenticação
   */
  getAuthHeaders() {
    if (!this.token) {
      throw new Error('Token do Bitbucket não configurado');
    }
    
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Cria um Pull Request
   * @param {Object} prData dados do PR
   * @returns {Promise<Object>} resultado da criação do PR
   */
  async createPullRequest(prData) {
    const { title, description, sourceBranch, destinationBranch } = prData;
    
    const spinner = ora(`Criando Pull Request: ${title}...`).start();
    
    try {
      if (!this.workspace || !this.repository) {
        throw new Error('Workspace ou repositório não configurados');
      }
      
      const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repository}/pullrequests`;
      
      const payload = {
        title,
        description,
        source: {
          branch: {
            name: sourceBranch
          }
        },
        destination: {
          branch: {
            name: destinationBranch
          }
        },
        close_source_branch: false
      };
      
      const response = await axios.post(url, payload, {
        headers: this.getAuthHeaders()
      });
      
      const prUrl = response.data.links.html.href;
      
      spinner.succeed(`Pull Request criado com sucesso!`);
      console.log(chalk.green('URL do PR:'), chalk.cyan(prUrl));
      
      return {
        success: true,
        pr: response.data,
        url: prUrl,
        id: response.data.id
      };
    } catch (error) {
      spinner.fail('Erro ao criar Pull Request');
      
      if (error.response) {
        console.error(chalk.red('Erro da API:'), error.response.data.error?.message || error.response.statusText);
        
        // Verifica se é erro de branch já existente
        if (error.response.status === 400 && error.response.data.error?.message?.includes('already exists')) {
          console.log(chalk.yellow('Dica: Pode ser que já exista um PR para esta branch'));
        }
      } else {
        console.error(chalk.red('Erro:'), error.message);
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Lista Pull Requests
   * @param {Object} filters filtros para a busca
   * @returns {Promise<Array>} lista de PRs
   */
  async listPullRequests(filters = {}) {
    try {
      if (!this.workspace || !this.repository) {
        throw new Error('Workspace ou repositório não configurados');
      }
      
      const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repository}/pullrequests`;
      
      const params = {
        state: filters.state || 'OPEN',
        sort: '-created_on'
      };
      
      if (filters.sourceBranch) {
        params.q = `source.branch.name="${filters.sourceBranch}"`;
      }
      
      const response = await axios.get(url, {
        headers: this.getAuthHeaders(),
        params
      });
      
      return response.data.values || [];
    } catch (error) {
      console.error(chalk.red('Erro ao listar Pull Requests:'), error.message);
      return [];
    }
  }

  /**
   * Obtém informações de um PR específico
   * @param {number} prId ID do Pull Request
   * @returns {Promise<Object|null>} dados do PR
   */
  async getPullRequest(prId) {
    try {
      if (!this.workspace || !this.repository) {
        throw new Error('Workspace ou repositório não configurados');
      }
      
      const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repository}/pullrequests/${prId}`;
      
      const response = await axios.get(url, {
        headers: this.getAuthHeaders()
      });
      
      return response.data;
    } catch (error) {
      console.error(chalk.red(`Erro ao obter PR ${prId}:`), error.message);
      return null;
    }
  }

  /**
   * Busca PRs por branch
   * @param {string} branchName nome da branch
   * @returns {Promise<Array>} PRs encontrados
   */
  async getPullRequestsByBranch(branchName) {
    try {
      const prs = await this.listPullRequests({ sourceBranch: branchName });
      return prs;
    } catch (error) {
      console.error(chalk.red(`Erro ao buscar PRs da branch ${branchName}:`), error.message);
      return [];
    }
  }

  /**
   * Verifica se existe PR aberto para uma branch
   * @param {string} branchName nome da branch
   * @returns {Promise<Object|null>} PR encontrado ou null
   */
  async getOpenPullRequestForBranch(branchName) {
    try {
      const prs = await this.getPullRequestsByBranch(branchName);
      const openPr = prs.find(pr => pr.state === 'OPEN');
      return openPr || null;
    } catch (error) {
      console.error(chalk.red(`Erro ao verificar PR da branch ${branchName}:`), error.message);
      return null;
    }
  }

  /**
   * Atualiza um Pull Request
   * @param {number} prId ID do Pull Request
   * @param {Object} updateData dados para atualização
   * @returns {Promise<boolean>} true se sucesso
   */
  async updatePullRequest(prId, updateData) {
    const spinner = ora(`Atualizando Pull Request ${prId}...`).start();
    
    try {
      if (!this.workspace || !this.repository) {
        throw new Error('Workspace ou repositório não configurados');
      }
      
      const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repository}/pullrequests/${prId}`;
      
      await axios.put(url, updateData, {
        headers: this.getAuthHeaders()
      });
      
      spinner.succeed(`Pull Request ${prId} atualizado com sucesso`);
      return true;
    } catch (error) {
      spinner.fail(`Erro ao atualizar Pull Request ${prId}`);
      console.error(chalk.red('Erro:'), error.message);
      return false;
    }
  }

  /**
   * Adiciona comentário a um Pull Request
   * @param {number} prId ID do Pull Request
   * @param {string} comment comentário
   * @returns {Promise<boolean>} true se sucesso
   */
  async addComment(prId, comment) {
    try {
      if (!this.workspace || !this.repository) {
        throw new Error('Workspace ou repositório não configurados');
      }
      
      const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repository}/pullrequests/${prId}/comments`;
      
      await axios.post(url, {
        content: {
          raw: comment
        }
      }, {
        headers: this.getAuthHeaders()
      });
      
      return true;
    } catch (error) {
      console.error(chalk.red(`Erro ao adicionar comentário ao PR ${prId}:`), error.message);
      return false;
    }
  }

  /**
   * Obtém status de builds/pipelines de um PR
   * @param {number} prId ID do Pull Request
   * @returns {Promise<Array>} status dos builds
   */
  async getBuildStatuses(prId) {
    try {
      if (!this.workspace || !this.repository) {
        throw new Error('Workspace ou repositório não configurados');
      }
      
      const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repository}/pullrequests/${prId}/statuses`;
      
      const response = await axios.get(url, {
        headers: this.getAuthHeaders()
      });
      
      return response.data.values || [];
    } catch (error) {
      console.error(chalk.red(`Erro ao obter status de builds do PR ${prId}:`), error.message);
      return [];
    }
  }

  /**
   * Verifica se as credenciais estão configuradas
   * @returns {boolean} true se configurado
   */
  isConfigured() {
    return !!(this.token && this.workspace && this.repository);
  }

  /**
   * Testa a conexão com a API do Bitbucket
   * @returns {Promise<boolean>} true se conexão OK
   */
  async testConnection() {
    const spinner = ora('Testando conexão com Bitbucket...').start();
    
    try {
      if (!this.isConfigured()) {
        throw new Error('Credenciais não configuradas');
      }
      
      const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repository}`;
      
      await axios.get(url, {
        headers: this.getAuthHeaders()
      });
      
      spinner.succeed('Conexão com Bitbucket OK');
      return true;
    } catch (error) {
      spinner.fail('Erro na conexão com Bitbucket');
      console.error(chalk.red('Erro:'), error.message);
      return false;
    }
  }

  /**
   * Formata dados do PR para exibição
   * @param {Object} pr dados do PR
   * @returns {Object} dados formatados
   */
  formatPRForDisplay(pr) {
    return {
      id: pr.id,
      title: pr.title,
      state: pr.state,
      sourceBranch: pr.source.branch.name,
      destinationBranch: pr.destination.branch.name,
      author: pr.author.display_name,
      createdOn: new Date(pr.created_on).toLocaleDateString('pt-BR'),
      url: pr.links.html.href,
      description: pr.description || 'Sem descrição'
    };
  }
}

module.exports = new BitbucketService();