import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from "react-native";
import { Group } from "../../../shared/types";
import { useTimerGame } from "../logic/useTimerGame";
import { startTimerGame } from "../logic/game";

type Props = {
  group: Group;
  playerId: string;
};

export default function TimerLobbyScreen({ group, playerId }: Props) {
  const { isHost, loading } = useTimerGame(group, playerId);

  const onStart = async () => {
    if (group.players.length < 2) {
      return Alert.alert("Need at least 2 players!");
    }
    await startTimerGame(group);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⏱️ Stop the Timer</Text>
      <Text style={styles.subtitle}>Mental math + timing challenge</Text>

      <View style={styles.rulesBox}>
        <Text style={styles.rulesTitle}>How to play</Text>
        <Text style={styles.rule}>1. A question appears on screen</Text>
        <Text style={styles.rule}>2. Calculate the answer in your head</Text>
        <Text style={styles.rule}>
          3. A hidden timer starts — stop it when you think it matches the
          answer
        </Text>
        <Text style={styles.rule}>
          4. Closest to the answer wins the round!
        </Text>
      </View>

      <Text style={styles.playersLabel}>PLAYERS ({group.players.length})</Text>
      <FlatList
        data={group.players}
        keyExtractor={(item) => item.id}
        style={styles.playerList}
        renderItem={({ item }) => (
          <View style={styles.playerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.playerName}>{item.name}</Text>
            {item.id === playerId && (
              <View style={styles.youBadge}>
                <Text style={styles.youText}>You</Text>
              </View>
            )}
            {item.isHost && (
              <View style={styles.hostBadge}>
                <Text style={styles.hostText}>Host</Text>
              </View>
            )}
          </View>
        )}
      />

      {isHost ? (
        <TouchableOpacity
          style={styles.startBtn}
          onPress={onStart}
          disabled={loading}
        >
          <Text style={styles.startBtnText}>Start Game →</Text>
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
    backgroundColor: "#0D1B2A",
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    color: "#4FC3F7",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 24,
    letterSpacing: 1,
  },
  rulesBox: {
    backgroundColor: "#1B2A3B",
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#4FC3F7",
  },
  rulesTitle: {
    color: "#4FC3F7",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 10,
  },
  rule: {
    color: "#aaa",
    fontSize: 13,
    lineHeight: 22,
  },
  playersLabel: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 10,
  },
  playerList: {
    flex: 1,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1B2A3B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D3349",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  playerName: {
    color: "#fff",
    fontSize: 15,
    flex: 1,
  },
  youBadge: {
    backgroundColor: "#0D3349",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  youText: {
    color: "#4FC3F7",
    fontSize: 12,
  },
  hostBadge: {
    backgroundColor: "#4FC3F7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hostText: {
    color: "#0D1B2A",
    fontSize: 12,
    fontWeight: "600",
  },
  startBtn: {
    backgroundColor: "#4FC3F7",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 16,
  },
  startBtnText: {
    color: "#0D1B2A",
    fontSize: 16,
    fontWeight: "bold",
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
