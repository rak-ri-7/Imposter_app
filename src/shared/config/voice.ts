// src/shared/config/voice.ts
// 🎙️ Where the app gets voice chat passes: the Cloudflare Worker in
// voice-worker/ (deployed with `npx wrangler deploy`). Paste the address it
// prints after deploying, with /token on the end.
export const VOICE_TOKEN_URL = "https://wgawpt-voice.lumirakgames.workers.dev/token";
