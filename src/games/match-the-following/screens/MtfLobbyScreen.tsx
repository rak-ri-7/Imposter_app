// Host picks how many rounds and how spicy the situations get.
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import type { Group, MtfDeck } from "../../../shared/types";
import { DEFAULT_ROUNDS, MAX_CHARS, MIN_PLAYERS, ROUND_OPTIONS } from "../logic/engine";
import { startMtf } from "../logic/game";
import Paper from "../components/Paper";
import { HAND, MF } from "../theme";
import HowToPlay from "../../../shared/components/HowToPlay";

type Props = { group: Group; playerId: string };

const DECKS: { id: MtfDeck; title: string; sub: string }[] = [
  { id: "wholesome", title: "😇 Wholesome", sub: "Safe for everyone, family included" },
  { id: "cheeky", title: "😏 Cheeky", sub: "Friends and colleagues (plus the wholesome ones)" },
  { id: "tricky", title: "🧠 Tricky", sub: "Only real dilemmas: no easy answers, hardest to match" },
];

const RULES = [
  "Everyone gets the same situation: \"Your boss calls you on a Sunday. You…\"",
  `Type how you'd really react (max ${MAX_CHARS} characters, 60 seconds). Spelling, emojis and style all count: they're clues. Stuck? You can ask for quick answers, but they're easy to spot.`,
  "Then match the following: draw a line from every name to the answer you think they wrote. Tap a name, then an answer. Every line must be drawn before you lock in.",
  "The reveal: each answer, who everyone joined it to, and who really wrote it.",
  "A point for every right line. Two answers that are exactly the same: either line counts.",
  "🏆 Most points wins: 10 pts, 2nd 5 pts, everyone else 2. Plus 🎭 Poker Face (fooled the most) and 📖 Open Book (easiest to read).",
];

export default function MtfLobbyScreen({ group, playerId }: Props) {
  const isHost = group.hostId === playerId;
  const [rounds, setRounds] = useState<number>(DEFAULT_ROUNDS);
  const [deck, setDeck] = useState<MtfDeck>("wholesome");
  const [starting, setStarting] = useState(false);
  const enough = group.players.length >= MIN_PLAYERS;

  const start = async () => {
    if (starting) return;
    if (!enough) return Alert.alert(`Needs at least ${MIN_PLAYERS} players`);
    setStarting(true);
    try {
      await startMtf(group, rounds, deck);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Paper
      kicker={`${group.players.length} players`}
      footer={
        isHost ? (
          <TouchableOpacity style={[styles.startBtn, (!enough || starting) && styles.dim]} onPress={start} disabled={starting}>
            <Text style={styles.startText}>{!enough ? `Needs ${MIN_PLAYERS}+ players` : starting ? "Handing out papers…" : "Start the exam ✏️"}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.waiting}>Waiting for the host…</Text>
        )
      }
    >
      <Text style={styles.title}>Match the Following</Text>
      <HowToPlay game="match-the-following" details={RULES} theme={{ text: MF.pencil, muted: MF.muted, accent: MF.ink, sheet: MF.paper, panel: MF.card, sheetText: MF.pencil, sheetMuted: MF.muted, numberText: "#FFFFFF" }} />

      <Text style={styles.label}>ROUNDS</Text>
      <View style={styles.row}>
        {ROUND_OPTIONS.map((n) => {
          const on = rounds === n;
          return (
            <TouchableOpacity key={n} style={[styles.tile, on && styles.tileOn]} onPress={() => isHost && setRounds(n)} disabled={!isHost}>
              <Text style={[styles.tileBig, on && styles.on]}>{n}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>SITUATIONS</Text>
      <View style={{ gap: 8 }}>
        {DECKS.map((s) => {
          const on = deck === s.id;
          return (
            <TouchableOpacity key={s.id} style={[styles.spice, on && styles.tileOn]} onPress={() => isHost && setDeck(s.id)} disabled={!isHost}>
              <Text style={[styles.spiceTitle, on && styles.on]}>{s.title}</Text>
              <Text style={styles.spiceSub}>{s.sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

    </Paper>
  );
}

const styles = StyleSheet.create({
  title: { color: MF.ink, fontSize: 32, fontWeight: "900", fontFamily: HAND },
  sub: { color: MF.muted, fontSize: 15 },
  label: { color: MF.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginTop: 8 },
  row: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, backgroundColor: MF.card, borderRadius: 12, borderWidth: 2, borderColor: MF.cardLine, paddingVertical: 12, alignItems: "center" },
  tileOn: { borderColor: MF.ink, backgroundColor: "#EEF2FF" },
  tileBig: { color: MF.pencil, fontSize: 20, fontWeight: "900" },
  on: { color: MF.ink },
  spice: { backgroundColor: MF.card, borderRadius: 12, borderWidth: 2, borderColor: MF.cardLine, padding: 12 },
  spiceTitle: { color: MF.pencil, fontSize: 16, fontWeight: "900" },
  spiceSub: { color: MF.muted, fontSize: 12, marginTop: 2 },
  note: { color: MF.faint, fontSize: 12 },
  rule: { color: MF.pencil, fontSize: 14, lineHeight: 20 },
  startBtn: { backgroundColor: MF.ink, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  startText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  waiting: { color: MF.muted, textAlign: "center", paddingVertical: 8 },
  dim: { opacity: 0.45 },
});
