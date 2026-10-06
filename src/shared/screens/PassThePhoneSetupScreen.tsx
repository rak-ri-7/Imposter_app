import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../App";
import {
  saveLocalSession,
  getLocalSession,
  clearLocalSession,
} from "../utils/localSession";

type Props = {
  navigation: NativeStackNavigationProp<
    RootStackParamList,
    "PassThePhoneSetup"
  >;
};

export default function PassThePhoneSetupScreen({ navigation }: Props) {
  const [playerNames, setPlayerNames] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(true);
  const [existingSession, setExistingSession] = useState(false);

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    const session = await getLocalSession();
    if (session && session.players.length > 0) {
      setExistingSession(true);
      setPlayerNames(session.players.map((p) => p.name));
    }
    setLoading(false);
  };

  const addPlayer = () => {
    if (playerNames.length >= 8) return;
    setPlayerNames([...playerNames, ""]);
  };

  const removePlayer = (index: number) => {
    if (playerNames.length <= 2) return;
    setPlayerNames(playerNames.filter((_, i) => i !== index));
  };

  const updatePlayerName = (index: number, name: string) => {
    const updated = [...playerNames];
    updated[index] = name;
    setPlayerNames(updated);
  };

  const handleStartSession = async () => {
    const validNames = playerNames
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (validNames.length < 2) {
      return Alert.alert("Need at least 2 players");
    }

    const hasDuplicates = new Set(validNames).size !== validNames.length;
    if (hasDuplicates) {
      return Alert.alert("Player names must be unique");
    }

    await saveLocalSession({
      players: validNames.map((name) => ({ name, score: 0 })),
    });

    navigation.replace("PassThePhoneMenu");
  };

  const handleResumeSession = () => {
    navigation.replace("PassThePhoneMenu");
  };

  const handleEndSession = async () => {
    Alert.alert(
      "End Session?",
      "This will clear all players and scores. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Session",
          style: "destructive",
          onPress: async () => {
            await clearLocalSession();
            setExistingSession(false);
            setPlayerNames(["", "", ""]);
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#E63946" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>🤝 Pass the Phone</Text>
      <Text style={styles.subtitle}>Set up your players</Text>

      {existingSession && (
        <View style={styles.resumeBox}>
          <Text style={styles.resumeText}>
            You have an active session with{" "}
            <Text style={styles.resumeHighlight}>
              {playerNames.filter((n) => n.trim()).length} players
            </Text>
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={handleResumeSession}
          >
            <Text style={styles.btnTextPrimary}>Resume Session</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.endSessionBtn}
            onPress={handleEndSession}
          >
            <Text style={styles.endSessionText}>
              End session and start fresh
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!existingSession && (
        <>
          <Text style={styles.sectionLabel}>ENTER PLAYER NAMES</Text>

          <ScrollView
            style={styles.nameList}
            showsVerticalScrollIndicator={false}
          >
            {playerNames.map((name, index) => (
              <View key={index} style={styles.nameRow}>
                <View style={styles.nameAvatar}>
                  <Text style={styles.nameAvatarText}>{index + 1}</Text>
                </View>
                <TextInput
                  style={styles.nameInput}
                  placeholder={`Player ${index + 1}`}
                  placeholderTextColor="#888"
                  value={name}
                  onChangeText={(text) => updatePlayerName(index, text)}
                  maxLength={16}
                />
                {playerNames.length > 2 && (
                  <TouchableOpacity onPress={() => removePlayer(index)}>
                    <Text style={styles.removeBtn}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {playerNames.length < 8 && (
              <TouchableOpacity style={styles.addPlayerBtn} onPress={addPlayer}>
                <Text style={styles.addPlayerText}>+ Add Player</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.btn} onPress={handleStartSession}>
            <Text style={styles.btnTextPrimary}>Start Session →</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A2E",
    padding: 24,
    paddingTop: 60,
  },
  backBtn: {
    marginBottom: 16,
  },
  backText: {
    color: "#888",
    fontSize: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#FFD700",
    textAlign: "center",
    marginBottom: 28,
    letterSpacing: 1,
  },
  sectionLabel: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 12,
  },
  nameList: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  nameAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0F3460",
    alignItems: "center",
    justifyContent: "center",
  },
  nameAvatarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  nameInput: {
    flex: 1,
    backgroundColor: "#16213E",
    color: "#fff",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#0F3460",
  },
  removeBtn: {
    color: "#E63946",
    fontSize: 16,
    padding: 4,
  },
  addPlayerBtn: {
    borderWidth: 1,
    borderColor: "#0F3460",
    borderRadius: 10,
    borderStyle: "dashed",
    padding: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  addPlayerText: {
    color: "#888",
    fontSize: 14,
  },
  btn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 16,
  },
  btnPrimary: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    width: "100%",
  },
  btnTextPrimary: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  resumeBox: {
    backgroundColor: "#16213E",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#0F3460",
    marginTop: 16,
  },
  resumeText: {
    color: "#888",
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  resumeHighlight: {
    color: "#fff",
    fontWeight: "600",
  },
  endSessionBtn: {
    marginTop: 14,
    padding: 8,
  },
  endSessionText: {
    color: "#E63946",
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
