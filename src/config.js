const crypto = require('crypto');

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3002,
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'https://provifier.com',
  requireApiKey: process.env.REQUIRE_API_KEY !== 'false',
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  chain: process.env.CHAIN || 'sui',
  sui: {
    network: process.env.SUI_NETWORK || 'devnet',
    privateKey: process.env.SUI_PRIVATE_KEY || null,
    packageId: process.env.SUI_PACKAGE_ID || null,
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || null,
    keypairSecret: process.env.SOLANA_KEYPAIR_SECRET || null,
  },
  ethereum: {
    rpcUrl: process.env.ETHEREUM_RPC_URL || null,
    privateKey: process.env.ETHEREUM_PRIVATE_KEY || null,
  },
  polygon: {
    rpcUrl: process.env.POLYGON_RPC_URL || null,
    privateKey: process.env.POLYGON_PRIVATE_KEY || null,
  },
  base: {
    rpcUrl: process.env.BASE_RPC_URL || null,
    privateKey: process.env.BASE_PRIVATE_KEY || null,
  },
  alexiuzServiceKey: process.env.ALEXIUZ_SERVICE_KEY || null,
  alexiuzDb: {
    host: process.env.ALEXIUZ_DB_HOST || 'localhost',
    user: process.env.ALEXIUZ_DB_USER || '',
    password: process.env.ALEXIUZ_DB_PASSWORD || '',
    database: process.env.ALEXIUZ_DB_NAME || '',
  },
};
