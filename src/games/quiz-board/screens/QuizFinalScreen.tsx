// src/games/quiz-board/screens/QuizFinalScreen.tsx
import { useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { formatRupees } from "../../../shared/quiz";
import type { Group } from "../../../shared/types";
import type { QuizBoardCtx } from "../logic/useQuizBoard";
import { finishQuizBoard, standings } from "../logic/game";
import { RetroButton } from "../components";
import { QB, bevel, digitText, displayText } from "../theme";

type Props = { group: Group; playerId: string; ctx: QuizBoardCtx };

export default function QuizFinalScreen({ group, playerId, ctx }: Props) {
  const { gs, isHost, nameOf } = ctx;
  const [busy, setBusy] = useState(false);
  if (!gs) return null;

  const rows = standings(gs.money, group.players);
  const played = (gs.rounds ?? []).some((r) => !r.voided);
  const teams =
    group.teamsEnabled && group.teams?.length
      ? [...group.teams]
          .map((t) => ({
            ...t,
            money: t.playerIds.reduce((s, id) => s + (gs.money[id] ?? 0), 0),
          }))
          .sort((a, b) => b.money - a.money)
      : null;

  const medal = (rank: number) =>
    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.marquee}>
          <Text style={displayText(32, QB.gold)}>Final Standings</Text>
          {rows[0] && played && (
            <Text style={displayText(16)}>
              {nameOf(rows[0].playerId)} takes the crown!
            </Text>
          )}
        </View>

        {teams && (
          <>
            <Text style={styles.label}>TEAMS</Text>
            {teams.map((t, i) => (
              <View key={t.id} style={styles.row}>
                <Text style={styles.rank}>{medal(i + 1)}</Text>
                <View style={[styles.dot, { backgroundColor: t.color }]} />
                <Text style={[displayText(17), styles.flex]}>{t.name}</Text>
                <Text style={digitText(17, t.money < 0 ? QB.red : QB.gold)}>
                  {formatRupees(t.money)}
                </Text>
              </View>
            ))}
            <Text style={styles.label}>PLAYERS</Text>
          </>
        )}

        {rows.map((r) => (
          <View key={r.playerId} style={[styles.row, r.playerId === playerId && styles.me]}>
            <Text style={styles.rank}>{medal(r.rank)}</Text>
            <Text style={[displayText(17), styles.flex]}>
              {nameOf(r.playerId)}
              {r.playerId === playerId ? " (you)" : ""}
            </Text>
            <View style={styles.right}>
              <Text style={digitText(17, r.money < 0 ? QB.red : QB.gold)}>
                {formatRupees(r.money)}
              </Text>
              {played && r.points > 0 && (
                <Text style={styles.pts}>+{r.points} leaderboard pts</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {isHost ? (
          <RetroButton
            label={busy ? "Saving…" : "Back to Game Menu"}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await finishQuizBoard(group);
              } catch (e) {
                console.error(e);
                setBusy(false);
              }
            }}
          />
        ) : (
          <Text style={styles.note}>Waiting for the host…</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: QB.bg, paddingTop: 50 },
  scroll: { padding: 16, gap: 8, paddingBottom: 30 },
  marquee: {
    alignItems: "center",
    paddingVertical: 18,
    gap: 6,
    backgroundColor: QB.tile,
    marginBottom: 8,
    ...bevel,
    borderWidth: 4,
  },
  label: { color: QB.dim, fontSize: 12, letterSpacing: 2, marginTop: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: QB.panel,
  },
  me: { borderWidth: 2, borderColor: QB.gold },
  rank: { fontSize: 18, width: 32, textAlign: "center", color: QB.white },
  dot: { width: 10, height: 10, borderRadius: 5 },
  right: { alignItems: "flex-end" },
  pts: { color: QB.green, fontSize: 11 },
  flex: { flex: 1 },
  footer: { padding: 16, paddingBottom: 28, borderTopWidth: 2, borderTopColor: QB.tileDark },
  note: { color: QB.dim, textAlign: "center", fontSize: 14 },
});
