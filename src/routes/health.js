const express = require('express');
const config = require('../config');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'provifier',
    chain: config.chain,
    sui_configured: !!(config.sui.privateKey && config.sui.packageId),
    sui_network: config.sui.network,
    solana_configured: !!config.solana.rpcUrl,
    ethereum_configured: !!(config.ethereum.rpcUrl && config.ethereum.privateKey),
    polygon_configured: !!(config.polygon.rpcUrl && config.polygon.privateKey),
    base_configured: !!(config.base.rpcUrl && config.base.privateKey),
  });
});

module.exports = router;
