import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { Group, ImposterGameState } from "../../../shared/types";
import { useImposterGame } from "../logic/useImposterGame";

type Props = {
  group: Group;
  playerId: string;
};

export default function ResultScreen({ group, playerId }: Props) {
  const { isHost, handleReturnToMenu } = useImposterGame(group, playerId);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.5));
  const gameState = group.gameState as ImposterGameState;
  const { players } = group;

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

  const imposters = players.filter((p) => gameState.imposterIds.includes(p.id));
  const allCaught = gameState.imposterIds.every((id) =>
    gameState.eliminatedPlayers.includes(id),
  );
  const isImposter = gameState.imposterIds.includes(playerId);

  const survivors = players.filter(
    (p) => !gameState.eliminatedPlayers.includes(p.id),
  );

  let resultForMe:
    | "imposter_caught"
    | "imposter_free"
    | "player_won"
    | "player_lost";
  if (isImposter) {
    resultForMe = allCaught ? "imposter_caught" : "imposter_free";
  } else {
    resultForMe = allCaught ? "player_won" : "player_lost";
  }

  const resultConfig = {
    imposter_caught: {
      emoji: "🚔",
      title: "Busted!",
      subtitle: "The players caught you",
      color: "#E63946",
      bg: "#1E0A0E",
    },
    imposter_free: {
      emoji: "😈",
      title: "You escaped!",
      subtitle: "Not everyone was found",
      color: "#FFD700",
      bg: "#1E1A00",
    },
    player_won: {
      emoji: "🎉",
      title: "You won!",
      subtitle:
        gameState.imposterIds.length > 1
          ? "All imposters were caught"
          : "The imposter was caught",
      color: "#4CAF50",
      bg: "#0A1E0E",
    },
    player_lost: {
      emoji: "😱",
      title:
        gameState.imposterIds.length > 1 ? "Imposters win!" : "Imposter wins!",
      subtitle: "At least one imposter fooled everyone",
      color: "#E63946",
      bg: "#1E0A0E",
    },
  };

  const config = resultConfig[resultForMe];

  return (
    <View style={[styles.container, { backgroundColor: config.bg }]}>
      <Animated.View
        style={[
          styles.resultCard,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={styles.emoji}>{config.emoji}</Text>
        <Text style={[styles.title, { color: config.color }]}>
          {config.title}
        </Text>
        <Text style={styles.subtitle}>{config.subtitle}</Text>
      </Animated.View>

      <Animated.View style={[styles.detailsCard, { opacity: fadeAnim }]}>
        <View style={styles.imposterReveal}>
          <Text style={styles.imposterLabel}>
            THE IMPOSTER{imposters.length > 1 ? "S WERE" : " WAS"}
          </Text>
          {imposters.map((imp) => (
            <Text key={imp.id} style={styles.imposterName}>
              {imp.name} 🕵️
            </Text>
          ))}
          {gameState.imposterGuess !== undefined && (
            <Text
              style={[
                styles.guessText,
                gameState.imposterGuessCorrect
                  ? styles.guessCorrect
                  : styles.guessWrong,
              ]}
            >
              {gameState.imposterGuessCorrect
                ? `✓ Guessed correctly: "${gameState.imposterGuess}"`
                : `✗ Wrong guess: "${gameState.imposterGuess}"`}
            </Text>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.wordReveal}>
          <Text style={styles.wordLabel}>THE WORD WAS</Text>
          <Text style={styles.wordText}>{gameState.word}</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.votesTitle}>Elimination Order</Text>
        {gameState.eliminatedPlayers.length === 0 && (
          <Text style={styles.emptyStateText}>No one was eliminated</Text>
        )}
        {gameState.eliminatedPlayers.map((eliminatedId, index) => {
          const player = players.find((p) => p.id === eliminatedId);
          const wasImposter = gameState.imposterIds.includes(eliminatedId);
          if (!player) return null;
          return (
            <View key={eliminatedId} style={styles.voteRow}>
              <Text style={styles.roundBadge}>#{index + 1}</Text>
              <Text style={styles.voteName}>
                {player.name}
                {wasImposter ? " 🕵️" : ""}
              </Text>
              <View
                style={[
                  styles.resultTag,
                  wasImposter ? styles.resultTagHit : styles.resultTagMiss,
                ]}
              >
                <Text
                  style={[
                    styles.resultTagText,
                    wasImposter
                      ? styles.resultTagTextHit
                      : styles.resultTagTextMiss,
                  ]}
                >
                  {wasImposter ? "Imposter" : "Innocent"}
                </Text>
              </View>
            </View>
          );
        })}

        {survivors.length > 0 && (
          <>
            <View style={styles.divider} />
            <Text style={styles.votesTitle}>Still Standing</Text>
            {survivors.map((player) => {
              const isEscapedImposter = gameState.imposterIds.includes(
                player.id,
              );
              return (
                <View key={player.id} style={styles.voteRow}>
                  <Text style={styles.voteName}>
                    {player.name}
                    {isEscapedImposter ? " 🕵️" : ""}
                  </Text>
                  {isEscapedImposter && (
                    <View style={[styles.resultTag, styles.resultTagEscaped]}>
                      <Text
                        style={[
                          styles.resultTagText,
                          styles.resultTagTextEscaped,
                        ]}
                      >
                        Escaped
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </Animated.View>

      {isHost ? (
        <TouchableOpacity
          style={styles.playAgainBtn}
          onPress={handleReturnToMenu}
        >
          <Text style={styles.playAgainText}>Back to Game Menu 🎮</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingText}>
            Waiting for host to continue...
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  resultCard: { alignItems: "center", marginBottom: 24 },
  emoji: { fontSize: 72, marginBottom: 12 },
  title: { fontSize: 36, fontWeight: "bold", marginBottom: 8 },
  subtitle: { color: "#888", fontSize: 16, textAlign: "center" },
  detailsCard: {
    flex: 1,
    backgroundColor: "#16213E",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  imposterReveal: { alignItems: "center", marginBottom: 16 },
  imposterLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 6,
  },
  imposterName: { color: "#E63946", fontSize: 28, fontWeight: "bold" },
  guessText: { fontSize: 13, marginTop: 8, textAlign: "center" },
  guessCorrect: { color: "#4CAF50" },
  guessWrong: { color: "#E63946" },
  divider: { height: 0.5, backgroundColor: "#0F3460", marginVertical: 16 },
  wordReveal: { alignItems: "center", marginBottom: 16 },
  wordLabel: { color: "#888", fontSize: 11, letterSpacing: 2, marginBottom: 6 },
  wordText: { color: "#FFD700", fontSize: 28, fontWeight: "bold" },
  votesTitle: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 12,
  },
  emptyStateText: {
    color: "#555",
    fontSize: 13,
    marginBottom: 10,
  },
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  roundBadge: {
    color: "#555",
    fontSize: 12,
    width: 24,
  },
  voteName: { color: "#fff", fontSize: 13, flex: 1 },
  resultTag: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  resultTagHit: {
    backgroundColor: "#2D0A0E",
    borderWidth: 1,
    borderColor: "#E63946",
  },
  resultTagMiss: {
    backgroundColor: "#0F3460",
  },
  resultTagEscaped: {
    backgroundColor: "#1E1A00",
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  resultTagText: { fontSize: 11, fontWeight: "600" },
  resultTagTextHit: { color: "#E63946" },
  resultTagTextMiss: { color: "#888" },
  resultTagTextEscaped: { color: "#FFD700" },
  playAgainBtn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  },
  playAgainText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  waitingBox: { padding: 18, alignItems: "center" },
  waitingText: { color: "#888", fontSize: 14, textAlign: "center" },
});
