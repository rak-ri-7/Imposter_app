# Voice chat passes (Cloudflare Worker)

Hands out LiveKit voice passes to players who are really in the group.
Free on Cloudflare's Workers plan; no card needed.

## One-time setup

1. Make a free account at https://dash.cloudflare.com/sign-up
2. In this folder:
   ```
   npm install
   npx wrangler login              (opens the browser to allow it)
   npx wrangler secret put LIVEKIT_API_KEY      (paste the key)
   npx wrangler secret put LIVEKIT_API_SECRET   (paste the secret)
   npx wrangler deploy
   ```
3. `deploy` prints an address like `https://wgawpt-voice.<you>.workers.dev`.
   Put it, with `/token` on the end, in `src/shared/config/voice.ts`.

## Changing it later

Edit `src/index.js`, check it with `npm test`, then `npx wrangler deploy`.
