# Getting Swaply live for your test group

The app is a single Node service that serves both the API and the installable web app. Everything below is the click-by-click path to putting it on a real URL your friends can open and install. It takes ~15 minutes and needs two free accounts (GitHub + a host). I'll walk you through it live when you're ready — this is the reference.

## What you're deploying
- A Node.js server (`server/`) with a built-in SQLite database.
- The installable web app (`public/`), served by that same server.
- No separate database or frontend host to manage for the closed test.

## Option A — Render (recommended, simplest)

1. **Put the code on GitHub.** Create a free account at github.com, make a new empty repository (e.g. `swaply`), and push this project's folder to it. (I can prepare the exact git commands for your machine.)
2. **Create a Render account** at render.com and click **New → Blueprint**. Point it at your GitHub repo. Render reads the included `render.yaml` and sets everything up — the web service, the auto-generated `JWT_SECRET`, and a 1 GB persistent disk so accounts and trades survive redeploys.
3. **Deploy.** Render installs, builds, and gives you a URL like `https://swaply.onrender.com`. That's your live app.
4. **Open it on your phone**, and use the browser's **Add to Home Screen** — it installs like a native app (that's the PWA working).

**Cost:** the Starter plan is ~$7/month, which is what allows the persistent disk that keeps everyone's data. (Render's free tier can't persist a disk, so data would reset on each deploy — fine for a quick look, not for real testers.)

## Option B — Railway or Fly.io
Both also run a Node app with a persistent volume. Same idea: connect the repo, mount a volume, set `SWAPLY_DB` to a path on that volume and `JWT_SECRET` to a long random string. Say the word and I'll write the exact config for whichever you prefer.

## After it's live
- **Invite your group** by sending them the URL. They sign up, onboard, post, and trade for real against the shared database.
- **You're the concierge.** Early on, hand-broker a few trades and seed good listings yourself (this is the playbook from the launch plan).
- **Watch it work.** Every account, listing, trade, message, and the credit ledger is now persistent and shared.

## What's intentionally deferred to Phase 2 (and why)
- **Payments / card-on-file (Stripe).** You shouldn't charge your first testers anyway, and this is where the money-transmission legal review belongs — we do it after the loop is proven.
- **Real ID verification** (Stripe Identity / Persona). For a closed group you know, the current one-tap simulated verify is fine; we swap in a real check before opening up.
- **Email/push notifications.** In-app notifications work now; wiring outbound email (e.g. Resend/Postmark) is a small add when you want the loop-completion pings to reach people who aren't in the app.
- **Database at scale.** SQLite is perfect for a closed test; we move to Postgres when you outgrow one server.

## A note on what's real vs. simulated right now
Real: accounts, login, the shared database, listings with photos, the ranked feed, the full trade lifecycle with correct two-sided credit escrow, real messaging, in-app notifications, and the chain-matching engine (it detects loops and notifies the people who can complete them). Simulated for the closed test: the identity check (one tap) and the chain "coordinate" step (it confirms the loop and notifies, but doesn't yet execute all legs atomically — that's a fast-follow).
