// src/shared/voice/VoiceProvider.tsx
// 🎙️ Group voice chat (audio only), so friends who aren't in the same room
// can still play together.
//
// How it works:
//   • Each group has one voice room on LiveKit.
//   • To join, the app asks our small Cloudflare Worker (voice-worker/) for
//     a pass, sending the player's Firebase sign-in; the Worker checks you're
//     really in the group. The LiveKit secret never sits in the app.
//   • This provider holds the one live call for the whole app, so the call
//     carries on while you move between Party Group, the menu and games.
//
// Voice needs the phone's native WebRTC code, which Expo Go doesn't have. In
// Expo Go `available` is false and the voice buttons simply don't show.
//
// Safety limits (each minute of a call costs, so a forgotten call shouldn't
// run all night):
//   • Nobody has spoken for IDLE_MS → "Still there?", then hang up.
//   • The app has sat in the background for BACKGROUND_MS → hang up.
//   • A call that has run SESSION_MS → "Keep talking?", then hang up.
//   • Leaving the group (or landing back on the start screen) hangs up.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

// Android asks for the microphone at run time.
async function askMic(): Promise<boolean> {
  if (Platform.OS !== "android") return true; // iOS asks by itself on first use
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PermissionsAndroid } = require("react-native") as typeof import("react-native");
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: "Talk with your group",
    message: "Voice chat needs the microphone so your friends can hear you.",
    buttonPositive: "Allow",
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
}
import { auth } from "../firebase/config";
import { VOICE_TOKEN_URL } from "../config/voice";
import { haptics } from "../haptics";

const IDLE_MS = 15 * 60 * 1000;
const BACKGROUND_MS = 5 * 60 * 1000;
const SESSION_MS = 3 * 60 * 60 * 1000;
const CONFIRM_MS = 60 * 1000; // how long "Still there?" waits for a tap

// ── Load LiveKit only if this build has it ───────────────────────────────
type LK = { client: typeof import("livekit-client"); rn: typeof import("@livekit/react-native") };
let lk: LK | null | undefined; // undefined = not tried yet, null = not in this build
function loadLiveKit(): LK | null {
  if (lk !== undefined) return lk;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require("@livekit/react-native") as LK["rn"];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const client = require("livekit-client") as LK["client"];
    rn.registerGlobals();
    if (Platform.OS === "ios") rn.setupIOSAudioManagement(true);
    lk = { rn, client };
  } catch {
    lk = null; // Expo Go, or a build made before voice was added
  }
  return lk;
}

// ── What screens see ─────────────────────────────────────────────────────
export type VoicePerson = {
  id: string; // player id (same as in the group)
  name: string;
  avatar?: string | null;
  speaking: boolean;
  muted: boolean;
  isMe: boolean;
};
export type VoiceStatus = "off" | "connecting" | "on" | "reconnecting" | "error";
export type VoicePrompt = null | { kind: "idle" | "session"; endsAt: number };

type VoiceApi = {
  available: boolean;
  status: VoiceStatus;
  groupId: string | null;
  people: VoicePerson[];
  micOn: boolean;
  error: string | null;
  prompt: VoicePrompt;
  join: (groupId: string) => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  stillHere: () => void; // answer the "Still there?" / "Keep talking?" prompt
  retry: () => void; // after an error
  dismissError: () => void;
};

// Outside a provider (e.g. a screen shown on its own) voice just isn't there.
const NO_VOICE: VoiceApi = {
  available: false,
  status: "off",
  groupId: null,
  people: [],
  micOn: false,
  error: null,
  prompt: null,
  join: async () => {},
  leave: () => {},
  toggleMic: () => {},
  stillHere: () => {},
  retry: () => {},
  dismissError: () => {},
};

export const VoiceContext = createContext<VoiceApi>(NO_VOICE);

export function useVoice(): VoiceApi {
  return useContext(VoiceContext);
}

