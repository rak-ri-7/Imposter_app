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
  Share,
  Image,
} from "react-native";
import { POSTER_BY_GAME } from "../assets/posters";
import { TILE_ART_BY_GAME } from "../assets/tiles";

// The menu is two tiles per row; a lone last tile gets an empty partner so
// it stays tile-sized (a stretched tile blows its picture up and crops it).
const SPACER_ID = "__spacer";
const padToPairs = <T extends { id: string }>(xs: T[]): T[] => (xs.length % 2 ? [...xs, { id: SPACER_ID } as T] : xs);
import { display, displaySemi } from "../theme/fonts";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp, useIsFocused } from "@react-navigation/native";
import PixelAvatar from "../avatars/PixelAvatar";
import { avatarIdFor } from "../avatars/sprites";
import ChatSheet from "../components/ChatSheet";
import ProfileSheet from "../components/ProfileSheet";
import ThemeSheet from "../components/ThemeSheet";
import LeaveGroupSheet from "../components/LeaveGroupSheet";
import { inviteMessage, inviteUrl } from "../config/invite";
import { useChat } from "../hooks/useChat";
import TalkButton from "../voice/TalkButton";
import { statusColor, useOnlineStatus } from "../hooks/useOnlineStatus";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../hooks/useGroup";
import { GameType, Team } from "../types";
import {
  startSelectedGame,
  dissolveTeams,
  leaveGroup,
  removePlayer,
  returnToMenu,
  setActivePlayersForGame,
  touchGroup,
} from "../firebase/groups";
import { games, GameDefinition, GameKind, KIND_LABEL, fitFor, minutesLabel, playersLabel, usesTeams } from "../../games/registry";
import GameInfoSheet from "../components/GameInfoSheet";
import MiniGame, { useMinimizedRoute } from "../components/MiniGame";
import { ThemeWallpaper, menuThemeById, menuThemeStyles } from "../themes/menuThemes";
import { routeForGame } from "../hooks/useMinimizableGame";
import { fromSessionTeams } from "../../games/roof-race/logic/engine";
import { clearSession } from "../utils/session";
import { BackHandler } from "react-native";
import PlayerSelectModal from "../components/PlayerSelectModal";
import { denseRanks, rankMedal } from "../utils/ranking";
import { AllTimeRow, getProfile, loadAllTime, setRealName } from "../firebase/profiles";
import BackLink from "../components/BackLink";
import { haptics } from "../haptics";
import { useBottomInset } from "../hooks/useSafeBottom";
import CoachMarks from "../components/CoachMarks";

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
  // The leaderboard and player list open as overlays, leaving the screen to the games.
  const [sheet, setSheet] = useState<null | "board" | "players" | "chat" | "me" | "theme">(null);
  const [leaving, setLeaving] = useState(false);
  const chat = useChat(groupId, playerId);
  // Who's here (and keeps this phone checked in while the menu is on top).
  const isFocused = useIsFocused();
  const online = useOnlineStatus(groupId, playerId, (group?.players ?? []).map((p) => p.id), isFocused);
  // The game whose details are open, and the filter chip picked.
  const [info, setInfo] = useState<GameDefinition | null>(null);
  // 👉 First-time tour: what each button up top does
  const tourMe = useRef<View>(null);
  const tourTheme = useRef<View>(null);
  const tourInvite = useRef<View>(null);
  const tourBoard = useRef<View>(null);
  const tourTalk = useRef<View>(null);
  const tourTile = useRef<View>(null);
  const [filter, setFilter] = useState<"all" | "fit" | "quick" | GameKind>("all");
  const anyBest = !!group && games.some((g) => fitFor(g, group.players.length) === "best");
  // Players left and the "Best for" chip went away while it was picked.
  useEffect(() => {
    if (filter === "fit" && !anyBest) setFilter("all");
  }, [filter, anyBest]);

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
  useEffect(() => {
    getProfile(playerId)
      .then((p) => setRealNameState(p?.realName ?? ""))
      .catch(() => {});
  }, [playerId]);
  const saveRealName = async (value: string): Promise<boolean> => {
    try {
      await setRealName(playerId, value);
      setRealNameState(value.trim().replace(/\s+/g, " "));
      setAllTime(null);
      return true;
    } catch {
      Alert.alert("Couldn't save", "Check your connection (or the Firestore rule for profiles) and try again.");
      return false;
    }
  };

  const isHost = group?.hostId === playerId;
  // 🎨 The group's theme: a wallpaper plus colours for text and buttons.
  const theme = menuThemeById(group?.menuTheme);
  const T = menuThemeStyles(theme);
  useEffect(() => {
    touchGroup(groupId);
  }, [groupId]);

  // A game starts → open it. Unless it's minimised underneath already (the
  // player came here to check the board or chat): then it stays a mini
  // player until they tap it.
  const minimized = useMinimizedRoute(group);
  const bottomInset = useBottomInset(); // clear of the phone's bottom bar
  useEffect(() => {
    const target = routeForGame(group?.currentGame);
    if (!target || minimized || !isFocused) return;
    navigation.replace(target as any, { groupId, playerId });
  }, [group?.currentGame, minimized, isFocused]);

  useEffect(() => {
    // Only while this screen is on top (a hidden menu must never grab the
    // press), and go BACK to the lobby rather than stacking a second one.
    if (!isFocused) return;
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        navigation.popTo("GroupLobby", { groupId, playerId });
        return true;
      },
    );
    return () => backHandler.remove();
  }, [navigation, groupId, playerId, isFocused]);

  const onSelectGame = async (
    gameId: GameType,
    available: boolean,
    justClosed = false, // the previous game was closed a moment ago
  ): Promise<void> => {
    if (!available) return;
    if (!isHost || !group) return;
    const gameDef = games.find((g) => g.id === gameId)!;
    // A game is still running (minimised): close it first?
    const running = !justClosed && group.currentGame !== "menu" ? games.find((g) => g.id === group.currentGame) : null;
    if (running) {
      return Alert.alert(
        `Close ${running.name}?`,
        `${running.name} is still running (minimised). Starting ${gameDef.name} closes it for everyone. Rounds already scored keep their points.`,
        [
          { text: `Keep ${running.name}`, style: "cancel" },
          {
            text: `Close & start`,
            style: "destructive",
            onPress: async () => {
              await returnToMenu(groupId);
              onSelectGame(gameId, available, true);
            },
          },
        ],
      );
    }
    if (group.players.length < gameDef.minPlayers) {
      return Alert.alert(`Needs ${gameDef.minPlayers}+ players`);
    }
    if (gameId === "roof-race") {
      // Played by the session's teams: exactly 2 of them, set up first.
      const fit = fromSessionTeams(group.teamsEnabled, group.teams, group.players.map((p) => p.id));
      if (!fit.ok) {
        return Alert.alert("Two teams needed", fit.problem, [
          { text: "Cancel", style: "cancel" },
          { text: "👥 Set up teams", onPress: () => navigation.navigate("TeamSetup", { groupId, playerId }) },
        ]);
      }
    }
    if (gameId === "imposter") {
      // show mode modal for imposter since it supports pass the phone
      setShowModeModal(true);
    } else if (
      gameId === "stop-the-timer" ||
      gameId === "pass-the-bomb" ||
      gameId === "quiz-board" ||
      gameId === "card-clash" ||
      gameId === "clash-holdem" ||
      gameId === "court-of-thieves" ||
      gameId === "match-the-following" ||
      gameId === "roof-race"
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
      <View style={[styles.container, T.container]}>
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

  // The slim bar: top three of the session (or teams).
  const topLine = (() => {
    const rows = teamsEnabled
      ? (group.teams ?? []).map((t) => ({
          name: t.name,
          pts: t.playerIds.reduce((sum, pid) => sum + (group.scores[pid] || 0), 0),
        }))
      : group.players.map((p) => ({
          name: p.id === playerId ? "You" : p.name,
          pts: group.scores[p.id] || 0,
        }));
    rows.sort((a, b) => b.pts - a.pts);
    if (rows.every((r) => r.pts === 0)) return "";
    const ranks = denseRanks(rows.map((r) => r.pts));
    return rows
      .slice(0, 3)
      .map((r, i) => `${rankMedal(ranks[i])} ${r.name} ${r.pts}`)
      .join("  ·  ");
  })();

  // The app's own "Leave the group?" prompt (LeaveGroupSheet does the rest).
  const handleLeave = () => setLeaving(true);

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
    <View style={[styles.container, T.container]}>
      <ThemeWallpaper theme={theme} />
      <BackLink label="Leave" onPress={handleLeave} textStyle={T.sectionLabel} />
      {/* You (top left) and the invite (top right) */}
      <View style={styles.topBar}>
        {(() => {
          const me = group.players.find((p) => p.id === playerId);
          return (
            <TouchableOpacity ref={tourMe as any} style={styles.meChip} onPress={() => setSheet("me")} accessibilityLabel="Your profile and settings">
              <View>
                <PixelAvatar avatar={me ? avatarIdFor(me, group.players) : undefined} playerId={playerId} size={40} />
                {isHost && <Text style={styles.meCrown}>👑</Text>}
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.meName} numberOfLines={1}>{me?.name ?? "You"}</Text>
                <Text style={styles.meSub} numberOfLines={1}>
                  {group.scores?.[playerId] ?? 0} pts · {realName ? "Profile" : "Set up profile"} ›
                </Text>
              </View>
            </TouchableOpacity>
          );
        })()}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          ref={tourTheme as any}
          style={styles.themeBtn}
          onPress={() => setSheet("theme")}
          accessibilityLabel={`Group theme: ${theme.name}`}
        >
          <Text style={styles.themeBtnText}>🎨</Text>
        </TouchableOpacity>
        <TouchableOpacity
          ref={tourInvite as any}
          style={styles.inviteChip}
          onPress={() =>
            Share.share({
              message: inviteMessage(group.code, group.players.find((p) => p.id === group.hostId)?.name),
              url: inviteUrl(group.code),
            })
          }
          accessibilityLabel={`Invite friends, group code ${group.code}`}
        >
          <Text style={styles.inviteCode}>{group.code}</Text>
          <Text style={styles.inviteText}>➕ Invite</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.title, T.title]}>Game Menu</Text>

      {/* Slim standings bar: the full boards open as overlays */}
      <View style={[styles.standBar, T.standBar]}>
        <TouchableOpacity style={styles.standTop} onPress={() => setSheet("board")} activeOpacity={0.7}>
          <Text style={[styles.standText, T.standText]} numberOfLines={1}>
            {topLine || "🏆 No points yet"}
          </Text>
        </TouchableOpacity>
        <View style={styles.standBtns}>
          <TouchableOpacity ref={tourBoard as any} style={[styles.standBtn, { flex: 1.45 }, T.standBtn]} onPress={() => setSheet("board")}>
            <Text style={[styles.standBtnText, T.standBtnText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              🏆 Leaderboard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.standBtn, { flex: 1.25 }, T.standBtn]} onPress={() => setSheet("players")}>
            <Text style={[styles.standBtnText, T.standBtnText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              👥 Players ({group.players.length})
            </Text>
          </TouchableOpacity>
          {/* 💬 Chat and 🎙️ voice, in one drop-down */}
          <View ref={tourTalk} collapsable={false} style={{ flex: 0.95 }}>
            <TalkButton
              groupId={groupId}
              unread={chat.unread}
              onChat={() => setSheet("chat")}
              style={[styles.standBtn, T.standBtn]}
              textStyle={[styles.standBtnText, T.standBtnText]}
            />
          </View>
        </View>
      </View>

      {!isHost && (() => {
        const host = group.players.find((p) => p.id === group.hostId);
        return (
          <View style={styles.guestBanner}>
            {host && <PixelAvatar avatar={avatarIdFor(host, group.players)} size={40} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.guestBannerTitle}>
                Waiting for {host?.name ?? "the host"} to pick a game
              </Text>
              <Text style={styles.guestBannerSub}>
                Tap any game to see how it works. You'll jump in when it starts.
              </Text>
            </View>
          </View>
        );
      })()}

      <Text style={[styles.sectionLabel, T.sectionLabel]}>{isHost ? "CHOOSE A GAME" : "GAMES YOU CAN PLAY"}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0, marginBottom: 10 }}
        contentContainerStyle={styles.filterRow}
      >
        {([
          ["all", "All"],
          // Only when some game is actually at its best with this many
          // (with 1 player, none is: that chip would always be empty).
          ...(anyBest ? [["fit", `⭐ Best for ${group.players.length}`]] : []),
          ...(Object.keys(KIND_LABEL) as GameKind[])
            .filter((k) => games.some((g) => g.kind === k))
            .map((k) => [k, KIND_LABEL[k]]),
          ["quick", "⚡ Under 10 min"],
        ] as [typeof filter, string][]).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[[styles.filterChip, T.filterChip], filter === key && [styles.filterChipOn, T.filterChipOn]]}
            onPress={() => setFilter(key)}
          >
            <Text style={[[styles.filterText, T.filterText], filter === key && [styles.filterTextOn, T.filterTextOn]]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <FlatList
        contentContainerStyle={{ paddingBottom: (minimized ? 120 : 16) + bottomInset }}
        data={padToPairs(games.filter((g) =>
          filter === "all"
            ? true
            : filter === "fit"
              ? fitFor(g, group.players.length) === "best"
              : filter === "quick"
                ? g.minutes[0] <= 10 && g.minutes[1] <= 10
                : filter === "teams"
                  ? usesTeams(g)
                  : g.kind === filter,
        ))}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={
          <Text style={[styles.filterEmpty, T.filterEmpty]}>No games match that yet. Try another filter.</Text>
        }
        renderItem={({ item, index }) => {
          // An odd tile out keeps tile width (instead of stretching across).
          if ((item.id as string) === SPACER_ID) return <View style={{ flex: 1 }} />;
          const available = item.available !== false;
          const fit = fitFor(item, group.players.length);
          // A game that can't be played right now is faded INSIDE a solid
          // tile, so a themed wallpaper never shows through it.
          const faded = !available || fit === "short";
          return (
            <TouchableOpacity
              ref={index === 0 ? (tourTile as any) : undefined}
              style={styles.gameCard}
              onPress={() => {
                if (!available) return;
                haptics.tap();
                setInfo(item);
              }}
              disabled={!available}
              accessibilityHint="Shows how the game works"
            >
              {!available ? (
                <View style={styles.soonBadge}>
                  <Text style={styles.soonBadgeText}>Soon</Text>
                </View>
              ) : item.isNew ? (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View>
              ) : null}
              {/* The game's tile picture (our avatars acting it out) across the
                  top; the painted poster is kept for the info sheet. */}
              <View style={[styles.posterWrap, faded && styles.gameInnerFaded]}>
                {TILE_ART_BY_GAME[item.id] ?? POSTER_BY_GAME[item.id] ? (
                  <Image source={(TILE_ART_BY_GAME[item.id] ?? POSTER_BY_GAME[item.id])!} style={styles.posterImg} resizeMode="cover" />
                ) : (
                  <View style={[styles.posterImg, styles.posterEmpty]}>
                    <Text style={styles.gameEmoji}>{item.emoji}</Text>
                  </View>
                )}
                <View style={styles.posterEmoji}>
                  <Text style={styles.posterEmojiText}>{item.emoji}</Text>
                </View>
              </View>
              <View style={[styles.gameInner, faded && styles.gameInnerFaded]}>
                <Text style={styles.gameName}>{item.name}</Text>
                <Text style={styles.gameDesc}>{item.description}</Text>
                <Text style={styles.gameMeta}>
                  👥 {playersLabel(item)} · ⏱ {minutesLabel(item)}
                </Text>
                <Text style={styles.gameKind}>
                  {KIND_LABEL[item.kind]}
                  {item.teamPlay?.need === "optional" ? " · 👥 Team mode" : ""}
                </Text>
              </View>
              {fit === "best" && <Text style={styles.gameFit}>⭐ Great for {group.players.length}</Text>}
              {fit === "short" && <Text style={styles.gameWarning}>Needs {item.minPlayers}+ players</Text>}
            </TouchableOpacity>
          );
        }}
      />

      <GameInfoSheet
        game={info}
        onClose={() => setInfo(null)}
        group={group}
        playerId={playerId}
        onPlay={(g) => {
          setInfo(null);
          onSelectGame(g.id, g.available !== false);
        }}
      />

      {/* 👉 First-time tour (once per phone) */}
      <CoachMarks
        storageKey="tour.gameMenu.v1"
        paused={!isFocused || sheet !== null || info !== null || showModeModal || showPlayerSelect || leaving}
        steps={[
          { target: tourMe, title: "This is you", text: "Tap here to change your avatar and name, and see your points." },
          { target: tourTheme, title: "Group themes", text: "Pick a wallpaper and colours. It changes the look for everyone in the group." },
          { target: tourInvite, title: "Invite friends", text: "Share this code or link so friends can join from their phones." },
          { target: tourBoard, title: "Leaderboard", text: "Everyone's points from tonight's games, game by game." },
          {
            target: tourTalk,
            title: "Chat & group call",
            text: "Text the group, or join a voice call. The call only starts when you pick \u201cJoin voice chat\u201d.",
          },
          {
            target: tourTile,
            title: "The games",
            text: isHost
              ? "Tap a game to see how it's played, then start it for everyone."
              : "Tap a game to see how it's played. The host starts the game for everyone.",
          },
        ]}
      />

      {/* The minimised game, bottom right */}
      <MiniGame group={group} playerId={playerId} bottom={24 + bottomInset} />

      <ChatSheet
        visible={sheet === "chat"}
        onClose={() => setSheet(null)}
        group={group}
        playerId={playerId}
        messages={chat.messages}
        blocked={chat.blocked}
        onSeen={chat.markRead}
        onRetry={chat.retry}
      />

      {/* 🏆 Leaderboard overlay */}
      <Modal visible={sheet === "board"} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.sheetDismiss} activeOpacity={1} onPress={() => setSheet(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>🏆 Leaderboard</Text>
              <TouchableOpacity onPress={() => setSheet(null)}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
        <View style={{ flex: 1 }}>
          <ScrollView
            horizontal
            style={{ flexGrow: 0 }}
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
            style={styles.sheetBoard}
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
          </View>
        </View>
      </Modal>

      {/* 👥 Players overlay (host: kick, teams) */}
      <Modal visible={sheet === "players"} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.sheetDismiss} activeOpacity={1} onPress={() => setSheet(null)} />
          <View style={[styles.sheet, styles.sheetShort]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>👥 Players ({group.players.length})</Text>
              <TouchableOpacity onPress={() => setSheet(null)}>
                <Text style={styles.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>
        <ScrollView style={styles.sheetList}>
          {group.players.map((player) => (
            <View key={player.id} style={styles.playerMgmtRow}>
              <View>
                <PixelAvatar avatar={avatarIdFor(player, group.players)} size={36} dim={online[player.id] === "offline"} />
                {online[player.id] && online[player.id] !== "unknown" && (
                  <View style={[styles.onlineDot, { backgroundColor: statusColor[online[player.id]] }]} />
                )}
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
      {isHost && (
        <View style={styles.teamBtnRow}>
          {teamsEnabled ? (
            <>
              <TouchableOpacity
                style={styles.teamBtn}
                onPress={() =>
                  (setSheet(null), navigation.navigate("TeamSetup", { groupId, playerId }))
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
                (setSheet(null), navigation.navigate("TeamSetup", { groupId, playerId }))
              }
            >
              <Text style={styles.teamBtnText}>👥 Play as Teams</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

          </View>
        </View>
      </Modal>

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

      <ThemeSheet visible={sheet === "theme"} onClose={() => setSheet(null)} group={group} playerId={playerId} />

      <ProfileSheet
        visible={sheet === "me"}
        onClose={() => setSheet(null)}
        group={group}
        playerId={playerId}
        realName={realName}
        onSaveRealName={saveRealName}
        onLeave={() => {
          setSheet(null);
          handleLeave();
        }}
      />

      <LeaveGroupSheet visible={leaving} onClose={() => setLeaving(false)} group={group} playerId={playerId} tone="light" />

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
    fontSize: 32,
    ...display,
    color: "#1A1A2E",
    textAlign: "center",
    marginBottom: 14,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  meChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    flexShrink: 1,
  },
  meCrown: { position: "absolute", top: -9, left: -6, fontSize: 14 },
  meName: { color: "#1A1A2E", fontSize: 16, ...display },
  meSub: { color: "#888", fontSize: 11, marginTop: 1 },
  themeBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#EAEAEE",
    alignItems: "center",
    justifyContent: "center",
  },
  themeBtnText: { fontSize: 22 },
  inviteChip: {
    alignItems: "center",
    backgroundColor: "#1A1A2E",
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  inviteCode: { color: "#C9A45C", fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  inviteText: { color: "#fff", fontSize: 11, fontWeight: "700", marginTop: 1 },
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
  standBar: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  standTop: { paddingHorizontal: 4 },
  standText: { color: "#1A1A2E", fontSize: 14, fontWeight: "600", textAlign: "center" },
  standBtns: { flexDirection: "row", gap: 8 },
  standBtn: {
    flex: 1,
    backgroundColor: "#1A1A2E",
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  standBtnText: { color: "#fff", fontSize: 13, ...displaySemi, textAlign: "center", textAlignVertical: "center", includeFontPadding: false },
  unreadBadge: {
    position: "absolute",
    top: -6,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#E63946",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  unreadText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  sheetDismiss: { flex: 1 },
  sheet: {
    height: "85%",
    backgroundColor: "#F7F7FA",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 28,
  },
  sheetShort: { height: "70%" },
  sheetHandle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: "#D6D6DE", marginBottom: 10 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "bold", color: "#1A1A2E" },
  sheetClose: { fontSize: 20, color: "#888", padding: 4 },
  sheetBoard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    overflow: "hidden",
  },
  sheetList: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#EAEAEE",
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
    backgroundColor: "#FFFFFF", // solid on every theme
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    borderRadius: 16,
    paddingBottom: 12,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    position: "relative",
    minHeight: 140,
    justifyContent: "flex-start",
    overflow: "hidden",
  },
  posterWrap: { alignSelf: "stretch", height: 112, marginBottom: 10 },
  posterImg: { width: "100%", height: "100%", borderTopLeftRadius: 15, borderTopRightRadius: 15 },
  posterEmpty: { backgroundColor: "#1A1A2E", alignItems: "center", justifyContent: "center" },
  posterEmoji: {
    position: "absolute",
    left: 8,
    bottom: -12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  posterEmojiText: { fontSize: 16 },
  gameCardBest: {
    borderWidth: 1.5,
    borderColor: "#3FA66A",
  },
  newBadge: {
    zIndex: 2,
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#C9A45C",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newBadgeText: { color: "#121110", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  gameMeta: { color: "#1A1A2E", fontSize: 11, fontWeight: "700", marginTop: 8 },
  gameKind: { color: "#888", fontSize: 11, marginTop: 2 },
  gameFit: { color: "#2E8B57", fontSize: 11, fontWeight: "800", marginTop: 4 },
  filterRow: { gap: 6, paddingRight: 8 },
  filterChip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E2EA",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipOn: { backgroundColor: "#1A1A2E", borderColor: "#1A1A2E" },
  filterText: { color: "#1A1A2E", fontSize: 13, fontWeight: "700" },
  filterTextOn: { color: "#fff" },
  filterEmpty: { color: "#888", textAlign: "center", padding: 24 },
  gameCardAvailable: {
    borderWidth: 1.5,
    borderColor: "#E63946",
  },
  gameCardDisabled: {
    opacity: 0.55,
  },
  gameInner: { alignItems: "center", alignSelf: "stretch", paddingHorizontal: 10 },
  gameInnerFaded: { opacity: 0.45 },
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
    zIndex: 2,
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
    fontSize: 16,
    lineHeight: 19,
    ...display,
    marginTop: 4,
    marginBottom: 3,
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
  guestBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1A1A2E",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  guestBannerTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  guestBannerSub: {
    color: "#C9C9D6",
    fontSize: 12,
    marginTop: 2,
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
  leaveLink: { alignSelf: "flex-start", marginBottom: 10 },
  leaveLinkText: { color: "#888", fontSize: 14, fontWeight: "600" },
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
  onlineDot: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
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
    backgroundColor: "#FFF4DC",
    borderWidth: 1,
    borderColor: "#C9A45C",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hostBadgeText: {
    color: "#9A7432",
    fontSize: 10,
    fontWeight: "800",
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
