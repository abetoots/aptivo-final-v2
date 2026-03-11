/**
 * S6-INF-SEED: domain seed barrel export
 * @task S6-INF-SEED
 */

// crypto domain
export {
  seedAllCrypto,
  seedCryptoRoles,
  seedCryptoTemplates,
  seedCryptoMcpServers,
  CRYPTO_PERMISSIONS,
  CRYPTO_TEMPLATES,
  CRYPTO_MCP_SERVERS,
} from './crypto-seeds.js';

// hr domain
export {
  seedAllHr,
  seedHrRoles,
  seedHrTemplates,
  seedHrMcpServers,
  HR_PERMISSIONS,
  HR_TEMPLATES,
  HR_MCP_SERVERS,
} from './hr-seeds.js';
