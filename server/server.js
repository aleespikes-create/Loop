'use strict';
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const path = require('node:path');
const db = require('./db');
const { findCycles } = require('./chain');

const app = express();
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const now = () => new Date().toISOString();
const uid = (p = 'id') => p + '_' + crypto.randomBytes(8).toString('hex');
const AV_COLORS = ['#3E7BFF', '#22A06B', '#C2185B', '#E08A2B', '#7A5AA0', '#2AA198', '#C0453B', '#4E6B94'];
const STAGES = ['proposed', 'accepted', 'in_progress', 'delivered', 'completed'];

const getUser = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
function publicUser(u) {
  if (!u) return null;
  const { pass_hash, ...rest } = u;
  rest.verified = !!rest.verified;
  rest.wants = db.prepare('SELECT tag FROM wants WHERE user_id=?').all(u.id).map(r => r.tag);
  return rest;
}
const sign = u => jwt.sign({ uid: u.id }, JWT_SECRET, { expiresIn: '30d' });
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const { uid } = jwt.verify(token, JWT_SECRET);
    const u = getUser(uid);
    if (!u) return res.status(401).json({ error: 'Account not found' });
    req.user = u; next();
  } catch { return res.status(401).json({ error: 'Session expired' }); }
}

// Mutate a user's credit fields and (optionally) write a ledger row recording balance_after.
function credit(userId, { dBal = 0, dHeld = 0, dEarned = 0, dSpent = 0, dCompleted = 0, label, amount, held = null }) {
  const u = getUser(userId);
  const nb = u.balance + dBal;
  db.prepare('UPDATE users SET balance=?,held=?,earned=?,spent=?,completed=? WHERE id=?')
    .run(nb, u.held + dHeld, u.earned + dEarned, u.spent + dSpent, u.completed + dCompleted, userId);
  if (label !== undefined) {
    db.prepare('INSERT INTO ledger (user_id,label,amount,held,balance_after,created_at) VALUES (?,?,?,?,?,?)')
      .run(userId, label, amount != null ? amount : dBal, held, nb, now());
  }
  return nb;
}
function notify(userId, kind, title, body, link) {
  db.prepare('INSERT INTO notifications (id,user_id,kind,title,body,link,read,created_at) VALUES (?,?,?,?,?,?,0,?)')
    .run(uid('n'), userId, kind, title, body || null, link || null, now());
}

// ---- Escrow effects ----
function applyAccept(t) {
  credit(t.payer_id, { dBal: -t.their_value, dHeld: t.their_value, label: `Escrow hold: ${t.their_give}`, amount: 0, held: t.their_value });
  if (t.my_value > 0) credit(t.payee_id, { dBal: -t.my_value, dHeld: t.my_value, label: `Escrow hold: ${t.my_give}`, amount: 0, held: t.my_value });
}
function applyComplete(t) {
  const payee = getUser(t.payee_id), payer = getUser(t.payer_id);
  // payer: releases held, earns my_value for what they provided, marks their_value spent
  credit(t.payer_id, { dBal: t.my_value, dHeld: -t.their_value, dEarned: t.my_value, dSpent: t.their_value, dCompleted: 1,
    label: `Spent: ${t.their_give} (from ${payee.name})`, amount: -t.their_value });
  if (t.my_value > 0) credit(t.payer_id, { label: `Earned: ${t.my_give} (for ${payee.name})`, amount: t.my_value, dBal: 0 });
  // payee: releases their held (if any), earns their_value, marks my_value spent
  credit(t.payee_id, { dBal: t.their_value, dHeld: -t.my_value, dEarned: t.their_value, dSpent: t.my_value, dCompleted: 1,
    label: `Earned: ${t.their_give} (for ${payer.name})`, amount: t.their_value });
  if (t.my_value > 0) credit(t.payee_id, { label: `Spent: ${t.my_give} (from ${payer.name})`, amount: -t.my_value, dBal: 0 });
}
function applyRefund(t) {
  credit(t.payer_id, { dBal: t.their_value, dHeld: -t.their_value, label: `Cancelled — refunded: ${t.their_give}`, amount: t.their_value });
  if (t.my_value > 0) credit(t.payee_id, { dBal: t.my_value, dHeld: -t.my_value, label: `Cancelled — refunded: ${t.my_give}`, amount: t.my_value });
}

// ---- health ----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, users: db.prepare('SELECT COUNT(*) c FROM users').get().c, time: now() });
});

