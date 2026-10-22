import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  TextInput,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../hooks/useGroup";
import { GameType, Team } from "../types";
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
import { denseRanks, rankMedal } from "../utils/ranking";
import { AllTimeRow, getProfile, loadAllTime, setRealName } from "../firebase/profiles";

// Leaderboard slides: 🏆 Session → one per game played this session →
// 🌍 All-time (everyone you've played with, across sessions, merged by
// real name).
type SlideKey = "session" | "alltime" | GameType;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "GameMenu">;
  route: RouteProp<RootStackParamList, "GameMenu">;
};

export default function GameMenuScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  const [showModeModal, setShowModeModal] = useState(false);
  const [showPlayerSelect, setShowPlayerSelect] = useState(false);
  const [pendingGameId, setPendingGameId] = useState<GameType | null>(null);
  const [activeTab, setActiveTab] = useState<"leaderboard" | "players">(
    "leaderboard",
  );

  // Leaderboard slides
  const [slide, setSlide] = useState(0);
  const [pageW, setPageW] = useState(0);
  const pager = useRef<ScrollView>(null);
  const [allTime, setAllTime] = useState<AllTimeRow[] | null>(null);
  const [allTimeError, setAllTimeError] = useState(false);
  const [allTimeLoading, setAllTimeLoading] = useState(false);
  const refreshAllTime = async () => {
    setAllTimeLoading(true);
    setAllTimeError(false);
    try {
      setAllTime(await loadAllTime(playerId));
    } catch {
      setAllTimeError(true);
    } finally {
      setAllTimeLoading(false);
    }
  };

  // Real name (this phone's all-time identity)
  const [realName, setRealNameState] = useState<string>("");
  const [nameModal, setNameModal] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => {
    getProfile(playerId)
      .then((p) => setRealNameState(p?.realName ?? ""))
      .catch(() => {});
  }, [playerId]);
  const saveRealName = async (value: string) => {
    try {
      await setRealName(playerId, value);
      setRealNameState(value.trim().replace(/\s+/g, " "));
      setNameModal(false);
      setAllTime(null);
    } catch {
      Alert.alert("Couldn't save", "Check your connection (or the Firestore rule for profiles) and try again.");
    }
  };

  const isHost = group?.hostId === playerId;

  useEffect(() => {
    if (group?.currentGame === "imposter") {
      navigation.replace("ImposterFlow", { groupId, playerId });
    } else if (group?.currentGame === "stop-the-timer") {
      navigation.replace("TimerFlow", { groupId, playerId });
    } else if (group?.currentGame === "pass-the-bomb") {
      navigation.replace("BombFlow", { groupId, playerId });
    } else if (group?.currentGame === "quiz-board") {
      navigation.replace("QuizBoardFlow", { groupId, playerId });
    } else if (group?.currentGame === "card-clash") {
      navigation.replace("ClashFlow", { groupId, playerId });
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
    gameId: GameType | "most-likely-to" | "two-truths-lie",
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
    } else if (
      gameId === "stop-the-timer" ||
      gameId === "pass-the-bomb" ||
      gameId === "quiz-board" ||
      gameId === "card-clash"
    ) {
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

  const playedGames = games.filter((g) =>
    Object.values(group.gameScores?.[g.id as GameType] ?? {}).some((v) => (v ?? 0) > 0),
  );
  const slides: { key: SlideKey; label: string }[] = [
    { key: "session", label: "🏆 Session" },
    ...playedGames.map((g) => ({ key: g.id as GameType, label: `${g.emoji} ${g.name}` })),
    { key: "alltime", label: "🌍 All-time" },
  ];
  const slideIndex = Math.min(slide, slides.length - 1);
  const goToSlide = (i: number) => {
    setSlide(i);
    pager.current?.scrollTo({ x: i * pageW, animated: true });
    if (slides[i]?.key === "alltime" && !allTimeLoading) refreshAllTime();
  };

  const selectedGame = games.find((g) => g.id === "imposter");
  const supportsPassThePhone = selectedGame?.modes.includes("pass-the-phone");

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

  // One session board (overall or a single game), as teams or players.
  // Equal scores share a place (10, 10, 7 -> 🥇 🥇 🥈).
  const renderBoard = (scoreOf: (pid: string) => number) => {
    if (teamsEnabled) {
      const teamScore = (t: Team) => t.playerIds.reduce((sum, pid) => sum + scoreOf(pid), 0);
      const teams = [...(group.teams ?? [])].sort((a, b) => teamScore(b) - teamScore(a));
      const ranks = denseRanks(teams.map(teamScore));
      return teams.map((team, index) => (
        <View key={team.id}>
          <View style={styles.leaderRow}>
            <Text style={styles.leaderRank}>{rankMedal(ranks[index])}</Text>
            <View style={[styles.teamDot, { backgroundColor: team.color }]} />
            <Text style={styles.leaderName}>{team.name}</Text>
            <Text style={styles.leaderScore}>{teamScore(team)} pts</Text>
          </View>
          <Text style={styles.teamMemberNames}>
            {team.playerIds.map((pid) => group.players.find((p) => p.id === pid)?.name).join(", ")}
          </Text>
        </View>
      ));
    }
    const players = [...group.players].sort((a, b) => scoreOf(b.id) - scoreOf(a.id));
    const ranks = denseRanks(players.map((p) => scoreOf(p.id)));
    return players.map((player, index) => (
      <View key={player.id} style={styles.leaderRow}>
        <Text style={styles.leaderRank}>{rankMedal(ranks[index])}</Text>
        <Text style={styles.leaderName}>
          {player.name}
          {player.id === playerId ? " (you)" : ""}
        </Text>
        <Text style={styles.leaderScore}>{scoreOf(player.id)} pts</Text>
      </View>
    ));
  };

  const renderAllTime = () => {
    if (allTimeError) {
      return (
        <TouchableOpacity onPress={refreshAllTime}>
          <Text style={styles.allTimeNote}>
            Couldn't load the all-time board. Tap to retry.{"\n"}(If this keeps happening, the Firestore rule for profiles is missing.)
          </Text>
        </TouchableOpacity>
      );
    }
    if (!allTime) {
      return <Text style={styles.allTimeNote}>{allTimeLoading ? "Loading…" : "Swipe here to load"}</Text>;
    }
    if (allTime.length === 0) {
      return <Text style={styles.allTimeNote}>No all-time points yet. Play a game!</Text>;
    }
    const ranks = denseRanks(allTime.map((r) => r.total));
    return (
      <>
        {allTime.map((row, index) => {
          const parts = games
            .filter((g) => (row.games[g.id as GameType] ?? 0) > 0)
            .map((g) => `${g.emoji} ${row.games[g.id as GameType]}`);
          return (
            <View key={row.key} style={styles.allTimeRow}>
              <View style={styles.leaderRow}>
                <Text style={styles.leaderRank}>{rankMedal(ranks[index])}</Text>
                <Text style={styles.leaderName} numberOfLines={1}>
                  {row.name}
                  {row.isMe ? " (you)" : ""}
                </Text>
                <Text style={styles.leaderScore}>{row.total} pts</Text>
              </View>
              {parts.length > 0 && <Text style={styles.allTimeGames}>{parts.join("  ·  ")}</Text>}
            </View>
          );
        })}
        <TouchableOpacity onPress={refreshAllTime}>
          <Text style={styles.allTimeRefresh}>{allTimeLoading ? "Refreshing…" : "↻ Refresh"}</Text>
        </TouchableOpacity>
      </>
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
      <TouchableOpacity
        style={styles.nameChip}
        onPress={() => {
          setNameDraft(realName);
          setNameModal(true);
        }}
      >
        <Text style={styles.nameChipText}>
          {realName ? `👤 Real name: ${realName}  ✏️` : "👤 Set your real name for the all-time board  ✏️"}
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
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {slides.map((sl, i) => (
              <TouchableOpacity
                key={sl.key}
                style={[styles.chip, i === slideIndex && styles.chipOn]}
                onPress={() => goToSlide(i)}
              >
                <Text style={[styles.chipText, i === slideIndex && styles.chipTextOn]}>
                  {sl.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View
            style={styles.leaderboardBox}
            onLayout={(e) => setPageW(e.nativeEvent.layout.width)}
          >
            {pageW > 0 && (
              <ScrollView
                ref={pager}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const i = Math.round(e.nativeEvent.contentOffset.x / pageW);
                  if (i !== slideIndex) {
                    setSlide(i);
                    if (slides[i]?.key === "alltime" && !allTimeLoading) refreshAllTime();
                  }
                }}
              >
                {slides.map((sl) => (
                  <ScrollView
                    key={sl.key}
                    style={{ width: pageW }}
                    contentContainerStyle={styles.page}
                    nestedScrollEnabled
                  >
                    {sl.key === "alltime"
                      ? renderAllTime()
                      : renderBoard(
                          sl.key === "session"
                            ? (pid) => group.scores[pid] || 0
                            : (pid) => group.gameScores?.[sl.key as GameType]?.[pid] || 0,
                        )}
                  </ScrollView>
                ))}
              </ScrollView>
            )}
          </View>
          <View style={styles.dots}>
            {slides.map((sl, i) => (
              <View key={sl.key} style={[styles.dot, i === slideIndex && styles.dotOn]} />
            ))}
          </View>
        </View>
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

      {/* Real name: ties this phone's points to one name across sessions */}
      <Modal
        visible={nameModal}
        transparent
        animationType="slide"
        onRequestClose={() => setNameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>👤 Your real name</Text>
            <Text style={styles.modalSubtitle}>
              Whatever username you play under, this phone's points go to this name on the 🌍 All-time board. Use the same name on every phone you play on.
            </Text>
            <TextInput
              style={styles.nameInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="e.g. Rakesh"
              placeholderTextColor="#AAA"
              maxLength={30}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={() => saveRealName(nameDraft)}
            />
            <TouchableOpacity style={styles.nameSave} onPress={() => saveRealName(nameDraft)}>
              <Text style={styles.nameSaveText}>Save</Text>
            </TouchableOpacity>
            {!!realName && (
              <TouchableOpacity style={styles.modalCancel} onPress={() => saveRealName("")}>
                <Text style={[styles.modalCancelText, { color: "#E63946" }]}>Remove real name</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setNameModal(false)}>
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
  leaderboardBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    height: 190,
    overflow: "hidden",
  },
  page: { padding: 16 },
  chipRow: { gap: 8, paddingBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#EAEAEE",
  },
  chipOn: { backgroundColor: "#E63946", borderColor: "#E63946" },
  chipText: { color: "#555", fontSize: 12, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8, marginBottom: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#D6D6DE" },
  dotOn: { backgroundColor: "#E63946", width: 16 },
  allTimeRow: { marginBottom: 2 },
  allTimeGames: { color: "#888", fontSize: 11, marginLeft: 44, marginTop: -6, marginBottom: 6 },
  allTimeNote: { color: "#888", fontSize: 13, textAlign: "center", marginTop: 30, lineHeight: 19 },
  allTimeRefresh: { color: "#E63946", fontSize: 12, textAlign: "center", marginTop: 8, fontWeight: "600" },
  nameChip: {
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: -10,
    marginBottom: 16,
  },
  nameChipText: { color: "#1A1A2E", fontSize: 12, fontWeight: "600" },
  nameInput: {
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#1A1A2E",
    marginBottom: 12,
  },
  nameSave: { backgroundColor: "#E63946", borderRadius: 12, padding: 14, alignItems: "center" },
  nameSaveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
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