function readMeta(raw?: string): { avatar?: string | null } {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Ask the Worker for a pass (see voice-worker/src/index.js).
async function fetchPass(groupId: string): Promise<{ url: string; token: string }> {
  if (!VOICE_TOKEN_URL) throw { code: "not-set-up" };
  const user = auth.currentUser;
  if (!user) throw { code: "unauthenticated" };
  const idToken = await user.getIdToken();
  const res = await fetch(VOICE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ groupId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw { code: body?.error ?? `http-${res.status}` };
  return body;
}

const friendlyError = (e: any): string => {
  const code: string = e?.code ?? "";
  if (code.includes("permission-denied")) return "You're not in this group any more.";
  if (code.includes("not-found")) return "That group has closed.";
  if (code.includes("unauthenticated")) return "Please rejoin the group and try again.";
  if (code === "not-set-up") return "Voice chat isn't switched on yet.";
  if (e?.message === "mic-denied") return "Allow the microphone to talk. You can still listen.";
  return "Couldn't connect to voice. Check your internet and try again.";
};

export function VoiceProvider({ children, currentRoute }: { children: ReactNode; currentRoute?: string }) {
  const available = useMemo(() => loadLiveKit() !== null, []);
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [people, setPeople] = useState<VoicePerson[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<VoicePrompt>(null);

  const roomRef = useRef<any>(null);
  const lastVoiceAt = useRef(0); // last time anyone spoke
  const startedAt = useRef(0);
  const bgSince = useRef<number | null>(null);
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joining = useRef(false);
  const lastGid = useRef<string | null>(null);

  // Rebuild the people list from the room.
  const refresh = useCallback(() => {
    const room = roomRef.current;
    if (!room) return setPeople([]);
    const all = [room.localParticipant, ...Array.from(room.remoteParticipants.values())] as any[];
    setPeople(
      all.map((p) => ({
        id: p.identity,
        name: p.name || "Player",
        avatar: readMeta(p.metadata).avatar,
        speaking: !!p.isSpeaking,
        muted: !p.isMicrophoneEnabled,
        isMe: p === room.localParticipant,
      })),
    );
  }, []);

  const clearPrompt = () => {
    if (promptTimer.current) clearTimeout(promptTimer.current);
    promptTimer.current = null;
    setPrompt(null);
  };

  const leave = useCallback(() => {
    clearPrompt();
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners?.();
      room.disconnect().catch(() => {});
      lk?.rn.AudioSession.stopAudioSession().catch(() => {});
    }
    setPeople([]);
    setGroupId(null);
    setStatus("off");
  }, []);

  const join = useCallback(
    async (gid: string) => {
      const L = loadLiveKit();
      if (!L || joining.current) return;
      if (roomRef.current && groupId === gid) return; // already in
      if (roomRef.current) leave(); // switching groups
      joining.current = true;
      lastGid.current = gid;
      setError(null);
      setStatus("connecting");
      setGroupId(gid);
      try {
        // 1. A pass from our server
        const data = await fetchPass(gid);

        // 2. The microphone (Android asks at run time)
        const micAllowed = await askMic();

        // 3. Into the room
        await L.rn.AudioSession.configureAudio({
          android: { preferredOutputList: ["bluetooth", "headset", "speaker"], audioTypeOptions: L.rn.AndroidAudioTypePresets.communication },
          ios: { defaultOutput: "speaker" },
        });
        await L.rn.AudioSession.startAudioSession();
        const { Room, RoomEvent } = L.client;
        const room = new Room({
          adaptiveStream: false,
          dynacast: false,
          audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        roomRef.current = room;

        const ev = [
          RoomEvent.ParticipantConnected,
          RoomEvent.ParticipantDisconnected,
          RoomEvent.TrackMuted,
          RoomEvent.TrackUnmuted,
          RoomEvent.TrackPublished,
          RoomEvent.TrackUnpublished,
          RoomEvent.LocalTrackPublished,
          RoomEvent.LocalTrackUnpublished,
          RoomEvent.ParticipantMetadataChanged,
        ];
        ev.forEach((e) => room.on(e, refresh));
        room.on(RoomEvent.ParticipantConnected, () => haptics.tap());
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers: any[]) => {
          if (speakers.length) lastVoiceAt.current = Date.now();
          refresh();
        });
        room.on(RoomEvent.Reconnecting, () => setStatus("reconnecting"));
        room.on(RoomEvent.Reconnected, () => setStatus("on"));
        room.on(RoomEvent.Disconnected, () => {
          if (roomRef.current === room) leave();
        });

        await room.connect(data.url, data.token, { autoSubscribe: true });
        if (roomRef.current !== room) return; // left while connecting
        if (micAllowed) await room.localParticipant.setMicrophoneEnabled(true);
        setMicOn(micAllowed);
        if (!micAllowed) setError(friendlyError({ message: "mic-denied" }));

        startedAt.current = Date.now();
        lastVoiceAt.current = Date.now();
        setStatus("on");
        refresh();
        haptics.success();
      } catch (e) {
        leave();
        setStatus("error");
        setError(friendlyError(e));
      } finally {
        joining.current = false;
      }
    },
    [groupId, leave, refresh],
  );

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    try {
      if (next && !(await askMic())) return setError(friendlyError({ message: "mic-denied" }));
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
      setError(null);
      haptics.tap();
      refresh();
    } catch {
      /* keep the old state */
    }
  }, [micOn, refresh]);

  // "Still there?" / "Keep talking?"
  const ask = useCallback(
    (kind: "idle" | "session") => {
      if (promptTimer.current) return;
      haptics.heavy();
      setPrompt({ kind, endsAt: Date.now() + CONFIRM_MS });
      promptTimer.current = setTimeout(leave, CONFIRM_MS);
    },
    [leave],
  );
  const stillHere = useCallback(() => {
    clearPrompt();
    lastVoiceAt.current = Date.now();
    startedAt.current = Date.now(); // a fresh session window
  }, []);

  const retry = useCallback(() => {
    if (lastGid.current) join(lastGid.current);
  }, [join]);
  const dismissError = useCallback(() => {
    setError(null);
    setStatus((s) => (s === "error" ? "off" : s));
  }, []);

  // Check the limits every 20 s while in a call.
  useEffect(() => {
    if (status !== "on" && status !== "reconnecting") return;
    const t = setInterval(() => {
      const now = Date.now();
      if (bgSince.current && now - bgSince.current > BACKGROUND_MS) return leave();
      if (now - lastVoiceAt.current > IDLE_MS) ask("idle");
      else if (now - startedAt.current > SESSION_MS) ask("session");
    }, 20000);
    return () => clearInterval(t);
  }, [status, ask, leave]);

  // Note when the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") bgSince.current = null;
      else if (bgSince.current === null) bgSince.current = Date.now();
    });
    return () => sub.remove();
  }, []);

  // Back on the start screen = left the group: hang up.
  useEffect(() => {
    if (currentRoute === "Home" && roomRef.current) leave();
  }, [currentRoute, leave]);

  // Hang up if the app closes this provider.
  useEffect(() => () => leave(), [leave]);

  const api = useMemo<VoiceApi>(
    () => ({ available, status, groupId, people, micOn, error, prompt, join, leave, toggleMic, stillHere, retry, dismissError }),
    [available, status, groupId, people, micOn, error, prompt, join, leave, toggleMic, stillHere, retry, dismissError],
  );
  return <VoiceContext.Provider value={api}>{children}</VoiceContext.Provider>;
}
