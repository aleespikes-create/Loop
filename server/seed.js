'use strict';
// Seeds a lively demo: a handful of Nashville members, real listings, wants that form a loop.
const db = require('./db');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const now = () => new Date().toISOString();
const uid = p => p + '_' + crypto.randomBytes(6).toString('hex');
const hash = bcrypt.hashSync('demo1234', 8);

function mkUser(name, email, hood, color, rating, completed, wants) {
  const id = uid('u');
  const initials = name.slice(0, 2).toUpperCase();
  db.prepare(`INSERT INTO users (id,email,pass_hash,name,neighborhood,initials,color,bio,verified,rating,completed,balance,held,earned,spent,created_at)
              VALUES (?,?,?,?,?,?,?,?,1,?,?,?,0,?,?,?)`)
    .run(id, email, hash, name, hood, initials, color, null, rating, completed, 200, completed * 40, completed * 30, now());
  db.prepare('INSERT INTO ledger (user_id,label,amount,held,balance_after,created_at) VALUES (?,?,?,?,?,?)').run(id, 'Welcome grant', 50, null, 50, now());
  (wants || []).forEach(w => db.prepare('INSERT INTO wants (user_id,tag) VALUES (?,?)').run(id, w));
  return id;
}
function mkListing(owner, title, category, credit, description) {
  const id = uid('l');
  const mode = category === 'Nashville-Local In-Person' ? 'In-Person' : 'Remote';
  db.prepare(`INSERT INTO listings (id,owner_id,title,category,mode,credit,description,photo_url,active,likes,created_at)
              VALUES (?,?,?,?,?,?,?,?,1,?,?)`).run(id, owner, title, category, mode, credit, description, null, Math.floor(Math.random ? 0 : 0) + 30, now());
}

const dana = mkUser('Dana Whitfield', 'dana@loopdemo.app', 'East Nashville', '#E08A2B', 4.8, 12, ['Personal Training']);
const jordan = mkUser('Jordan Meece', 'jordan@loopdemo.app', '12South', '#22A06B', 4.9, 20, ['Development', 'Photography']);
const marcus = mkUser('Marcus Idun', 'marcus@loopdemo.app', 'Wedgewood-Houston', '#3E7BFF', 5.0, 8, ['Design']);
const theo = mkUser('Theo Nakamura', 'theo@loopdemo.app', 'Germantown', '#7A5AA0', 4.7, 15, ['Design', 'Video']);
const renata = mkUser('Renata Cole', 'renata@loopdemo.app', 'Berry Hill', '#C2185B', 4.6, 9, ['Design']);
const leah = mkUser('Leah Park', 'leah@loopdemo.app', 'The Nations', '#C0453B', null, 0, ['Marketing']);

mkListing(dana, 'Brand Identity + Logo Package', 'Design & Creative', 220, 'Brand identity + logo, delivered like I\'d want to receive it — no stock-template energy.');
mkListing(marcus, 'Full-Stack Web App Build', 'Development & Tech', 300, 'I\'ll build the web app you\'ve been afraid to quote a client for.');
mkListing(jordan, 'Personal Training — 5 Sessions', 'Nashville-Local In-Person', 150, 'Five sessions, programmed around your actual goals. First one somewhere public in 12South.');
mkListing(jordan, 'Event Photography (3 Hours)', 'Nashville-Local In-Person', 200, 'Three hours, one gallery, zero awkward posing direction.');
mkListing(theo, 'Website Copywriting Package', 'Writing & Marketing', 180, 'Copy that sounds like a person wrote it — because one did.');
mkListing(renata, 'Monthly Bookkeeping', 'Writing & Marketing', 150, 'Your books, actually reconciled. Less scary than you think.');
mkListing(leah, 'Promo Video Edit (60–90s)', 'Design & Creative', 250, 'Send me your rawest footage. I\'ll send back something you\'d actually post.');

console.log('Seeded', db.prepare('SELECT COUNT(*) c FROM users').get().c, 'members and', db.prepare('SELECT COUNT(*) c FROM listings').get().c, 'listings.');
