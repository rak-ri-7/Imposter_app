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
  hpIsLive,
  hpIsNapping,
  hpHolder,
  hpNextInOrder,
  hpPassesUsed,
  hpOutOfPasses,
  HpMood,
} from "../logic/hotPotatoDuel";
import { FAILSAFE_GRACE_MS, FAILSAFE_RETRY_MS } from "../logic/game";

type Props = {
  group: Group;
  playerId: string;
  title?: string;
  subtitle?: string;
  watchText?: string; // shown to non-players instead of the default line
};

const MOODS: Record<
  HpMood,
  { emoji: string; title: string; line: string; color: string; pulseMs: number }
> = {
  neutral: {
    emoji: "😐",
    title: "Watching you",
    line: "The bomb is sizing everyone up.",
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

export default function BombHotPotatoScreen({
  group,
  playerId,
  title = "🔥 HOT POTATO",
  subtitle = "Final duel · no clock, no wires",
  watchText,
}: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const nameOf = (id?: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Someone";

  const players = gameState.hpPlayers ?? [];
  const holderId = hpHolder(gameState);
  const isPlayer = players.includes(playerId);
  const isHolder = holderId === playerId;
  // Passes always go to the next player in the fixed order.
  const nextId = hpNextInOrder(gameState, playerId);

  const mood = (gameState.hpMood ?? "neutral") as HpMood;
  const moodInfo = MOODS[mood];
  const lazy = gameState.hpLazy;
  const lingeringWithMe = isHolder && lazy?.from === playerId;
  const driftingToMe = lazy?.to === playerId;
  const outOfPasses = hpOutOfPasses(gameState, playerId);
  const passMode = gameState.hpPassMode ?? "each";

  const [acting, setActing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [moodFade] = useState(() => new Animated.Value(1));
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  };

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  // Latest snapshot for the watchdog, without restarting its interval.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const groupLatestRef = useRef(group);
  groupLatestRef.current = group;

  // Local clock, only while a nap is scheduled or happening — drives the
  // nap banner without re-rendering every 250ms all fuse long.
  useEffect(() => {
    const nap = gameState.hpNap;
    if (!nap || Date.now() >= nap.until) return;
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= nap.until) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [gameState.hpNap?.from, gameState.hpNap?.until]);
  const napping = hpIsNapping(gameState, now);

  // ── Watchdog — every phone. Detonates the bomb and lands lazy passes.
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
      if (!hpIsLive(gs)) return;
      const t = Date.now();

      if (t >= hpZeroAt(gs) + graceMs) {
        attempt("boom", t, () => explodeHotPotato(g));
        return; // fuse is out — never land a lazy pass in the same tick
      }
      if (gs.hpLazy && t >= gs.hpLazy.arrivesAt + graceMs) {
        attempt("lazy", t, () => completeLazyTransfer(g.id));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);

  // Buzz when the bomb lands in your hands.
  useEffect(() => {
    if (isHolder && !lazy) Vibration.vibrate(120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holderId]);

  const handlePass = async () => {
    if (!isHolder || acting || lazy || outOfPasses || !nextId) return;
    setActing(true);
    try {
      const result = await hotPotatoPass(group, playerId);
      if (!result.success) {
        Vibration.vibrate([0, 60, 40, 60]);
        showToast(
          result.reason === "no-passes"
            ? "🔒 No passes left — you're holding it."
            : result.reason === "in-transit"
              ? "😴 It's still dragging its feet…"
              : "💥 Too late — that pass didn't go through!",
        );
      }
    } finally {
      setActing(false);
    }
  };

  const passLabel = `${gameState.hpPassMin ?? 4}–${gameState.hpPassMax ?? 7} passes ${
    passMode === "each" ? "each" : "total"
  }`;
  const passCountLine =
    passMode === "total"
      ? `${gameState.hpTotalPasses ?? 0} used between you`
      : !isPlayer
        ? `${gameState.hpTotalPasses ?? 0} passes so far`
        : players.length === 2 && nextId
          ? `You've used ${hpPassesUsed(gameState, playerId)} · ${nameOf(
              nextId,
            )} ${hpPassesUsed(gameState, nextId)}`
          : `You've used ${hpPassesUsed(gameState, playerId)}`;

  const statusLine = lingeringWithMe
    ? "😴 You passed it… but it hasn't left your hands yet."
    : driftingToMe
      ? `😴 It's dragging its feet over from ${nameOf(lazy?.from)}…`
      : lazy
        ? `😴 ${nameOf(lazy.from)} passed it to ${nameOf(lazy.to)}… it's taking its time.`
        : isHolder
          ? "YOU'RE HOLDING IT"
          : `${nameOf(holderId)} is holding it`;

  const canPass = isHolder && !lingeringWithMe && !outOfPasses;

  return (
    <View style={styles.container}>
      <Text style={styles.banner}>{title}</Text>
      <Text style={styles.sub}>{subtitle}</Text>

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

      {/* Pass order — only worth showing in a group */}
      {players.length > 2 && (
        <View style={styles.orderBox}>
          <Text style={styles.orderLabel}>PASS ORDER</Text>
          <View style={styles.playerRow}>
            {players.map((id, i) => (
              <View key={id} style={styles.orderItem}>
                <View
                  style={[styles.chip, id === holderId && styles.chipHolder]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      id === holderId && styles.chipTextHolder,
                    ]}
                  >
                    {id === holderId ? "💣 " : ""}
                    {nameOf(id)}
                    {id === playerId ? " (you)" : ""}
                  </Text>
                </View>
                <Text style={styles.orderArrow}>
                  {i < players.length - 1 ? "→" : "↺"}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

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
      {isHolder && !lingeringWithMe && outOfPasses ? (
        <View style={styles.lockedBox}>
          <Text style={styles.lockedTitle}>🔒 No passes left</Text>
          <Text style={styles.lockedLine}>Hold on. And pray.</Text>
        </View>
      ) : canPass && nextId ? (
        <TouchableOpacity
          style={[styles.passBtn, acting && styles.passBtnDisabled]}
          onPress={handlePass}
          disabled={acting}
        >
          <Text style={styles.passBtnText}>Pass to {nameOf(nextId)} →</Text>
        </TouchableOpacity>
      ) : !isHolder ? (
        <View style={styles.watchBox}>
          <Text style={styles.watchEmoji}>👀</Text>
          <Text style={styles.watchText}>
            {isPlayer
              ? "Wait for it…"
              : (watchText ?? "Watching from a safe distance…")}
          </Text>
        </View>
      ) : null}

      {toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Text style={styles.footer}>
        ✂️ No wires. Holding it when it blows = straight to heaven. 😇
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
    textAlign: "center",
  },
  sub: {
    color: "#777",
    fontSize: 12,
    marginTop: 4,
    marginBottom: 18,
    textAlign: "center",
  },

  moodCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    backgroundColor: "#161616",
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 14,
  },
  moodEmoji: { fontSize: 34 },
  moodText: { flex: 1 },
  moodTitle: { fontSize: 15, fontWeight: "800" },
  moodLine: { color: "#999", fontSize: 12, marginTop: 2, lineHeight: 17 },

  orderBox: { width: "100%", alignItems: "center", marginBottom: 14 },
  orderLabel: {
    color: "#777",
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  playerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    rowGap: 8,
  },
  orderItem: { flexDirection: "row", alignItems: "center" },
  orderArrow: { color: "#555", fontSize: 14, marginHorizontal: 6 },
  chip: {
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#333",
  },
  chipHolder: { borderColor: "#FF4500", backgroundColor: "#2A0A0A" },
  chipText: { color: "#999", fontSize: 12 },
  chipTextHolder: { color: "#FF4500", fontWeight: "800" },

  bombCard: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#333",
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  bombCardHolder: { borderColor: "#FF4500", backgroundColor: "#2A0A0A" },
  bombEmoji: { fontSize: 64, marginBottom: 10 },
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

  passInfo: { alignItems: "center", marginBottom: 16 },
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

  toast: {
    position: "absolute",
    top: 12,
    left: 16,
    right: 16,
    backgroundColor: "rgba(26,26,26,0.96)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
    paddingVertical: 10,
    paddingHorizontal: 14,
    zIndex: 20,
  },
  toastText: {
    color: "#FFD700",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },

  footer: {
    color: "#444",
    fontSize: 11,
    marginTop: "auto",
    marginBottom: 12,
    textAlign: "center",
  },
});
