import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import { duelPass, cutWire, getLiarHint } from "../logic/game";

type Props = {
  group: Group;
  playerId: string;
};

export default function BombDuelScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const isHolder = gameState.currentHolderId === playerId;
  const opponent = group.players.find(
    (p) => p.id !== playerId && !gameState.ghosts.includes(p.id),
  );
  const holderName =
    group.players.find((p) => p.id === gameState.currentHolderId)?.name ?? "";

  const [timeLeft, setTimeLeft] = useState(gameState.duelHoldSeconds ?? 4);
  const [acting, setActing] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));
  const forcedRef = useRef(false);
  const [liarHint, setLiarHint] = useState("");

  const holdSeconds = gameState.duelHoldSeconds ?? 4;
  const holdStartedAt = gameState.duelHoldStartedAt ?? Date.now();

  useEffect(() => {
    if (
      gameState.personalityEffect === "liar" &&
      isHolder &&
      gameState.correctWire
    ) {
      setLiarHint(getLiarHint(gameState.correctWire));
    }
  }, [gameState.currentHolderId, gameState.personalityEffect]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ).start();
    Vibration.vibrate(100);
  }, [gameState.currentHolderId]);

  useEffect(() => {
    forcedRef.current = false;

    const tick = () => {
      const elapsed = (Date.now() - holdStartedAt) / 1000;
      const remaining = Math.max(0, holdSeconds - elapsed);
      setTimeLeft(remaining);

      if (remaining <= 0 && isHolder && !forcedRef.current) {
        forcedRef.current = true;
        const randomWire = Math.random() < 0.5 ? "red" : "blue";
        cutWire(group, playerId, randomWire);
      }
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [holdStartedAt, holdSeconds, isHolder, group.id]);

  const handlePass = async () => {
    if (!isHolder || acting || !opponent) return;
    setActing(true);
    try {
      await duelPass(group, playerId, opponent.id);
    } finally {
      setActing(false);
    }
  };

  const handleCut = async (wire: "red" | "blue") => {
    if (!isHolder || acting) return;
    setActing(true);
    try {
      await cutWire(group, playerId, wire);
    } finally {
      setActing(false);
    }
  };

  const urgency = timeLeft <= 1.5;

  return (
    <View style={styles.container}>
      <Text style={styles.duelBanner}>⚡ FINAL DUEL</Text>
      <Text style={styles.duelSub}>
        {group.players.filter((p) => !gameState.ghosts.includes(p.id)).length}{" "}
        players left — winner takes it all
      </Text>

      <Animated.View
        style={[
          styles.bombContainer,
          { transform: [{ scale: pulseAnim }] },
          isHolder && styles.bombContainerHolder,
        ]}
      >
        <Text style={styles.bombEmoji}>💣</Text>
        <Text style={[styles.holdTimer, urgency && styles.holdTimerUrgent]}>
          {timeLeft.toFixed(1)}s
        </Text>
        {isHolder ? (
          <Text style={styles.youHaveIt}>ACT NOW</Text>
        ) : (
          <Text style={styles.holderName}>{holderName} must act</Text>
        )}
      </Animated.View>

      {isHolder ? (
        <>
          {gameState.personalityEffect === "liar" && liarHint !== "" && (
            <View style={styles.liarHintBox}>
              <Text style={styles.liarHintText}>🎭 {liarHint}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.passBtn}
            onPress={handlePass}
            disabled={acting || !opponent}
          >
            <Text style={styles.passBtnText}>
              Pass to {opponent?.name ?? "opponent"} →
            </Text>
          </TouchableOpacity>

          <Text style={styles.orText}>— OR —</Text>

          <View style={styles.wireContainer}>
            <TouchableOpacity
              style={[styles.wire, styles.wireRed]}
              onPress={() => handleCut("red")}
              disabled={acting}
            >
              <Text style={styles.wireText}>🔴</Text>
              <Text style={styles.wireLabelText}>CUT RED</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.wire, styles.wireBlue]}
              onPress={() => handleCut("blue")}
              disabled={acting}
            >
              <Text style={styles.wireText}>🔵</Text>
              <Text style={styles.wireLabelText}>CUT BLUE</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Run out of time and a wire gets cut for you — 50/50.
          </Text>
        </>
      ) : (
        <>
          {gameState.personalityEffect === "liar" && (
            <Text style={styles.liarWarning}>
              🎭 This bomb lies. Their tip may be wrong.
            </Text>
          )}
          <Text style={styles.watchingEmoji}>👀</Text>
          <Text style={styles.watchingText}>
            Watch closely — every hold gets faster.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    padding: 24,
    paddingTop: 60,
  },
  duelBanner: {
    color: "#FF4500",
    fontSize: 22,
    fontWeight: "bold",
    letterSpacing: 2,
    marginBottom: 4,
  },
  duelSub: { color: "#888", fontSize: 12, marginBottom: 20 },
  bombContainer: {
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
    width: "100%",
  },
  bombContainerHolder: { borderColor: "#FF4500", backgroundColor: "#2A0A0A" },
  bombEmoji: { fontSize: 56, marginBottom: 8 },
  holdTimer: { color: "#fff", fontSize: 40, fontWeight: "bold" },
  holdTimerUrgent: { color: "#FF0000" },
  youHaveIt: {
    color: "#FF4500",
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 2,
    marginTop: 8,
  },
  holderName: { color: "#888", fontSize: 13, marginTop: 8 },
  liarHintBox: {
    backgroundColor: "#1A0A2A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#9B59B6",
    width: "100%",
  },
  liarHintText: { color: "#fff", fontSize: 13, fontStyle: "italic" },
  passBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    width: "100%",
    marginBottom: 12,
  },
  passBtnText: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  orText: { color: "#555", fontSize: 12, marginBottom: 12 },
  wireContainer: { flexDirection: "row", gap: 16, marginBottom: 16 },
  wire: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
  },
  wireRed: { backgroundColor: "#3A0000", borderColor: "#FF0000" },
  wireBlue: { backgroundColor: "#00003A", borderColor: "#0000FF" },
  wireText: { fontSize: 32, marginBottom: 4 },
  wireLabelText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  hint: { color: "#555", fontSize: 11, textAlign: "center" },
  liarWarning: {
    color: "#9B59B6",
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 16,
    textAlign: "center",
  },
  watchingEmoji: { fontSize: 72, marginTop: 20 },
  watchingText: { color: "#888", fontSize: 13, marginTop: 12 },
});
