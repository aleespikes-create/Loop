'use strict';
/* ============ Loop PWA client ============ */
let TOKEN = localStorage.getItem('loop_token') || localStorage.getItem('swaply_token') || null;
let ME = null;
let FEED = [], CHAINS = [], loopOwnerIds = new Set(), filterCat = 'all';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOGO = (px = 24) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>`;
const ICON = {
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12v17l-6-4-6 4V4z"/></svg>',
  bookmarkFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 1 1 21 11.5z"/></svg>',
  deal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h13l-3-3M21 17H8l3 3"/></svg>',
};
const CATS = [
  { full: 'Design & Creative', label: 'Design' },
  { full: 'Development & Tech', label: 'Development' },
  { full: 'Writing & Marketing', label: 'Writing' },
  { full: 'Nashville-Local In-Person', label: 'Local / In-person' },
];
const WANT_TAGS = ['Design', 'Development', 'Writing', 'Photography', 'Personal Training', 'Bookkeeping', 'Video', 'Marketing', 'Handmade goods', 'Music lessons'];
const HOODS = ['East Nashville', '12South', 'Germantown', 'The Nations', 'Wedgewood-Houston', 'Berry Hill', 'Downtown', 'Sylvan Park', 'Inglewood', 'Donelson'];
const catKey = c => ({ 'Design & Creative': 'design', 'Development & Tech': 'dev', 'Writing & Marketing': 'write', 'Nashville-Local In-Person': 'local' }[c] || 'design');

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600); }
function avatar(p, size = 36) {
  const initials = esc(p.initials || (p.name || '?').slice(0, 2).toUpperCase());
  return `<span class="avatar" style="background:${esc(p.color || '#4E6B94')};width:${size}px;height:${size}px;font-size:${Math.round(size * .34)}px">${initials}</span>`;
}
function artHTML(l) { return l.photo_url ? `<div class="art cover" style="background-image:url('${esc(l.photo_url)}')"></div>` : `<div class="art ${catKey(l.category)}"></div>`; }
function trust(o) {
  const r = o.owner_rating != null ? o.owner_rating : o.rating, c = o.owner_completed != null ? o.owner_completed : o.completed;
  return r != null ? `★ ${Number(r).toFixed(1)}${c ? ` · ${c} trades` : ''}` : 'New Trader · no history yet';
}
function openModal(html) { $('#modal').innerHTML = html; $('#overlay').classList.add('on'); }
function closeModal() { $('#overlay').classList.remove('on'); }
$('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeModal(); });

/* saves — per-user, local for the closed test */
const savedKey = () => 'loop_saved_' + (ME && ME.id);
function savedSet() { try { return new Set(JSON.parse(localStorage.getItem(savedKey()) || '[]')); } catch { return new Set(); } }
function isSaved(id) { return savedSet().has(id); }
function toggleSave(id) { const s = savedSet(); s.has(id) ? s.delete(id) : s.add(id); localStorage.setItem(savedKey(), JSON.stringify([...s])); return s.has(id); }

/* ============ boot / auth ============ */
async function boot() {
  if (TOKEN) { try { ME = (await api('/me')).user; enterApp(); } catch { TOKEN = null; localStorage.removeItem('loop_token'); showAuth(); } }
  else showAuth();
  setTimeout(() => $('#boot').classList.add('hide'), 500);
}
let authMode = 'signup';
function showAuth() {
  $('#app').classList.remove('show'); $('#onboard').classList.remove('show'); $('#nav').style.display = 'none';
  const a = $('#auth'); a.classList.add('show');
  a.innerHTML = `
    <div class="auth-brand">${LOGO(34)}<span class="w">Loop</span></div>
    <h1>${authMode === 'signup' ? 'Trade in circles.' : 'Welcome back.'}</h1>
    <p class="sub">${authMode === 'signup' ? "Nashville's barter network. Offer what you're good at, get what you need — no cash." : 'Log in to your account.'}</p>
    <div class="field"><label>Email</label><input class="in" id="aEmail" type="email" autocomplete="email" placeholder="you@email.com"></div>
    <div class="field"><label>Password</label><input class="in" id="aPass" type="password" autocomplete="${authMode === 'signup' ? 'new-password' : 'current-password'}" placeholder="••••••••"></div>
    <div class="err" id="aErr"></div>
    <button class="btn btn-dark btn-block" id="aGo">${authMode === 'signup' ? 'Continue' : 'Log in'}</button>
    <div class="auth-switch">${authMode === 'signup' ? 'Already a member?' : 'New here?'} <button id="aSwitch">${authMode === 'signup' ? 'Log in' : 'Create account'}</button></div>`;
  $('#aSwitch').onclick = () => { authMode = authMode === 'signup' ? 'login' : 'signup'; showAuth(); };
  $('#aGo').onclick = authGo; $('#aPass').addEventListener('keydown', e => { if (e.key === 'Enter') authGo(); });
}
async function authGo() {
  const email = $('#aEmail').value.trim(), password = $('#aPass').value;
  if (!email || !password) { $('#aErr').textContent = 'Enter your email and password.'; return; }
  if (authMode === 'login') {
    try { const r = await api('/login', { method: 'POST', body: { email, password } }); TOKEN = r.token; localStorage.setItem('loop_token', TOKEN); ME = r.user; $('#auth').classList.remove('show'); enterApp(); }
    catch (e) { $('#aErr').textContent = e.message; }
  } else { if (password.length < 4) { $('#aErr').textContent = 'Use a password of at least 4 characters.'; return; } startOnboarding({ email, password }); }
}

/* ============ onboarding ============ */
let onb = null;
function startOnboarding(creds) { onb = { step: 0, creds, name: '', hood: '', offer: { title: '', cat: '', credit: '', desc: '' }, skipOffer: false, wants: [] }; $('#auth').classList.remove('show'); $('#onboard').classList.add('show'); renderOnboard(); }
function renderOnboard() {
  const o = $('#onboard');
  const prog = onb.step === 0 ? '' : `<div class="ob-progress">${[1, 2, 3, 4].map(i => `<span class="${onb.step >= i ? 'on' : ''}"></span>`).join('')}</div>`;
  let inner = '';
  if (onb.step === 0) inner = `
    <div class="auth-brand">${LOGO(34)}<span class="w">Loop</span></div>
    <h1 class="ob-hed">Trade in circles.</h1><p class="ob-sub">Here's how it works:</p>
    <div class="ob-howto">
      <div class="row"><div class="n">1</div><div class="tx"><h4>Offer something</h4><p>List a skill, a service, or something you make.</p></div></div>
      <div class="row"><div class="n">2</div><div class="tx"><h4>Trade or pay with credits</h4><p>Earn credits from one person, spend them with anyone else.</p></div></div>
      <div class="row"><div class="n">3</div><div class="tx"><h4>Close the loop</h4><p>When wants don't line up 1-to-1, Loop connects three or more people in a circle so everyone wins.</p></div></div>
    </div>
    <button class="btn btn-dark btn-block" id="o0">Get started</button>`;
  else if (onb.step === 1) inner = `
    <h1 class="ob-hed">First, the basics</h1><p class="ob-sub">How neighbors will see you.</p>
    <div class="fl2">Your first name</div><input class="in" id="oName" placeholder="e.g. Aaron" value="${esc(onb.name)}" style="margin-bottom:18px">
    <div class="fl2">Your Nashville neighborhood</div><div class="ob-chips" id="oHoods">${HOODS.map(h => `<button class="ob-chip ${onb.hood === h ? 'on' : ''}" data-h="${h}">${h}</button>`).join('')}</div>
    <button class="btn btn-dark btn-block" id="o1">Continue</button>`;
  else if (onb.step === 2) inner = `
    <h1 class="ob-hed">What can you offer?</h1><p class="ob-sub">Your first posting. You can add more anytime.</p>
    <div class="fl2">What is it?</div><input class="in" id="oTitle" placeholder="e.g. Logo design, Guitar lessons" value="${esc(onb.offer.title)}" style="margin-bottom:18px">
    <div class="fl2">Category</div><div class="ob-chips" id="oCats">${CATS.map(c => `<button class="ob-chip ${onb.offer.cat === c.full ? 'on' : ''}" data-c="${c.full}">${c.label}</button>`).join('')}</div>
    <div class="fl2">What's it worth? (credits)</div><input class="in" id="oCredit" inputmode="numeric" placeholder="120" value="${esc(onb.offer.credit)}" style="margin-bottom:18px">
    <div class="fl2">One line (optional)</div><input class="in" id="oDesc" placeholder="What makes yours good?" value="${esc(onb.offer.desc)}" style="margin-bottom:18px">
    <button class="btn btn-dark btn-block" id="o2">Add this posting</button><button class="text-link" id="o2skip">Skip for now</button>`;
  else if (onb.step === 3) inner = `
    <h1 class="ob-hed">What are you looking for?</h1><p class="ob-sub">Tap anything you'd trade for. This powers your feed and finds your loops.</p>
    <div class="ob-chips" id="oWants">${WANT_TAGS.map(t => `<button class="ob-chip ${onb.wants.includes(t) ? 'on' : ''}" data-t="${t}">${t}</button>`).join('')}</div>
    <button class="btn btn-dark btn-block" id="o3">Continue</button><button class="text-link" id="o3skip">Skip</button>`;
  else if (onb.step === 4) inner = `
    <div class="ob-credits"><div class="fl2" style="text-align:center">Welcome gift</div><div class="big">50 credits</div><div class="cap" style="font-size:.9rem">50 Swap Credits to get you started — trade from day one.</div></div>
    <div style="height:14px"></div><button class="btn btn-dark btn-block" id="o4">Create my account</button>
    <div class="cap" style="margin-top:14px">We'll verify your identity later, before your first trade.</div>`;
  o.innerHTML = `<div class="ob-wrap">${prog}<div>${inner}</div></div>`; wireOnboard();
}
function wireOnboard() {
  const s = onb.step;
  if (s === 0) $('#o0').onclick = () => { onb.step = 1; renderOnboard(); };
  if (s === 1) {
    $('#oName').oninput = e => onb.name = e.target.value;
    $('#oHoods').querySelectorAll('.ob-chip').forEach(c => c.onclick = () => { onb.hood = c.dataset.h; renderOnboard(); });
    $('#o1').onclick = () => { if (!onb.name.trim()) return toast('Add your first name.'); if (!onb.hood) return toast('Pick your neighborhood.'); onb.step = 2; renderOnboard(); };
  }
  if (s === 2) {
    $('#oTitle').oninput = e => onb.offer.title = e.target.value; $('#oDesc').oninput = e => onb.offer.desc = e.target.value;
    $('#oCredit').oninput = e => onb.offer.credit = e.target.value.replace(/[^0-9]/g, '');
    $('#oCats').querySelectorAll('.ob-chip').forEach(c => c.onclick = () => { onb.offer.cat = c.dataset.c; renderOnboard(); });
    $('#o2').onclick = () => { if (!onb.offer.title.trim()) return toast('Name it, or skip.'); if (!onb.offer.cat) return toast('Pick a category.'); if (!onb.offer.credit) return toast('Add a credit value.'); onb.skipOffer = false; onb.step = 3; renderOnboard(); };
    $('#o2skip').onclick = () => { onb.skipOffer = true; onb.step = 3; renderOnboard(); };
  }
  if (s === 3) {
    $('#oWants').querySelectorAll('.ob-chip').forEach(c => c.onclick = () => { const t = c.dataset.t; onb.wants.includes(t) ? onb.wants = onb.wants.filter(x => x !== t) : onb.wants.push(t); c.classList.toggle('on'); });
    $('#o3').onclick = () => { onb.step = 4; renderOnboard(); }; $('#o3skip').onclick = () => { onb.step = 4; renderOnboard(); };
  }
  if (s === 4) $('#o4').onclick = finishOnboarding;
}
async function finishOnboarding() {
  try {
    const r = await api('/register', { method: 'POST', body: { email: onb.creds.email, password: onb.creds.password, name: onb.name.trim(), neighborhood: onb.hood, wants: onb.wants } });
    TOKEN = r.token; localStorage.setItem('loop_token', TOKEN); ME = r.user;
    if (!onb.skipOffer && onb.offer.title.trim()) await api('/listings', { method: 'POST', body: { title: onb.offer.title.trim(), category: onb.offer.cat, credit: parseInt(onb.offer.credit) || 100, description: onb.offer.desc.trim() } });
    $('#onboard').classList.remove('show'); enterApp(); toast(`Welcome to Loop, ${ME.name}! Here's 50 credits.`);
  } catch (e) { toast(e.message); }
}

