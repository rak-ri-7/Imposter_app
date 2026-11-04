// Results: most right lines wins, plus 🎭 Poker Face and 📖 Open Book.
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { Group, MtfGameState } from "../../../shared/types";
import { rankMedal } from "../../../shared/utils/ranking";
import { MIN_ROUNDS_FOR_POINTS, awards, roundsPlayed, standings } from "../logic/engine";
import { finishMtf } from "../logic/game";
import Paper from "../components/Paper";
import { HAND, MF, penOf } from "../theme";

type Props = { group: Group; gs: MtfGameState; playerId: string };

export default function MtfOverScreen({ group, gs, playerId }: Props) {
  const isHost = group.hostId === playerId;
  const [busy, setBusy] = useState(false);
  const present = group.players.map((p) => p.id);
  const rows = standings(gs, present);
  const aw = awards(gs, present);
  const nameOf = (id: string) => (id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone");
  const champs = rows.filter((r) => r.rank === 1);
  const nobody = rows.length === 0 || rows[0].score === 0;
  const title = nobody
    ? "Pens down! Nobody got a line right 😅"
    : champs.length === 1
      ? `${nameOf(champs[0].playerId)} ${champs[0].playerId === playerId ? "know" : "knows"} everyone best!`
      : champs.length === 2
        ? `${nameOf(champs[0].playerId)} & ${nameOf(champs[1].playerId)} know everyone best!`
        : `A ${champs.length}-way tie at the top!`;
  const played = roundsPlayed(gs);
  const noPoints = played < (gs.endedEarly ? MIN_ROUNDS_FOR_POINTS : 1);

  return (
    <Paper
      kicker="Results"
      footer={
        isHost ? (
          <TouchableOpacity
            style={[styles.btn, busy && styles.dim]}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await finishMtf(group);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={styles.btnText}>Add points & back to menu</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.waiting}>Waiting for the host…</Text>
        )
      }
    >
      <Text style={styles.trophy}>🏆</Text>
      <Text style={styles.title}>
        {title}
      </Text>
      <Text style={styles.sub}>
        {gs.endedEarly ? `Ended early after ${played} question${played === 1 ? "" : "s"}` : `${played} questions`} · most right lines wins
      </Text>
      {noPoints && (
        <Text style={styles.note}>
          {gs.endedEarly ? `Ended before ${MIN_ROUNDS_FOR_POINTS} questions: no points this time` : "No full question played: no points this time"}
        </Text>
      )}

      <View style={{ gap: 8 }}>
        {rows.map((r) => (
          <View key={r.playerId} style={[styles.row, r.rank === 1 && styles.rowWin]}>
            <Text style={styles.medal}>{rankMedal(r.rank)}</Text>
            <Text style={[styles.name, { color: penOf(gs.seats, r.playerId) }]}>{nameOf(r.playerId)}</Text>
            <Text style={styles.score}>{r.score} right</Text>
            <Text style={styles.points}>+{r.points}</Text>
          </View>
        ))}
      </View>

      {(aw.pokerFace || aw.openBook) && (
        <View style={styles.awards}>
          {aw.pokerFace && (
            <View style={styles.award}>
              <Text style={styles.awardEmoji}>🎭</Text>
              <Text style={styles.awardTitle}>Poker Face</Text>
              <Text style={styles.awardName}>{nameOf(aw.pokerFace)}</Text>
              <Text style={styles.awardSub}>fooled the most</Text>
            </View>
          )}
          {aw.openBook && (
            <View style={styles.award}>
              <Text style={styles.awardEmoji}>📖</Text>
              <Text style={styles.awardTitle}>Open Book</Text>
              <Text style={styles.awardName}>{nameOf(aw.openBook)}</Text>
              <Text style={styles.awardSub}>easiest to read</Text>
            </View>
          )}
        </View>
      )}
    </Paper>
  );
}

const styles = StyleSheet.create({
  trophy: { fontSize: 56, textAlign: "center" },
  title: { color: MF.ink, fontSize: 26, fontWeight: "900", textAlign: "center", fontFamily: HAND },
  sub: { color: MF.muted, textAlign: "center" },
  note: { color: MF.wrong, textAlign: "center", fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: MF.card, borderRadius: 12, borderWidth: 1.5, borderColor: MF.cardLine, padding: 12 },
  rowWin: { borderColor: MF.gold, borderWidth: 2.5 },
  medal: { fontSize: 22, width: 34, textAlign: "center", color: MF.pencil },
  name: { fontSize: 16, fontWeight: "900", flex: 1 },
  score: { color: MF.muted, fontSize: 14, fontWeight: "700" },
  points: { color: MF.right, fontSize: 16, fontWeight: "900", minWidth: 36, textAlign: "right" },
  awards: { flexDirection: "row", gap: 10 },
  award: { flex: 1, backgroundColor: MF.card, borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: MF.stamp, padding: 14, alignItems: "center", gap: 2 },
  awardEmoji: { fontSize: 32 },
  awardTitle: { color: MF.stamp, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  awardName: { color: MF.ink, fontSize: 18, fontWeight: "900", fontFamily: HAND },
  awardSub: { color: MF.muted, fontSize: 12 },
  btn: { backgroundColor: MF.ink, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  waiting: { color: MF.muted, textAlign: "center", paddingVertical: 8 },
  dim: { opacity: 0.45 },
});
