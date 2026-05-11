const assert = require('assert');
const vtexService = require('../services/vtex');

assert.ok(
  vtexService.VTEX_AUTH_BASE_URL,
  'VTEX_AUTH_BASE_URL deve estar definido'
);

assert.ok(
  !vtexService.VTEX_AUTH_BASE_URL.startsWith('http://'),
  'VTEX_AUTH_BASE_URL não pode começar com http://'
);

assert.ok(
  vtexService.buildVtexAuthUrl('minhaconta').startsWith('https://'),
  'URL final de autenticação deve usar HTTPS'
);

assert.strictEqual(
  new URL(vtexService.buildVtexAuthUrl('minhaconta')).searchParams.get('an'),
  'minhaconta',
  'URL final de autenticação deve incluir a conta no parâmetro an'
);