/* ============ app shell ============ */
function enterApp() {
  $('#app').classList.add('show'); $('#nav').style.display = 'flex';
  $('#meChip').innerHTML = `${avatar(ME, 28)}<span>${esc(ME.name.split(' ')[0])}</span>`;
  switchView('home'); pollNotifs();
}
$('#nav').querySelectorAll('button').forEach(b => b.onclick = () => switchView(b.dataset.v));
function switchView(v) {
  $('#nav').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  document.querySelectorAll('.view').forEach(x => x.classList.remove('on'));
  $('#v-' + v).classList.add('on'); window.scrollTo(0, 0);
  if (v === 'home') renderHome();
  if (v === 'loops') renderLoops();
  if (v === 'trades') renderTrades();
  if (v === 'wallet') renderWallet();
  if (v === 'profile') renderProfile();
}

/* ============ HOME — scroll feed ============ */
async function renderHome() {
  const v = $('#v-home');
  const chips = [{ full: 'all', label: 'For You' }].concat(CATS).concat([{ full: '__saved__', label: 'Saved' }]);
  v.innerHTML = `<div class="feed-top" id="chips">${chips.map(c => `<button class="chip ${filterCat === c.full ? 'on' : ''}" data-c="${c.full}">${c.label}</button>`).join('')}</div>
    <div class="feed" id="feed"><div class="feed-empty"><span class="spin"></span></div></div>`;
  $('#chips').querySelectorAll('.chip').forEach(c => c.onclick = () => { filterCat = c.dataset.c; $('#chips').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); drawFeed(); });
  try { FEED = (await api('/feed')).listings; } catch { FEED = []; }
  try { CHAINS = (await api('/chains/suggest')).chains; } catch { CHAINS = []; }
  loopOwnerIds = new Set(); CHAINS.forEach(c => c.forEach(l => loopOwnerIds.add(l.giver.id)));
  drawFeed();
}
function drawFeed() {
  const f = $('#feed'); if (!f) return;
  let items = FEED.slice();
  if (filterCat === '__saved__') { const s = savedSet(); items = items.filter(l => s.has(l.id)); }
  else if (filterCat !== 'all') items = items.filter(l => l.category === filterCat);
  if (!items.length) { f.innerHTML = `<div class="feed-empty"><div class="em">${filterCat === '__saved__' ? '🔖' : '🔍'}</div>${filterCat === '__saved__' ? 'Nothing saved yet — tap Save on any offer' : 'No offers here yet — check back soon'}</div>`; return; }
  f.innerHTML = items.map(l => {
    const inLoop = loopOwnerIds.has(l.owner_id), saved = isSaved(l.id);
    return `<div class="fcard" data-id="${l.id}">
      <div class="fart">${artHTML(l)}</div><div class="shade"></div>
      ${inLoop ? `<div class="floopband">${LOGO(13)} Part of a Loop</div>` : ''}
      <div class="frail">
        <button data-act="save"><span class="rc ${saved ? 'on' : ''}">${saved ? ICON.bookmarkFill : ICON.bookmark}</span>${saved ? 'Saved' : 'Save'}</button>
        <button data-act="msg"><span class="rc">${ICON.chat}</span>Message</button>
        <button data-act="deal"><span class="rc deal">${ICON.deal}</span>Deal</button>
      </div>
      <div class="info">
        <div class="fowner">${avatar({ initials: l.owner_initials, color: l.owner_color }, 34)}<div><div class="nm">${esc(l.owner_name)}</div><div class="rt">${trust(l)}</div></div></div>
        <div class="ftitle">${esc(l.title)}</div>
        ${l.description ? `<div class="fdesc">"${esc(l.description)}"</div>` : ''}
        <div class="fmeta"><span class="fcredit">${l.credit} credits</span><span class="ftag">${esc(l.category.split(' & ')[0])}</span><span class="ftag">${esc(l.mode)}</span></div>
      </div>
    </div>`;
  }).join('');
  f.querySelectorAll('.fcard').forEach(card => {
    const l = FEED.find(x => x.id === card.dataset.id);
    card.querySelector('.info').onclick = () => openDetail(l);
    card.querySelector('.fart').onclick = () => openDetail(l);
    card.querySelectorAll('.frail button').forEach(btn => btn.onclick = e => {
      e.stopPropagation(); const act = btn.dataset.act;
      if (act === 'save') { const now = toggleSave(l.id); toast(now ? 'Saved for later' : 'Removed'); drawFeed(); }
      if (act === 'msg') messageOwner(l);
      if (act === 'deal') openDetail(l);
    });
  });
}

