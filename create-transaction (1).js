const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
module.exports = async (req, res) => {
  const b = req.body || {};
  const sig = crypto.createHash('sha512').update(String(b.order_id) + b.status_code + b.gross_amount + process.env.MIDTRANS_SERVER_KEY).digest('hex');
  if (sig !== b.signature_key) return res.status(403).end();

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const paid = b.transaction_status === 'settlement' || (b.transaction_status === 'capture' && b.fraud_status === 'accept');
  const failed = ['deny', 'cancel', 'expire', 'failure'].includes(b.transaction_status);
  const status = paid ? 'paid' : failed ? 'failed' : 'pending';

  const { data: p } = await sb.from('payments').select('*').eq('order_id', b.order_id).single();
  if (!p) return res.status(404).end();
  if (p.status !== 'paid') {
    await sb.from('payments').update({ status }).eq('order_id', b.order_id);
    if (paid) {
      const until = new Date(Date.now() + 30 * 864e5).toISOString();
      await sb.from('profiles').update({ plan: 'pro', plan_until: until }).eq('id', p.user_id);
      await sb.from('events').insert({ name: 'bayar_sukses', user_id: p.user_id, meta: { order_id: b.order_id } });
    }
  }
  res.json({ ok: true });
};
