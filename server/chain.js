'use strict';
// Chain-matching engine: model members as nodes, draw an edge A->B when A wants something
// B offers, and find loops (cycles) where everyone gives one thing and gets one thing.
// This is the "double coincidence" solver and the source of the "you're the missing piece" push.

const CAT_LABELS = {
  'Design & Creative': ['design', 'creative', 'brand', 'logo', 'graphic'],
  'Development & Tech': ['development', 'dev', 'tech', 'web', 'app', 'software', 'code'],
  'Writing & Marketing': ['writing', 'copy', 'marketing', 'seo', 'content', 'bookkeep'],
  'Nashville-Local In-Person': ['training', 'photo', 'photography', 'video', 'music', 'lesson', 'local', 'handmade'],
};

// Does a want-tag plausibly match a listing? Loose, case-insensitive.
function wantMatchesListing(tag, listing) {
  const t = String(tag).toLowerCase();
  const hay = (listing.title + ' ' + listing.category).toLowerCase();
  if (hay.includes(t)) return true;
  const kws = CAT_LABELS[listing.category] || [];
  if (kws.some(k => t.includes(k) || k.includes(t))) return true;
  return false;
}

// Build edges: from[user] = [{to, listing}] meaning `user` wants `listing` owned by `to`.
function buildGraph(db) {
  const users = db.prepare('SELECT id,name FROM users').all();
  const listings = db.prepare('SELECT * FROM listings WHERE active=1').all();
  const wantsByUser = {};
  db.prepare('SELECT user_id, tag FROM wants').all().forEach(w => {
    (wantsByUser[w.user_id] = wantsByUser[w.user_id] || []).push(w.tag);
  });
  const from = {};
  for (const u of users) {
    const wants = wantsByUser[u.id] || [];
    from[u.id] = [];
    for (const l of listings) {
      if (l.owner_id === u.id) continue;
      if (wants.some(tag => wantMatchesListing(tag, l))) {
        from[u.id].push({ to: l.owner_id, listing: l });
      }
    }
  }
  return { users, from };
}

// Find simple cycles up to maxLen. Returns arrays of legs [{giver, listing, receiver}].
function findCycles(db, { maxLen = 4, involving = null } = {}) {
  const { from } = buildGraph(db);
  const cycles = [];
  const seen = new Set();

  function dfs(start, node, pathEdges, visited) {
    if (pathEdges.length >= maxLen) return;
    for (const edge of (from[node] || [])) {
      const next = edge.to; // node wants edge.listing owned by next
      const leg = { giver: next, listing: edge.listing, receiver: node };
      if (next === start && pathEdges.length >= 1) {
        // closed a loop: current path + this leg
        const legs = pathEdges.concat([leg]);
        const sig = legs.map(l => l.giver).sort().join('|') + '#' + legs.length;
        if (!seen.has(sig)) { seen.add(sig); cycles.push(legs); }
        continue;
      }
      if (visited.has(next)) continue;
      visited.add(next);
      dfs(start, next, pathEdges.concat([leg]), visited);
      visited.delete(next);
    }
  }

  const { users } = buildGraph(db);
  for (const u of users) dfs(u.id, u.id, [], new Set([u.id]));

  let out = cycles;
  if (involving) out = out.filter(legs => legs.some(l => l.giver === involving || l.receiver === involving));
  // shortest, then fewest parties first
  out.sort((a, b) => a.length - b.length);
  return out;
}

module.exports = { findCycles, buildGraph, wantMatchesListing };