/* ============ LOOPS tab ============ */
async function renderLoops() {
  const v = $('#v-loops'); v.innerHTML = `<div class="empty" style="padding:50px"><span class="spin"></span></div>`;
  let chains = []; try { chains = (await api('/chains/suggest')).chains; } catch {}
  let html = `<div class="loop-hero"><div class="lg">${LOGO(48)}</div><h2>Loops: everybody wins in a circle</h2>
    <p>You want what someone has, but they don't want yours. Loop finds a third — or fourth — person to close the circle, so everyone gets what they need.</p>
    <button class="btn" id="loopHow">See how a Loop works</button></div>`;
  if (chains.length) {
    html += `<div class="sec-label">Loops you can join</div>` + chains.map((c, i) => `
      <div class="loop-card" data-i="${i}">
        <div class="lk">${LOGO(13)} ${c.length}-way loop</div>
        <div class="loop-nodes">${c.map((l, k) => `<span class="loop-node">${avatar(l.giver, 26)}<span class="nm">${esc(l.giver.name)}</span></span>${k < c.length - 1 ? '<span class="loop-arrow">→</span>' : '<span class="loop-arrow">↻</span>'}`).join('')}</div>
        <div style="font-size:.84rem;color:var(--ink-soft);line-height:1.45;margin-bottom:14px">${c.map(l => esc(l.giver.name) + ' gives ' + esc(l.gives)).join(' → ')}.</div>
        <button class="btn btn-dark btn-block loop-open">See this loop</button>
      </div>`).join('');
  } else {
    html += `<div class="empty"><div style="display:flex;justify-content:center;color:var(--ink-faint);margin-bottom:6px">${LOGO(40)}</div>
      <div style="font-weight:800;margin-top:6px">No loops for you yet</div>
      <div style="font-size:.84rem;margin-top:8px;line-height:1.55;max-width:310px;margin-left:auto;margin-right:auto">Loops appear when your <b>wants</b> and <b>offers</b> connect with other members. Add what you're looking for and post what you offer — as more people join, loops start forming.</div>
      <button class="btn btn-outline" id="loopEdit" style="margin-top:18px">Update what I'm looking for</button></div>`;
  }
  v.innerHTML = html;
  if ($('#loopHow')) $('#loopHow').onclick = openLoopExplainer;
  v.querySelectorAll('.loop-card').forEach(card => card.querySelector('.loop-open').onclick = () => openChain(chains[card.dataset.i]));
  if ($('#loopEdit')) $('#loopEdit').onclick = openWants;
}
function openLoopExplainer() {
  openModal(`<button class="x" id="x">✕</button><div class="fl2" style="color:var(--ink-faint)">How a Loop works</div><h3>Everybody gets what they want — in a circle</h3>
    <div class="ob-howto" style="margin:16px 0">
      <div class="row"><div class="n">1</div><div class="tx"><h4>You want something</h4><p>Say you want guitar lessons — but the teacher doesn't need what you offer.</p></div></div>
      <div class="row"><div class="n">2</div><div class="tx"><h4>Loop finds the missing link</h4><p>The teacher wants a logo. Someone wants what you make. That closes the circle.</p></div></div>
      <div class="row"><div class="n">3</div><div class="tx"><h4>Everyone trades at once</h4><p>Each person gives one thing and gets one thing. Nobody goes first — all confirm, then it happens together.</p></div></div>
    </div>
    <div class="safety">If even one person backs out, the whole loop cancels and no one is out anything. A loop can be 3, 4, or more people — the more members, the more loops become possible.</div>
    <button class="btn btn-dark btn-block" id="ok">Got it</button>`);
  $('#x').onclick = closeModal; $('#ok').onclick = closeModal;
}
async function openWants() {
  const cur = new Set(ME.wants || []), sel = new Set(cur);
  openModal(`<button class="x" id="x">✕</button><h3>What are you looking for?</h3><p style="color:var(--ink-soft);font-size:.86rem;margin:6px 0 14px">Tap anything you'd trade for. This powers your feed and finds your loops.</p>
    <div class="ob-chips" id="wc">${WANT_TAGS.map(t => `<button class="ob-chip ${cur.has(t) ? 'on' : ''}" data-t="${t}">${t}</button>`).join('')}</div>
    <button class="btn btn-dark btn-block" id="save">Save</button>`);
  $('#x').onclick = closeModal;
  document.querySelectorAll('#wc .ob-chip').forEach(c => c.onclick = () => { const t = c.dataset.t; sel.has(t) ? sel.delete(t) : sel.add(t); c.classList.toggle('on'); });
  $('#save').onclick = async () => { ME = (await api('/wants', { method: 'POST', body: { wants: [...sel] } })).user; closeModal(); toast('Updated — finding your loops.'); renderLoops(); };
}
function openChain(c) {
  if (!c) return;
  openModal(`<button class="x" id="x">✕</button><div class="fl2" style="color:var(--ink-faint)">Your Loop</div><h3>A ${c.length}-way trade only Loop can make</h3>
    <div class="loop-nodes" style="margin:14px 0">${c.map((l, k) => `<span class="loop-node">${avatar(l.giver, 26)}<span class="nm">${esc(l.giver.name)}</span></span>${k < c.length - 1 ? '<span class="loop-arrow">→</span>' : '<span class="loop-arrow">↻</span>'}`).join('')}</div>
    <p style="color:var(--ink-soft);font-size:.88rem;line-height:1.5;margin:0 0 12px">${c.map(l => `<b>${esc(l.giver.name)}</b> gives ${esc(l.gives)}`).join(' → ')} → back around.</p>
    <div class="safety">Each person gives one thing and gets one thing. <b>Nobody goes first</b> — everyone confirms, then the whole loop happens at once. If one backs out, it cancels and no one is out anything.</div>
    <button class="btn btn-dark btn-block" id="coord">Notify the group to start</button><button class="text-link" id="later">Maybe later</button>`);
  $('#x').onclick = closeModal; $('#later').onclick = closeModal;
  $('#coord').onclick = () => { closeModal(); toast('Everyone in the loop has been notified — check back soon.'); };
}

