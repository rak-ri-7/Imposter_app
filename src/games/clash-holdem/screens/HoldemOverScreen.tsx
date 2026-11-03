// Game over: most chips wins, then everyone by chips (busted players by how long they lasted).
import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import type { Group, HoldemGameState } from "../../../shared/types";
import { rankMedal } from "../../../shared/utils/ranking";
import { MIN_HANDS_FOR_ALL, handsPlayed, holdemStandings } from "../logic/engine";
import { finishHoldem } from "../logic/game";
import { CC, SERIF } from "../../card-clash/theme";

type Props = { group: Group; gs: HoldemGameState; playerId: string };

export default function HoldemOverScreen({ group, gs, playerId }: Props) {
  const isHost = group.hostId === playerId;
  const [busy, setBusy] = useState(false);
  const rows = holdemStandings(gs, group.players);
  const nameOf = (id: string) =>
    id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone";
  const champ = rows[0];
  const played = handsPlayed(gs);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.trophy}>💰</Text>
      <Text style={styles.title}>
        {champ ? `${nameOf(champ.playerId)} ${champ.playerId === playerId ? "win" : "wins"}!` : "Game over"}
      </Text>
      <Text style={styles.sub}>
        {gs.endedEarly
          ? `Ended early after ${played} hand${played === 1 ? "" : "s"}`
          : played >= gs.handsTotal
            ? `After all ${gs.handsTotal} hands`
            : `Ended after ${played} hands`}{" "}
        · most chips wins
      </Text>
      {played < MIN_HANDS_FOR_ALL && (
        <Text style={styles.note}>
          {gs.endedEarly
            ? `Ended before ${MIN_HANDS_FOR_ALL} hands: no points this time`
            : `Under ${MIN_HANDS_FOR_ALL} hands: only the winner scores`}
        </Text>
      )}
      <View style={styles.list}>
        {rows.map((r) => (
          <View key={r.playerId} style={[styles.row, r.rank === 1 && styles.rowWin]}>
            <Text style={styles.medal}>{rankMedal(r.rank)}</Text>
            <View style={styles.mid}>
              <Text style={styles.name}>{nameOf(r.playerId)}</Text>
              <Text style={styles.detail}>{r.chips > 0 ? `🪙 ${r.chips} chips` : `out in hand ${r.outHand ?? "?"}`}</Text>
            </View>
            <Text style={styles.points}>+{r.points} pts</Text>
          </View>
        ))}
      </View>
      {isHost ? (
        <TouchableOpacity
          style={[styles.btn, busy && styles.dim]}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await finishHoldem(group);
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
  container: { flex: 1, backgroundColor: CC.bg },
  content: { padding: 20, paddingTop: 64, paddingBottom: 40, gap: 10 },
  trophy: { fontSize: 64, textAlign: "center" },
  title: { color: CC.gold, fontSize: 30, fontWeight: "900", textAlign: "center", fontFamily: SERIF },
  sub: { color: CC.textMuted, textAlign: "center" },
  note: { color: CC.gold, textAlign: "center", fontSize: 12, fontWeight: "700" },
  list: { gap: 8, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: CC.panel, borderRadius: 14, padding: 12, gap: 12 },
  rowWin: { borderWidth: 2, borderColor: CC.gold },
  medal: { fontSize: 24, width: 36, textAlign: "center", color: CC.text },
  mid: { flex: 1 },
  name: { color: CC.text, fontSize: 16, fontWeight: "900" },
  detail: { color: CC.textMuted, fontSize: 12 },
  points: { color: CC.win, fontSize: 16, fontWeight: "900" },
  btn: { marginTop: 20, backgroundColor: CC.gold, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#000", fontSize: 16, fontWeight: "900" },
  waiting: { color: CC.textMuted, textAlign: "center", marginTop: 20 },
  dim: { opacity: 0.4 },
});
