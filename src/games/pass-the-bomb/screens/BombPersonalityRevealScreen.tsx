import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import {
  playSound,
  pickRevealSound,
} from "../../../shared/sounds/soundManager";

type Props = { group: Group; playerId: string };

export default function BombPersonalityRevealScreen({ group }: Props) {
  const gameState = group.gameState as BombGameState;
  const [scaleAnim] = useState(new Animated.Value(0.6));
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
    playSound(pickRevealSound());
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
          alignItems: "center",
        }}
      >
        <Text style={styles.roundLabel}>ROUND {gameState.roundNumber}</Text>
        <Text style={styles.emoji}>{gameState.personalityEmoji}</Text>
        <Text style={styles.name}>{gameState.personalityName}</Text>
        <Text style={styles.description}>
          {gameState.personalityDescription}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  roundLabel: {
    color: "#888",
    fontSize: 13,
    letterSpacing: 3,
    marginBottom: 20,
  },
  emoji: { fontSize: 100, marginBottom: 20 },
  name: {
    color: "#FF4500",
    fontSize: 28,
    fontWeight: "bold",
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: 16,
  },
  description: {
    color: "#aaa",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 12,
  },
});