/* ============ listing detail ============ */
function openDetail(l) {
  if (!l) return;
  const canAfford = ME.balance >= l.credit, saved = isSaved(l.id);
  openModal(`<button class="x" id="x">✕</button>
    <div style="border-radius:14px;overflow:hidden;border:1.6px solid var(--line)">${artHTML(l)}</div>
    <h3 class="detail-title">${esc(l.title)}</h3>
    <div class="who">${avatar({ initials: l.owner_initials, color: l.owner_color }, 40)}<div><div class="nm">${esc(l.owner_name)}</div><div class="rl">${trust(l)}</div></div></div>
    ${l.description ? `<div class="pitch">"${esc(l.description)}"</div>` : ''}
    <div class="facts">
      <div class="fact"><div class="fl">Format</div><div class="fv">${esc(l.mode)}</div></div>
      <div class="fact"><div class="fl">Category</div><div class="fv">${esc(l.category.split(' & ')[0])}</div></div>
      <div class="fact"><div class="fl">Neighborhood</div><div class="fv">${esc(l.owner_hood || 'Nashville')}</div></div>
      <div class="fact"><div class="fl">Trader</div><div class="fv">${l.owner_completed || 0} trades done</div></div>
    </div>
    <div class="price"><div><div class="pv">${l.credit} credits</div><div style="font-size:.72rem;color:var(--ink-faint)">≈ $${l.credit} in trade value</div></div><div class="pr">Held in escrow — released only when you confirm</div></div>
    <button class="btn btn-dark btn-block" id="req" style="margin-top:14px">Request — ${l.credit} credits</button>
    <div class="cap">${canAfford ? 'Paid from your Swap Credits — not cash' : `You have ${ME.balance} credits — propose a trade instead`}</div>
    <button class="btn btn-outline btn-block" id="prop" style="margin-top:10px">Propose a trade instead</button>
    <button class="text-link" id="msg">💬 Message ${esc(l.owner_name.split(' ')[0])} first</button>
    <button class="text-link" id="sv" style="margin-top:-6px">${saved ? '✓ Saved' : '🔖 Save for later'}</button>
    <button class="text-link" id="prot" style="margin-top:-6px">🔒 How you're protected</button>`);
  $('#x').onclick = closeModal;
  let confirming = false, timer;
  $('#req').onclick = () => {
    if (confirming) { clearTimeout(timer); confirming = false; requestPay(l); return; }
    confirming = true; $('#req').classList.add('confirming'); $('#req').textContent = 'Tap again to confirm';
    timer = setTimeout(() => { confirming = false; $('#req').classList.remove('confirming'); $('#req').textContent = `Request — ${l.credit} credits`; }, 3000);
  };
  $('#prop').onclick = () => openPropose(l);
  $('#msg').onclick = () => messageOwner(l);
  $('#sv').onclick = e => { const now = toggleSave(l.id); e.target.textContent = now ? '✓ Saved' : '🔖 Save for later'; };
  $('#prot').onclick = openProtect;
}
async function guarded(fn) { try { await fn(); } catch (e) { if (e.message === 'verify_required') openVerify(fn); else toast(e.message); } }
async function requestPay(l) {
  await guarded(async () => {
    const r = await api('/trades', { method: 'POST', body: { listing_id: l.id, kind: 'direct' } });
    ME = (await api('/me')).user; closeModal(); toast('Requested — credits held in escrow.'); switchView('trades'); setTimeout(() => openThread(r.thread_id), 150);
  });
}
async function messageOwner(l) {
  try { const r = await api('/threads', { method: 'POST', body: { listing_id: l.id, kind: 'inquiry' } }); closeModal(); switchView('trades'); setTimeout(() => openThread(r.thread.id), 150); }
  catch (e) { toast(e.message); }
}
async function openPropose(l) {
  const mine = (await api('/listings/mine')).listings;
  if (!mine.length) { toast('Post something first to propose a trade.'); return; }
  openModal(`<button class="x" id="x">✕</button><h3>Propose a trade</h3><p style="color:var(--ink-soft);font-size:.86rem;margin:6px 0 14px">Offer one of your postings for "${esc(l.title)}".</p>
    <div id="opts">${mine.map(o => `<div class="offer-opt" data-id="${o.id}"><span>${esc(o.title)}</span><b>${o.credit} credits</b></div>`).join('')}</div>
    <button class="btn btn-dark btn-block" id="send" disabled style="margin-top:8px">Select a posting</button>`);
  $('#x').onclick = closeModal; let pick = null;
  document.querySelectorAll('#opts .offer-opt').forEach(o => o.onclick = () => { pick = o.dataset.id; document.querySelectorAll('#opts .offer-opt').forEach(x => x.classList.toggle('sel', x === o)); $('#send').disabled = false; $('#send').textContent = 'Propose this trade'; });
  $('#send').onclick = () => { if (!pick) return; guarded(async () => { const r = await api('/trades', { method: 'POST', body: { listing_id: l.id, kind: 'proposal', my_listing_id: pick } }); closeModal(); toast('Trade proposed.'); switchView('trades'); setTimeout(() => openThread(r.thread_id), 150); }); };
}
function openVerify(retry) {
  openModal(`<button class="x" id="x">✕</button><div class="fl2" style="color:var(--ink-faint)">🪪 One-time check</div><h3>Verify to make your first trade</h3>
    <p style="color:var(--ink-soft);font-size:.86rem;line-height:1.5;margin:12px 0 16px">Loop verifies every member before their first trade, so you always know there's a real person on the other side. You only do this once.</p>
    <div class="safety">In the real app this is a quick photo-ID + selfie check. For now, tap below to simulate it.</div>
    <button class="btn btn-dark btn-block" id="vok">Verify me</button><button class="text-link" id="vno">Not now</button>`);
  $('#x').onclick = closeModal; $('#vno').onclick = closeModal;
  $('#vok').onclick = async () => { await api('/verify', { method: 'POST' }); ME.verified = true; closeModal(); toast('Verified — you\'re good to trade!'); setTimeout(() => retry && retry(), 120); };
}
function openProtect() {
  openModal(`<button class="x" id="x">✕</button><div class="fl2" style="color:var(--ink-faint)">🔒 How you're protected</div><h3>You never trade on trust alone</h3>
    <div class="protect-list">
      <div class="pi"><div class="ic">🔒</div><div><div class="ph">Credits are locked first</div><div class="pb">The instant a trade starts, credits are held by Loop — the other person can't walk off with them.</div></div></div>
      <div class="pi"><div class="ic">✅</div><div><div class="ph">Both people confirm</div><div class="pb">Held credits release only when the work is done.</div></div></div>
      <div class="pi"><div class="ic">↩️</div><div><div class="ph">Didn't get what you were promised?</div><div class="pb">Cancel before you confirm and your held credits come straight back — or open a dispute.</div></div></div>
      <div class="pi"><div class="ic">⭐</div><div><div class="ph">Reputation keeps people honest</div><div class="pb">Every trade ends in a rating. People who don't deliver lose access fast.</div></div></div>
    </div><button class="btn btn-dark btn-block" id="ok" style="margin-top:8px">Got it</button>`);
  $('#x').onclick = closeModal; $('#ok').onclick = closeModal;
}