// ---- auth ----
app.post('/api/register', (req, res) => {
  const { email, password, name, neighborhood, wants } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name are required' });
  if (getUser2ByEmail(email)) return res.status(409).json({ error: 'That email is already registered' });
  const id = uid('u');
  const initials = (name.trim().slice(0, 2) || 'ME').toUpperCase();
  const color = AV_COLORS[name.length % AV_COLORS.length];
  db.prepare(`INSERT INTO users (id,email,pass_hash,name,neighborhood,initials,color,bio,verified,rating,completed,balance,held,earned,spent,created_at)
              VALUES (?,?,?,?,?,?,?,?,0,NULL,0,50,0,0,0,?)`)
    .run(id, String(email).toLowerCase(), bcrypt.hashSync(String(password), 10), name.trim(), neighborhood || null, initials, color, null, now());
  db.prepare('INSERT INTO ledger (user_id,label,amount,held,balance_after,created_at) VALUES (?,?,?,?,?,?)').run(id, 'Welcome grant', 50, null, 50, now());
  if (Array.isArray(wants)) { const ins = db.prepare('INSERT INTO wants (user_id,tag) VALUES (?,?)'); wants.slice(0, 20).forEach(t => t && ins.run(id, String(t))); }
  const u = getUser(id);
  detectAndNotifyChains(id);
  res.json({ token: sign(u), user: publicUser(u) });
});
const getUser2ByEmail = e => db.prepare('SELECT id FROM users WHERE email=?').get(String(e).toLowerCase());

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(String(password || ''), u.pass_hash)) return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: sign(u), user: publicUser(u) });
});
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
app.post('/api/verify', auth, (req, res) => { db.prepare('UPDATE users SET verified=1 WHERE id=?').run(req.user.id); res.json({ user: publicUser(getUser(req.user.id)) }); });
app.post('/api/wants', auth, (req, res) => {
  const { wants } = req.body || {};
  db.prepare('DELETE FROM wants WHERE user_id=?').run(req.user.id);
  if (Array.isArray(wants)) { const ins = db.prepare('INSERT INTO wants (user_id,tag) VALUES (?,?)'); wants.slice(0, 20).forEach(t => t && ins.run(req.user.id, String(t))); }
  detectAndNotifyChains(req.user.id);
  res.json({ user: publicUser(getUser(req.user.id)) });
});

// ---- listings ----
app.post('/api/listings', auth, (req, res) => {
  const { title, category, credit: cr, description, photo_url } = req.body || {};
  if (!title || !category || !cr) return res.status(400).json({ error: 'Title, category and credit value are required' });
  const id = uid('l');
  const mode = category === 'Nashville-Local In-Person' ? 'In-Person' : 'Remote';
  db.prepare(`INSERT INTO listings (id,owner_id,title,category,mode,credit,description,photo_url,active,likes,created_at)
              VALUES (?,?,?,?,?,?,?,?,1,0,?)`).run(id, req.user.id, String(title).trim(), category, mode, parseInt(cr) || 100,
    description ? String(description).trim() : null, photo_url || null, now());
  detectAndNotifyChains(req.user.id);
  res.json({ listing: db.prepare('SELECT * FROM listings WHERE id=?').get(id) });
});
app.get('/api/listings/mine', auth, (req, res) =>
  res.json({ listings: db.prepare('SELECT * FROM listings WHERE owner_id=? ORDER BY created_at DESC').all(req.user.id) }));

// Ranked feed: personalized by the viewer's wants, neighborhood, owner rating, recency.
app.get('/api/feed', auth, (req, res) => {
  const me = req.user;
  const myWants = db.prepare('SELECT tag FROM wants WHERE user_id=?').all(me.id).map(r => r.tag.toLowerCase());
  const rows = db.prepare(`
    SELECT l.*, u.name owner_name, u.initials owner_initials, u.color owner_color,
           u.rating owner_rating, u.completed owner_completed, u.neighborhood owner_hood, u.verified owner_verified
    FROM listings l JOIN users u ON u.id=l.owner_id
    WHERE l.active=1 AND l.owner_id != ?`).all(me.id);
  const scored = rows.map(l => {
    let s = 0;
    const hay = (l.title + ' ' + l.category).toLowerCase();
    if (myWants.some(w => hay.includes(w) || w.includes(l.category.toLowerCase().split(' ')[0]))) s += 50;
    if (l.owner_hood && me.neighborhood && l.owner_hood === me.neighborhood) s += 15;
    if (l.owner_rating != null) s += l.owner_rating * 2;
    if (l.owner_verified) s += 3;
    s += Math.max(0, 10 - (Date.now() - Date.parse(l.created_at)) / 86400000); // recency, ~10 days
    return { ...l, _score: s };
  }).sort((a, b) => b._score - a._score);
  res.json({ listings: scored });
});

