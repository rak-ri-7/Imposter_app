import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp, useIsFocused } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../hooks/useGroup";
import QRCodeDisplay from "./QRCodeDisplay";
import { leaveGroup, removePlayer, setPlayerAvatar, touchGroup } from "../firebase/groups";
import { clearSession, saveAvatar } from "../utils/session";
import { BackHandler } from "react-native";
import PixelAvatar from "../avatars/PixelAvatar";
import AvatarPicker from "../avatars/AvatarPicker";
import MiniGame, { useMinimizedRoute } from "../components/MiniGame";
import LeaveGroupSheet from "../components/LeaveGroupSheet";
import { ThemeWallpaper, menuThemeById, menuThemeStyles } from "../themes/menuThemes";
import { display, displaySemi } from "../theme/fonts";
import { routeForGame } from "../hooks/useMinimizableGame";
import { statusColor, statusLabel, useOnlineStatus } from "../hooks/useOnlineStatus";
import { avatarIdFor } from "../avatars/sprites";
import { inviteMessage, inviteUrl } from "../config/invite";
import BackLink from "../components/BackLink";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "GroupLobby">;
  route: RouteProp<RootStackParamList, "GroupLobby">;
};

export default function GroupLobbyScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  const isFocused = useIsFocused();
  const isHost = group?.hostId === playerId;
  const [showQR, setShowQR] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    touchGroup(groupId);
  }, [groupId]);

  // Who's here: only while this screen is on top (games check in themselves).
  const ids = (group?.players ?? []).map((p) => p.id);
  const status = useOnlineStatus(groupId, playerId, ids, isFocused);
  const hereCount = ids.filter((id) => status[id] === "here").length;

  const me = group?.players.find((p) => p.id === playerId);
  const taken = useMemo(() => {
    const t: Record<string, string> = {};
    for (const p of [...(group?.players ?? []), ...(group?.benchedPlayers ?? [])])
      if (p.avatar && p.id !== playerId) t[p.avatar] = p.name;
    return t;
  }, [group?.players, group?.benchedPlayers, playerId]);

  const pickAvatar = async (id: string) => {
    setPicking(false);
    saveAvatar(id);
    const ok = await setPlayerAvatar(groupId, playerId, id).catch(() => false);
    if (!ok) Alert.alert("Just taken", "Someone else picked that one a moment ago. Choose another.");
  };

  // A game starts while you're in the lobby → open it on top (the lobby
  // stays underneath). Not if it's already open or minimised.
  const minimized = useMinimizedRoute(group);
  useEffect(() => {
    const target = routeForGame(group?.currentGame);
    if (!target || minimized || !isFocused) return;
    navigation.navigate(target as any, { groupId, playerId });
  }, [group?.currentGame, minimized, isFocused]);

  const shareGroupCode = async () => {
    if (!group) return;
    const host = group.players.find((p) => p.id === group.hostId)?.name;
    await Share.share({
      message: inviteMessage(group.code, host),
      url: inviteUrl(group.code), // iOS shows a link preview from this
    });
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

  // The app's own "Leave the group?" prompt (LeaveGroupSheet does the rest).
  const handleLeave = () => setLeaving(true);
  useEffect(() => {
    // GroupLobby remains mounted below game flows, so only consume Android
    // Back while this screen is actually on top.
    if (!isFocused) return;

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        handleLeave();
        return true;
      },
    );
    return () => backHandler.remove();
  }, [group, isFocused]);

  if (loading || !group) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Same look as the game menu: light, in the group's chosen theme.
  const theme = menuThemeById(group.menuTheme);
  const T = menuThemeStyles(theme);

  return (
    <View style={[styles.container, T.container]}>
      <ThemeWallpaper theme={theme} />
      <BackLink label="Leave" onPress={handleLeave} textStyle={T.sectionLabel} />
      <Text style={[styles.title, T.title]}>Party Group</Text>

      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>GROUP CODE</Text>
        <Text style={styles.code}>{group.code}</Text>
        <View style={styles.codeActions}>
          <TouchableOpacity
            style={styles.codeActionBtn}
            onPress={() => setShowQR(true)}
          >
            <Text style={styles.codeActionText}>📷 Show QR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.codeActionBtn}
            onPress={shareGroupCode}
          >
            <Text style={styles.codeActionText}>📤 Share</Text>
          </TouchableOpacity>
        </View>
      </View>

      <QRCodeDisplay
        code={group.code}
        visible={showQR}
        onClose={() => setShowQR(false)}
      />
      <MiniGame group={group} playerId={playerId} bottom={110} />
      <LeaveGroupSheet visible={leaving} onClose={() => setLeaving(false)} group={group} playerId={playerId} tone="light" />
      <AvatarPicker
        visible={picking}
        selected={me?.avatar}
        taken={taken}
        onPick={pickAvatar}
        onClose={() => setPicking(false)}
      />

      <View style={styles.playersHead}>
        <Text style={[styles.playersTitle, T.sectionLabel]}>PLAYERS ({group.players.length})</Text>
        <Text style={[styles.hereCount, T.sectionLabel]}>
          <Text style={{ color: statusColor.here }}>● </Text>
          {hereCount} here now
        </Text>
      </View>

      <FlatList
        data={group.players}
        keyExtractor={(item) => item.id}
        style={styles.list}
        renderItem={({ item }) => {
          const mine = item.id === playerId;
          const st = status[item.id] ?? "unknown";
          return (
            <View style={[styles.playerRow, mine && styles.playerRowMine]}>
              <TouchableOpacity
                disabled={!mine}
                onPress={() => setPicking(true)}
                accessibilityLabel={mine ? "Change your avatar" : undefined}
              >
                <PixelAvatar
                  avatar={avatarIdFor(item, group.players)}
                  size={44}
                  dim={st === "offline"}
                />
                {st !== "unknown" && (
                  <View style={[styles.dot, { backgroundColor: statusColor[st] }]} />
                )}
                {mine && (
                  <View style={styles.editBadge}>
                    <Text style={styles.editBadgeText}>✎</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.playerName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.playerSub} numberOfLines={1}>
                  {mine ? "You · tap your avatar to change it" : statusLabel[st]}
                </Text>
              </View>
              {item.isHost && (
                <View style={styles.hostBadge}>
                  <Text style={styles.hostText}>Host</Text>
                </View>
              )}
              {isHost && !mine && (
                <TouchableOpacity
                  style={styles.kickBtn}
                  onPress={() => handleKick(item.id, item.name)}
                >
                  <Text style={styles.kickBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {!isHost && (
        <Text style={[styles.guestNote, T.sectionLabel, { fontWeight: "600" }]}>
          {group.players.find((p) => p.id === group.hostId)?.name ?? "The host"} picks the
          game. You'll jump in automatically when it starts.
        </Text>
      )}
      <TouchableOpacity
        style={[styles.continueBtn, !isHost && styles.continueBtnGuest]}
        onPress={() => navigation.navigate("GameMenu", { groupId, playerId })}
      >
        <Text style={[styles.continueBtnText, !isHost && styles.continueBtnTextGuest]}>
          {isHost ? "Continue to Games →" : "Browse the games →"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Same family as the game menu: light cards, navy text, brass accent.
const GOLD = "#C9A45C";
const INK = "#121110";
const IVORY = "#1A1A2E"; // main text (navy on light)
const MUTED = "#7A7A8C";
const PANEL = "#FFFFFF";
const LINE = "#EAEAEE";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7FA",
    padding: 24,
    paddingTop: 60,
  },
  loadingText: {
    color: MUTED,
    textAlign: "center",
    marginTop: 100,
    fontSize: 16,
  },
  title: {
    fontSize: 32,
    ...display,
    color: IVORY,
    textAlign: "center",
    marginBottom: 20,
  },
  codeBox: {
    backgroundColor: PANEL,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: GOLD,
  },
  codeLabel: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  code: {
    color: IVORY,
    fontSize: 44,
    ...display,
    letterSpacing: 8,
  },
  playersHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  playersTitle: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  hereCount: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "700",
  },
  list: {
    flex: 1,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PANEL,
    borderRadius: 14,
    padding: 10,
    paddingRight: 14,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: LINE,
  },
  playerRowMine: {
    borderColor: "#E4CF9F",
    borderWidth: 1.5,
  },
  dot: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: PANEL,
  },
  editBadge: {
    position: "absolute",
    left: -4,
    top: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: PANEL,
  },
  editBadgeText: {
    color: INK,
    fontSize: 9,
    fontWeight: "900",
  },
  playerName: {
    color: IVORY,
    fontSize: 17,
    ...displaySemi,
  },
  playerSub: {
    color: MUTED,
    fontSize: 12,
    marginTop: 2,
  },
  hostBadge: {
    backgroundColor: "#FFF4DC",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: GOLD,
  },
  hostText: {
    color: "#9A7432",
    fontSize: 12,
    fontWeight: "800",
  },
  continueBtn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 16,
  },
  continueBtnText: {
    color: INK,
    fontSize: 19,
    ...display,
  },
  continueBtnGuest: {
    backgroundColor: PANEL,
    borderWidth: 1,
    borderColor: LINE,
    marginTop: 10,
  },
  continueBtnTextGuest: {
    color: IVORY,
    fontSize: 16,
  },
  guestNote: {
    color: MUTED,
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 19,
  },

  codeActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  codeActionBtn: {
    backgroundColor: "#F1F1F5",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: LINE,
  },
  codeActionText: {
    color: IVORY,
    fontSize: 13,
    fontWeight: "700",
  },

  leaveBtn: {
    marginBottom: 12,
  },
  leaveBtnText: {
    color: MUTED,
    fontSize: 14,
  },
  kickBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FDEAEA",
    alignItems: "center",
    justifyContent: "center",
  },
  kickBtnText: {
    color: "#D14B55",
    fontSize: 14,
    fontWeight: "700",
  },
});