/* ============ TRADES ============ */
const STAGE_META = {
  proposed: { label: 'Proposed', hint: 'Waiting for them to accept' }, accepted: { label: 'Accepted', hint: 'Credits held — mark work started' },
  in_progress: { label: 'In Progress', hint: 'Work underway' }, delivered: { label: 'Delivered', hint: 'Confirm to release credits' },
  completed: { label: 'Completed', hint: 'Credits settled' }, cancelled: { label: 'Cancelled', hint: 'Held credits refunded' },
};
async function renderTrades() {
  const v = $('#v-trades'); v.innerHTML = `<div class="empty"><span class="spin"></span></div>`;
  const { threads } = await api('/threads');
  const active = threads.filter(t => !t.trade || (t.trade.status !== 'completed' && t.trade.status !== 'cancelled'));
  const done = threads.filter(t => t.trade && (t.trade.status === 'completed' || t.trade.status === 'cancelled'));
  const rowHTML = t => {
    const meta = t.trade ? STAGE_META[t.trade.status] : { label: 'Chat', hint: t.last ? t.last.body.slice(0, 40) : 'Say hello' };
    const cls = t.trade ? (t.trade.status === 'completed' ? 'completed' : t.trade.status === 'cancelled' ? 'cancelled' : '') : '';
    const thumb = t.listing ? `<div class="thumb">${artHTML(t.listing)}</div>` : `<div class="thumb" style="background:var(--ink);display:flex;align-items:center;justify-content:center;color:#fff">↻</div>`;
    return `<div class="row" data-id="${t.id}">${thumb}<div class="mi"><div class="nm">${esc(t.other.name)}</div><div class="snip">${esc(t.listing ? t.listing.title : 'Conversation')}</div><div class="nx">${esc(meta.hint)}</div></div><span class="pill ${cls}">${meta.label}</span></div>`;
  };
  v.innerHTML = `<div class="sec-label">Active</div>` +
    (active.length ? active.map(rowHTML).join('') : `<div class="empty"><div class="em">🤝</div>No active trades yet<div style="font-size:.82rem;margin-top:6px">Find something in the Feed, then <b>Deal</b> to Request or Propose.</div></div>`) +
    (done.length ? `<div class="sec-label">History</div>` + done.map(rowHTML).join('') : '');
  v.querySelectorAll('.row').forEach(r => r.onclick = () => openThread(r.dataset.id));
}
async function openThread(id) {
  const d = await api('/threads/' + id);
  const other = d.other, t = d.trade, listing = d.listing;
  const bubbles = d.messages.map(m => `<div class="bubble ${m.sender_id === ME.id ? 'me' : 'them'}">${esc(m.body)}</div>`).join('') || `<div class="bubble sys">Say hello 👋</div>`;
  let tradeUI = '';
  if (t && t.status !== 'cancelled') {
    const STAGES = ['proposed', 'accepted', 'in_progress', 'delivered', 'completed'];
    const i = STAGES.indexOf(t.status), next = STAGES[i + 1];
    const nextLabel = { accepted: 'Accept Trade (Hold Credits)', in_progress: 'Mark Work Started', delivered: 'Mark Delivered', completed: 'Confirm & Release Credits' };
    const iAmPayer = t.payer_id === ME.id; let line1, line2;
    if (iAmPayer) { line1 = t.my_value ? `You give: ${esc(t.my_give)} — ${t.my_value} credits` : `You pay: ${t.their_value} credits`; line2 = `You get: ${esc(t.their_give)} — ${t.their_value} credits`; }
    else { line1 = `You provide: ${esc(t.their_give)} — ${t.their_value} credits`; line2 = t.my_value ? `You get: ${esc(t.my_give)} — ${t.my_value} credits` : `You get paid: ${t.their_value} credits`; }
    tradeUI = `<div class="stepper">${STAGES.map((s, k) => `<div class="step ${k < i ? 'done' : k === i ? 'now' : ''}"><div class="d"></div><small>${STAGE_META[s].label}</small></div>`).join('')}</div>
      <div class="fl2">${line1}</div><div class="fl2">${line2}</div>
      ${next ? `<button class="btn btn-dark btn-block" id="adv" style="margin-top:12px">${nextLabel[next]}</button><button class="btn btn-outline btn-block" id="cancel" style="margin-top:10px">Cancel Trade${i >= 1 ? ' (Refund)' : ''}</button>` : `<div style="text-align:center;font-weight:800;margin-top:14px">✓ Trade complete — credits settled.</div>`}`;
  } else if (t && t.status === 'cancelled') tradeUI = `<div style="text-align:center;color:var(--ink-faint);font-weight:800;margin-top:12px">✕ Trade cancelled — held credits refunded.</div>`;
  else if (listing) tradeUI = `<div class="fl2" style="margin-top:6px">About: ${esc(listing.title)} — ${listing.credit} credits</div>
    <button class="btn btn-dark btn-block" id="req2" style="margin-top:10px">Request — ${listing.credit} credits</button><button class="btn btn-outline btn-block" id="prop2" style="margin-top:10px">Propose a trade</button>`;
  const safety = listing && listing.mode === 'In-Person' ? `<div class="safety">🛡️ Meeting in person — meet somewhere public and tell a friend your plan.</div>` : '';
  openModal(`<button class="x" id="x">✕</button>
    <div class="who">${avatar(other, 44)}<div><h3 style="margin:0">${esc(other.name)}</h3><div class="rl">${esc(other.neighborhood ? other.neighborhood + ', Nashville' : 'Nashville')}</div></div></div>
    <div class="thread" id="thread">${bubbles}</div>
    <div class="composer"><input id="mIn" placeholder="Message ${esc(other.name.split(' ')[0])}…"><button id="mSend">Send</button></div>
    ${safety}${tradeUI}<button class="text-link" id="prot" style="margin-top:10px">🔒 How you're protected</button>`);
  $('#x').onclick = closeModal; $('#prot').onclick = openProtect;
  const send = async () => { const b = $('#mIn').value.trim(); if (!b) return; $('#mIn').value = ''; await api('/threads/' + id + '/messages', { method: 'POST', body: { body: b } }); const dd = await api('/threads/' + id); $('#thread').innerHTML = dd.messages.map(m => `<div class="bubble ${m.sender_id === ME.id ? 'me' : 'them'}">${esc(m.body)}</div>`).join(''); $('#thread').scrollTop = 1e6; };
  $('#mSend').onclick = send; $('#mIn').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  if ($('#adv')) $('#adv').onclick = async () => { await api('/trades/' + t.id + '/advance', { method: 'POST' }); ME = (await api('/me')).user; toast('Updated.'); openThread(id); };
  if ($('#cancel')) $('#cancel').onclick = async () => { await api('/trades/' + t.id + '/cancel', { method: 'POST' }); ME = (await api('/me')).user; toast('Trade cancelled.'); openThread(id); };
  if ($('#req2')) $('#req2').onclick = () => requestPay(listing);
  if ($('#prop2')) $('#prop2').onclick = () => openPropose(listing);
}

