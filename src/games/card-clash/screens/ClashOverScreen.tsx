// Game over: last one standing, then everyone by how long they lasted.
import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import type { ClashGameState, Group } from "../../../shared/types";
import { rankMedal } from "../../../shared/utils/ranking";
import { MIN_CLASHES_FOR_ALL, clashStandings, clashesPlayed, finishCardClash } from "../logic/game";
import { CC, SERIF } from "../theme";

type Props = { group: Group; gs: ClashGameState; playerId: string };

export default function ClashOverScreen({ group, gs, playerId }: Props) {
  const isHost = group.hostId === playerId;
  const [busy, setBusy] = useState(false);
  const rows = clashStandings(gs, group.players);
  const nameOf = (id: string) =>
    id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone";
  const champ = rows[0];
  const played = clashesPlayed(gs);
  const short = played < MIN_CLASHES_FOR_ALL;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.trophy}>🏆</Text>
      <Text style={styles.title}>
        {champ ? `${nameOf(champ.playerId)} ${champ.playerId === playerId ? "win" : "wins"}!` : "Game over"}
      </Text>
      <Text style={styles.sub}>
        {gs.endedEarly
          ? `Ended early after ${played} clashes · ranked by cards held, then ★ golds`
          : rows.filter((r) => r.cards > 0).length > 1
            ? gs.statsOut
              ? `All the stats are used up after ${played} clashes · ranked by cards held, then ★ golds`
              : `🏁 Host called time after ${played} clashes · ranked by cards held, then ★ golds`
            : `Last one standing after ${played} clashes`}
      </Text>
      {short && (
        <Text style={styles.note}>
          {gs.endedEarly
            ? `Ended before ${MIN_CLASHES_FOR_ALL} clashes: no points this time`
            : `Under ${MIN_CLASHES_FOR_ALL} clashes: only the winner scores`}
        </Text>
      )}

      <View style={styles.list}>
        {rows.map((r) => (
          <View key={r.playerId} style={[styles.row, r.rank === 1 && styles.rowWin]}>
            <Text style={styles.medal}>{rankMedal(r.rank)}</Text>
            <View style={styles.mid}>
              <Text style={styles.name}>{nameOf(r.playerId)}</Text>
              <Text style={styles.detail}>
                {r.cards > 0 ? `${r.cards} cards${r.golds > 0 ? ` · ★${r.golds} gold` : ""}` : `out in clash ${r.outRound ?? "?"}`}
              </Text>
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
              await finishCardClash(group);
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CC.panel,
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
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
