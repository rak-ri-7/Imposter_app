import { useEffect, useRef } from "react";
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

const ordinal = (n: number) => {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
};

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const getDiffText = (ms: number, answerMs: number) => {
  const diff = ms - answerMs;
  const absDiff = Math.abs(diff);
  if (absDiff < 100) return "exact! 🎯";
  if (absDiff < 500)
    return `incredibly close! (${diff > 0 ? "+" : "-"}${formatSeconds(absDiff)})`;
  if (diff > 0) return `${formatSeconds(diff)} too late`;
  return `${formatSeconds(absDiff)} too early`;
};

const getRankLabel = (rank: number, didNotStop: boolean) => {
  if (didNotStop) return "—";
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return ordinal(rank);
};

const joinNames = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;

export default function TimerResultScreen({ group, playerId }: Props) {
  const { isHost, getRanking, handleNextRound, handleEndGame, loading } =
    useTimerGame(group, playerId);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
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

  const getPlayerName = (pid: string) =>
    group.players.find((p) => p.id === pid)?.name ?? "Unknown";

  const answerMs = gameState.answer * 1000;
  // Everyone sharing first place among players who actually stopped.
  // Voided because a player dropped out: no ranking, no points.
  const voided =
    gameState.voidedRound?.round === gameState.roundNumber
      ? gameState.voidedRound
      : null;
  const winners = voided
    ? []
    : ranking.filter((r) => r.rank === 1 && !r.didNotStop);
  const nobodyStopped = !voided && ranking.length > 0 && winners.length === 0;

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
        {winners.length === 1 && winners[0].stoppedAt !== null && (
          <View style={styles.winnerBox}>
            <Text style={styles.winnerEmoji}>🏆</Text>
            <Text style={styles.winnerText}>
              <Text style={styles.winnerName}>
                {getPlayerName(winners[0].playerId)}
              </Text>
              {` stopped at ${formatSeconds(winners[0].stoppedAt)} — closest!`}
            </Text>
          </View>
        )}

        {winners.length > 1 && (
          <View style={styles.winnerBox}>
            <Text style={styles.winnerEmoji}>🤝</Text>
            <Text style={styles.winnerText}>
              <Text style={styles.winnerName}>
                {joinNames(winners.map((w) => getPlayerName(w.playerId)))}
              </Text>
              {` tied for closest — each ${formatSeconds(winners[0].diff)} off!`}
            </Text>
          </View>
        )}

        {nobodyStopped && (
          <View style={styles.winnerBox}>
            <Text style={styles.winnerEmoji}>⏰</Text>
            <Text style={styles.winnerText}>
              Nobody stopped in time — no points awarded this round!
            </Text>
          </View>
        )}

        {voided && (
          <View style={styles.winnerBox}>
            <Text style={styles.winnerEmoji}>🚫</Text>
            <Text style={styles.winnerText}>
              Round voided
              {voided.awayIds.length > 0
                ? ` — ${joinNames(voided.awayIds.map(getPlayerName))} dropped out`
                : ""}
              . No points this round.
            </Text>
          </View>
        )}

        {/* Player breakdown */}
        {!voided && (
          <Text style={styles.sectionLabel}>HOW EVERYONE DID</Text>
        )}
        <ScrollView
          style={styles.rankingList}
          showsVerticalScrollIndicator={false}
        >
          {(voided ? [] : ranking).map((r) => {
            const isMe = r.playerId === playerId;
            const isWinner = r.rank === 1 && !r.didNotStop;

            return (
              <View
                key={r.playerId}
                style={[
                  styles.rankRow,
                  isMe && styles.rankRowMe,
                  isWinner && styles.rankRowWinner,
                ]}
              >
                <Text style={styles.rankEmoji}>
                  {getRankLabel(r.rank, r.didNotStop)}
                </Text>
                <View style={styles.rankInfo}>
                  <View style={styles.rankNameRow}>
                    <Text style={styles.rankName}>
                      {getPlayerName(r.playerId)}
                      {isMe ? " (you)" : ""}
                    </Text>
                    {r.points > 0 && (
                      <View style={styles.pointsBadge}>
                        <Text style={styles.pointsText}>+{r.points}pt</Text>
                      </View>
                    )}
                  </View>
                  {r.stoppedAt === null ? (
                    <Text style={styles.rankTimeMissed}>
                      Ran out of time ⏰
                    </Text>
                  ) : (
                    <Text style={styles.rankTime}>
                      Stopped at{" "}
                      <Text style={styles.rankTimeValue}>
                        {formatSeconds(r.stoppedAt)}
                      </Text>{" "}
                      — {getDiffText(r.stoppedAt, answerMs)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {isHost ? (
          <View style={styles.hostBtns}>
            <TouchableOpacity
              style={[styles.nextBtn, loading && styles.btnDisabled]}
              onPress={handleNextRound}
              disabled={loading}
            >
              <Text style={styles.nextBtnText}>Next Round →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.endBtn, loading && styles.btnDisabled]}
              onPress={handleEndGame}
              disabled={loading}
            >
              <Text style={styles.endBtnText}>End Game</Text>
            </TouchableOpacity>
          </View>
        ) : (
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
  answerReveal: { alignItems: "center" },
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
  answerSub: { color: "#888", fontSize: 12, marginTop: 4 },
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
  winnerEmoji: { fontSize: 24 },
  winnerText: { color: "#888", fontSize: 13, flex: 1, lineHeight: 20 },
  winnerName: { color: "#FFD700", fontWeight: "bold", fontSize: 15 },
  sectionLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
  },
  rankingList: { flex: 1, marginBottom: 16 },
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
  rankRowMe: { borderColor: "#4FC3F7" },
  rankRowWinner: { borderColor: "#FFD700", backgroundColor: "#1E2D1A" },
  rankEmoji: { fontSize: 22, width: 44, textAlign: "center", color: "#888" },
  rankInfo: { flex: 1 },
  rankNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  rankName: { color: "#fff", fontSize: 15, fontWeight: "600", flex: 1 },
  pointsBadge: {
    backgroundColor: "#0D3349",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#4FC3F7",
  },
  pointsText: { color: "#4FC3F7", fontSize: 12, fontWeight: "600" },
  rankTime: { color: "#888", fontSize: 12, lineHeight: 18 },
  rankTimeValue: { color: "#fff", fontWeight: "600" },
  rankTimeMissed: { color: "#E63946", fontSize: 12 },
  hostBtns: { gap: 10 },
  nextBtn: {
    backgroundColor: "#4FC3F7",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  },
  nextBtnText: { color: "#0D1B2A", fontSize: 16, fontWeight: "bold" },
  endBtn: {
    backgroundColor: "transparent",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E63946",
  },
  endBtnText: { color: "#E63946", fontSize: 15, fontWeight: "600" },
  btnDisabled: { opacity: 0.5 },
  waitingBox: { padding: 18, alignItems: "center" },
  waitingText: { color: "#888", fontSize: 14, textAlign: "center" },
});
