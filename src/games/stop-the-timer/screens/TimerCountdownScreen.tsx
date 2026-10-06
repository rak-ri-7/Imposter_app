import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Group, TimerGameState } from "../../../shared/types";
import { useTimerGame } from "../logic/useTimerGame";

type Props = {
  group: Group;
  playerId: string;
};

export default function TimerCountdownScreen({ group, playerId }: Props) {
  const { countdown } = useTimerGame(group, playerId);
  const [scaleAnim] = useState(new Animated.Value(1));
  const gameState = group.gameState as TimerGameState;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.3,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [countdown]);

  return (
    <View style={styles.container}>
      <Text style={styles.question}>{gameState.question}</Text>

      <View style={styles.countdownBox}>
        <Text style={styles.getReady}>Get ready...</Text>
        <Animated.Text
          style={[styles.countdown, { transform: [{ scale: scaleAnim }] }]}
        >
          {countdown}
        </Animated.Text>
        <Text style={styles.hint}>Timer starts when this hits zero!</Text>
      </View>
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
    justifyContent: "center",
  },
  question: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 60,
  },
  countdownBox: {
    alignItems: "center",
  },
  getReady: {
    color: "#888",
    fontSize: 16,
    letterSpacing: 2,
    marginBottom: 16,
  },
  countdown: {
    color: "#4FC3F7",
    fontSize: 96,
    fontWeight: "bold",
    marginBottom: 16,
  },
  hint: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
  },
});
