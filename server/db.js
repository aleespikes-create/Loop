'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = process.env.SWAPLY_DB || path.join(__dirname, 'swaply.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ---- Schema: the full data model the whole product hangs off ----
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  pass_hash     TEXT NOT NULL,
  name          TEXT NOT NULL,
  neighborhood  TEXT,
  initials      TEXT,
  color         TEXT,
  bio           TEXT,
  verified      INTEGER NOT NULL DEFAULT 0,
  rating        REAL,                 -- null = New Trader
  completed     INTEGER NOT NULL DEFAULT 0,
  balance       INTEGER NOT NULL DEFAULT 50,   -- Swap Credits
  held          INTEGER NOT NULL DEFAULT 0,
  earned        INTEGER NOT NULL DEFAULT 0,
  spent         INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wants (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wants_user ON wants(user_id);
CREATE INDEX IF NOT EXISTS idx_wants_tag  ON wants(tag);

CREATE TABLE IF NOT EXISTS listings (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL,
  mode         TEXT NOT NULL,          -- Remote | In-Person
  credit       INTEGER NOT NULL,
  description  TEXT,
  photo_url    TEXT,                   -- null -> gradient art by category
  active       INTEGER NOT NULL DEFAULT 1,
  likes        INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_cat   ON listings(category);

-- A thread is a conversation/relationship between two members about a listing (or a chain leg)
CREATE TABLE IF NOT EXISTS threads (
  id          TEXT PRIMARY KEY,
  a_user      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- initiator
  b_user      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- counterpart
  listing_id  TEXT REFERENCES listings(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL DEFAULT 'inquiry',   -- inquiry | direct | proposal | chain
  chain_id    TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_a ON threads(a_user);
CREATE INDEX IF NOT EXISTS idx_threads_b ON threads(b_user);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);

CREATE TABLE IF NOT EXISTS trades (
  id           TEXT PRIMARY KEY,
  thread_id    TEXT REFERENCES threads(id) ON DELETE SET NULL,
  payer_id     TEXT NOT NULL REFERENCES users(id),   -- receives their_give, pays their_value
  payee_id     TEXT NOT NULL REFERENCES users(id),   -- provides their_give
  my_give      TEXT,        -- what payer provides back (null for direct pay)
  their_give   TEXT NOT NULL,
  my_value     INTEGER NOT NULL DEFAULT 0,
  their_value  INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'proposed',  -- proposed|accepted|in_progress|delivered|completed|cancelled
  direct       INTEGER NOT NULL DEFAULT 0,
  chain_id     TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trades_payer ON trades(payer_id);
CREATE INDEX IF NOT EXISTS idx_trades_payee ON trades(payee_id);

CREATE TABLE IF NOT EXISTS ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  amount       INTEGER NOT NULL DEFAULT 0,   -- signed; 0 for pure holds
  held         INTEGER,                      -- non-null on escrow-hold rows
  balance_after INTEGER NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id);

-- Notifications: how the chain engine reaches the person who can complete a loop
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,     -- message | trade | chain_invite | match
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
`);

module.exports = db;
