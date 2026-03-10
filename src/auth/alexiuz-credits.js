const config = require('../config');

const BASE_URL = 'https://alexiuz.com/public/apis';

async function checkBalance(alexiuzUserId) {
  if (!config.alexiuzServiceKey || !alexiuzUserId) return null;

  try {
    const res = await fetch(
      `${BASE_URL}/credit-balance.php?alexiuz_user_id=${encodeURIComponent(alexiuzUserId)}`,
      { headers: { 'X-Service-Key': config.alexiuzServiceKey } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      total: Number(data.total) || 0,
      paid: Number(data.paid) || 0,
      free: Number(data.free) || 0,
      earned: Number(data.earned) || 0,
    };
  } catch (err) {
    console.error('[CREDITS] Balance check failed:', err.message);
    return null;
  }
}

async function deductCredit(alexiuzUserId, cost, description, relatedId) {
  if (!config.alexiuzServiceKey || !alexiuzUserId) {
    return { success: false, error: 'not_configured' };
  }

  try {
    const res = await fetch(`${BASE_URL}/credit-deduct.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': config.alexiuzServiceKey,
      },
      body: JSON.stringify({
        alexiuz_user_id: alexiuzUserId,
        cost,
        type: 'pvf_commit',
        description,
        service: 'provifier',
        related_id: relatedId || null,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return { success: false, error: data.error || 'deduction_failed' };
    }
    return { success: true, balance: data.balance };
  } catch (err) {
    console.error('[CREDITS] Deduction failed:', err.message);
    return { success: false, error: 'network_error' };
  }
}

module.exports = { checkBalance, deductCredit };