// ---- trades ----
app.post('/api/trades', auth, (req, res) => {
  if (!req.user.verified) return res.status(403).json({ error: 'verify_required' });
  const { listing_id, kind, my_listing_id } = req.body || {};
  const listing = db.prepare('SELECT * FROM listings WHERE id=?').get(listing_id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.owner_id === req.user.id) return res.status(400).json({ error: "That's your own listing" });
  const payee = getUser(listing.owner_id);
  const tid = uid('t'), thId = uid('th');

  if (kind === 'direct') {
    if (req.user.balance < listing.credit) return res.status(400).json({ error: `Not enough credits — costs ${listing.credit}, you have ${req.user.balance}` });
    db.prepare('INSERT INTO threads (id,a_user,b_user,listing_id,kind,created_at) VALUES (?,?,?,?,?,?)').run(thId, req.user.id, payee.id, listing.id, 'direct', now());
    const t = { id: tid, thread_id: thId, payer_id: req.user.id, payee_id: payee.id, my_give: null, their_give: listing.title, my_value: 0, their_value: listing.credit, status: 'accepted', direct: 1, chain_id: null };
    db.prepare(`INSERT INTO trades (id,thread_id,payer_id,payee_id,my_give,their_give,my_value,their_value,status,direct,chain_id,created_at,updated_at)
                VALUES (@id,@thread_id,@payer_id,@payee_id,@my_give,@their_give,@my_value,@their_value,@status,@direct,@chain_id,?,?)`).run({ ...t }, now(), now());
    applyAccept(t);
    notify(payee.id, 'trade', `${req.user.name} requested "${listing.title}"`, `Paid ${listing.credit} credits — held in escrow`, `/thread/${thId}`);
    return res.json({ trade: getTrade(tid), thread_id: thId });
  }
  // proposal (barter)
  const myListing = db.prepare('SELECT * FROM listings WHERE id=? AND owner_id=?').get(my_listing_id, req.user.id);
  if (!myListing) return res.status(400).json({ error: 'Pick one of your own postings to offer' });
  db.prepare('INSERT INTO threads (id,a_user,b_user,listing_id,kind,created_at) VALUES (?,?,?,?,?,?)').run(thId, req.user.id, payee.id, listing.id, 'proposal', now());
  const t = { id: tid, thread_id: thId, payer_id: req.user.id, payee_id: payee.id, my_give: myListing.title, their_give: listing.title, my_value: myListing.credit, their_value: listing.credit, status: 'proposed', direct: 0, chain_id: null };
  db.prepare(`INSERT INTO trades (id,thread_id,payer_id,payee_id,my_give,their_give,my_value,their_value,status,direct,chain_id,created_at,updated_at)
              VALUES (@id,@thread_id,@payer_id,@payee_id,@my_give,@their_give,@my_value,@their_value,@status,@direct,@chain_id,?,?)`).run({ ...t }, now(), now());
  notify(payee.id, 'trade', `${req.user.name} proposed a trade`, `${myListing.title} ⇄ ${listing.title}`, `/thread/${thId}`);
  res.json({ trade: getTrade(tid), thread_id: thId });
});
const getTrade = id => db.prepare('SELECT * FROM trades WHERE id=?').get(id);

app.post('/api/trades/:id/advance', auth, (req, res) => {
  const t = getTrade(req.params.id);
  if (!t || (t.payer_id !== req.user.id && t.payee_id !== req.user.id)) return res.status(404).json({ error: 'Trade not found' });
  const i = STAGES.indexOf(t.status), next = STAGES[i + 1];
  if (!next) return res.status(400).json({ error: 'Already complete' });
  db.prepare('UPDATE trades SET status=?, updated_at=? WHERE id=?').run(next, now(), t.id);
  const nt = getTrade(t.id);
  if (next === 'accepted') applyAccept(nt);
  if (next === 'completed') applyComplete(nt);
  const other = t.payer_id === req.user.id ? t.payee_id : t.payer_id;
  notify(other, 'trade', `Trade moved to ${next.replace('_', ' ')}`, `${nt.their_give}`, `/thread/${nt.thread_id}`);
  res.json({ trade: nt });
});
app.post('/api/trades/:id/cancel', auth, (req, res) => {
  const t = getTrade(req.params.id);
  if (!t || (t.payer_id !== req.user.id && t.payee_id !== req.user.id)) return res.status(404).json({ error: 'Trade not found' });
  if (t.status === 'completed' || t.status === 'cancelled') return res.status(400).json({ error: 'Cannot cancel' });
  if (STAGES.indexOf(t.status) >= STAGES.indexOf('accepted')) applyRefund(t);
  db.prepare('UPDATE trades SET status=?, updated_at=? WHERE id=?').run('cancelled', now(), t.id);
  res.json({ trade: getTrade(t.id) });
});

