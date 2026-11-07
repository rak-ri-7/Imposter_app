import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from "react-native";
import { useState } from "react";
import { Group } from "../../../shared/types";
import { sessionTeamSides } from "../../../shared/utils/teams";
import { useTimerGame } from "../logic/useTimerGame";
import { startTimerGame } from "../logic/game";
import HowToPlay from "../../../shared/components/HowToPlay";
import PixelAvatar from "../../../shared/avatars/PixelAvatar";
import { avatarIdFor } from "../../../shared/avatars/sprites";

type Props = {
  group: Group;
  playerId: string;
};

export default function TimerLobbyScreen({ group, playerId }: Props) {
  const { isHost, loading } = useTimerGame(group, playerId);
  // Teams set up in the game menu? The host can play this as teams.
  const teams = sessionTeamSides(group);
  const [asTeams, setAsTeams] = useState(true);
  const playTeams = !!teams && asTeams;

  const onStart = async () => {
    if (group.players.length < 2) {
      return Alert.alert("Need at least 2 players!");
    }
    await startTimerGame(group, playTeams);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⏱️ Stop the Timer</Text>
      <Text style={styles.subtitle}>Mental math + timing challenge</Text>

      <HowToPlay
        game="stop-the-timer"
        center
        theme={{ text: "#E6EEF5", muted: "#9AA7B5", accent: "#4FC3F7", sheet: "#0D1B2A", panel: "#1B2A3B", sheetText: "#E6EEF5", sheetMuted: "#9AA7B5" }}
      />

      {teams && !isHost && (
        <View style={styles.teamToggle}>
          <Text style={styles.teamToggleTitle}>👥 Teams are set up</Text>
          <Text style={styles.teamToggleText}>
            The host chooses whether this game is played as teams or everyone for themselves.
          </Text>
        </View>
      )}
      {teams && isHost && (
        <TouchableOpacity
          style={[styles.teamToggle, playTeams && styles.teamToggleOn]}
          onPress={() => setAsTeams((v) => !v)}
        >
          <Text style={styles.teamToggleTitle}>
            {playTeams ? "👥 Playing as teams" : "🙋 Everyone for themselves"}
            {"  ·  tap to switch"}
          </Text>
          <Text style={styles.teamToggleText}>
            {playTeams
              ? `${teams.map((t) => t.name).join(" vs ")}. Everyone stops their own timer; the team closest on average wins the round, and every member scores.`
              : "Ignore the teams: closest single player wins."}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.playersLabel}>PLAYERS ({group.players.length})</Text>
      <FlatList
        data={group.players}
        keyExtractor={(item) => item.id}
        style={styles.playerList}
        renderItem={({ item }) => (
          <View style={styles.playerRow}>
            <View style={styles.avatar}>
              <PixelAvatar avatar={avatarIdFor(item, group.players)} playerId={item.id} size={40} />
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
    overflow: "hidden",
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
  teamToggle: {
    backgroundColor: "#1B2A3B",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A3A4B",
    padding: 14,
    marginBottom: 16,
    gap: 4,
  },
  teamToggleOn: { borderColor: "#4FC3F7" },
  teamToggleTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  teamToggleText: { color: "#9AA7B5", fontSize: 13, lineHeight: 18 },
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
