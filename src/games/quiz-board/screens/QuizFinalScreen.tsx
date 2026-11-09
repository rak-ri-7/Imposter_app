// src/games/quiz-board/screens/QuizFinalScreen.tsx
import { useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { formatRupees } from "../../../shared/quiz";
import type { Group } from "../../../shared/types";
import type { QuizBoardCtx } from "../logic/useQuizBoard";
import { finishQuizBoard, standings, teamStandings } from "../logic/game";
import { RetroButton } from "../components";
import { QB, bevel, digitText, displayText } from "../theme";
import { EndPodium, podiumEntries } from "../../../shared/components/WinnerPodium";

type Props = { group: Group; playerId: string; ctx: QuizBoardCtx };

export default function QuizFinalScreen({ group, playerId, ctx }: Props) {
  const { gs, isHost, nameOf } = ctx;
  const [busy, setBusy] = useState(false);
  if (!gs) return null;

  const rows = standings(gs.money, group.players);
  const played = (gs.rounds ?? []).some((r) => !r.voided);
  // Team mode: teams are ranked and score; players are shown for interest.
  // Solo games with session teams still show the teams' totals.
  const teamMode = !!gs.teams?.length;
  const teams = teamMode
    ? teamStandings(gs.money, gs.teams!).map((r) => ({ ...r.team, money: r.money, rank: r.rank, points: r.points }))
    : group.teamsEnabled && group.teams?.length
      ? [...group.teams]
          .map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            money: t.playerIds.reduce((s, id) => s + (gs.money[id] ?? 0), 0),
            rank: 0,
            points: 0,
          }))
          .sort((a, b) => b.money - a.money)
          .map((t, i, all) => ({ ...t, rank: i > 0 && all[i - 1].money === t.money ? i : i + 1 }))
      : null;

  const medal = (rank: number) =>
    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;

  // 🏆 Teams on the podium in team mode; players otherwise.
  const podium = !played
    ? []
    : teamMode
      ? teamStandings(gs.money, gs.teams!).filter((r) => r.rank <= 3).map((r) => ({
          id: r.team.id,
          name: r.team.name,
          rank: r.rank,
          color: r.team.color,
          score: formatRupees(r.money),
          members: r.team.memberIds.map((id) => group.players.find((p) => p.id === id) ?? { id, name: nameOf(id) }),
        }))
      : podiumEntries(rows, group.players, (r) => formatRupees(r.money));
  return (
    <View style={styles.container}>
      <EndPodium id={`${group.id}:quiz:${rows.map((r) => r.playerId + r.money).join(",")}`} subtitle="QUIZ BOARD · FINAL" entries={podium} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.marquee}>
          <Text style={displayText(32, QB.gold)}>Final Standings</Text>
          {played && teamMode && teams?.[0] && (
            <Text style={displayText(16)}>{teams[0].name} take the crown!</Text>
          )}
          {played && !teamMode && rows[0] && (
            <Text style={displayText(16)}>
              {nameOf(rows[0].playerId)} takes the crown!
            </Text>
          )}
        </View>

        {teams && (
          <>
            <Text style={styles.label}>TEAMS</Text>
            {teams.map((t) => (
              <View key={t.id} style={styles.row}>
                <Text style={styles.rank}>{medal(t.rank)}</Text>
                <View style={[styles.dot, { backgroundColor: t.color }]} />
                <Text style={[displayText(17), styles.flex]}>{t.name}</Text>
                <View style={styles.right}>
                  <Text style={digitText(17, t.money < 0 ? QB.red : QB.gold)}>
                    {formatRupees(t.money)}
                  </Text>
                  {played && teamMode && t.points > 0 && (
                    <Text style={styles.pts}>+{t.points} pts each</Text>
                  )}
                </View>
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
              {played && !teamMode && r.points > 0 && (
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
