// voice-worker/src/index.js
// 🎙️ Voice chat passes, on a free Cloudflare Worker.
//
// The app sends:   POST /token   { groupId }   with header
//                  Authorization: Bearer <the player's Firebase ID token>
// We then:
//   1. check the Firebase sign-in is genuine (Google's signature, our project,
//      not expired),
//   2. read the group from Firestore *as that player* and check they're in it,
//   3. sign a LiveKit pass for that group's voice room only: microphone
//      only, no video, no screen share, valid for 2 hours.
// The LiveKit secret lives only here (as a Worker secret), never in the app.

const GOOGLE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const PASS_TTL_S = 2 * 60 * 60;

export default {
  async fetch(request, env) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/token") {
      return json({ error: "not-found" }, 404);
    }
    try {
      // 1. Who is asking?
      const auth = request.headers.get("Authorization") || "";
      const idToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const user = await verifyFirebaseToken(idToken, env.FIREBASE_PROJECT_ID);
      if (!user) return fail("unauthenticated", 401, idToken ? "sign-in token not accepted" : "no sign-in token");

      // 2. Are they in this group?
      const body = await request.json().catch(() => ({}));
      const groupId = typeof body.groupId === "string" ? body.groupId : "";
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(groupId)) return fail("invalid-argument", 400, `bad group id`);
      const group = await readGroup(env.FIREBASE_PROJECT_ID, groupId, idToken);
      if (!group) return fail("not-found", 404, `group ${groupId} not found`);
      const me = group.players.find((p) => p.id === user.uid);
      if (!me) return fail("permission-denied", 403, `player not in group ${groupId}`);

      // 3. The pass
      const room = `group-${groupId}`;
      const apiKey = cleanSecret(env.LIVEKIT_API_KEY, "LIVEKIT_API_KEY");
      const apiSecret = cleanSecret(env.LIVEKIT_API_SECRET, "LIVEKIT_API_SECRET");
      const token = await signLiveKitToken(apiKey, apiSecret, {
        identity: user.uid,
        name: (me.name || "Player").slice(0, 40),
        metadata: JSON.stringify({ avatar: me.avatar ?? null }),
        room,
      });
      return json({ url: env.LIVEKIT_URL, room, token });
    } catch (e) {
      return fail("internal", 500);
    }
  },
};

// A refusal: a short code the app turns into a friendly message.
const fail = (code, status) => json({ error: code }, status);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Forgive common paste slips: spaces/new lines, quotes, or the whole
// "LIVEKIT_API_SECRET=..." line pasted instead of just the value.
function cleanSecret(raw, name) {
  let v = String(raw ?? "").trim();
  if (v.startsWith(`${name}=`)) v = v.slice(name.length + 1).trim();
  v = v.replace(/^["']|["']$/g, "");
  return v;
}

// ── base64url helpers ────────────────────────────────────────────────────
const enc = new TextEncoder();
const b64url = (bytes) => {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlJson = (obj) => b64url(enc.encode(JSON.stringify(obj)));
const fromB64url = (str) => {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const parseJson = (part) => JSON.parse(new TextDecoder().decode(fromB64url(part)));

// ── 1. Firebase sign-in check ────────────────────────────────────────────
let jwksCache = { keys: null, until: 0 };
async function googleKeys() {
  if (jwksCache.keys && Date.now() < jwksCache.until) return jwksCache.keys;
  const res = await fetch(GOOGLE_JWKS);
  if (!res.ok) throw new Error(`fetching Google's sign-in keys failed (${res.status})`);
  const { keys } = await res.json();
  const maxAge = Number((res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/)?.[1] || 3600);
  jwksCache = { keys, until: Date.now() + Math.min(maxAge, 6 * 3600) * 1000 };
  return keys;
}

async function verifyFirebaseToken(token, projectId) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, claims;
  try {
    header = parseJson(parts[0]);
    claims = parseJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== projectId) return null;
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!claims.sub || typeof claims.sub !== "string") return null;
  if (typeof claims.exp !== "number" || claims.exp <= now) return null;
  if (typeof claims.iat !== "number" || claims.iat > now + 300) return null;

  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  return ok ? { uid: claims.sub } : null;
}

// ── 2. The group, read as the player (so the app's own rules apply) ──────
async function readGroup(projectId, groupId, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`reading the group from Firestore failed (${res.status}): ${(await res.text()).slice(0, 80)}`);
  const doc = await res.json();
  const values = doc.fields?.players?.arrayValue?.values || [];
  const players = values.map((v) => {
    const f = v.mapValue?.fields || {};
    return { id: f.id?.stringValue, name: f.name?.stringValue, avatar: f.avatar?.stringValue };
  });
  return { players };
}

// ── 3. LiveKit pass (an HS256-signed JWT in LiveKit's format) ────────────
async function signLiveKitToken(apiKey, apiSecret, { identity, name, metadata, room }) {
  if (!apiKey) throw new Error("LIVEKIT_API_KEY secret is not set");
  if (!apiSecret) throw new Error("LIVEKIT_API_SECRET secret is not set");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const claims = {
    iss: apiKey,
    sub: identity,
    name,
    metadata,
    nbf: now - 10,
    exp: now + PASS_TTL_S,
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: ["microphone"],
    },
  };
  const data = `${b64urlJson(header)}.${b64urlJson(claims)}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}
