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
} from "../utils/session";
import { RouteProp } from "@react-navigation/native";

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

    const session = await getSession();
    if (session) {
      const stillExists = await checkGroupExists(session.groupId);
      if (stillExists) {
        setSavedSession(session);
      } else {
        await clearSession();
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
      const { group, playerId } = await createGroup(playerName.trim());
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
      const { group, playerId } = await joinGroup(
        groupCode.trim(),
        playerName.trim(),
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
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#E63946" />
      </View>
    );
  }

  if (savedSession) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>🎉 What Game Are We Playing Today?</Text>
        <Text style={styles.subtitle}>The Indian Edition</Text>

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
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Text style={styles.title}>🎉 What Game Are We Playing Today?</Text>
      <Text style={styles.subtitle}>The Indian Edition</Text>

      {mode === "create" && (
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor="#888"
          value={playerName}
          onChangeText={setPlayerName}
          maxLength={16}
        />
      )}

      {mode === "join" && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor="#888"
            value={playerName}
            onChangeText={setPlayerName}
            maxLength={16}
          />
          <TextInput
            style={styles.input}
            placeholder="Group code"
            placeholderTextColor="#888"
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
          color="#E63946"
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A2E",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#E63946",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#FFD700",
    marginBottom: 48,
    letterSpacing: 2,
  },
  input: {
    width: "100%",
    backgroundColor: "#16213E",
    color: "#fff",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#0F3460",
  },
  buttons: {
    width: "100%",
    marginTop: 12,
    gap: 12,
  },
  btn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: "#E63946",
  },
  btnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#E63946",
  },
  btnTextPrimary: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  btnTextSecondary: {
    color: "#E63946",
    fontSize: 16,
    fontWeight: "600",
  },
  backBtn: {
    alignItems: "center",
    marginTop: 4,
  },
  backText: {
    color: "#888",
    fontSize: 14,
  },
  resumeBox: {
    width: "100%",
    backgroundColor: "#16213E",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#0F3460",
  },
  resumeText: {
    color: "#888",
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  resumeName: {
    color: "#fff",
    fontWeight: "600",
  },
  joinLink: {
    alignItems: "center",
    marginTop: 8,
  },
  joinLinkText: {
    color: "#888",
    fontSize: 13,
    textDecorationLine: "underline",
  },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: "#333",
  },
  dividerText: {
    color: "#888",
    fontSize: 13,
  },
  quickPlayBtn: {
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
    borderStyle: "dashed",
  },
  quickPlayText: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  quickPlaySub: {
    color: "#888",
    fontSize: 12,
  },
});
