// 💸 The final count: every purse as it looked, then the counterfeit money
// is taken out. Most REAL money wins.
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import type { CotGameState, Group } from "../../../shared/types";
import { rankMedal } from "../../../shared/utils/ranking";
import { MIN_ROUNDS_FOR_POINTS, roundsPlayed, standings } from "../logic/engine";
import { finishCot } from "../logic/game";
import { CT, rupees, seatColor } from "../theme";

type Props = { group: Group; gs: CotGameState; playerId: string };

export default function CotOverScreen({ group, gs, playerId }: Props) {
  const isHost = group.hostId === playerId;
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 2500);
    return () => clearTimeout(t);
  }, []);
  const rows = standings(gs, group.players.map((p) => p.id));
  const shownOrder = [...rows].sort((a, b) => b.shown - a.shown);
  const list = revealed ? rows : shownOrder;
  const name = (id: string) => (id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone");
  const champ = rows[0];
  const played = roundsPlayed(gs);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.big}>{revealed ? "🏆" : "💸"}</Text>
      <Text style={styles.title}>
        {revealed ? (champ ? `${name(champ.playerId)} ${champ.playerId === playerId ? "win" : "wins"}!` : "Game over") : "The final count…"}
      </Text>
      <Text style={styles.sub}>
        {revealed ? "Counterfeit money removed · most real money wins" : "Checking every note for fakes…"}
        {gs.endedEarly ? ` · ended early after ${played} round${played === 1 ? "" : "s"}` : ""}
      </Text>
      {revealed && played < (gs.endedEarly ? MIN_ROUNDS_FOR_POINTS : 1) && (
        <Text style={styles.note}>
          {gs.endedEarly ? `Ended before ${MIN_ROUNDS_FOR_POINTS} full rounds: no points this time` : "No full round played: no points this time"}
        </Text>
      )}
      {gs.endedEarly && <Text style={styles.note}>The unfinished round was called off: purses are as they were before it.</Text>}
      <View style={styles.list}>
        {list.map((r) => (
          <View key={r.playerId} style={[styles.row, revealed && r.rank === 1 && styles.rowWin]}>
            <Text style={styles.medal}>{revealed ? rankMedal(r.rank) : "·"}</Text>
            <View style={[styles.dot, { backgroundColor: seatColor(gs.seats, r.playerId) }]} />
            <View style={styles.mid}>
              <Text style={styles.name}>{name(r.playerId)}</Text>
              {revealed ? (
                <Text style={styles.detail}>
                  showed {rupees(r.shown)}
                  {r.fake > 0 ? ` · ${rupees(r.fake)} was fake` : " · all real"}
                </Text>
              ) : (
                <Text style={styles.detail}>shows {rupees(r.shown)}</Text>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.real}>{rupees(revealed ? r.real : r.shown)}</Text>
              {revealed && <Text style={styles.points}>+{r.points} pts</Text>}
            </View>
          </View>
        ))}
      </View>
      {isHost ? (
        <TouchableOpacity
          style={[styles.btn, (busy || !revealed) && styles.dim]}
          disabled={busy || !revealed}
          onPress={async () => {
            setBusy(true);
            try {
              await finishCot(group);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Text style={styles.btnText}>Add points & back to menu</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.waiting}>Waiting for the host…</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CT.bg },
  content: { padding: 20, paddingTop: 64, paddingBottom: 40, gap: 10 },
  big: { fontSize: 64, textAlign: "center" },
  title: { color: CT.gold, fontSize: 30, fontWeight: "900", textAlign: "center" },
  sub: { color: CT.textMuted, textAlign: "center" },
  note: { color: CT.gold, textAlign: "center", fontSize: 12, fontWeight: "700" },
  list: { gap: 8, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: CT.panel, borderRadius: 14, padding: 12, gap: 10 },
  rowWin: { borderWidth: 2, borderColor: CT.gold },
  medal: { fontSize: 22, width: 32, textAlign: "center", color: CT.text },
  dot: { width: 12, height: 12, borderRadius: 6 },
  mid: { flex: 1 },
  name: { color: CT.text, fontSize: 16, fontWeight: "900" },
  detail: { color: CT.textMuted, fontSize: 12 },
  real: { color: CT.text, fontSize: 16, fontWeight: "900" },
  points: { color: CT.good, fontSize: 13, fontWeight: "900" },
  btn: { marginTop: 20, backgroundColor: CT.gold, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  btnText: { color: CT.ink, fontSize: 16, fontWeight: "900" },
  waiting: { color: CT.textMuted, textAlign: "center", marginTop: 20 },
  dim: { opacity: 0.45 },
});
