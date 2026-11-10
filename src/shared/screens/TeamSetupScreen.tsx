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
import { Team } from "../types";
import { display } from "../theme/fonts";
import BackLink from "../components/BackLink";
import { padBottom, useBottomInset } from "../hooks/useSafeBottom";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "TeamSetup">;
  route: RouteProp<RootStackParamList, "TeamSetup">;
};

const TEAM_COLORS = ["#E63946", "#4FC3F7", "#4CAF50", "#FFD700"];
const TEAM_NAMES = ["Team A", "Team B", "Team C", "Team D"];

const generateTeamId = () => Math.random().toString(36).substring(2, 8);

export default function TeamSetupScreen({ navigation, route }: Props) {
  const bottomInset = useBottomInset(); // clear of the phone's bottom bar
  const { groupId } = route.params;
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

  // Deal everyone into the current teams at random, as evenly as possible
  // (team names and colours stay). Players set to watch keep watching.
  const randomizeTeams = (count = teams.length) => {
    const watchers = new Set(unassignedPlayers.map((p) => p.id));
    const nobodyPlaced = watchers.size === group.players.length;
    const pool = group.players.filter((p) => mode === "pick" || nobodyPlaced || !watchers.has(p.id));
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const base = Array.from({ length: count }, (_, i) =>
      teams[i] ?? { id: generateTeamId(), name: TEAM_NAMES[i], color: TEAM_COLORS[i], playerIds: [] },
    );
    setTeams(
      base.map((t, i) => ({
        ...t,
        playerIds: shuffled.filter((_, k) => k % count === i).map((p) => p.id),
      })),
    );
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

  const save = async () => {
    setLoading(true);
    try {
      await saveTeams(groupId, teams);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    const emptyTeams = teams.filter((t) => t.playerIds.length === 0);
    if (emptyTeams.length > 0) {
      return Alert.alert(
        "Empty team",
        `${emptyTeams.map((t) => t.name).join(", ")} has nobody in it. Add players or remove the team.`,
      );
    }
    // Players left off every team watch team games (that's allowed).
    if (unassignedPlayers.length > 0) {
      const names = unassignedPlayers.map((p) => p.name).join(", ");
      return Alert.alert(
        "Some players aren't on a team",
        `${names} will watch team games, and their points won't count toward a team. Save anyway?`,
        [
          { text: "Go back", style: "cancel" },
          { text: "Save", onPress: save },
        ],
      );
    }
    save();
  };

  const getPlayerName = (id: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Unknown";

  if (mode === "pick") {
    return (
      <View style={[styles.container, padBottom(styles.container, bottomInset)]}>
        <BackLink onPress={() => navigation.goBack()} />

        <Text style={styles.title}>👥 Play as Teams</Text>
        <Text style={styles.subtitle}>How do you want to form teams?</Text>

        <Text style={styles.usedFor}>
          Teams are used by 🏛️ Race Before the Roof Falls! (2 teams), and as an
          option in 💣 That Old Bomb Story (Pass mode), 📺 Quiz Board and ⏱️ Stop
          the Timer. In every game, points also add up to team totals on the
          leaderboard.
        </Text>

        <View style={styles.pickBox}>
          <TouchableOpacity
            style={styles.pickBtn}
            onPress={() => randomizeTeams(teams.length)}
          >
            <Text style={styles.pickEmoji}>🎲</Text>
            <Text style={styles.pickName}>Randomize</Text>
            <Text style={styles.pickDesc}>
              App splits everyone into 2 random teams. Change the number after.
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
    <View style={[styles.container, padBottom(styles.container, bottomInset)]}>
      <BackLink onPress={() => setMode("pick")} />

      <Text style={styles.title}>👥 Set Up Teams</Text>
      <Text style={styles.subtitle}>
        Tap a team button to move someone. ✕ takes them off a team to watch.
      </Text>

      <View style={styles.toolRow}>
        <Text style={styles.toolLabel}>🎲 Shuffle into</Text>
        {[2, 3, 4].map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.toolBtn, teams.length === n && styles.toolBtnOn]}
            onPress={() => randomizeTeams(n)}
          >
            <Text style={[styles.toolText, teams.length === n && styles.toolTextOn]}>
              {n} teams
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {unassignedPlayers.length > 0 && (
          <View style={styles.unassignedBox}>
            <Text style={styles.unassignedLabel}>NOT ON A TEAM · WATCHING</Text>
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

        {teams.map((team) => (
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
    ...display,
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
  usedFor: {
    color: "#666",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    padding: 12,
  },
  toolRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, justifyContent: "center" },
  toolLabel: { color: "#888", fontSize: 13, fontWeight: "700" },
  toolBtn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E2EA",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  toolBtnOn: { backgroundColor: "#1A1A2E", borderColor: "#1A1A2E" },
  toolText: { color: "#1A1A2E", fontSize: 13, fontWeight: "700" },
  toolTextOn: { color: "#fff" },
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
    backgroundColor: "#FFC83D", // the main button colour (sunshine), with a darker lip underneath
    borderBottomWidth: 4,
    borderBottomColor: "#D18F00",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  confirmBtnText: { color: "#121110", fontSize: 18, ...display },
});
