import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
} from "react-native";
import { Group, BombGameState } from "../../../../shared/types";
import { returnToMenu } from "../../../../shared/firebase/groups";
import BombWinnerBetResults from "./BombWinnerBetResults";
import { standingsOrder } from "../../logic/timer/placings";
import { RUNNER_UP_SCORE_BONUS } from "../../logic/timer/bombHelpers";
import { FP_PER_POINT } from "../../data/betOdds";
import { ACHIEVEMENTS, AchievementId, rewardText } from "../../data/achievements";

type Props = {
  group: Group;
  playerId: string;
};

export default function BombResultScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  const activePlayers = group.players.filter(
    (p) => !gameState.ghosts.includes(p.id),
  );
  const winner = activePlayers[0];
  const isWinner = winner?.id === playerId;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const standings = standingsOrder(
    group.players.map((p) => p.id),
    winner?.id,
    gameState.ghostEvents,
    gameState.lives,
  ).map((id) => group.players.find((p) => p.id === id)!);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.winnerCard,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={styles.winnerEmoji}>🏆</Text>
        <Text style={styles.winnerLabel}>WINNER</Text>
        <Text style={styles.winnerName}>{winner?.name ?? "Nobody"}</Text>
        {isWinner && <Text style={styles.youWon}>That's you! 🎉</Text>}
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Final standings */}
          <Text style={styles.sectionLabel}>FINAL STANDINGS</Text>
          <View style={styles.standingsCard}>
            {standings.map((player, index) => {
              const isElim = gameState.ghosts.includes(player.id);
              const lives = gameState.lives[player.id] ?? 0;
              const isThisWinner = player.id === winner?.id;
              const isRunnerUp = player.id === gameState.runnerUpId;
              return (
                <View
                  key={player.id}
                  style={[
                    styles.standingRow,
                    isThisWinner && styles.standingRowWinner,
                  ]}
                >
                  <Text style={styles.standingRank}>
                    {isThisWinner
                      ? "🏆"
                      : isRunnerUp
                        ? "🥈"
                        : isElim
                          ? "💀"
                          : `${index + 1}.`}
                  </Text>
                  <Text style={styles.standingName}>
                    {player.name}
                    {player.id === playerId ? " (you)" : ""}
                  </Text>
                  {isRunnerUp && (
                    <Text style={styles.runnerUpTag}>
                      +{RUNNER_UP_SCORE_BONUS} pts
                    </Text>
                  )}
                  {isElim ? (
                    <Text style={styles.eliminatedTag}>Eliminated</Text>
                  ) : (
                    <View style={styles.livesRow}>
                      {[1, 2, 3].map((i) => (
                        <Text key={i} style={styles.heart}>
                          {i <= lives ? "❤️" : "🖤"}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <BombWinnerBetResults group={group} playerId={playerId} />

          {/* Leftover FP cashed into leaderboard points */}
          {Object.keys(gameState.fpCashOut ?? {}).length > 0 && (
            <View style={styles.cashCard}>
              <Text style={styles.cashTitle}>
                💰 FP CASH-OUT · {FP_PER_POINT} FP = 1 PT
              </Text>
              {group.players
                .filter((p) => gameState.fpCashOut?.[p.id])
                .map((p) => {
                  const c = gameState.fpCashOut![p.id];
                  return (
                    <Text key={p.id} style={styles.cashLine}>
                      {p.name}
                      {p.id === playerId ? " (you)" : ""}: {c.fp} FP → +
                      {c.points} pt{c.points === 1 ? "" : "s"}
                    </Text>
                  );
                })}
            </View>
          )}

          {/* Hidden achievements earned this game */}
          <Text style={styles.sectionLabel}>🏅 ACHIEVEMENTS</Text>
          <View style={styles.achCard}>
            {group.players.every(
              (p) => Object.keys(gameState.achievements?.[p.id]?.earned ?? {}).length === 0,
            ) ? (
              <Text style={styles.achText}>Nobody unlocked anything this game.</Text>
            ) : (
              group.players.map((player) => {
                const earned = Object.keys(gameState.achievements?.[player.id]?.earned ?? {});
                if (earned.length === 0) return null;
                return (
                  <View key={player.id} style={styles.achPlayer}>
                    <Text style={styles.achPlayerName}>{player.name}</Text>
                    {earned.map((id) => {
                      const a = ACHIEVEMENTS[id as AchievementId];
                      if (!a) return null;
                      return (
                        <View key={id} style={[styles.achRow, styles.achRowDone]}>
                          <Text style={styles.achIcon}>{a.emoji}</Text>
                          <View style={styles.achContent}>
                            <Text style={styles.achText}>{a.name}</Text>
                            <Text style={styles.achLifeTag}>
                              {a.how} {rewardText(a)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </Animated.View>

      {isHost && (
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => returnToMenu(group.id)}
        >
          <Text style={styles.menuBtnText}>Back to Game Menu 🎮</Text>
        </TouchableOpacity>
      )}

      {!isHost && (
        <Text style={styles.waitingText}>
          Waiting for host to return to menu...
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cashCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  cashTitle: { color: "#4CAF50", fontSize: 11, letterSpacing: 2, marginBottom: 4 },
  cashLine: { color: "#ddd", fontSize: 13 },
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    padding: 20,
    paddingTop: 60,
  },
  winnerCard: {
    alignItems: "center",
    marginBottom: 20,
  },
  winnerEmoji: { fontSize: 64, marginBottom: 8 },
  winnerLabel: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 3,
    marginBottom: 4,
  },
  winnerName: {
    color: "#FFD700",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 4,
  },
  youWon: { color: "#4CAF50", fontSize: 16 },
  sectionLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
  },
  standingsCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  standingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#2A2A2A",
  },
  standingRowWinner: { backgroundColor: "#1A1500" },
  standingRank: { fontSize: 18, width: 28 },
  standingName: { color: "#fff", fontSize: 14, flex: 1 },
  eliminatedTag: { color: "#E63946", fontSize: 11 },
  livesRow: { flexDirection: "row", gap: 2 },
  heart: { fontSize: 12 },
  achCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    gap: 12,
  },
  achPlayer: { gap: 6 },
  achPlayerName: {
    color: "#FF4500",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  achRow: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    padding: 8,
  },
  achRowDone: { backgroundColor: "#0A1E0A" },
  achIcon: { fontSize: 14 },
  achContent: { flex: 1 },
  achText: { color: "#aaa", fontSize: 11, lineHeight: 16 },
  achLifeTag: { color: "#E63946", fontSize: 10, marginTop: 4 },
  menuBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  menuBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  waitingText: { color: "#888", fontSize: 14, textAlign: "center" },

  runnerUpTag: { color: "#C0C0C0", fontSize: 11, fontWeight: "700" },
});
