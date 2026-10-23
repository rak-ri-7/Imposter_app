// Host picks the deck and how many cards each player gets.
import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from "react-native";
import type { Group } from "../../../shared/types";
import { DECKS, DECK_CARDS, cardById } from "../data/decks";
import { MiniCard } from "../components/ClashCardView";
import CardBack from "../components/CardBack";
import type { ClashDeckId } from "../data/types";
import { DEFAULT_HAND, HAND_SIZES, startCardClash } from "../logic/game";
import { CC, SERIF } from "../theme";

// A showcase card for each deck tile.
const SHOWCASE: Record<ClashDeckId, { id: string; stat: string; value: string }> = {
  countries: { id: "c-np", stat: "⛰️ Highest point", value: "8,849 m" },
  animals: { id: "a-cheetah", stat: "⚡ Top speed", value: "112 km/h" },
};

type Props = { group: Group; playerId: string };

const RULES = [
  "Everyone gets a pile of cards. You only ever see your own top card.",
  "The caller picks one stat from their card and hits CLASH!. Everyone sees the call and their own number, then taps CLASH! when ready. Then all the cards flip.",
  "Highest number wins every card in the clash. The winner calls next.",
  "✏️ Scratch-off: a stat you call is crossed off for you. Once you've called all 10, they all come back. Calling from a ★ gold card skips this: every stat is open.",
  "A tie at the top? A ★ gold card wins it. Otherwise 🎲 the die picks the winner.",
  "★ Everyone starts with one GOLD card. Beat a gold card with a normal one and it gets a ⚡ Gold Defence: its owner picks a new stat and you must win again. Win twice and the gold moves to your card.",
  "Lifelines, once a game each: ⏭️ Skip sends your top card to the bottom of your pile (anyone, before the call). 🔍 Hint, on your call, shows each opponent's continent (countries) or animal group.",
  "In a clash with a gold card, the other cards stay hidden: only the called number shows.",
  "🃏 Once a game, on your call, play your Wildcard: a surprise hidden stat.",
  "Run out of cards and you're out. Last one standing wins.",
  "🏆 Winner: 6 pts (2 players) or 10 pts (3+). Reach 10 clashes and everyone else scores too: 5 for the runner-up, 2 for the rest.",
  "The caller has 30 seconds: pick a stat, then hit CLASH! Too slow and your pick (or a random stat) is called.",
  "🎁 Called 3 in a row? You can pass the call: to the other player, or with more, to a 🎲 roll among the rest.",
];

export default function ClashLobbyScreen({ group, playerId }: Props) {
  const isHost = group.hostId === playerId;
  const [deck, setDeck] = useState<ClashDeckId>("countries");
  const [hand, setHand] = useState<number>(DEFAULT_HAND);
  const [starting, setStarting] = useState(false);
  const maxHand = Math.floor(DECK_CARDS[deck].length / Math.max(1, group.players.length));

  const start = async () => {
    if (starting) return;
    if (group.players.length < 2) return Alert.alert("Needs at least 2 players");
    setStarting(true);
    try {
      await startCardClash(group, deck, hand);
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🃏 Clash Cards</Text>
      <Text style={styles.sub}>{group.players.length} players</Text>

      <Text style={styles.label}>DECK</Text>
      <View style={styles.row}>
        {(Object.keys(DECKS) as ClashDeckId[]).map((id) => {
          const d = DECKS[id];
          const on = deck === id;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.deckTile, on && styles.deckTileOn]}
              onPress={() => isHost && setDeck(id)}
              disabled={!isHost}
              activeOpacity={0.7}
            >
              <View style={styles.fan}>
                <View style={styles.fanBack}>
                  <CardBack width={86} height={124} />
                </View>
                {cardById(SHOWCASE[id].id) && (
                  <MiniCard
                    card={cardById(SHOWCASE[id].id)!}
                    deck={id}
                    width={96}
                    gold={id === "countries"}
                    label={SHOWCASE[id].stat}
                    value={SHOWCASE[id].value}
                  />
                )}
              </View>
              <Text style={[styles.deckName, on && styles.deckNameOn]}>{d.name}</Text>
              <Text style={styles.deckBlurb}>{d.blurb}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>CARDS EACH</Text>
      <View style={styles.row}>
        {HAND_SIZES.map((n) => {
          const on = hand === n;
          const tooMany = n > maxHand;
          return (
            <TouchableOpacity
              key={n}
              style={[styles.handBtn, on && styles.handBtnOn, tooMany && styles.dim]}
              onPress={() => isHost && !tooMany && setHand(n)}
              disabled={!isHost || tooMany}
            >
              <Text style={[styles.handText, on && styles.handTextOn]}>{n}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>More cards = a longer game.</Text>

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
          <Text style={styles.startText}>{starting ? "Dealing…" : "Deal the cards"}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.waiting}>Waiting for the host to pick a deck and deal…</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CC.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { color: CC.gold, fontSize: 32, fontWeight: "900", textAlign: "center", fontFamily: SERIF, letterSpacing: 2 },
  sub: { color: CC.textMuted, textAlign: "center", marginTop: 4 },
  label: { color: CC.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginTop: 22, marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  deckTile: {
    flex: 1,
    backgroundColor: CC.panel,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: CC.line,
    padding: 14,
    alignItems: "center",
  },
  deckTileOn: { borderColor: CC.gold, backgroundColor: "#1B4440" },
  fan: { height: 150, width: 130, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  fanBack: { position: "absolute", left: 4, top: 14, transform: [{ rotate: "-12deg" }] },
  deckName: { color: CC.text, fontSize: 18, fontWeight: "900", marginTop: 4, fontFamily: SERIF },
  deckNameOn: { color: CC.gold },
  deckBlurb: { color: CC.textMuted, fontSize: 11, textAlign: "center", marginTop: 4 },
  handBtn: {
    flex: 1,
    backgroundColor: CC.panel,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: CC.line,
    paddingVertical: 12,
    alignItems: "center",
  },
  handBtnOn: { borderColor: CC.gold },
  handText: { color: CC.text, fontSize: 20, fontWeight: "900" },
  handTextOn: { color: CC.gold },
  hint: { color: CC.textMuted, fontSize: 12, marginTop: 6 },
  rules: { backgroundColor: CC.panel, borderRadius: 14, padding: 14, gap: 6 },
  rule: { color: CC.text, fontSize: 13, lineHeight: 19 },
  startBtn: {
    marginTop: 24,
    backgroundColor: CC.gold,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  startText: { color: "#000", fontSize: 18, fontWeight: "900" },
  waiting: { color: CC.textMuted, textAlign: "center", marginTop: 24 },
  dim: { opacity: 0.4 },
});
