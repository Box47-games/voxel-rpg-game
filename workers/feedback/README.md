# Riftholm feedback Worker

Players send feedback from the game (pause menu or start screen → **Send Feedback**):
a 1–5 rating, a category, a message, an optional screenshot of the 3D view, and game
details (level, location, day, device size, browser). Nothing personal is stored; IPs
are kept only as a salted hash, for rate limiting (5 per 10 minutes).

- **Live:** `https://riftholm-feedback.box47games.workers.dev`
- **Read feedback:** open `/admin` there. The browser asks for a username (anything)
  and password (the `ADMIN_TOKEN` secret). `/admin/export` gives JSON.
- **Storage:** a SQLite-backed Durable Object (`FeedbackStore`), not D1: the Cloudflare
  token used to deploy only covers Workers. Moving to D1 later means a new binding and a
  copy of the rows.
- **CORS:** only `https://box47-games.github.io` and `localhost` may post.

## Deploy

```bash
CF_ACCOUNT_ID=<account id> CF_API_TOKEN=<token with Workers edit> ./deploy.sh
```

Add `ADMIN_TOKEN=<new password>` to set or change the admin password. `npx wrangler
deploy` with `wrangler.toml` works too (`npx wrangler secret put ADMIN_TOKEN`).

The game posts to `src/systems/feedback/feedback.js` `FEEDBACK_URL`; a build can point
elsewhere with `VITE_FEEDBACK_URL`. Tests: `src/systems/feedback/__tests__/`.