/* ============ WALLET ============ */
async function renderWallet() {
  const v = $('#v-wallet'); v.innerHTML = `<div class="empty"><span class="spin"></span></div>`;
  const d = await api('/ledger');
  v.innerHTML = `<div class="hero"><div class="l">Available Balance</div><div class="amt">${d.balance} <span style="font-size:1.3rem">SC</span></div><div class="s">≈ $${d.balance} USD in trade value</div></div>
    <div class="stat3"><div class="t"><div class="n">${d.held}</div><div class="lb">Held in Escrow</div></div><div class="t"><div class="n">${d.earned}</div><div class="lb">Earned</div></div><div class="t"><div class="n">${d.spent}</div><div class="lb">Spent</div></div></div>
    <div class="histb"><h5>Transaction History</h5>${d.history.map(h => {
      const cls = h.held != null ? 'held' : h.amount > 0 ? 'pos' : h.amount < 0 ? 'neg' : '';
      const txt = h.held != null ? `${h.held} credits held` : h.amount === 0 ? '—' : (h.amount > 0 ? '+' : '') + h.amount + ' credits';
      const dt = new Date(h.created_at); const day = isNaN(dt) ? '' : (dt.getMonth() + 1) + '/' + dt.getDate();
      return `<div class="hrow"><div class="hd">${day}</div><div class="ht">${esc(h.label)}</div><div class="ha ${cls}">${txt}</div></div>`;
    }).join('')}</div>`;
}

