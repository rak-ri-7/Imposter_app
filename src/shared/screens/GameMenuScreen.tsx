import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../hooks/useGroup";
import { Team } from "../types";
import {
  startSelectedGame,
  dissolveTeams,
  leaveGroup,
  removePlayer,
  setActivePlayersForGame,
} from "../firebase/groups";
import { games } from "../../games/registry";
import { clearSession } from "../utils/session";
import { BackHandler } from "react-native";
import PlayerSelectModal from "../components/PlayerSelectModal";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "GameMenu">;
  route: RouteProp<RootStackParamList, "GameMenu">;
};

export default function GameMenuScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  const [showModeModal, setShowModeModal] = useState(false);
  const [showPlayerSelect, setShowPlayerSelect] = useState(false);
  const [pendingGameId, setPendingGameId] = useState<
    "imposter" | "stop-the-timer" | "pass-the-bomb" | null
  >(null);
  const [activeTab, setActiveTab] = useState<"leaderboard" | "players">(
    "leaderboard",
  );

  const isHost = group?.hostId === playerId;

  useEffect(() => {
    if (group?.currentGame === "imposter") {
      navigation.replace("ImposterFlow", { groupId, playerId });
    } else if (group?.currentGame === "stop-the-timer") {
      navigation.replace("TimerFlow", { groupId, playerId });
    } else if (group?.currentGame === "pass-the-bomb") {
      navigation.replace("BombFlow", { groupId, playerId });
    }
  }, [group?.currentGame]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        navigation.navigate("GroupLobby", { groupId, playerId });
        return true;
      },
    );
    return () => backHandler.remove();
  }, [navigation, groupId, playerId]);

  const onSelectGame = async (
    gameId:
      | "imposter"
      | "stop-the-timer"
      | "pass-the-bomb"
      | "most-likely-to"
      | "two-truths-lie",
    available: boolean,
  ) => {
    if (!available) return;
    if (!isHost || !group) return;
    const gameDef = games.find((g) => g.id === gameId)!;
    if (group.players.length < gameDef.minPlayers) {
      return Alert.alert(`Needs ${gameDef.minPlayers}+ players`);
    }
    if (gameId === "imposter") {
      // show mode modal for imposter since it supports pass the phone
      setShowModeModal(true);
    } else if (gameId === "stop-the-timer" || gameId === "pass-the-bomb") {
      // online only — let host pick who's actually playing, then go straight in
      setPendingGameId(gameId);
      setShowPlayerSelect(true);
    } else {
      return;
    }
  };

  const handlePlayerSelectConfirm = async (selectedIds: string[]) => {
    if (!group || !pendingGameId) return;
    await setActivePlayersForGame(group.id, group.players, selectedIds);
    await startSelectedGame(groupId, pendingGameId);
    setShowPlayerSelect(false);
    setPendingGameId(null);
  };

  const handlePlayerSelectCancel = () => {
    setShowPlayerSelect(false);
    setPendingGameId(null);
  };

  if (loading || !group) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const sortedPlayers = [...group.players].sort(
    (a, b) => (group.scores[b.id] || 0) - (group.scores[a.id] || 0),
  );

  const selectedGame = games.find((g) => g.id === "imposter");
  const supportsPassThePhone = selectedGame?.modes.includes("pass-the-phone");

  const getTeamScore = (team: Team) => {
    return team.playerIds.reduce(
      (sum: number, pid: string) => sum + (group.scores[pid] || 0),
      0,
    );
  };

  const teamsEnabled =
    group?.teamsEnabled && group.teams && group.teams.length > 0;

  const handleLeave = () => {
    Alert.alert(
      "Leave Group?",
      isHost
        ? "You are the host. Next player will become host if you leave."
        : "Are you sure you want to leave?",
      [
        { text: "Stay", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            if (!group) return;
            await leaveGroup(group.id, playerId, isHost, group.players);
            await clearSession();
            navigation.replace("Home");
          },
        },
      ],
    );
  };

  const handleKick = (targetId: string, targetName: string) => {
    if (!group) return;
    Alert.alert(
      "Remove Player?",
      `Remove ${targetName} from the group? They'll need to rejoin with the group code.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removePlayer(group.id, targetId, group.players, group.hostId);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
        <Text style={styles.leaveBtnText}>← Leave Group</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Game Menu</Text>
      <TouchableOpacity onPress={() => Alert.alert("Group Code", group.code)}>
        <Text style={styles.codeHint}>
          Group code: {group.code} (tap to view)
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>LEADERBOARD</Text>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === "leaderboard" && styles.tabBtnActive,
          ]}
          onPress={() => setActiveTab("leaderboard")}
        >
          <Text
            style={[
              styles.tabBtnText,
              activeTab === "leaderboard" && styles.tabBtnTextActive,
            ]}
          >
            🏆 Leaderboard
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === "players" && styles.tabBtnActive,
          ]}
          onPress={() => setActiveTab("players")}
        >
          <Text
            style={[
              styles.tabBtnText,
              activeTab === "players" && styles.tabBtnTextActive,
            ]}
          >
            👥 Players ({group.players.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "leaderboard" ? (
        <ScrollView style={styles.leaderboard} nestedScrollEnabled>
          {teamsEnabled
            ? [...(group.teams ?? [])]
                .sort((a, b) => getTeamScore(b) - getTeamScore(a))
                .map((team, index) => (
                  <View key={team.id}>
                    <View style={styles.leaderRow}>
                      <Text style={styles.leaderRank}>
                        {index === 0
                          ? "🥇"
                          : index === 1
                            ? "🥈"
                            : index === 2
                              ? "🥉"
                              : `${index + 1}.`}
                      </Text>
                      <View
                        style={[
                          styles.teamDot,
                          { backgroundColor: team.color },
                        ]}
                      />
                      <Text style={styles.leaderName}>{team.name}</Text>
                      <Text style={styles.leaderScore}>
                        {getTeamScore(team)} pts
                      </Text>
                    </View>
                    <Text style={styles.teamMemberNames}>
                      {team.playerIds
                        .map(
                          (pid) =>
                            group.players.find((p) => p.id === pid)?.name,
                        )
                        .join(", ")}
                    </Text>
                  </View>
                ))
            : sortedPlayers.map((player, index) => (
                <View key={player.id} style={styles.leaderRow}>
                  <Text style={styles.leaderRank}>
                    {index === 0
                      ? "🥇"
                      : index === 1
                        ? "🥈"
                        : index === 2
                          ? "🥉"
                          : `${index + 1}.`}
                  </Text>
                  <Text style={styles.leaderName}>
                    {player.name}
                    {player.id === playerId ? " (you)" : ""}
                  </Text>
                  <Text style={styles.leaderScore}>
                    {group.scores[player.id] || 0} pts
                  </Text>
                </View>
              ))}
        </ScrollView>
      ) : (
        <ScrollView style={styles.leaderboard} nestedScrollEnabled>
          {group.players.map((player) => (
            <View key={player.id} style={styles.playerMgmtRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {player.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.leaderName}>
                {player.name}
                {player.id === playerId ? " (you)" : ""}
              </Text>
              {player.isHost && (
                <View style={styles.hostBadge}>
                  <Text style={styles.hostBadgeText}>Host</Text>
                </View>
              )}
              {isHost && player.id !== playerId && (
                <TouchableOpacity
                  style={styles.kickBtn}
                  onPress={() => handleKick(player.id, player.name)}
                >
                  <Text style={styles.kickBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}
      {isHost && (
        <View style={styles.teamBtnRow}>
          {teamsEnabled ? (
            <>
              <TouchableOpacity
                style={styles.teamBtn}
                onPress={() =>
                  navigation.navigate("TeamSetup", { groupId, playerId })
                }
              >
                <Text style={styles.teamBtnText}>👥 Edit Teams</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.teamBtn, styles.teamBtnOutline]}
                onPress={async () => {
                  await dissolveTeams(groupId);
                }}
              >
                <Text style={styles.teamBtnOutlineText}>Dissolve Teams</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.teamBtn}
              onPress={() =>
                navigation.navigate("TeamSetup", { groupId, playerId })
              }
            >
              <Text style={styles.teamBtnText}>👥 Play as Teams</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.sectionLabel}>CHOOSE A GAME</Text>
      <FlatList
        data={games}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => {
          const enoughPlayers = group.players.length >= item.minPlayers;
          const available = item.available !== false;
          const canPlay = isHost && enoughPlayers && available;

          return (
            <TouchableOpacity
              style={[
                styles.gameCard,
                available && styles.gameCardAvailable,
                !canPlay && styles.gameCardDisabled,
              ]}
              onPress={() => onSelectGame(item.id, available)}
              disabled={!canPlay}
            >
              {available ? (
                <View style={styles.readyBadge}>
                  <Text style={styles.readyBadgeText}>Ready</Text>
                </View>
              ) : (
                <View style={styles.soonBadge}>
                  <Text style={styles.soonBadgeText}>Soon</Text>
                </View>
              )}
              <Text style={styles.gameEmoji}>{item.emoji}</Text>
              <Text style={styles.gameName}>{item.name}</Text>
              <Text style={styles.gameDesc}>{item.description}</Text>
              {available && !enoughPlayers && (
                <Text style={styles.gameWarning}>
                  Needs {item.minPlayers}+ players
                </Text>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {!isHost && (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingText}>
            Waiting for host to pick a game...
          </Text>
        </View>
      )}

      {/* Mode selector modal — only for games that support pass the phone */}
      <Modal
        visible={showModeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🕵️ Imposter</Text>
            <Text style={styles.modalSubtitle}>Choose your game mode</Text>

            <TouchableOpacity
              style={styles.modeBtn}
              onPress={() => {
                setShowModeModal(false);
                setPendingGameId("imposter");
                setShowPlayerSelect(true);
              }}
            >
              <Text style={styles.modeEmoji}>📱</Text>
              <View style={styles.modeBtnText}>
                <Text style={styles.modeName}>Online</Text>
                <Text style={styles.modeDesc}>
                  Everyone plays on their own phone
                </Text>
              </View>
            </TouchableOpacity>

            {supportsPassThePhone && (
              <TouchableOpacity
                style={styles.modeBtn}
                onPress={() => {
                  setShowModeModal(false);
                  Alert.alert(
                    "Coming Soon",
                    "Group Pass the Phone mode is coming soon!",
                  );
                }}
              >
                <Text style={styles.modeEmoji}>🤝</Text>
                <View style={styles.modeBtnText}>
                  <Text style={styles.modeName}>Pass the Phone</Text>
                  <Text style={styles.modeDesc}>
                    One phone, uses your group's players
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setShowModeModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Player selection modal — host picks who's actually playing before start */}
      <PlayerSelectModal
        visible={showPlayerSelect}
        players={group.players}
        minPlayers={games.find((g) => g.id === pendingGameId)?.minPlayers ?? 2}
        onConfirm={handlePlayerSelectConfirm}
        onCancel={handlePlayerSelectCancel}
      />
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
  loadingText: {
    color: "#333",
    textAlign: "center",
    marginTop: 100,
    fontSize: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#1A1A2E",
    textAlign: "center",
    marginBottom: 4,
  },
  codeHint: {
    color: "#E63946",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
  },
  sectionLabel: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 10,
  },
  leaderboard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    height: 170,
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  leaderRank: {
    fontSize: 16,
    width: 32, // was likely just `width: 28` or unset — now matches avatar
    height: 32, // new — matches avatar height exactly
    textAlign: "center",
    textAlignVertical: "center", // Android vertical centering for Text
    lineHeight: 32, // iOS vertical centering for Text (matches height)
  },
  leaderName: {
    color: "#1A1A2E",
    fontSize: 15,
    flex: 1,
  },
  leaderScore: {
    color: "#D4A017",
    fontSize: 15,
    fontWeight: "600",
  },
  row: {
    gap: 10,
  },
  gameCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    position: "relative",
    minHeight: 140,
    justifyContent: "center",
  },
  gameCardAvailable: {
    borderWidth: 1.5,
    borderColor: "#E63946",
  },
  gameCardDisabled: {
    opacity: 0.55,
  },
  readyBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#FDEAEA",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  readyBadgeText: {
    color: "#E63946",
    fontSize: 10,
    fontWeight: "600",
  },
  soonBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#F0F0F2",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  soonBadgeText: {
    color: "#888",
    fontSize: 10,
    fontWeight: "600",
  },
  gameEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  gameName: {
    color: "#1A1A2E",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
    textAlign: "center",
  },
  gameDesc: {
    color: "#888",
    fontSize: 11,
    textAlign: "center",
  },
  gameWarning: {
    color: "#E63946",
    fontSize: 10,
    marginTop: 6,
    textAlign: "center",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1A1A2E",
    textAlign: "center",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginBottom: 24,
  },
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F7FA",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 14,
    borderWidth: 1,
    borderColor: "#EAEAEE",
  },
  modeEmoji: {
    fontSize: 28,
  },
  modeBtnText: {
    flex: 1,
  },
  modeName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A2E",
    marginBottom: 2,
  },
  modeDesc: {
    fontSize: 12,
    color: "#888",
  },
  modalCancel: {
    alignItems: "center",
    marginTop: 8,
    padding: 12,
  },
  modalCancelText: {
    color: "#888",
    fontSize: 15,
  },

  teamBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  teamBtn: {
    flex: 1,
    backgroundColor: "#1A1A2E",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  teamBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  teamBtnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#E63946",
  },
  teamBtnOutlineText: {
    color: "#E63946",
    fontSize: 14,
    fontWeight: "600",
  },
  teamDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 2,
  },
  teamMemberNames: {
    color: "#888",
    fontSize: 11,
    marginLeft: 40,
    marginTop: -4,
    marginBottom: 8,
  },

  leaveBtn: {
    alignItems: "center",
    padding: 14,
    marginTop: 4,
  },
  leaveBtnText: {
    color: "#888",
    fontSize: 14,
  },

  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#EAEAEE",
  },
  tabBtnActive: {
    backgroundColor: "#1A1A2E",
    borderColor: "#1A1A2E",
  },
  tabBtnText: {
    color: "#888",
    fontSize: 13,
    fontWeight: "600",
  },
  tabBtnTextActive: {
    color: "#fff",
  },
  playerMgmtRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0F3460",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  hostBadge: {
    backgroundColor: "#E63946",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hostBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  kickBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FDEAEA",
    alignItems: "center",
    justifyContent: "center",
  },
  kickBtnText: {
    color: "#E63946",
    fontSize: 13,
    fontWeight: "700",
  },
});
