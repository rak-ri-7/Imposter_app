import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../App";
import { createGroup, joinGroup, checkGroupExists } from "../firebase/groups";
import {
  saveSession,
  getSession,
  clearSession,
  savePlayerName,
  getSavedPlayerName,
  saveAvatar,
  getSavedAvatar,
} from "../utils/session";
import PixelAvatar from "../avatars/PixelAvatar";
import AvatarPicker from "../avatars/AvatarPicker";
import { AVATARS, avatarById } from "../avatars/sprites";
import { RouteProp } from "@react-navigation/native";
import PosterWall from "../components/PosterWall";
import { display } from "../theme/fonts";

const TAGLINE = "Party games for all ages";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "Home">;
  route: RouteProp<RootStackParamList, "Home">;
};
export default function HomeScreen({ navigation, route }: Props) {
  const [playerName, setPlayerName] = useState("");
  const [namePrefilled, setNamePrefilled] = useState(false);
  const [groupCode, setGroupCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [savedSession, setSavedSession] = useState<{
    groupId: string;
    playerId: string;
    playerName: string;
  } | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  // A random avatar to start with, until the player picks (then remembered).
  const [avatar, setAvatar] = useState(
    () => AVATARS[Math.floor(Math.random() * AVATARS.length)].id,
  );
  const [picking, setPicking] = useState(false);
  const pickAvatar = (id: string) => {
    setAvatar(id);
    setPicking(false);
    saveAvatar(id);
  };

  useEffect(() => {
    checkForSavedSession();
  }, []);

  useEffect(() => {
    const joinCode = route?.params?.joinCode;
    if (joinCode) {
      setGroupCode(joinCode);
      setMode("join");
    }
  }, [route?.params?.joinCode]);

  const checkForSavedSession = async () => {
    // Always try to restore name first
    const savedName = await getSavedPlayerName();
    if (savedName && !namePrefilled) {
      setPlayerName(savedName);
      setNamePrefilled(true);
    }
    const savedAvatar = await getSavedAvatar();
    if (avatarById(savedAvatar)) setAvatar(savedAvatar!);

    const session = await getSession();
    if (session) {
      // Only forget the session if the group is really gone. If the server
      // can't be reached right now, keep it so the player can resume.
      const status = await checkGroupExists(session.groupId);
      if (status === "missing") {
        await clearSession();
      } else {
        setSavedSession(session);
      }
    }
    setCheckingSession(false);
  };
  const handleResume = () => {
    if (!savedSession) return;
    navigation.navigate("GroupLobby", {
      groupId: savedSession.groupId,
      playerId: savedSession.playerId,
    });
  };

  const handleStartFresh = async () => {
    await clearSession();
    setSavedSession(null);
  };

  const handleCreateGroup = async () => {
    if (!playerName.trim()) return Alert.alert("Enter your name first");
    setLoading(true);
    try {
      await savePlayerName(playerName.trim()); // ← add this
      await saveAvatar(avatar);
      const { group, playerId } = await createGroup(playerName.trim(), avatar);
      await saveSession(group.id, playerId, playerName.trim());
      navigation.navigate("GroupLobby", { groupId: group.id, playerId });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not create group. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!playerName.trim()) return Alert.alert("Enter your name first");
    if (!groupCode.trim()) return Alert.alert("Enter a group code");
    setLoading(true);
    try {
      await savePlayerName(playerName.trim()); // ← add this
      await saveAvatar(avatar);
      const { group, playerId } = await joinGroup(
        groupCode.trim(),
        playerName.trim(),
        avatar,
      );
      await saveSession(group.id, playerId, playerName.trim());
      navigation.navigate("GroupLobby", { groupId: group.id, playerId });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not join group. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  if (savedSession) {
    return (
      <View style={styles.container}>
        <PosterWall />
        <View style={styles.content}>
        <Text style={styles.title}>What Game Are We{"\n"}Playing Today?</Text>
        <Text style={styles.subtitle}>{TAGLINE}</Text>

        <View style={styles.resumeBox}>
          <Text style={styles.resumeText}>
            You were playing as{" "}
            <Text style={styles.resumeName}>{savedSession.playerName}</Text>
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={handleResume}
          >
            <Text style={styles.btnTextPrimary}>Resume Your Group</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleStartFresh} style={styles.backBtn}>
            <Text style={styles.backText}>Start fresh instead</Text>
          </TouchableOpacity>
        </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
    <PosterWall />
    <KeyboardAvoidingView
      style={styles.content}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Text style={styles.title}>What Game Are We{"\n"}Playing Today?</Text>
      <Text style={styles.subtitle}>{TAGLINE}</Text>

      {mode !== null && (
        <View style={styles.nameRow}>
          <TouchableOpacity
            onPress={() => setPicking(true)}
            style={styles.avatarBtn}
            accessibilityLabel="Change your avatar"
          >
            <PixelAvatar avatar={avatar} size={52} />
            <View style={styles.avatarEdit}>
              <Text style={styles.avatarEditText}>✎</Text>
            </View>
          </TouchableOpacity>
          <TextInput
            style={[styles.input, styles.nameInput]}
            placeholder="Your name"
            placeholderTextColor="#8C877E"
            value={playerName}
            onChangeText={setPlayerName}
            maxLength={16}
          />
        </View>
      )}
      <AvatarPicker
        visible={picking}
        selected={avatar}
        onPick={pickAvatar}
        onClose={() => setPicking(false)}
      />

      {mode === "join" && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Group code"
            placeholderTextColor="#8C877E"
            value={groupCode}
            onChangeText={setGroupCode}
            autoCapitalize="characters"
            maxLength={6}
          />
        </>
      )}

      {loading ? (
        <ActivityIndicator
          size="large"
          color={GOLD}
          style={{ marginTop: 24 }}
        />
      ) : (
        <View style={styles.buttons}>
          {mode === null && (
            <>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => setMode("create")}
              >
                <Text style={styles.btnTextPrimary}>Create a Group</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => setMode("join")}
              >
                <Text style={styles.btnTextSecondary}>Join a Group</Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.quickPlayBtn}
                onPress={() => navigation.navigate("QuickPlay")}
              >
                <Text style={styles.quickPlayText}>⚡ Quick Play</Text>
                <Text style={styles.quickPlaySub}>
                  No internet? Pass the phone locally
                </Text>
              </TouchableOpacity>
            </>
          )}

          {mode === "create" && (
            <>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={handleCreateGroup}
              >
                <Text style={styles.btnTextPrimary}>Create Group</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMode(null)}
                style={styles.backBtn}
              >
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === "join" && (
            <>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={handleJoinGroup}
              >
                <Text style={styles.btnTextPrimary}>Join Group</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMode(null)}
                style={styles.backBtn}
              >
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
    </View>
  );
}

// Colours: dark stone, ivory text and a brass accent (same family as the games).
const GOLD = "#C9A45C";
const INK = "#121110";
const IVORY = "#ECE7DD";
const MUTED = "#A9A49A";
const PANEL = "rgba(23,25,28,0.92)";
const LINE = "#2D3137";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#07080A",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  // Everything sits at the bottom, over the darkest part of the poster wall.
  content: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    ...display,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: MUTED,
    textAlign: "center",
    marginBottom: 28,
    letterSpacing: 0.5,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  avatarBtn: {
    borderRadius: 14,
  },
  avatarEdit: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#07080A",
  },
  avatarEditText: {
    color: INK,
    fontSize: 11,
    fontWeight: "900",
  },
  nameInput: {
    flex: 1,
    width: undefined,
    marginBottom: 0,
  },
  input: {
    width: "100%",
    backgroundColor: PANEL,
    color: IVORY,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: LINE,
  },
  buttons: {
    width: "100%",
    marginTop: 4,
    gap: 12,
  },
  btn: {
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: GOLD,
  },
  btnSecondary: {
    backgroundColor: PANEL,
    borderWidth: 1,
    borderColor: LINE,
  },
  btnTextPrimary: {
    color: INK,
    fontSize: 17,
    fontWeight: "800",
  },
  btnTextSecondary: {
    color: IVORY,
    fontSize: 17,
    fontWeight: "800",
  },
  backBtn: {
    alignItems: "center",
    marginTop: 4,
    paddingVertical: 6,
  },
  backText: {
    color: MUTED,
    fontSize: 14,
    fontWeight: "600",
  },
  resumeBox: {
    width: "100%",
    backgroundColor: PANEL,
    borderRadius: 18,
    padding: 20,
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: LINE,
  },
  resumeText: {
    color: MUTED,
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  resumeName: {
    color: IVORY,
    fontWeight: "700",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: LINE,
  },
  dividerText: {
    color: MUTED,
    fontSize: 13,
  },
  quickPlayBtn: {
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    borderStyle: "dashed",
    backgroundColor: "rgba(7,8,10,0.6)",
  },
  quickPlayText: {
    color: GOLD,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 2,
  },
  quickPlaySub: {
    color: MUTED,
    fontSize: 12,
  },
});
