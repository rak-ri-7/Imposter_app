import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../hooks/useGroup";
import { saveTeams } from "../firebase/groups";
import { Team, Player } from "../types";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "TeamSetup">;
  route: RouteProp<RootStackParamList, "TeamSetup">;
};

const TEAM_COLORS = ["#E63946", "#4FC3F7", "#4CAF50", "#FFD700"];
const TEAM_NAMES = ["Team A", "Team B", "Team C", "Team D"];

const generateTeamId = () => Math.random().toString(36).substring(2, 8);

export default function TeamSetupScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group } = useGroup(groupId);
  const [teams, setTeams] = useState<Team[]>(() => {
    if (group?.teams && group.teams.length > 0) return group.teams;
    return [
      {
        id: generateTeamId(),
        name: "Team A",
        playerIds: [],
        color: TEAM_COLORS[0],
      },
      {
        id: generateTeamId(),
        name: "Team B",
        playerIds: [],
        color: TEAM_COLORS[1],
      },
    ];
  });
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"pick" | "manual" | "random" | null>("pick");

  if (!group) return null;

  const assignedPlayerIds = teams.flatMap((t) => t.playerIds);
  const unassignedPlayers = group.players.filter(
    (p) => !assignedPlayerIds.includes(p.id),
  );

  const randomizeTeams = () => {
    const shuffled = [...group.players].sort(() => Math.random() - 0.5);
    const half = Math.ceil(shuffled.length / 2);
    const newTeams: Team[] = [
      {
        id: generateTeamId(),
        name: "Team A",
        playerIds: shuffled.slice(0, half).map((p) => p.id),
        color: TEAM_COLORS[0],
      },
      {
        id: generateTeamId(),
        name: "Team B",
        playerIds: shuffled.slice(half).map((p) => p.id),
        color: TEAM_COLORS[1],
      },
    ];
    setTeams(newTeams);
    setMode("manual");
  };

  const movePlayerToTeam = (playerId: string, teamId: string) => {
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        playerIds:
          t.id === teamId
            ? [...t.playerIds.filter((id) => id !== playerId), playerId]
            : t.playerIds.filter((id) => id !== playerId),
      })),
    );
  };

  const removePlayerFromTeam = (playerId: string) => {
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        playerIds: t.playerIds.filter((id) => id !== playerId),
      })),
    );
  };

  const updateTeamName = (teamId: string, name: string) => {
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, name } : t)));
  };

  const addTeam = () => {
    if (teams.length >= 4) return;
    const index = teams.length;
    setTeams((prev) => [
      ...prev,
      {
        id: generateTeamId(),
        name: TEAM_NAMES[index],
        playerIds: [],
        color: TEAM_COLORS[index],
      },
    ]);
  };

  const removeTeam = (teamId: string) => {
    if (teams.length <= 2) return Alert.alert("Need at least 2 teams");
    setTeams((prev) => prev.filter((t) => t.id !== teamId));
  };

  const handleConfirm = async () => {
    const allAssigned = group.players.every((p) =>
      teams.some((t) => t.playerIds.includes(p.id)),
    );
    if (!allAssigned) {
      return Alert.alert(
        "Unassigned players",
        "All players must be in a team before confirming.",
      );
    }
    const emptyTeams = teams.filter((t) => t.playerIds.length === 0);
    if (emptyTeams.length > 0) {
      return Alert.alert(
        "Empty teams",
        "Remove empty teams before confirming.",
      );
    }
    setLoading(true);
    try {
      await saveTeams(groupId, teams);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const getPlayerName = (id: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Unknown";

  if (mode === "pick") {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>👥 Play as Teams</Text>
        <Text style={styles.subtitle}>How do you want to form teams?</Text>

        <View style={styles.pickBox}>
          <TouchableOpacity
            style={styles.pickBtn}
            onPress={() => {
              randomizeTeams();
              setMode("manual");
            }}
          >
            <Text style={styles.pickEmoji}>🎲</Text>
            <Text style={styles.pickName}>Randomize</Text>
            <Text style={styles.pickDesc}>
              App splits players into 2 random teams
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickBtn}
            onPress={() => setMode("manual")}
          >
            <Text style={styles.pickEmoji}>✋</Text>
            <Text style={styles.pickName}>Assign Manually</Text>
            <Text style={styles.pickDesc}>
              Host decides who goes in which team
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => setMode("pick")}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>👥 Set Up Teams</Text>
      <Text style={styles.subtitle}>
        Tap a player to move them between teams
      </Text>

      <ScrollView showsVerticalScrollIndicator={false}>
        {unassignedPlayers.length > 0 && (
          <View style={styles.unassignedBox}>
            <Text style={styles.unassignedLabel}>UNASSIGNED</Text>
            <View style={styles.playerChips}>
              {unassignedPlayers.map((player) => (
                <View key={player.id} style={styles.unassignedChip}>
                  <Text style={styles.unassignedChipText}>{player.name}</Text>
                  <View style={styles.assignBtns}>
                    {teams.map((team) => (
                      <TouchableOpacity
                        key={team.id}
                        style={[
                          styles.assignBtn,
                          { backgroundColor: team.color },
                        ]}
                        onPress={() => movePlayerToTeam(player.id, team.id)}
                      >
                        <Text style={styles.assignBtnText}>{team.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {teams.map((team, index) => (
          <View
            key={team.id}
            style={[styles.teamBox, { borderColor: team.color }]}
          >
            <View style={styles.teamHeader}>
              <View
                style={[styles.teamColorDot, { backgroundColor: team.color }]}
              />
              <TextInput
                style={styles.teamNameInput}
                value={team.name}
                onChangeText={(t) => updateTeamName(team.id, t)}
                maxLength={20}
                placeholder="Team name"
                placeholderTextColor="#888"
              />
              {teams.length > 2 && (
                <TouchableOpacity onPress={() => removeTeam(team.id)}>
                  <Text style={styles.removeTeamBtn}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {team.playerIds.length === 0 ? (
              <Text style={styles.emptyTeam}>No players yet</Text>
            ) : (
              <View style={styles.teamPlayers}>
                {team.playerIds.map((pid) => (
                  <View key={pid} style={styles.teamPlayerChip}>
                    <Text style={styles.teamPlayerName}>
                      {getPlayerName(pid)}
                    </Text>
                    <TouchableOpacity onPress={() => removePlayerFromTeam(pid)}>
                      <Text style={styles.removePlayerBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {teams.length < 4 && (
          <TouchableOpacity style={styles.addTeamBtn} onPress={addTeam}>
            <Text style={styles.addTeamText}>+ Add another team</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.confirmBtn}
        onPress={handleConfirm}
        disabled={loading}
      >
        <Text style={styles.confirmBtnText}>
          {loading ? "Saving..." : "Confirm Teams →"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7FA",
    padding: 20,
    paddingTop: 60,
  },
  backBtn: { marginBottom: 16 },
  backText: { color: "#888", fontSize: 14 },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1A1A2E",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
  },
  pickBox: { gap: 12, marginTop: 20 },
  pickBtn: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EAEAEE",
  },
  pickEmoji: { fontSize: 36, marginBottom: 8 },
  pickName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A2E",
    marginBottom: 4,
  },
  pickDesc: { fontSize: 12, color: "#888", textAlign: "center" },
  unassignedBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EAEAEE",
  },
  unassignedLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
  },
  playerChips: { gap: 8 },
  unassignedChip: {
    backgroundColor: "#F7F7FA",
    borderRadius: 10,
    padding: 10,
  },
  unassignedChipText: {
    color: "#1A1A2E",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  assignBtns: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  assignBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  assignBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  teamBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  teamColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  teamNameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A2E",
    padding: 0,
  },
  removeTeamBtn: { color: "#888", fontSize: 16, padding: 4 },
  emptyTeam: { color: "#888", fontSize: 13, textAlign: "center", padding: 8 },
  teamPlayers: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  teamPlayerChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F7FA",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  teamPlayerName: { color: "#1A1A2E", fontSize: 13 },
  removePlayerBtn: { color: "#E63946", fontSize: 12 },
  addTeamBtn: {
    borderWidth: 1,
    borderColor: "#EAEAEE",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  addTeamText: { color: "#888", fontSize: 14 },
  confirmBtn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
