// src/games/timer/screens/TimerQuestionScreen.tsx
import { View, Text, StyleSheet, Animated } from "react-native";
import { useState, useEffect } from "react";
import { Group, TimerGameState } from "../../../shared/types";
import { useTimerGame } from "../logic/useTimerGame";
import { useDistractions } from "../hooks/useDistractions";
import DistractionWrapper from "../components/DistractionWrapper";
import DistractionOverlay from "../components/DistractionOverlay";

type Props = {
  group: Group;
  playerId: string;
};

export default function TimerQuestionScreen({ group, playerId }: Props) {
  const { countdown } = useTimerGame(group, playerId);
  const [scaleAnim] = useState(new Animated.Value(1));
  const gameState = group.gameState as TimerGameState;

  const isUrgent = countdown <= 3;

  const { current } = useDistractions({
    enabled: gameState.distractionsEnabled,
    active: gameState.phase === "question",
    roundKey: gameState.roundNumber,
  });

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.2,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [countdown]);

  const difficultyColor = {
    easy: "#4CAF50",
    medium: "#FFD700",
    hard: "#E63946",
  }[gameState.difficulty];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.roundLabel}>ROUND {gameState.roundNumber}</Text>
        <View style={[styles.diffBadge, { borderColor: difficultyColor }]}>
          <Text style={[styles.diffText, { color: difficultyColor }]}>
            {gameState.difficulty.toUpperCase()}
          </Text>
        </View>
      </View>

      <DistractionWrapper distraction={current}>
        <View style={styles.questionBox}>
          <Text style={styles.questionLabel}>CALCULATE</Text>
          <Text style={styles.question}>{gameState.question}</Text>
        </View>
      </DistractionWrapper>

      <View style={styles.countdownSection}>
        <Text style={styles.countdownLabel}>Timer starts in</Text>
        <Animated.Text
          style={[
            styles.countdown,
            { transform: [{ scale: scaleAnim }] },
            isUrgent && styles.countdownUrgent,
          ]}
        >
          {countdown}
        </Animated.Text>
        <Text style={styles.countdownHint}>
          Calculate now — hidden timer starts when this hits zero!
        </Text>
      </View>

      <DistractionOverlay distraction={current} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D1B2A",
    padding: 24,
    paddingTop: 60,
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 32,
  },
  roundLabel: {
    color: "#888",
    fontSize: 13,
    letterSpacing: 2,
  },
  diffBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  diffText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },
  questionBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  questionLabel: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 3,
    marginBottom: 20,
  },
  question: {
    color: "#fff",
    fontSize: 48,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 60,
  },
  countdownSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  countdownLabel: {
    color: "#888",
    fontSize: 13,
    marginBottom: 8,
    letterSpacing: 1,
  },
  countdown: {
    color: "#4FC3F7",
    fontSize: 72,
    fontWeight: "bold",
    marginBottom: 12,
  },
  countdownUrgent: {
    color: "#E63946",
  },
  countdownHint: {
    color: "#888",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
