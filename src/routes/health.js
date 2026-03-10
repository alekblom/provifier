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
  });
});

module.exports = router;
