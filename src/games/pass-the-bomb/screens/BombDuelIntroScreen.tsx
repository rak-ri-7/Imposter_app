import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import { markDuelReady, setDuelMode } from "../logic/game";
import { startDuelFastestFinger } from "../logic/duelFastestFinger";
import { startHotSeatDuel } from "../logic/hotSeatDuel";

type Props = {
  group: Group;
  playerId: string;
};

export default function BombDuelIntroScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const activePlayers = group.players.filter(
    (p) => !gameState.ghosts.includes(p.id),
  );
  const isFinalist = activePlayers.some((p) => p.id === playerId);
  const readyPlayers = gameState.duelReadyPlayers ?? [];
  const amReady = readyPlayers.includes(playerId);
  const [submitting, setSubmitting] = useState(false);

  const isHost = group.hostId === playerId;
  const duelMode = gameState.duelMode ?? "hot-potato";

  const [scaleAnim] = useState(new Animated.Value(0.7));
  const [fadeAnim] = useState(new Animated.Value(0));
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    const readyPlayers = gameState.duelReadyPlayers ?? [];
    const activePlayers = group.players.filter(
      (p) => !gameState.ghosts.includes(p.id),
    );
    const bothReady = activePlayers.every((p) => readyPlayers.includes(p.id));
    console.log(
      "[DuelIntro effect] activePlayers:",
      activePlayers.map((p) => p.id),
      "bothReady:",
      bothReady,
      "duelMode:",
      duelMode,
      "phase:",
      gameState.phase,
      "readyPlayers:",
      readyPlayers,
    );
    if (
      isHost &&
      bothReady &&
      duelMode === "fastest-finger" &&
      gameState.phase !== "duel"
    ) {
      startDuelFastestFinger(group);
    }
  }, [gameState.duelReadyPlayers, duelMode, gameState.phase]);

  useEffect(() => {
    const readyPlayers = gameState.duelReadyPlayers ?? [];
    const activePlayers = group.players.filter(
      (p) => !gameState.ghosts.includes(p.id),
    );
    const bothReady = activePlayers.every((p) => readyPlayers.includes(p.id));
    if (
      isHost &&
      bothReady &&
      duelMode === "hot-seat" &&
      gameState.phase !== "duel"
    ) {
      startHotSeatDuel(group);
    }
  }, [gameState.duelReadyPlayers, duelMode, gameState.phase]);

  useEffect(() => {
    Vibration.vibrate([100, 80, 100]);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const handleReady = async () => {
    if (amReady || submitting) return;
    setSubmitting(true);
    try {
      await markDuelReady(group, playerId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Animated.Text
          style={[styles.duelTitle, { transform: [{ scale: pulseAnim }] }]}
        >
          ⚡ FINAL DUEL ⚡
        </Animated.Text>
        <Text style={styles.duelSubtitle}>Only one walks away</Text>

        <View style={styles.finalistsBox}>
          {activePlayers.map((p, i) => (
            <View key={p.id} style={styles.finalistRow}>
              <Text style={styles.finalistName}>
                {p.name}
                {p.id === playerId ? " (you)" : ""}
              </Text>
              <Text style={styles.finalistStatus}>
                {readyPlayers.includes(p.id) ? "✅ Ready" : "⏳ Waiting..."}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.rulesText}>
          Just a friednly reminder. Every pass makes the next hold shorter.
        </Text>

        {isHost && (
          <View style={styles.modeSelectBox}>
            <Text style={styles.modeSelectLabel}>DUEL MODE</Text>
            <View style={styles.modeSelectRow}>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  duelMode === "hot-potato" && styles.modeBtnActive,
                ]}
                onPress={() => setDuelMode(group.id, "hot-potato")}
              >
                <Text style={styles.modeBtnText}>🔥 Hot Potato</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  duelMode === "fastest-finger" && styles.modeBtnActive,
                ]}
                onPress={() => setDuelMode(group.id, "fastest-finger")}
              >
                <Text style={styles.modeBtnText}>⚡ Fastest Finger</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeBtn,
                  duelMode === "hot-seat" && styles.modeBtnActive,
                ]}
                onPress={() => setDuelMode(group.id, "hot-seat")}
              >
                <Text style={styles.modeBtnText}>🪑 Hot Seat</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isFinalist ? (
          <TouchableOpacity
            style={[styles.readyBtn, amReady && styles.readyBtnDone]}
            onPress={handleReady}
            disabled={amReady || submitting}
          >
            <Text style={styles.readyBtnText}>
              {amReady ? "✅ You're Ready" : "I'M READY 💪"}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.spectatorText}>
            👀 Watching from the sidelines...
          </Text>
        )}
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
    padding: 24,
  },
  content: { alignItems: "center", width: "100%" },
  duelTitle: {
    color: "#FF4500",
    fontSize: 34,
    fontWeight: "bold",
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 8,
  },
  duelSubtitle: {
    color: "#888",
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 28,
  },
  finalistsBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "#FF4500",
    marginBottom: 20,
    gap: 10,
  },
  finalistRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  finalistName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  finalistStatus: { color: "#888", fontSize: 13 },
  rulesText: {
    color: "#666",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  readyBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 40,
    width: "100%",
    alignItems: "center",
  },
  readyBtnDone: {
    backgroundColor: "#2A2A2A",
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  readyBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  spectatorText: { color: "#555", fontSize: 14 },

  modeSelectBox: { width: "100%", marginBottom: 20 },
  modeSelectLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
    textAlign: "center",
  },
  modeSelectRow: { flexDirection: "row", gap: 10 },
  modeBtn: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  modeBtnActive: { borderColor: "#FF4500", backgroundColor: "#2A1A1A" },
  modeBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
