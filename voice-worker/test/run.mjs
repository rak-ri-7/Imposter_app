// voice-worker/test/run.mjs — checks the Worker's logic with fake Google keys
// and a fake Firestore. Run: node test/run.mjs
import worker from "../src/index.js";

const PROJECT = "imposter-game-a588f";
const env = { LIVEKIT_URL: "wss://x.livekit.cloud", FIREBASE_PROJECT_ID: PROJECT, LIVEKIT_API_KEY: "APIkey123", LIVEKIT_API_SECRET: "secret-secret-secret-secret-secret" };
const enc = new TextEncoder();
const b64url = (b) => Buffer.from(b).toString("base64url");

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const other = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);

async function idToken(over = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: "RS256", kid: "k1", typ: "JWT" }));
  const c = b64url(JSON.stringify({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: "uid-1", iat: now - 5, exp: now + 3600, ...over }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${h}.${c}`));
  return `${h}.${c}.${b64url(sig)}`;
}

const groups = {
  g1: { fields: { players: { arrayValue: { values: [
    { mapValue: { fields: { id: { stringValue: "uid-1" }, name: { stringValue: "Rakesh" }, avatar: { stringValue: "fox" } } } },
    { mapValue: { fields: { id: { stringValue: "uid-2" }, name: { stringValue: "Anu" } } } },
  ] } } } },
};
globalThis.fetch = async (url, opts) => {
  if (String(url).includes("securetoken@system")) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Cache-Control": "max-age=100" } });
  const m = String(url).match(/documents\/groups\/(.+)$/);
  if (m) return groups[m[1]] ? new Response(JSON.stringify(groups[m[1]])) : new Response("{}", { status: 404 });
  throw new Error("unexpected fetch " + url);
};

const call = async (tok, body, method = "POST", path = "/token") => {
  const res = await worker.fetch(new Request("https://w.dev" + path, { method, headers: tok ? { Authorization: "Bearer " + tok } : {}, body: method === "POST" ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: await res.json() };
};

const { TokenVerifier } = await import("livekit-server-sdk");
const results = [];
const expect = (name, cond) => { results.push([name, cond]); console.log(cond ? "PASS" : "FAIL", name); };

let r = await call(await idToken(), { groupId: "g1" });
expect("member gets a pass", r.status === 200 && !!r.data.token && r.data.room === "group-g1" && r.data.url === env.LIVEKIT_URL);
const claims = await new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET).verify(r.data.token);
expect("LiveKit accepts the pass", claims.sub === "uid-1" && claims.video.room === "group-g1" && claims.video.roomJoin && claims.name === "Rakesh");
expect("mic only", JSON.stringify(claims.video.canPublishSources) === '["microphone"]' && claims.video.canPublishData === false);
expect("avatar in metadata", JSON.parse(claims.metadata).avatar === "fox");
expect("2 hour pass", claims.exp - Math.floor(Date.now() / 1000) > 7100 && claims.exp - Math.floor(Date.now() / 1000) <= 7200);
r = await call(await idToken({ sub: "uid-9" }), { groupId: "g1" }); expect("non-member refused (403)", r.status === 403);
r = await call(await idToken({}, other.privateKey), { groupId: "g1" }); expect("forged sign-in refused (401)", r.status === 401);
r = await call(await idToken({ exp: Math.floor(Date.now() / 1000) - 10 }), { groupId: "g1" }); expect("expired sign-in refused (401)", r.status === 401);
r = await call(await idToken({ aud: "someone-else" }), { groupId: "g1" }); expect("other project refused (401)", r.status === 401);
r = await call(null, { groupId: "g1" }); expect("no sign-in refused (401)", r.status === 401);
r = await call(await idToken(), { groupId: "nope" }); expect("closed group (404)", r.status === 404);
r = await call(await idToken(), { groupId: "../evil" }); expect("bad group id (400)", r.status === 400);
r = await call(await idToken(), null, "GET"); expect("wrong method (404)", r.status === 404);
let bad = false; try { await new TokenVerifier(env.LIVEKIT_API_KEY, "wrong-secret-wrong-secret-wrong").verify((await call(await idToken(), { groupId: "g1" })).data.token); } catch { bad = true; }
expect("pass can't be checked with a wrong secret", bad);
const failed = results.filter(([, ok]) => !ok).length;
console.log(failed ? `${failed} FAILED` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
