const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const b = req.body && typeof req.body === 'object' ? req.body : {};

  // A) Kabar pembayaran dari Midtrans
  if (b.signature_key) {
    const sig = crypto.createHash('sha512').update(String(b.order_id) + b.status_code + b.gross_amount + process.env.MIDTRANS_SERVER_KEY).digest('hex');
    if (sig !== b.signature_key) return res.status(403).end();

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
    return res.json({ ok: true });
  }

  // B) Buat tagihan saat pengguna klik Bayar
  const jwt = (req.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error } = await sb.auth.getUser(jwt);
  if (error || !user) return res.status(401).json({ error: 'Belum login' });

  const amount = 10000;
  const order_id = 'SIAP-' + Date.now() + '-' + user.id.slice(0, 6);
  const base = process.env.MIDTRANS_PRODUCTION === 'true' ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
  const r = await fetch(base + '/snap/v1/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(process.env.MIDTRANS_SERVER_KEY + ':').toString('base64') },
    body: JSON.stringify({
      transaction_details: { order_id, gross_amount: amount },
      customer_details: { email: user.email },
      item_details: [{ id: 'pro-1bln', price: amount, quantity: 1, name: 'Siap? Paket Pro 1 bulan' }]
    })
  });
  const d = await r.json();
  if (!r.ok) return res.status(502).json({ error: d });
  await sb.from('payments').insert({ order_id, user_id: user.id, amount, status: 'pending' });
  res.json({ token: d.token });
};
