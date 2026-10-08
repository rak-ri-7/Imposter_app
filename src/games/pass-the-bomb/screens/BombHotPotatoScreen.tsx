import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import {
  hotPotatoPass,
  completeLazyTransfer,
  explodeHotPotato,
  hpZeroAt,
  hpIsNapping,
  hpPassesUsed,
  hpOutOfPasses,
  HP_PASS_MIN,
  HP_PASS_MAX,
  HpMood,
} from "../logic/hotPotatoDuel";
import { FAILSAFE_GRACE_MS, FAILSAFE_RETRY_MS } from "../logic/game";

type Props = {
  group: Group;
  playerId: string;
};

const MOODS: Record<
  HpMood,
  { emoji: string; title: string; line: string; color: string; pulseMs: number }
> = {
  neutral: {
    emoji: "😐",
    title: "Watching you",
    line: "The bomb is sizing you both up.",
    color: "#AAAAAA",
    pulseMs: 550,
  },
  angry: {
    emoji: "😠",
    title: "Getting angry",
    line: "All that rushing — the fuse is racing now.",
    color: "#FF4500",
    pulseMs: 220,
  },
  lazy: {
    emoji: "😴",
    title: "Feeling lazy",
    line: "It's in no hurry to go anywhere.",
    color: "#4FC3F7",
    pulseMs: 1100,
  },
  bored: {
    emoji: "🥱",
    title: "Getting bored",
    line: "Same old rhythm. It might nod off.",
    color: "#B388FF",
    pulseMs: 900,
  },
};

