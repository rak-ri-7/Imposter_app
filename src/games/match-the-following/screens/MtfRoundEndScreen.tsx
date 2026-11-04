// After the reveal: this round's marks and the running total. Moves on by
// itself; the host can skip ahead.
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { Group, MtfGameState } from "../../../shared/types";
import { mtfNextRound } from "../logic/game";
import Paper from "../components/Paper";
import { HAND, MF, penOf } from "../theme";
import { useServerNow } from "../useServerNow";

type Props = { group: Group; gs: MtfGameState; playerId: string };

export default function MtfRoundEndScreen({ group, gs, playerId }: Props) {
  const now = useServerNow(500);
  const isHost = group.hostId === playerId;
  const [busy, setBusy] = useState(false);
  const secs = Math.max(0, Math.ceil(((gs.phaseEndsAt ?? now) - now) / 1000));
  const last = gs.last;
  const nameOf = (id: string) => (id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone");
  const rows = [...gs.seats].sort((a, b) => (gs.score[b] ?? 0) - (gs.score[a] ?? 0));
  const lastRound = gs.round >= gs.roundsTotal;

  return (
    <Paper
      kicker={`End of Q${gs.round} of ${gs.roundsTotal}`}
      footer={
        isHost ? (
          <TouchableOpacity
            style={[styles.btn, busy && styles.dim]}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await mtfNextRound(group.id, gs.round, playerId);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={styles.btnText}>
              {lastRound ? "Results 🏆" : "Next question"} ({secs}s)
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.waiting}>{lastRound ? "Results" : "Next question"} in {secs}s…</Text>
        )
      }
    >
      <Text style={styles.title}>Marks so far</Text>
      <View style={{ gap: 8 }}>
        {rows.map((id, i) => (
          <View key={id} style={styles.row}>
            <Text style={styles.pos}>{i + 1}.</Text>
            <Text style={[styles.name, { color: penOf(gs.seats, id) }]}>{nameOf(id)}</Text>
            {last && (
              <Text style={styles.round}>
                +{last.correct[id] ?? 0}/{last.lines[id] ?? 0}
              </Text>
            )}
            <Text style={styles.total}>{gs.score[id] ?? 0}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.note}>+ right lines this round · total</Text>
    </Paper>
  );
}

const styles = StyleSheet.create({
  title: { color: MF.ink, fontSize: 28, fontWeight: "900", fontFamily: HAND },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: MF.card, borderRadius: 12, borderWidth: 1.5, borderColor: MF.cardLine, padding: 12 },
  pos: { color: MF.muted, fontSize: 15, fontWeight: "900", width: 24 },
  name: { fontSize: 16, fontWeight: "900", flex: 1 },
  round: { color: MF.right, fontSize: 14, fontWeight: "800" },
  total: { color: MF.ink, fontSize: 20, fontWeight: "900", minWidth: 32, textAlign: "right" },
  note: { color: MF.faint, fontSize: 12, textAlign: "right" },
  btn: { backgroundColor: MF.ink, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "900" },
  waiting: { color: MF.muted, textAlign: "center", fontSize: 15, fontWeight: "800", paddingVertical: 10 },
  dim: { opacity: 0.45 },
});
