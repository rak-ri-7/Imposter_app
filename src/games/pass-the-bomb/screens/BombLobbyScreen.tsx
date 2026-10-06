import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
  Alert,
  Switch,
} from "react-native";
import { Group, BombTimerMode } from "../../../shared/types";
import { startBombGame } from "../logic/game";

type Props = {
  group: Group;
  playerId: string;
};

export default function BombLobbyScreen({ group, playerId }: Props) {
  const [timerMode, setTimerMode] = useState<BombTimerMode>("on");
  const [loading, setLoading] = useState(false);
  const [seatingOrder, setSeatingOrder] = useState<string[]>(
    group.players.map((p) => p.id),
  );
  const [strictMemoryMode, setStrictMemoryMode] = useState(true); // default ON
  const isHost = group.hostId === playerId;

  const moveSeat = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= seatingOrder.length) return;
    const newOrder = [...seatingOrder];
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    setSeatingOrder(newOrder);
  };

  const onStart = async () => {
    if (group.players.length < 3) {
      return Alert.alert("Need at least 3 players!");
    }
    setLoading(true);
    try {
      await startBombGame(group, timerMode, seatingOrder, strictMemoryMode);
    } finally {
      setLoading(false);
    }
  };

  const timerModes: {
    id: BombTimerMode;
    label: string;
    desc: string;
    emoji: string;
  }[] = [
    {
      id: "on",
      label: "Timer Visible",
      desc: "Everyone sees the countdown",
      emoji: "⏱️",
    },
    {
      id: "off",
      label: "Timer Hidden",
      desc: "No one sees the countdown",
      emoji: "🙈",
    },
    {
      id: "mixed",
      label: "Mixed Mode",
      desc: "Lose lives = lose the timer",
      emoji: "💀",
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>💣 Pass the Bomb</Text>
      <Text style={styles.subtitle}>Social deduction under pressure</Text>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.rulesBox}>
          <Text style={styles.rulesTitle}>HOW TO PLAY</Text>
          <Text style={styles.rule}>💣 One player holds the bomb</Text>
          <Text style={styles.rule}>
            📜 They get a secret instruction to pass it
          </Text>
          <Text style={styles.rule}>🎯 Tap a player's name to pass</Text>
          <Text style={styles.rule}>
            ⚠️ At panic time — cut red or blue wire
          </Text>
          <Text style={styles.rule}>
            💥 Wrong wire or no time = lose a life
          </Text>
          <Text style={styles.rule}>
            ❤️ 3 lives each — last one standing wins!
          </Text>
        </View>

        {isHost && (
          <>
            <Text style={styles.sectionLabel}>TIMER MODE</Text>
            <View style={styles.timerModes}>
              {timerModes.map((mode) => (
                <TouchableOpacity
                  key={mode.id}
                  style={[
                    styles.modeBtn,
                    timerMode === mode.id && styles.modeBtnActive,
                  ]}
                  onPress={() => setTimerMode(mode.id)}
                >
                  <Text style={styles.modeEmoji}>{mode.emoji}</Text>
                  <Text
                    style={[
                      styles.modeLabel,
                      timerMode === mode.id && styles.modeLabelActive,
                    ]}
                  >
                    {mode.label}
                  </Text>
                  <Text style={styles.modeDesc}>{mode.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.memoryModeBox}>
              <Text style={styles.memoryModeLabel}>MEMORY INSTRUCTIONS</Text>
              <View style={styles.memoryModeRow}>
                <View style={styles.memoryModeTextCol}>
                  <Text style={styles.memoryModeTitle}>
                    {strictMemoryMode ? "🔒 Strict Mode" : "🎲 Casual Mode"}
                  </Text>
                  <Text style={styles.memoryModeDesc}>
                    {strictMemoryMode
                      ? "Wrong memory-based passes trigger a clingy lock"
                      : "Memory instructions are honor-system — no penalty for a wrong pass"}
                  </Text>
                </View>
                <Switch
                  value={strictMemoryMode}
                  onValueChange={setStrictMemoryMode}
                  trackColor={{ false: "#333", true: "#FF4500" }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {strictMemoryMode && (
              <>
                <Text style={styles.sectionLabel}>
                  SEATING ORDER (for left / right / opposite passes)
                </Text>
                <Text style={styles.seatingHint}>
                  Arrange players in the order they're actually sitting, going
                  around the circle. This lets the game check directional
                  passes.
                </Text>
                <View style={styles.seatingList}>
                  {seatingOrder.map((id, index) => {
                    const p = group.players.find((pl) => pl.id === id);
                    if (!p) return null;
                    const isFirst = index === 0;
                    const isLast = index === seatingOrder.length - 1;
                    return (
                      <View key={id} style={styles.seatRow}>
                        <View style={styles.seatIndexCircle}>
                          <Text style={styles.seatIndexText}>{index + 1}</Text>
                        </View>
                        <Text style={styles.seatName} numberOfLines={1}>
                          {p.name}
                          {p.id === playerId ? " (you)" : ""}
                        </Text>
                        <View style={styles.seatArrows}>
                          <TouchableOpacity
                            style={[
                              styles.seatArrowBtn,
                              isFirst && styles.seatArrowBtnDisabled,
                            ]}
                            onPress={() => moveSeat(index, -1)}
                            disabled={isFirst}
                          >
                            <Text
                              style={[
                                styles.seatArrowText,
                                isFirst && styles.seatArrowTextDisabled,
                              ]}
                            >
                              ↑
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.seatArrowBtn,
                              isLast && styles.seatArrowBtnDisabled,
                            ]}
                            onPress={() => moveSeat(index, 1)}
                            disabled={isLast}
                          >
                            <Text
                              style={[
                                styles.seatArrowText,
                                isLast && styles.seatArrowTextDisabled,
                              ]}
                            >
                              ↓
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}

        {!isHost && (
          <View style={styles.waitingSettings}>
            <Text style={styles.waitingSettingsText}>
              Host is setting up the game...
            </Text>
          </View>
        )}

        {!isHost && (
          <>
            <Text style={styles.sectionLabel}>
              PLAYERS ({group.players.length})
            </Text>
            <FlatList
              data={group.players}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.playerRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.playerName}>{item.name}</Text>
                  <View style={styles.livesRow}>
                    {[1, 2, 3].map((i) => (
                      <Text key={i} style={styles.heart}>
                        ❤️
                      </Text>
                    ))}
                  </View>
                  {item.isHost && (
                    <View style={styles.hostBadge}>
                      <Text style={styles.hostText}>Host</Text>
                    </View>
                  )}
                </View>
              )}
            />
          </>
        )}
      </ScrollView>

      {isHost ? (
        <TouchableOpacity
          style={styles.startBtn}
          onPress={onStart}
          disabled={loading}
        >
          <Text style={styles.startBtnText}>
            {loading ? "Starting..." : "Light the Fuse 💣"}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingText}>Waiting for host to start...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#FF4500",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  rulesBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#FF4500",
  },
  rulesTitle: {
    color: "#FF4500",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
    fontWeight: "600",
  },
  rule: {
    color: "#aaa",
    fontSize: 13,
    lineHeight: 24,
  },
  sectionLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
  },
  timerModes: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  modeBtnActive: {
    borderColor: "#FF4500",
    backgroundColor: "#2A1A1A",
  },
  modeEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  modeLabel: {
    color: "#888",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 2,
  },
  modeLabelActive: {
    color: "#FF4500",
  },
  modeDesc: {
    color: "#555",
    fontSize: 9,
    textAlign: "center",
  },

  // Seating order
  seatingHint: {
    color: "#555",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
    marginTop: -4,
  },
  seatingList: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
  },
  seatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#2A2A2A",
  },
  seatIndexCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  seatIndexText: {
    color: "#FF4500",
    fontSize: 12,
    fontWeight: "bold",
  },
  seatName: {
    color: "#fff",
    fontSize: 14,
    flex: 1,
  },
  seatArrows: {
    flexDirection: "row",
    gap: 6,
  },
  seatArrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#444",
  },
  seatArrowBtnDisabled: {
    opacity: 0.3,
  },
  seatArrowText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
  },
  seatArrowTextDisabled: {
    color: "#555",
  },

  waitingSettings: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    alignItems: "center",
  },
  waitingSettingsText: {
    color: "#888",
    fontSize: 13,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  playerName: { color: "#fff", fontSize: 15, flex: 1 },
  livesRow: { flexDirection: "row", gap: 2 },
  heart: { fontSize: 12 },
  hostBadge: {
    backgroundColor: "#FF4500",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hostText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  startBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 12,
  },
  startBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  waitingBox: { padding: 18, alignItems: "center" },
  waitingText: { color: "#888", fontSize: 14, textAlign: "center" },

  memoryModeBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
  },
  memoryModeLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
  },
  memoryModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  memoryModeTextCol: {
    flex: 1,
  },
  memoryModeTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  memoryModeDesc: {
    color: "#666",
    fontSize: 11,
    lineHeight: 15,
  },
});