// ---- threads + messages ----
app.post('/api/threads', auth, (req, res) => {
  const { listing_id, kind } = req.body || {};
  const listing = db.prepare('SELECT * FROM listings WHERE id=?').get(listing_id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  let th = db.prepare('SELECT * FROM threads WHERE a_user=? AND listing_id=?').get(req.user.id, listing_id);
  if (!th) {
    const id = uid('th');
    db.prepare('INSERT INTO threads (id,a_user,b_user,listing_id,kind,created_at) VALUES (?,?,?,?,?,?)').run(id, req.user.id, listing.owner_id, listing_id, kind || 'inquiry', now());
    th = db.prepare('SELECT * FROM threads WHERE id=?').get(id);
  }
  res.json({ thread: th });
});
app.get('/api/threads', auth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM threads WHERE a_user=? OR b_user=? ORDER BY created_at DESC`).all(req.user.id, req.user.id);
  const out = rows.map(th => {
    const otherId = th.a_user === req.user.id ? th.b_user : th.a_user;
    const other = getUser(otherId);
    const trade = db.prepare('SELECT * FROM trades WHERE thread_id=? ORDER BY created_at DESC').get(th.id);
    const last = db.prepare('SELECT * FROM messages WHERE thread_id=? ORDER BY created_at DESC').get(th.id);
    const listing = th.listing_id ? db.prepare('SELECT * FROM listings WHERE id=?').get(th.listing_id) : null;
    return { ...th, other: { id: other.id, name: other.name, initials: other.initials, color: other.color }, trade, last, listing };
  });
  res.json({ threads: out });
});
app.get('/api/threads/:id', auth, (req, res) => {
  const th = db.prepare('SELECT * FROM threads WHERE id=?').get(req.params.id);
  if (!th || (th.a_user !== req.user.id && th.b_user !== req.user.id)) return res.status(404).json({ error: 'Not found' });
  const otherId = th.a_user === req.user.id ? th.b_user : th.a_user;
  const messages = db.prepare('SELECT * FROM messages WHERE thread_id=? ORDER BY created_at ASC').all(th.id);
  const trade = db.prepare('SELECT * FROM trades WHERE thread_id=? ORDER BY created_at DESC').get(th.id);
  const listing = th.listing_id ? db.prepare('SELECT * FROM listings WHERE id=?').get(th.listing_id) : null;
  res.json({ thread: th, other: publicUser(getUser(otherId)), messages, trade, listing });
});
app.post('/api/threads/:id/messages', auth, (req, res) => {
  const th = db.prepare('SELECT * FROM threads WHERE id=?').get(req.params.id);
  if (!th || (th.a_user !== req.user.id && th.b_user !== req.user.id)) return res.status(404).json({ error: 'Not found' });
  const { body } = req.body || {};
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'Empty message' });
  const id = uid('m');
  db.prepare('INSERT INTO messages (id,thread_id,sender_id,body,created_at) VALUES (?,?,?,?,?)').run(id, th.id, req.user.id, String(body).trim(), now());
  const otherId = th.a_user === req.user.id ? th.b_user : th.a_user;
  notify(otherId, 'message', `${req.user.name} messaged you`, String(body).trim().slice(0, 80), `/thread/${th.id}`);
  res.json({ message: db.prepare('SELECT * FROM messages WHERE id=?').get(id) });
});

// ---- ledger + notifications ----
app.get('/api/ledger', auth, (req, res) => {
  const u = getUser(req.user.id);
  res.json({ balance: u.balance, held: u.held, earned: u.earned, spent: u.spent,
    history: db.prepare('SELECT * FROM ledger WHERE user_id=? ORDER BY id DESC').all(req.user.id) });
});
app.get('/api/notifications', auth, (req, res) =>
  res.json({ notifications: db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.id) }));
app.post('/api/notifications/read', auth, (req, res) => { db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id); res.json({ ok: true }); });

// ---- chains ----
app.get('/api/chains/suggest', auth, (req, res) => {
  const cycles = findCycles(db, { maxLen: 3, involving: req.user.id }).slice(0, 5);
  res.json({ chains: cycles.map(formatChain) });
});
function formatChain(legs) {
  return legs.map(l => {
    const g = getUser(l.giver), r = getUser(l.receiver);
    return { giver: { id: g.id, name: g.name, initials: g.initials, color: g.color }, gives: l.listing.title, credit: l.listing.credit,
      receiver: { id: r.id, name: r.name } };
  });
}
// When a listing/want changes, find loops the member is now in and notify everyone involved (once).
function detectAndNotifyChains(userId) {
  const cycles = findCycles(db, { maxLen: 3, involving: userId });
  for (const legs of cycles.slice(0, 3)) {
    const sig = 'chain:' + legs.map(l => l.giver).sort().join('|');
    for (const l of legs) {
      const already = db.prepare("SELECT id FROM notifications WHERE user_id=? AND kind='chain_invite' AND link=?").get(l.giver, sig);
      if (!already) notify(l.giver, 'chain_invite', 'You can complete a trade circle', `${legs.length}-way loop — everyone gets what they want`, sig);
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Swaply server on :${PORT}`));