/* ============ PROFILE ============ */
async function renderProfile() {
  const v = $('#v-profile'); const mine = (await api('/listings/mine')).listings;
  v.innerHTML = `<div class="pcard"><div class="art ${catKey(mine[0] ? mine[0].category : 'Design & Creative')}"></div><div class="b">
      <h2>${esc(ME.name)}</h2><div class="role">${esc(ME.neighborhood ? ME.neighborhood + ', Nashville' : 'Nashville Member')}</div>
      <div class="badges"><span class="bdg tier">${ME.verified ? '✓ Verified' : 'Unverified'}</span><span class="bdg">${ME.rating != null ? '★ ' + ME.rating.toFixed(1) : '🌱 New Trader'}</span><span class="bdg">${ME.completed} trades</span></div>
    </div></div>
    <div class="sec-label" style="display:flex;justify-content:space-between;align-items:center">My Postings <button id="addPost" style="background:var(--ink);color:#fff;border:none;font-weight:800;font-size:.72rem;padding:7px 14px;border-radius:999px;letter-spacing:0;text-transform:none">+ New posting</button></div>
    <div class="myposts">${mine.length ? mine.map(l => `<div class="tile">${artHTML(l)}<div class="foot"><div class="t">${esc(l.title)}</div><div class="c">${l.credit} credits</div></div></div>`).join('') : `<p style="color:var(--ink-faint);font-size:.85rem">No postings yet — add one.</p>`}</div>
    <button class="text-link" id="wants" style="margin-top:18px">Edit what I'm looking for</button>
    <button class="text-link" id="logout">Log out</button>`;
  $('#addPost').onclick = openCreate; $('#wants').onclick = openWants;
  $('#logout').onclick = () => { TOKEN = null; ME = null; localStorage.removeItem('loop_token'); closeModal(); showAuth(); };
}
function openCreate() {
  openModal(`<button class="x" id="x">✕</button><div class="fl2" style="color:var(--ink-faint)">New posting</div><h3 style="margin-bottom:14px">What are you offering?</h3>
    <div class="fl2">What is it?</div><input class="in" id="cT" placeholder="e.g. Logo design" style="margin-bottom:14px">
    <div class="fl2">Category</div><div class="ob-chips" id="cC">${CATS.map(c => `<button class="ob-chip" data-c="${c.full}">${c.label}</button>`).join('')}</div>
    <div class="fl2">Photo (optional)</div><input type="file" accept="image/*" id="cP" style="margin-bottom:14px"><div id="cPrev"></div>
    <div class="fl2">Credit value</div><input class="in" id="cCr" inputmode="numeric" placeholder="120" style="margin-bottom:14px">
    <div class="fl2">One line (optional)</div><input class="in" id="cD" placeholder="What makes yours good?" style="margin-bottom:16px">
    <button class="btn btn-dark btn-block" id="cSave">Post it</button>`);
  $('#x').onclick = closeModal; let cat = '', photo = null;
  document.querySelectorAll('#cC .ob-chip').forEach(c => c.onclick = () => { cat = c.dataset.c; document.querySelectorAll('#cC .ob-chip').forEach(x => x.classList.toggle('on', x === c)); });
  $('#cP').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { photo = r.result; $('#cPrev').innerHTML = `<div class="art cover" style="background-image:url('${photo}');aspect-ratio:16/9;border-radius:12px;margin-bottom:14px"></div>`; }; r.readAsDataURL(f); };
  $('#cSave').onclick = async () => {
    const title = $('#cT').value.trim(), credit = parseInt(($('#cCr').value || '').replace(/[^0-9]/g, '')), desc = $('#cD').value.trim();
    if (!title) return toast('Name what you\'re offering.'); if (!cat) return toast('Pick a category.'); if (!credit) return toast('Add a credit value.');
    try { await api('/listings', { method: 'POST', body: { title, category: cat, credit, description: desc, photo_url: photo } }); closeModal(); toast('Posting is live!'); renderProfile(); } catch (e) { toast(e.message); }
  };
}

/* ============ notifications ============ */
async function pollNotifs() { try { const { notifications } = await api('/notifications'); $('#bellDot').classList.toggle('on', notifications.some(n => !n.read)); window._notifs = notifications; } catch {} }
$('#bell').onclick = async () => {
  const notifications = window._notifs || (await api('/notifications')).notifications;
  openModal(`<button class="x" id="x">✕</button><h3 style="margin-bottom:12px">Notifications</h3>${notifications.length ? notifications.map(n => `<div style="padding:12px 0;border-bottom:1px dashed var(--line-soft)"><div style="font-weight:800;font-size:.9rem">${esc(n.title)}</div><div style="font-size:.82rem;color:var(--ink-soft)">${esc(n.body || '')}</div></div>`).join('') : `<div class="empty"><div class="em">🔔</div>Nothing yet</div>`}`);
  $('#x').onclick = closeModal; await api('/notifications/read', { method: 'POST' }); $('#bellDot').classList.remove('on');
};

boot();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
