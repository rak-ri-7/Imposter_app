// src/games/timer/screens/TimerRunningScreen.tsx
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { useState, useEffect } from "react";
import { Group } from "../../../shared/types";
import { useTimerGame } from "../logic/useTimerGame";
import { useRunningDistractions } from "../hooks/useRunningDistractions";
import DistractionOverlay from "../components/DistractionOverlay";
import { useAmbientSounds } from "../hooks/useAmbientSounds";

type Props = {
  group: Group;
  playerId: string;
};

export default function TimerRunningScreen({ group, playerId }: Props) {
  const { hasStopped, handleStop, gameState } = useTimerGame(group, playerId);
  const [pulseAnim] = useState(new Animated.Value(1));
  const stoppedCount = Object.keys(gameState?.stops ?? {}).length;
  const totalPlayers = group.players.length;

  const { current } = useRunningDistractions({
    enabled: gameState?.distractionsEnabled ?? false,
    active: gameState?.phase === "running" && !hasStopped,
    timerStartedAt: gameState?.timerStartedAt ?? 0,
    answer: gameState?.answer ?? 0,
  });

  useEffect(() => {
    if (hasStopped) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [hasStopped]);

  useAmbientSounds({
    enabled: gameState?.distractionsEnabled ?? false,
    active: gameState?.phase === "running" && !hasStopped,
  });

  return (
    <View style={styles.container}>
      {!hasStopped ? (
        <>
          <Text style={styles.tapHint}>
            Tap when you think the timer matches your answer!
          </Text>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
              <Text style={styles.stopBtnText}>STOP</Text>
            </TouchableOpacity>
          </Animated.View>

          <Text style={styles.subHint}>
            The timer is running...{"\n"}count in your head!
          </Text>

          <DistractionOverlay distraction={current} />
        </>
      ) : (
        <>
          <Text style={styles.stoppedEmoji}>✋</Text>
          <Text style={styles.stoppedTitle}>Stopped!</Text>
          <Text style={styles.stoppedHint}>Waiting for others...</Text>
          <View style={styles.waitingCount}>
            <Text style={styles.waitingCountText}>
              {stoppedCount} / {totalPlayers} stopped
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D1B2A",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  tapHint: {
    color: "#888",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 48,
    lineHeight: 22,
  },
  stopBtn: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "#E63946",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#FF6B75",
    elevation: 8,
    shadowColor: "#E63946",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  stopBtnText: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "bold",
    letterSpacing: 4,
  },
  subHint: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginTop: 48,
    lineHeight: 22,
  },
  stoppedEmoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  stoppedTitle: {
    color: "#4FC3F7",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 12,
  },
  stoppedHint: {
    color: "#888",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 24,
  },
  waitingCount: {
    backgroundColor: "#1B2A3B",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#4FC3F7",
  },
  waitingCountText: {
    color: "#4FC3F7",
    fontSize: 16,
    fontWeight: "600",
  },
});
