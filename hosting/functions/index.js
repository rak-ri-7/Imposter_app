// hosting/functions/index.js
// 🎙️ Voice chat passes (Firebase version, NOT IN USE).
//
// The app uses the free Cloudflare Worker in voice-worker/ instead. This is
// kept for if the project moves to Firebase's Blaze plan later: add
//   "functions": [{ "source": "functions" }]
// to hosting/firebase.json and point the app at it.
//
// The app never holds the LiveKit secret. When a player taps "Join voice",
// the app calls `voiceToken` here; we check that they're signed in and really
// are in that group, then hand back a short-lived pass that lets them into
// that group's voice room only (microphone only, no video, no screen share).
//
// Setup (once):
//   firebase functions:secrets:set LIVEKIT_API_KEY
//   firebase functions:secrets:set LIVEKIT_API_SECRET
//   firebase deploy --only functions
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { AccessToken, TrackSource } from "livekit-server-sdk";

initializeApp();

const LIVEKIT_API_KEY = defineSecret("LIVEKIT_API_KEY");
const LIVEKIT_API_SECRET = defineSecret("LIVEKIT_API_SECRET");
const LIVEKIT_URL = "wss://partygame-app-kt18030x.livekit.cloud";

const MAX_IN_ROOM = 16; // a party, not a conference

export const voiceToken = onCall(
  {
    region: "asia-south1", // Mumbai: closest to the players
    secrets: [LIVEKIT_API_KEY, LIVEKIT_API_SECRET],
    maxInstances: 5, // a hard ceiling, so a flood of calls can't run up a bill
  },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

    const groupId = typeof req.data?.groupId === "string" ? req.data.groupId : "";
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(groupId)) throw new HttpsError("invalid-argument", "Bad group.");

    const snap = await getFirestore().doc(`groups/${groupId}`).get();
    if (!snap.exists) throw new HttpsError("not-found", "That group has closed.");
    const players = snap.get("players") || [];
    const me = players.find((p) => p && p.id === uid);
    if (!me) throw new HttpsError("permission-denied", "You're not in this group.");

    const room = `group-${groupId}`;
    const at = new AccessToken(LIVEKIT_API_KEY.value(), LIVEKIT_API_SECRET.value(), {
      identity: uid,
      name: String(me.name || "Player").slice(0, 40),
      metadata: JSON.stringify({ avatar: me.avatar ?? null }),
      ttl: "2h", // long enough to join; the call itself can carry on
    });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: [TrackSource.MICROPHONE],
    });

    return { url: LIVEKIT_URL, room, token: await at.toJwt(), maxInRoom: MAX_IN_ROOM };
  },
);
