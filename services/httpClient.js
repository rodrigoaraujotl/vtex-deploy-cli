const axios = require('axios');

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);

function parsePositiveInteger(value, fallback) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryAfterDelay(retryAfter) {
  if (!retryAfter) {
    return null;
  }

  const retryAfterSeconds = Number.parseInt(retryAfter, 10);
  if (Number.isFinite(retryAfterSeconds)) {
    return retryAfterSeconds * 1000;
  }

  const retryAfterDate = Date.parse(retryAfter);
  if (Number.isFinite(retryAfterDate)) {
    return Math.max(0, retryAfterDate - Date.now());
  }

  return null;
}

function getRetryDelay(error, retryCount, baseDelayMs) {
  const retryAfterDelay = getRetryAfterDelay(error.response?.headers?.['retry-after']);
  if (retryAfterDelay !== null) {
    return retryAfterDelay;
  }

  return baseDelayMs * (2 ** Math.max(0, retryCount - 1));
}

function isTimeoutError(error) {
  return error.code === 'ECONNABORTED' ||
    error.code === 'ETIMEDOUT' ||
    /timeout|timed out/i.test(error.message || '');
}

function isTransientError(error) {
  const status = error.response?.status;
  return TRANSIENT_STATUS_CODES.has(status) || isTimeoutError(error);
}

function shouldRetry(error, retryAttempts) {
  if (!error.config) {
    return false;
  }

  const retryCount = error.config.__retryCount || 0;

  return retryCount < retryAttempts && isTransientError(error);
}

function createHttpClient(options = {}) {
  const retryAttempts = parsePositiveInteger(
    options.retryAttempts || process.env.HTTP_RETRY_ATTEMPTS,
    DEFAULT_RETRY_ATTEMPTS
  );
  const retryBaseDelayMs = parsePositiveInteger(
    options.retryBaseDelayMs || process.env.HTTP_RETRY_BASE_DELAY_MS,
    DEFAULT_RETRY_BASE_DELAY_MS
  );

  const client = axios.create({
    timeout: parsePositiveInteger(options.timeout || process.env.HTTP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    ...options.axiosConfig
  });

  client.interceptors.response.use(
    response => response,
    async error => {
      if (!shouldRetry(error, retryAttempts)) {
        return Promise.reject(error);
      }

      error.config.__retryCount = (error.config.__retryCount || 0) + 1;
      const retryDelay = getRetryDelay(error, error.config.__retryCount, retryBaseDelayMs);
      await sleep(retryDelay);

      return client(error.config);
    }
  );

  return client;
}

function formatHttpError(error, fallbackMessage = 'Não foi possível concluir a comunicação com o serviço.') {
  if (!error) {
    return fallbackMessage;
  }

  if (isTimeoutError(error)) {
    return `${fallbackMessage} Tempo limite excedido. Tente novamente em instantes.`;
  }

  if (!error.isAxiosError && error.message) {
    return `${fallbackMessage} ${error.message}`;
  }

  const status = error.response?.status;
  if (!status) {
    return `${fallbackMessage} Verifique sua conexão e tente novamente.`;
  }

  if (status === 429) {
    return `${fallbackMessage} Limite de requisições atingido. Tente novamente em instantes.`;
  }

  if (status === 401 || status === 403) {
    return `${fallbackMessage} Verifique as credenciais configuradas.`;
  }

  if (TRANSIENT_STATUS_CODES.has(status)) {
    return `${fallbackMessage} Serviço temporariamente indisponível (${status}). Tente novamente em instantes.`;
  }

  return `${fallbackMessage} A API retornou status ${status}.`;
}

module.exports = {
  createHttpClient,
  formatHttpError,
  httpClient: createHttpClient()
};
