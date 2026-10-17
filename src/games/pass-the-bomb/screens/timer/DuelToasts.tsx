// Full-screen cards on the duel screen: the duel announcement, then (for
// Hot Potato) what makes the bomb angry or lazy. Tap to continue; each one
// also closes by itself so nobody gets stuck behind it.
import { useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
} from "react-native";

const hearts = (n: number) => "❤️".repeat(Math.max(0, n)) + "🖤".repeat(Math.max(0, 3 - n));

function ToastShell({
  onClose,
  autoMs,
  accent,
  children,
}: {
  onClose: () => void;
  autoMs: number;
  accent: string;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Vibration.vibrate([0, 90, 60, 90]);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(onClose, autoMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.card,
            { borderColor: accent, opacity: fade, transform: [{ scale }] },
          ]}
        >
          {children}
          <Text style={styles.tap}>Tap to continue</Text>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

type Duellist = { id: string; name: string; lives: number };

export function DuelAnnounceToast({
  round,
  duellists,
  viewerId,
  onClose,
}: {
  round: number;
  duellists: Duellist[];
  viewerId: string;
  onClose: () => void;
}) {
  const [a, b] = duellists;
  const isDuellist = duellists.some((d) => d.id === viewerId);
  const first = round <= 1;
  return (
    <ToastShell onClose={onClose} autoMs={first ? 7000 : 4500} accent="#FF4500">
      <Text style={styles.kicker}>{first ? "THE LAST TWO STANDING" : `DUEL · ROUND ${round}`}</Text>
      <Text style={styles.bigTitle}>⚔️ FINAL DUEL ⚔️</Text>
      <View style={styles.versus}>
        <View style={styles.side}>
          <Text style={styles.name}>{a?.name ?? "?"}</Text>
          <Text style={styles.hearts}>{hearts(a?.lives ?? 0)}</Text>
        </View>
        <Text style={styles.vs}>VS</Text>
        <View style={styles.side}>
          <Text style={styles.name}>{b?.name ?? "?"}</Text>
          <Text style={styles.hearts}>{hearts(b?.lives ?? 0)}</Text>
        </View>
      </View>
      {first ? (
        <>
          <Text style={styles.body}>
            {isDuellist
              ? "You survived the chaos, the wires and the backstabbing. 👑 Respect. Now it's one-on-one until somebody runs out of lives."
              : `${a?.name} and ${b?.name} survived the chaos. 👑 Now it's one-on-one until somebody runs out of lives.`}
          </Text>
          <Text style={styles.spectate}>
            👻 Everyone else: pull up a chair. Bet your FP on who loses each
            round, or sit tight. Every 5 FP you still hold at the end becomes 1
            leaderboard point.
          </Text>
        </>
      ) : (
        <Text style={styles.body}>
          Still standing. Still sweating. 🥵 {isDuellist ? "" : "Bets are open for this round."}
        </Text>
      )}
    </ToastShell>
  );
}

export function HotPotatoMoodsToast({ onClose }: { onClose: () => void }) {
  return (
    <ToastShell onClose={onClose} autoMs={11000} accent="#FFD700">
      <Text style={styles.kicker}>🔥 HOT POTATO</Text>
      <Text style={styles.bigTitle}>Meet the moods</Text>
      <Text style={styles.body}>
        This bomb has feelings. How you pass decides what it does next.
      </Text>
      <View style={[styles.mood, { borderColor: "#FF4500" }]}>
        <Text style={[styles.moodTitle, { color: "#FF4500" }]}>😠 ANGRY BOMB</Text>
        <Text style={styles.moodLine}>
          Pass it too fast and it gets mad. Quick back-and-forth makes the
          hidden fuse burn faster and faster, up to 2.5× speed. Rushing it
          brings the boom closer.
        </Text>
      </View>
      <View style={[styles.mood, { borderColor: "#4FC3F7" }]}>
        <Text style={[styles.moodTitle, { color: "#4FC3F7" }]}>😴 LAZY BOMB</Text>
        <Text style={styles.moodLine}>
          Hog it for 6+ seconds and it gets lazy. Your next pass takes 1–4
          seconds to actually leave your hands. If it blows while it's still
          dragging its feet, it blows on YOU.
        </Text>
      </View>
      <Text style={styles.footnote}>
        🥱 Same rhythm every pass? It might get bored and nap, and the fuse
        pauses for a few seconds.
      </Text>
    </ToastShell>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    backgroundColor: "#141414",
    borderRadius: 20,
    borderWidth: 2,
    padding: 22,
    gap: 12,
    alignItems: "center",
  },
  kicker: { color: "#888", fontSize: 11, letterSpacing: 3, fontWeight: "800" },
  bigTitle: {
    color: "#FF4500",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1,
    textAlign: "center",
  },
  versus: { flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 4 },
  side: { alignItems: "center", flex: 1 },
  name: { color: "#fff", fontSize: 20, fontWeight: "800", textAlign: "center" },
  hearts: { fontSize: 16, marginTop: 4 },
  vs: { color: "#FFD700", fontSize: 22, fontWeight: "900" },
  body: { color: "#ddd", fontSize: 15, lineHeight: 22, textAlign: "center" },
  spectate: {
    color: "#B9A8FF",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    backgroundColor: "#1A1528",
    padding: 12,
    borderRadius: 12,
  },
  mood: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#1A1A1A",
    gap: 4,
  },
  moodTitle: { fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  moodLine: { color: "#ddd", fontSize: 14, lineHeight: 20 },
  footnote: { color: "#999", fontSize: 12, textAlign: "center" },
  tap: { color: "#666", fontSize: 12, marginTop: 4 },
});
