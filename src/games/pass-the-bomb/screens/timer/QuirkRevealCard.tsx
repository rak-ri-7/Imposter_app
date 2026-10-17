// The mid-game "the bomb just changed" card, on every phone at once. The
// fuse is paused on the server for exactly as long as the card is up, so
// everyone gets to groan (or laugh) together. Also the Toxic boom screen.
import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, StyleSheet, Animated, Vibration } from "react-native";
import { Group, BombGameState, QuirkReveal } from "../../../../shared/types";
import {
  ALL_QUIRK_VARIANTS,
  QUIRK_INFO,
  QuirkVariant,
  QUIRK_REVEAL_MS,
  STRANGER_BITE_S,
  quirkStoryLine,
} from "../../logic/timer/bombQuirks";

type Props = { group: Group };

const ACCENT: Record<string, string> = {
  crush: "#FF5C93",
  stranger: "#FF9F1C",
  lazy: "#4FC3F7",
};

export default function QuirkRevealCard({ group }: Props) {
  const gameState = group.gameState as BombGameState;
  const reveal = gameState.quirkReveal;
  const [shownId, setShownId] = useState<string | null>(null);

  // Show each reveal once, until its end time (the server unpauses then too).
  useEffect(() => {
    if (!reveal || gameState.phase !== "playing") {
      setShownId(null);
      return;
    }
    // Phones' clocks differ a little: a fresh reveal always gets a decent
    // showing, but never longer than the real pause.
    const left = reveal.endsAt - Date.now();
    if (left < -5000) return; // an old one (e.g. rejoining mid-round)
    const showFor = Math.min(QUIRK_REVEAL_MS, Math.max(1500, left));
    setShownId(reveal.id);
    const t = setTimeout(() => setShownId(null), showFor);
    return () => clearTimeout(t);
  }, [reveal?.id, gameState.phase]);

  if (!reveal || shownId !== reveal.id) return null;
  return <Card reveal={reveal} group={group} />;
}

function Card({ reveal, group }: { reveal: QuirkReveal; group: Group }) {
  const gameState = group.gameState as BombGameState;
  const info = QUIRK_INFO[reveal.variant as QuirkVariant];
  const nameOf = (id?: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Someone";
  const scale = useRef(new Animated.Value(0.6)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Vibration.vibrate([0, 120, 80, 120, 80, 200]);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  if (!info) return null;
  const subject = nameOf(reveal.playerId);
  const d = reveal.detail ?? {};
  const story = quirkStoryLine(info.kind, subject, gameState.personalityName, d);

  let outcome: string | null = null;
  if (info.kind === "stranger") {
    if (d.fledTo) outcome = `…so it ran off to ${nameOf(d.fledTo)}! 🏃`;
    else if (d.panic) outcome = "…and it bit the fuse. Straight to panic! 😱";
    else if (reveal.variant === "gaslighter") outcome = "…and it bit the fuse. How hard? Nobody knows. 🌀";
    else outcome = `…and it bit ${d.bite ?? STRANGER_BITE_S}s off the fuse! 🦷`;
  } else if (info.kind === "lazy") {
    outcome = `${subject}'s pass is still on its way…`;
  }

  const accent = ACCENT[info.kind] ?? "#FFD700";
  const total = ALL_QUIRK_VARIANTS.length;

  return (
    <Modal transparent visible animationType="none">
      <View style={styles.backdrop}>
        <Animated.View
          style={[styles.card, { borderColor: accent, opacity: fade, transform: [{ scale }] }]}
        >
          <Text style={styles.paused}>⏸ FUSE PAUSED</Text>
          <Text style={styles.story}>{story}</Text>
          {outcome && <Text style={[styles.outcome, { color: accent }]}>{outcome}</Text>}
          <Text style={styles.nowThe}>It's now the</Text>
          <Text style={styles.emoji}>{info.emoji}</Text>
          <Text style={[styles.name, { color: accent }]}>{info.name}</Text>
          <Text style={styles.hint}>"{info.hint}"</Text>
          <Text style={[styles.collection, reveal.isNew && styles.collectionNew]}>
            {reveal.isNew
              ? `🆕 NEW DISCOVERY · ${reveal.found}/${total}`
              : `📖 Bomb Collection · ${reveal.found}/${total}`}
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

// The Toxic Bomb snapped on an impatient tap.
export function ToxicBoomScreen({ group }: Props) {
  const gameState = group.gameState as BombGameState;
  const name =
    group.players.find((p) => p.id === gameState.currentHolderId)?.name ?? "Someone";
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Vibration.vibrate([0, 400, 100, 400]);
    Animated.loop(
      Animated.sequence([
        Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
      ]),
      { iterations: 8 },
    ).start();
  }, []);
  return (
    <View style={styles.toxicWrap}>
      <Animated.Text style={[styles.toxicEmoji, { transform: [{ translateX: shake }] }]}>
        ☠️💥
      </Animated.Text>
      <Text style={styles.toxicTitle}>THE TOXIC BOMB SNAPPED</Text>
      <Text style={styles.toxicLine}>
        {name} kept poking it. It blew up right in their hands.
      </Text>
      <Text style={styles.toxicHint}>"It hates being rushed."</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    backgroundColor: "#141414",
    borderRadius: 22,
    borderWidth: 3,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 8,
  },
  paused: { color: "#777", fontSize: 11, letterSpacing: 3, fontWeight: "800" },
  story: { color: "#fff", fontSize: 17, lineHeight: 24, textAlign: "center", fontWeight: "600" },
  outcome: { fontSize: 16, lineHeight: 22, textAlign: "center", fontWeight: "800" },
  nowThe: { color: "#999", fontSize: 13, marginTop: 8, letterSpacing: 1 },
  emoji: { fontSize: 64 },
  name: { fontSize: 28, fontWeight: "900", letterSpacing: 1.5, textAlign: "center" },
  hint: { color: "#ccc", fontSize: 15, fontStyle: "italic", textAlign: "center", marginTop: 4 },
  collection: { color: "#888", fontSize: 12, fontWeight: "700", marginTop: 10, letterSpacing: 1 },
  collectionNew: { color: "#FFD700" },
  toxicWrap: {
    flex: 1,
    backgroundColor: "#140008",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  toxicEmoji: { fontSize: 80 },
  toxicTitle: { color: "#B6FF3B", fontSize: 26, fontWeight: "900", textAlign: "center", letterSpacing: 1 },
  toxicLine: { color: "#fff", fontSize: 17, textAlign: "center", lineHeight: 24 },
  toxicHint: { color: "#999", fontSize: 14, fontStyle: "italic" },
});
