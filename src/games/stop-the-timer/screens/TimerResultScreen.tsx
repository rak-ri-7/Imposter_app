import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
} from "react-native";
import { Group, TimerGameState } from "../../../shared/types";
import { useTimerGame } from "../logic/useTimerGame";

type Props = {
  group: Group;
  playerId: string;
};

export default function TimerResultScreen({ group, playerId }: Props) {
  const { isHost, getRanking, handleNextRound, handleEndGame, loading } =
    useTimerGame(group, playerId);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));
  const gameState = group.gameState as TimerGameState;
  const ranking = getRanking();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const getPlayerName = (pid: string) => {
    return group.players.find((p) => p.id === pid)?.name ?? "Unknown";
  };

  const formatStopped = (ms: number) => {
    if (ms >= 34000) return "ran out of time";
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getDiffText = (ms: number, answerMs: number) => {
    if (ms >= 34000) return "didn't stop in time";
    const diff = ms - answerMs;
    const absDiff = Math.abs(diff);
    if (absDiff < 100) return "exact! 🎯";
    if (absDiff < 500)
      return `incredibly close! (${diff > 0 ? "+" : ""}${(diff / 1000).toFixed(1)}s)`;
    if (diff > 0) return `${(diff / 1000).toFixed(1)}s too late`;
    return `${(absDiff / 1000).toFixed(1)}s too early`;
  };

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}th`;
  };

  const answerMs = gameState.answer * 1000;
  const winner = ranking[0];
  const winnerName = getPlayerName(winner?.playerId ?? "");

  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          flex: 1,
        }}
      >
        <Text style={styles.title}>Round {gameState.roundNumber}</Text>

        {/* Question reminder */}
        <View style={styles.questionReminder}>
          <Text style={styles.questionReminderText}>{gameState.question}</Text>
          <View style={styles.answerReveal}>
            <Text style={styles.answerLabel}>Answer</Text>
            <Text style={styles.answerValue}>{gameState.answer}</Text>
            <Text style={styles.answerSub}>
              You had to stop at {gameState.answer}.0s
            </Text>
          </View>
        </View>

        {/* Winner callout */}
        {winner && !winner.didNotStop && (
          <View style={styles.winnerBox}>
            <Text style={styles.winnerEmoji}>🏆</Text>
            <Text style={styles.winnerText}>
              <Text style={styles.winnerName}>{winnerName}</Text>
              {` stopped at ${formatStopped(winner.stoppedAt)} — closest!`}
            </Text>
          </View>
        )}

        {winner && winner.didNotStop && (
          <View style={styles.winnerBox}>
            <Text style={styles.winnerEmoji}>⏰</Text>
            <Text style={styles.winnerText}>
              Nobody stopped in time — no points awarded this round!
            </Text>
          </View>
        )}

        {/* Player breakdown */}
        <Text style={styles.sectionLabel}>HOW EVERYONE DID</Text>
        <ScrollView
          style={styles.rankingList}
          showsVerticalScrollIndicator={false}
        >
          {ranking.map((r, index) => {
            const isMe = r.playerId === playerId;
            const name = getPlayerName(r.playerId);
            const diffText = getDiffText(r.stoppedAt, answerMs);
            const didntStop = r.stoppedAt >= 34000;

            return (
              <Animated.View
                key={r.playerId}
                style={[
                  styles.rankRow,
                  isMe && styles.rankRowMe,
                  r.rank === 1 && styles.rankRowWinner,
                ]}
              >
                <Text style={styles.rankEmoji}>{getRankEmoji(r.rank)}</Text>
                <View style={styles.rankInfo}>
                  <View style={styles.rankNameRow}>
                    <Text style={styles.rankName}>
                      {name}
                      {isMe ? " (you)" : ""}
                    </Text>
                    {r.points > 0 && (
                      <View style={styles.pointsBadge}>
                        <Text style={styles.pointsText}>+{r.points}pt</Text>
                      </View>
                    )}
                  </View>
                  {didntStop ? (
                    <Text style={styles.rankTimeMissed}>
                      Ran out of time ⏰
                    </Text>
                  ) : (
                    <>
                      <Text style={styles.rankTime}>
                        Stopped at{" "}
                        <Text style={styles.rankTimeValue}>
                          {formatStopped(r.stoppedAt)}
                        </Text>{" "}
                        — {diffText}
                      </Text>
                    </>
                  )}
                </View>
              </Animated.View>
            );
          })}
        </ScrollView>

        {isHost && (
          <View style={styles.hostBtns}>
            <TouchableOpacity
              style={styles.nextBtn}
              onPress={handleNextRound}
              disabled={loading}
            >
              <Text style={styles.nextBtnText}>Next Round →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.endBtn}
              onPress={handleEndGame}
              disabled={loading}
            >
              <Text style={styles.endBtnText}>End Game</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isHost && (
          <View style={styles.waitingBox}>
            <Text style={styles.waitingText}>
              Waiting for host to continue...
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D1B2A",
    padding: 24,
    paddingTop: 60,
  },
  title: {
    color: "#888",
    fontSize: 14,
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 16,
  },
  questionReminder: {
    backgroundColor: "#1B2A3B",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2A3A4B",
  },
  questionReminderText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },
  answerReveal: {
    alignItems: "center",
  },
  answerLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 4,
  },
  answerValue: {
    color: "#4FC3F7",
    fontSize: 42,
    fontWeight: "bold",
    lineHeight: 48,
  },
  answerSub: {
    color: "#888",
    fontSize: 12,
    marginTop: 4,
  },
  winnerBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1B2A3B",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  winnerEmoji: {
    fontSize: 24,
  },
  winnerText: {
    color: "#888",
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },
  winnerName: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 15,
  },
  sectionLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
  },
  rankingList: {
    flex: 1,
    marginBottom: 16,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1B2A3B",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  rankRowMe: {
    borderColor: "#4FC3F7",
  },
  rankRowWinner: {
    borderColor: "#FFD700",
    backgroundColor: "#1E2D1A",
  },
  rankEmoji: {
    fontSize: 22,
    width: 36,
    textAlign: "center",
  },
  rankInfo: {
    flex: 1,
  },
  rankNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  rankName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  pointsBadge: {
    backgroundColor: "#0D3349",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#4FC3F7",
  },
  pointsText: {
    color: "#4FC3F7",
    fontSize: 12,
    fontWeight: "600",
  },
  rankTime: {
    color: "#888",
    fontSize: 12,
    lineHeight: 18,
  },
  rankTimeValue: {
    color: "#fff",
    fontWeight: "600",
  },
  rankTimeMissed: {
    color: "#E63946",
    fontSize: 12,
  },
  hostBtns: {
    gap: 10,
  },
  nextBtn: {
    backgroundColor: "#4FC3F7",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  },
  nextBtnText: {
    color: "#0D1B2A",
    fontSize: 16,
    fontWeight: "bold",
  },
  endBtn: {
    backgroundColor: "transparent",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E63946",
  },
  endBtnText: {
    color: "#E63946",
    fontSize: 15,
    fontWeight: "600",
  },
  waitingBox: {
    padding: 18,
    alignItems: "center",
  },
  waitingText: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
  },
});
