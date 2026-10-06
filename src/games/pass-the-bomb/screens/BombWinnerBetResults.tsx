import { View, Text, StyleSheet } from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import { betPickLabel } from "./BombBetSheet";

type Props = { group: Group; playerId: string };

// Drop this into the final results screen. Shows how every game-winner bet
// turned out. Renders nothing when nobody placed one.
export default function BombWinnerBetResults({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const bets = (gameState.matchBets ?? []).filter(
    (b) => b.market === "game-winner" && b.status !== "open",
  );
  if (bets.length === 0) return null;

  const nameOf = (id: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Unknown";

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🏆 WINNER BETS</Text>
      {bets.map((b) => (
        <Text
          key={b.id}
          style={[
            styles.line,
            b.status === "won" && styles.won,
            b.status === "lost" && styles.lost,
          ]}
        >
          {nameOf(b.bettorId)} backed{" "}
          {betPickLabel(b.pick, group.players, playerId)} · {b.stake} FP{" "}
          {b.status === "won"
            ? `✅ +${b.scorePoints ?? 0} leaderboard point${(b.scorePoints ?? 0) === 1 ? "" : "s"}`
            : b.status === "lost"
              ? "❌ wrong guess"
              : "↩️ void"}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  title: { color: "#FFD700", fontSize: 11, letterSpacing: 2, marginBottom: 4 },
  line: { color: "#aaa", fontSize: 12 },
  won: { color: "#4CAF50" },
  lost: { color: "#E63946" },
});
