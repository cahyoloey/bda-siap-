(function () {
  var C = window.SIAP_CONFIG || {}, sb = null, state = { user: null, profile: null }, pending = false, mode = 'masuk';
  if (C.SUPABASE_URL && window.supabase) sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

  var sid; try { sid = localStorage.getItem('siap_sid'); if (!sid) { sid = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('siap_sid', sid); } } catch (e) { sid = 'anon'; }

  function track(name, meta) {
    if (!sb) return;
    sb.from('events').insert({ name: name, session_id: sid, user_id: state.user ? state.user.id : null, meta: meta || {} }).then(function () {});
  }
  function isPro() { var p = state.profile; return !!(p && p.plan === 'pro' && p.plan_until && new Date(p.plan_until) > new Date()); }

  // ---------- UI ----------
  var css = document.createElement('style');
  css.textContent = '.siap-ov{position:fixed;inset:0;background:rgba(34,48,28,.55);display:none;align-items:center;justify-content:center;padding:24px;z-index:60}.siap-ov.show{display:flex}.siap-box{background:var(--cream,#fff);border-radius:20px;padding:30px;width:100%;max-width:380px}.siap-box h3{font-size:22px;font-weight:500;margin:0 0 6px}.siap-box p{font-size:14px;color:var(--ink-soft,#555);margin:0 0 16px;line-height:1.5}.siap-box input{width:100%;padding:12px 14px;margin:0 0 10px;border:1px solid var(--line,#ccc);border-radius:10px;font:inherit;box-sizing:border-box}.siap-box .btn{width:100%;justify-content:center}.siap-msg{color:#B3402A;font-size:13px;min-height:18px;margin:0 0 8px}.siap-sw{background:none;border:0;color:var(--terracotta,#c4622d);font:inherit;font-size:13px;cursor:pointer;margin-top:12px;width:100%}.siap-nav{margin-left:14px;padding:8px 16px;border-radius:100px;border:1px solid var(--line,#ccc);background:transparent;font:inherit;font-size:14px;cursor:pointer;color:inherit}';
  document.head.appendChild(css);

  var ov = document.createElement('div'); ov.className = 'siap-ov'; ov.id = 'authModal';
  ov.innerHTML = '<div class="siap-box"><h3 id="aTitle">Masuk</h3><p id="aSub"></p><input id="aEmail" type="email" placeholder="Email" autocomplete="email"><input id="aPass" type="password" placeholder="Kata sandi (min. 6 karakter)" autocomplete="current-password"><div class="siap-msg" id="aMsg"></div><button class="btn btn-primary" id="aGo" type="button">Masuk</button><button class="siap-sw" id="aSw" type="button"></button></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('show'); });

  function setMode(m) {
    mode = m;
    document.getElementById('aTitle').textContent = m === 'masuk' ? 'Masuk' : 'Daftar akun';
    document.getElementById('aGo').textContent = m === 'masuk' ? 'Masuk' : 'Daftar';
    document.getElementById('aSw').textContent = m === 'masuk' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk';
    document.getElementById('aMsg').textContent = '';
  }
  function openAuth(sub) { setMode('masuk'); document.getElementById('aSub').textContent = sub || 'Masuk untuk menyimpan progresmu.'; ov.classList.add('show'); }
  document.getElementById('aSw').onclick = function () { setMode(mode === 'masuk' ? 'daftar' : 'masuk'); };
  document.getElementById('aGo').onclick = async function () {
    var email = document.getElementById('aEmail').value.trim(), password = document.getElementById('aPass').value, msg = document.getElementById('aMsg');
    if (!sb) { msg.textContent = 'Supabase belum diisi di config.js'; return; }
    msg.textContent = 'Memproses...';
    var r = mode === 'daftar' ? await sb.auth.signUp({ email: email, password: password }) : await sb.auth.signInWithPassword({ email: email, password: password });
    if (r.error) { msg.textContent = r.error.message; return; }
    if (!r.data.session) { msg.textContent = 'Cek email kamu untuk konfirmasi, lalu masuk.'; return; }
    ov.classList.remove('show');
    await refresh(); track(mode === 'daftar' ? 'daftar' : 'login');
    if (pending) { pending = false; buyPro(); }
  };

  var navBtn = document.createElement('button'); navBtn.className = 'siap-nav'; navBtn.type = 'button'; navBtn.textContent = 'Masuk';
  var anchor = document.querySelector('a[href="#paket"]');
  if (anchor) anchor.insertAdjacentElement('afterend', navBtn); else document.body.insertBefore(navBtn, document.body.firstChild);
  var adminLink = document.createElement('a'); adminLink.href = 'admin.html'; adminLink.textContent = 'Admin'; adminLink.style.display = 'none';
  navBtn.insertAdjacentElement('afterend', adminLink);
  navBtn.onclick = async function () {
    if (!sb) { alert('Isi config.js dulu (lihat README).'); return; }
    if (state.user) { if (confirm('Keluar dari akun ' + state.user.email + '?')) { await sb.auth.signOut(); } } else openAuth();
  };

  function render() {
    navBtn.textContent = state.user ? (isPro() ? 'Pro ✓ ' : '') + state.user.email.split('@')[0] : 'Masuk';
    adminLink.style.display = state.profile && state.profile.role === 'admin' ? '' : 'none';
    var b = document.getElementById('openProBtn');
    if (b) b.textContent = isPro() ? 'Paket Pro aktif ✓' : 'Beli Paket Pro →';
  }
  async function refresh() {
    if (!sb) return;
    var r = await sb.auth.getSession(); state.user = r.data.session ? r.data.session.user : null; state.profile = null;
    if (state.user) { var q = await sb.from('profiles').select('*').eq('id', state.user.id).single(); state.profile = q.data; }
    render();
  }

  // ---------- Pembayaran (Midtrans Snap) ----------
  function buyPro() {
    track('klik_beli_pro');
    if (!sb) { if (window.openPro) window.openPro(); return; }
    location.href = 'checkout.html';
  }
  window.siapBuyPro = buyPro;

  // ---------- Pelacakan ----------
  var seen = {};
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && !seen[e.target.id]) { seen[e.target.id] = 1; track('lihat_' + e.target.id); } }); }, { threshold: 0.4 });
    ['paket', 'coba'].forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }
  var f = document.getElementById('demoForm'); if (f) f.addEventListener('submit', function () { track('chat_ai'); });
  document.querySelectorAll('.chip').forEach(function (c) { c.addEventListener('click', function () { track('chat_ai', { via: 'chip' }); }); });

  if (sb) { sb.auth.onAuthStateChange(function () { setTimeout(refresh, 0); }); refresh().then(function () { track('page_view'); }); } else render();
})();
