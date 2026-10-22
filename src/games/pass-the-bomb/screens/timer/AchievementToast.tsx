// "🏅 Ravi unlocked BOMB WHISPERER" — a banner on every phone, one unlock
// at a time. Doesn't pause anything. The host also records first-ever
// unlocks in the group's collection.
import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Vibration } from "react-native";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../../shared/firebase/config";
import { Group, BombGameState, AchievementUnlock } from "../../../../shared/types";
import { ACHIEVEMENTS, AchievementId, rewardText } from "../../data/achievements";

type Props = { group: Group; playerId: string };
const SHOW_MS = 3200;

export default function AchievementToast({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const feed = gameState.achFeed ?? [];
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<AchievementUnlock[]>([]);
  const [current, setCurrent] = useState<AchievementUnlock | null>(null);
  const slide = useRef(new Animated.Value(-120)).current;

  // New unlocks join the queue (whatever was already there on arrival is old news).
  const feedKey = feed.map((f) => f.id).join(",");
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(feed.map((f) => f.id));
      return;
    }
    const fresh = feed.filter((f) => !seen.current!.has(f.id));
    if (fresh.length === 0) return;
    fresh.forEach((f) => seen.current!.add(f.id));
    setQueue((q) => [...q, ...fresh]);
  }, [feedKey]);

  // Host: remember first-ever finds for the Bomb Collection.
  const isHost = group.hostId === playerId;
  useEffect(() => {
    if (!isHost) return;
    const updates: Record<string, unknown> = {};
    for (const f of feed) {
      if (!group.achievementCollection?.[f.achievement]) {
        updates[`achievementCollection.${f.achievement}`] = {
          foundAt: Date.now(),
          foundBy: f.playerId,
        };
      }
    }
    if (Object.keys(updates).length > 0) {
      updateDoc(doc(db, "groups", group.id), updates).catch(() => {});
    }
  }, [feedKey, isHost]);

  // Play the queue one at a time.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    if (next.playerId === playerId) Vibration.vibrate([0, 80, 60, 160]);
    slide.setValue(-120);
    Animated.spring(slide, { toValue: 0, friction: 6, useNativeDriver: true }).start();
  }, [queue, current]);

  // Hide each banner after SHOW_MS. Kept separate from the effect above:
  // there, showing a banner changes `queue`/`current`, which re-ran it and
  // its cleanup cancelled the hide timer, so the banner never left.
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      Animated.timing(slide, { toValue: -160, duration: 220, useNativeDriver: true }).start(() =>
        setCurrent(null)
      );
    }, SHOW_MS);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;
  const a = ACHIEVEMENTS[current.achievement as AchievementId];
  if (!a) return null;
  const who =
    current.playerId === playerId
      ? "You"
      : group.players.find((p) => p.id === current.playerId)?.name ?? "Someone";
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { transform: [{ translateY: slide }] }]}>
      <View style={[styles.card, current.playerId === playerId && styles.mine]}>
        <Text style={styles.emoji}>{a.emoji}</Text>
        <View style={styles.text}>
          <Text style={styles.title}>
            🏅 {who} unlocked {a.name}
          </Text>
          <Text style={styles.sub}>
            {a.how} {rewardText(a, current.gotLife)}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 52, left: 12, right: 12, zIndex: 50 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1E1A0A",
    borderWidth: 2,
    borderColor: "#FFD700",
    borderRadius: 14,
    padding: 12,
    elevation: 8,
  },
  mine: { backgroundColor: "#2A2306" },
  emoji: { fontSize: 30 },
  text: { flex: 1 },
  title: { color: "#FFD700", fontSize: 14, fontWeight: "900" },
  sub: { color: "#ddd", fontSize: 12, marginTop: 2 },
});
