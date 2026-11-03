// Host picks the deck, how many hands, and the mode (Dealer's choice / Draw / Scratch).
import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from "react-native";
import type { Group, HoldemGameState } from "../../../shared/types";
import { DECKS } from "../../card-clash/data/decks";
import type { ClashDeckId } from "../../card-clash/data/types";
import { BIG_BLIND, DEFAULT_HANDS, HAND_OPTIONS, SMALL_BLIND, START_CHIPS } from "../logic/engine";
import { startHoldem } from "../logic/game";
import { CC, SERIF } from "../../card-clash/theme";

type Props = { group: Group; playerId: string };

const MODES: { id: HoldemGameState["modeSetting"]; title: string; sub: string }[] = [
  { id: "choice", title: "🎩 Dealer's choice", sub: "Each hand the dealer picks Draw or Scratch" },
  { id: "draw", title: "🎴 Draw", sub: "Stats get replaced · best of 3 wins" },
  { id: "scratch", title: "✂️ Scratch", sub: "Stats get struck · last one decides" },
];

const RULES = [
  `Everyone starts with ${START_CHIPS} chips. Each hand you get ONE secret card. Blinds: ${SMALL_BLIND} / ${BIG_BLIND}, posted by the two seats left of the 🎩 dealer (with 2 players, the dealer posts the small one).`,
  "🎩 The dealer moves round the table. In Dealer's choice, they look at their card and pick the mode for the hand: 🎴 Draw or ✂️ Scratch.",
  "Pre-flop: bet on your card alone, before any stat is shown. Flop: 3 stats are shown. Bet. Turn: Draw replaces one stat with a new one, Scratch strikes one. Bet. River: same again. Final bets.",
  `No-limit betting, like Texas Hold'em: check, call, raise or fold. The smallest bet is ${BIG_BLIND}; a raise must be at least as big as the last one (facing ${BIG_BLIND}, raise to ${BIG_BLIND * 2}+). Go all-in any time.`,
  "Your card shows where it ranks on each live stat (Top X%). Everyone else's card is hidden.",
  "🎴 Draw showdown: each of the 3 stats gives a 👑 to its highest number. Most 👑 wins.",
  "✂️ Scratch showdown: highest number on the one stat left wins.",
  "🔥 A tie flips a sudden-death stat until someone's ahead (or the pot is split).",
  "Everyone else folds? You win without showing your card.",
  "After the last hand, most chips wins. Run out and you watch the rest.",
  "🏆 Winner: 6 pts (2 players) or 10 pts (3+). After 5+ hands everyone scores: 5 for 2nd, 2 for the rest.",
];

export default function HoldemLobbyScreen({ group, playerId }: Props) {
  const isHost = group.hostId === playerId;
  const [deck, setDeck] = useState<ClashDeckId>("countries");
  const [hands, setHands] = useState<number>(DEFAULT_HANDS);
  const [mode, setMode] = useState<HoldemGameState["modeSetting"]>("choice");
  const [starting, setStarting] = useState(false);

  const start = async () => {
    if (starting) return;
    if (group.players.length < 2) return Alert.alert("Needs at least 2 players");
    setStarting(true);
    try {
      await startHoldem(group, deck, hands, mode);
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>💰 Clash Hold'em</Text>
      <Text style={styles.sub}>{group.players.length} players · {START_CHIPS} chips each</Text>

      <Text style={styles.label}>DECK</Text>
      <View style={styles.row}>
        {(Object.keys(DECKS) as ClashDeckId[]).map((id) => {
          const on = deck === id;
          return (
            <TouchableOpacity key={id} style={[styles.tile, on && styles.tileOn]} onPress={() => isHost && setDeck(id)} disabled={!isHost}>
              <Text style={styles.tileEmoji}>{DECKS[id].emoji}</Text>
              <Text style={[styles.tileTitle, on && styles.on]}>{DECKS[id].name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>HANDS</Text>
      <View style={styles.row}>
        {HAND_OPTIONS.map((n) => {
          const on = hands === n;
          return (
            <TouchableOpacity key={n} style={[styles.tile, on && styles.tileOn]} onPress={() => isHost && setHands(n)} disabled={!isHost}>
              <Text style={[styles.tileBig, on && styles.on]}>{n}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>MODE</Text>
      <View style={styles.col}>
        {MODES.map((m) => {
          const on = mode === m.id;
          return (
            <TouchableOpacity key={m.id} style={[styles.modeBtn, on && styles.tileOn]} onPress={() => isHost && setMode(m.id)} disabled={!isHost}>
              <Text style={[styles.tileTitle, on && styles.on]}>{m.title}</Text>
              <Text style={styles.modeSub}>{m.sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>HOW IT WORKS</Text>
      <View style={styles.rules}>
        {RULES.map((r, i) => (
          <Text key={i} style={styles.rule}>
            • {r}
          </Text>
        ))}
      </View>

      {isHost ? (
        <TouchableOpacity style={[styles.startBtn, starting && styles.dim]} onPress={start} disabled={starting}>
          <Text style={styles.startText}>{starting ? "Dealing…" : "Deal the first hand"}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.waiting}>Waiting for the host to set up the table…</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CC.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { color: CC.gold, fontSize: 30, fontWeight: "900", textAlign: "center", fontFamily: SERIF, letterSpacing: 1.5 },
  sub: { color: CC.textMuted, textAlign: "center", marginTop: 4 },
  label: { color: CC.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginTop: 22, marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  col: { gap: 8 },
  tile: { flex: 1, backgroundColor: CC.panel, borderRadius: 12, borderWidth: 2, borderColor: CC.line, paddingVertical: 12, alignItems: "center" },
  tileOn: { borderColor: CC.gold },
  tileEmoji: { fontSize: 28 },
  tileTitle: { color: CC.text, fontSize: 15, fontWeight: "900" },
  tileBig: { color: CC.text, fontSize: 20, fontWeight: "900" },
  on: { color: CC.gold },
  modeBtn: { backgroundColor: CC.panel, borderRadius: 12, borderWidth: 2, borderColor: CC.line, padding: 12 },
  modeSub: { color: CC.textMuted, fontSize: 12, marginTop: 2 },
  rules: { backgroundColor: CC.panel, borderRadius: 14, padding: 14, gap: 6 },
  rule: { color: CC.text, fontSize: 13, lineHeight: 19 },
  startBtn: { marginTop: 24, backgroundColor: CC.gold, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  startText: { color: "#000", fontSize: 18, fontWeight: "900" },
  waiting: { color: CC.textMuted, textAlign: "center", marginTop: 24 },
  dim: { opacity: 0.4 },
});