export default function BombHotPotatoScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const isHolder = gameState.currentHolderId === playerId;
  const opponent = group.players.find(
    (p) => p.id !== playerId && !gameState.ghosts.includes(p.id),
  );
  const nameOf = (id?: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Someone";

  const mood = (gameState.hpMood ?? "neutral") as HpMood;
  const moodInfo = MOODS[mood];
  const lazy = gameState.hpLazy;
  const lingeringWithMe = isHolder && lazy?.from === playerId;
  const driftingToMe = lazy?.to === playerId;
  const outOfPasses = hpOutOfPasses(gameState, playerId);
  const passMode = gameState.hpPassMode ?? "total";

  const [acting, setActing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [pulseAnim] = useState(new Animated.Value(1));
  const [moodFade] = useState(new Animated.Value(1));

  // Latest snapshot for the watchdog, without restarting its interval.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const groupLatestRef = useRef(group);
  groupLatestRef.current = group;

  // Local clock, only used for the nap banner.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const napping = hpIsNapping(gameState, now);

  // ── Watchdog — every phone. Lands lazy passes and detonates the bomb.
  // The host acts on time; everyone else steps in FAILSAFE_GRACE_MS late
  // if the host is gone. Both server calls are guarded transactions. ────
  useEffect(() => {
    const graceMs = isHost ? 0 : FAILSAFE_GRACE_MS;
    const lastAttempt: Record<string, number> = {};
    const attempt = (key: string, at: number, action: () => void) => {
      if (at - (lastAttempt[key] ?? 0) < FAILSAFE_RETRY_MS) return;
      lastAttempt[key] = at;
      action();
    };

    const check = () => {
      const gs = gameStateRef.current;
      const g = groupLatestRef.current;
      if (gs.phase !== "duel" || gs.hpTimerStartedAt == null) return;
      const t = Date.now();

      if (gs.hpLazy && t >= gs.hpLazy.arrivesAt + graceMs) {
        attempt("lazy", t, () => completeLazyTransfer(g.id));
      }
      if (t >= hpZeroAt(gs) + graceMs) {
        attempt("boom", t, () => explodeHotPotato(g));
      }
    };

    check();
    const interval = setInterval(check, 200);
    return () => clearInterval(interval);
  }, [isHost, group.id]);

  // Pulse speed follows the mood — the bomb's only visible "heartbeat".
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: moodInfo.pulseMs,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: moodInfo.pulseMs,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulseAnim.setValue(1);
    };
  }, [mood]);

  // Mood change: fade the badge in and give a little buzz.
  const firstMoodRef = useRef(true);
  useEffect(() => {
    if (firstMoodRef.current) {
      firstMoodRef.current = false;
      return;
    }
    moodFade.setValue(0);
    Animated.timing(moodFade, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
    Vibration.vibrate([0, 80, 60, 80]);
  }, [mood]);

  // Buzz when the bomb lands in your hands.
  useEffect(() => {
    if (isHolder && !lazy) Vibration.vibrate(120);
  }, [gameState.currentHolderId]);

  const handlePass = async () => {
    if (!isHolder || acting || !opponent || lazy || outOfPasses) return;
    setActing(true);
    try {
      await hotPotatoPass(group, playerId, opponent.id);
    } finally {
      setActing(false);
    }
  };

  const passLabel = `${HP_PASS_MIN}–${HP_PASS_MAX} passes ${
    passMode === "each" ? "each" : "total"
  }`;
  const passCountLine =
    passMode === "each"
      ? `You've used ${hpPassesUsed(gameState, playerId)} · ${nameOf(
          opponent?.id,
        )} ${opponent ? hpPassesUsed(gameState, opponent.id) : 0}`
      : `${gameState.hpTotalPasses ?? 0} used between you`;

  const statusLine = lingeringWithMe
    ? "😴 You passed it… but it hasn't left your hands yet."
    : driftingToMe
      ? `😴 It's dragging its feet over from ${nameOf(lazy?.from)}…`
      : lazy
        ? `😴 ${nameOf(lazy.from)} passed it… it's taking its time.`
        : isHolder
          ? "YOU'RE HOLDING IT"
          : `${nameOf(gameState.currentHolderId)} is holding it`;

  return (
    <View style={styles.container}>
      <Text style={styles.banner}>🔥 HOT POTATO</Text>
      <Text style={styles.sub}>Final duel · no clock, no wires</Text>

      {/* Mood badge */}
      <Animated.View
        style={[
          styles.moodCard,
          { borderColor: moodInfo.color, opacity: moodFade },
        ]}
      >
        <Text style={styles.moodEmoji}>{moodInfo.emoji}</Text>
        <View style={styles.moodText}>
          <Text style={[styles.moodTitle, { color: moodInfo.color }]}>
            {moodInfo.title}
          </Text>
          <Text style={styles.moodLine}>{moodInfo.line}</Text>
        </View>
      </Animated.View>

      {/* The bomb */}
      <Animated.View
        style={[
          styles.bombCard,
          isHolder && styles.bombCardHolder,
          { transform: [{ scale: pulseAnim }] },
        ]}
      >
        <Text style={styles.bombEmoji}>💣</Text>
        <Text style={[styles.status, isHolder && !lazy && styles.statusHolder]}>
          {statusLine}
        </Text>
      </Animated.View>

      {napping && (
        <View style={styles.napBanner}>
          <Text style={styles.napText}>
            🥱 The bomb dozed off… the fuse has stopped.
          </Text>
        </View>
      )}

      {/* Pass budget */}
      <View style={styles.passInfo}>
        <Text style={styles.passRange}>{passLabel}</Text>
        <Text style={styles.passCount}>{passCountLine}</Text>
      </View>

      {/* Holder controls */}
      {isHolder && !lingeringWithMe ? (
        outOfPasses ? (
          <View style={styles.lockedBox}>
            <Text style={styles.lockedTitle}>🔒 No passes left</Text>
            <Text style={styles.lockedLine}>Hold on. And pray.</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.passBtn, acting && styles.passBtnDisabled]}
            onPress={handlePass}
            disabled={acting || !opponent}
          >
            <Text style={styles.passBtnText}>
              Pass to {opponent?.name ?? "opponent"} →
            </Text>
          </TouchableOpacity>
        )
      ) : !isHolder ? (
        <View style={styles.watchBox}>
          <Text style={styles.watchEmoji}>👀</Text>
          <Text style={styles.watchText}>Wait for it…</Text>
        </View>
      ) : null}

      <Text style={styles.footer}>
        ✂️ No wires this time. Holding bomb when it blows = straight to heaven.
        😇
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    padding: 24,
    paddingTop: 40,
  },
  banner: {
    color: "#FF4500",
    fontSize: 22,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  sub: { color: "#777", fontSize: 12, marginTop: 4, marginBottom: 18 },

  moodCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    backgroundColor: "#161616",
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 18,
  },
  moodEmoji: { fontSize: 34 },
  moodText: { flex: 1 },
  moodTitle: { fontSize: 15, fontWeight: "800" },
  moodLine: { color: "#999", fontSize: 12, marginTop: 2, lineHeight: 17 },

  bombCard: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#333",
    paddingVertical: 28,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  bombCardHolder: { borderColor: "#FF4500", backgroundColor: "#2A0A0A" },
  bombEmoji: { fontSize: 72, marginBottom: 10 },
  status: { color: "#aaa", fontSize: 14, textAlign: "center", lineHeight: 20 },
  statusHolder: {
    color: "#FF4500",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 2,
  },

  napBanner: {
    width: "100%",
    backgroundColor: "#1A1230",
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    alignItems: "center",
  },
  napText: { color: "#C9B8FF", fontSize: 13, fontWeight: "600" },

  passInfo: { alignItems: "center", marginBottom: 18 },
  passRange: { color: "#FFD700", fontSize: 14, fontWeight: "800" },
  passCount: { color: "#888", fontSize: 12, marginTop: 3 },

  passBtn: {
    width: "100%",
    backgroundColor: "#FF4500",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  passBtnDisabled: { opacity: 0.5 },
  passBtnText: { color: "#fff", fontSize: 17, fontWeight: "bold" },

  lockedBox: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E63946",
    paddingVertical: 16,
  },
  lockedTitle: { color: "#E63946", fontSize: 17, fontWeight: "900" },
  lockedLine: { color: "#999", fontSize: 13, marginTop: 4 },

  watchBox: { alignItems: "center", marginTop: 4 },
  watchEmoji: { fontSize: 48 },
  watchText: { color: "#888", fontSize: 13, marginTop: 6 },

  footer: {
    color: "#444",
    fontSize: 11,
    marginTop: "auto",
    marginBottom: 12,
    textAlign: "center",
  },
});
