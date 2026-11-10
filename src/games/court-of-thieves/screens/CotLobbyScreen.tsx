// Host picks how many rounds and how long the deal phase lasts.
import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from "react-native";
import type { Group } from "../../../shared/types";
import { DEAL_OPTIONS, DEFAULT_DEAL_MS, DEFAULT_ROUNDS, MAX_PARTNERS, MIN_PLAYERS, PAYDAY, ROUND_OPTIONS } from "../logic/engine";
import { startCot } from "../logic/game";
import { CT } from "../theme";
import HowToPlay from "../../../shared/components/HowToPlay";
import { padBottom, useBottomInset } from "../../../shared/hooks/useSafeBottom";

type Props = { group: Group; playerId: string };

const RULES = [
  `Each round everyone gets a secret role: 🧤 Thief, 🚓 Police, ⚖️ Judge, 💼 Advocate, and 🙂 Citizens. Your role card shows once. Remember it.`,
  `Payday: everyone gets ₹${PAYDAY.toLocaleString("en-IN")}. The Thief's is counterfeit. It looks the same, but fake money is worth nothing at the final count.`,
  "🔦 Then the lights go out for a random time. Only the Thief can move: sneak to a bag, take money (₹500 a second), plant money in someone else's bag to frame them, and get home.",
  "👣 Walking leaves coloured footprints that fade in 3 s. Tiptoeing leaves none but is slow. ⚡ Lightning may flash a shadow for everyone.",
  "👀 One or two players get their lights back 3 s early and see the Thief's glove and footprints. The Thief gets a 3-second warning at the same moment.",
  "🚨 Not back in your seat when the lights come on, or still busy? Caught red-handed: the money goes back, each witness earns ₹500, and the Thief pays a ₹1,000 fine from their real money.",
  `🤝 Then the deal phase: send template messages to a role ("the Thief"), "the witness", or a player. Offer hush money, make demands, sell tips, or pay ₹500 to learn who someone is. You can deal with ${MAX_PARTNERS} people a round.`,
  "💸 The Thief pays 2 parts real to 1 part fake. Hush money can be taken now, or 'on acquittal': paid at the end of the round, unless whoever promised it is convicted.",
  "🚨 Then everyone secretly points at a suspect. Only the Police's pick is an arrest (and reveals them). Arrest an innocent: the Police pays them ₹1,000. Guess the Thief right yourself: +₹200.",
  "⚖️ The trial: the Police, then the Advocate, then the accused (always last) each get a timed turn. Only the speaker talks. Then the Judge rules. A right verdict pays the Judge ₹500.",
  "🔨 Thief convicted: the Police and the victims split the stash (+₹500 to the Police), witnesses and right tips earn ₹500, and anyone who took the Thief's money gives it back and pays ₹500. Thief walks free: their deals stand.",
  "🏆 After the last round, all counterfeit money is removed. Most REAL money wins: 10 pts, 2nd 5 pts, everyone else 2.",
];

export default function CotLobbyScreen({ group, playerId }: Props) {
  const bottomInset = useBottomInset(); // clear of the phone's bottom bar
  const isHost = group.hostId === playerId;
  const [rounds, setRounds] = useState<number>(DEFAULT_ROUNDS);
  const [dealMs, setDealMs] = useState<number>(DEFAULT_DEAL_MS);
  const [starting, setStarting] = useState(false);
  const enough = group.players.length >= MIN_PLAYERS;

  const start = async () => {
    if (starting) return;
    if (!enough) return Alert.alert(`Needs at least ${MIN_PLAYERS} players`);
    setStarting(true);
    try {
      await startCot(group, rounds, dealMs);
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, padBottom(styles.content, bottomInset)]}>
      <Text style={styles.title}>⚖️ Court of Thieves</Text>
      <Text style={styles.sub}>{group.players.length} players · the heist, the deals, the court</Text>
      <HowToPlay game="court-of-thieves" details={RULES} theme={{ text: CT.text, muted: CT.textMuted, accent: CT.gold, sheet: CT.bg, panel: CT.panel, sheetText: CT.text, sheetMuted: CT.textMuted }} />

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

      <Text style={styles.label}>DEAL PHASE</Text>
      <View style={styles.row}>
        {DEAL_OPTIONS.map((ms) => {
          const on = dealMs === ms;
          const label = ms % 60000 === 0 ? `${ms / 60000} min` : `${(ms / 60000).toFixed(1)} min`;
          return (
            <TouchableOpacity key={ms} style={[styles.tile, on && styles.tileOn]} onPress={() => isHost && setDealMs(ms)} disabled={!isHost}>
              <Text style={[styles.tileBig, on && styles.on]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.tip}>Tip: hold your phone close. Your screen gives you away during the blackout.</Text>

      {isHost ? (
        <TouchableOpacity style={[styles.startBtn, (!enough || starting) && styles.dim]} onPress={start} disabled={starting}>
          <Text style={styles.startText}>{!enough ? `Needs ${MIN_PLAYERS}+ players` : starting ? "Dealing roles…" : "Deal the roles"}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.waiting}>Waiting for the host…</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CT.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { color: CT.gold, fontSize: 30, fontWeight: "900", textAlign: "center", letterSpacing: 0.5 },
  sub: { color: CT.textMuted, textAlign: "center", marginTop: 4 },
  label: { color: CT.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginTop: 22, marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, backgroundColor: CT.panel, borderRadius: 12, borderWidth: 2, borderColor: CT.line, paddingVertical: 12, alignItems: "center" },
  tileOn: { borderColor: CT.gold },
  tileBig: { color: CT.text, fontSize: 18, fontWeight: "900" },
  on: { color: CT.gold },
  rules: { backgroundColor: CT.panel, borderRadius: 14, padding: 14, gap: 7 },
  rule: { color: CT.text, fontSize: 13, lineHeight: 19 },
  tip: { color: CT.gold, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 12 },
  startBtn: { marginTop: 24, backgroundColor: CT.gold, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  startText: { color: CT.ink, fontSize: 18, fontWeight: "900" },
  waiting: { color: CT.textMuted, textAlign: "center", marginTop: 24 },
  dim: { opacity: 0.45 },
});
