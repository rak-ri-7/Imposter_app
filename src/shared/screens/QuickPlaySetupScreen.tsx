import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../App";
import {
  saveLocalSession,
  getLocalSession,
  clearLocalSession,
} from "../utils/localSession";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "QuickPlaySetup">;
};

export default function QuickPlaySetupScreen({ navigation }: Props) {
  const [playerNames, setPlayerNames] = useState<string[]>(["", "", ""]);

  useEffect(() => {
    loadExisting();
  }, []);

  const loadExisting = async () => {
    const session = await getLocalSession();
    if (session && session.players.length > 0) {
      setPlayerNames(session.players.map((p) => p.name));
    }
  };

  const addPlayer = () => {
    if (playerNames.length >= 8) return;
    setPlayerNames([...playerNames, ""]);
  };

  const removePlayer = (index: number) => {
    if (playerNames.length <= 2) return;
    setPlayerNames(playerNames.filter((_, i) => i !== index));
  };

  const updateName = (index: number, name: string) => {
    const updated = [...playerNames];
    updated[index] = name;
    setPlayerNames(updated);
  };

  const handleSave = async () => {
    const valid = playerNames.map((n) => n.trim()).filter((n) => n.length > 0);
    if (valid.length < 2) {
      return Alert.alert("Need at least 2 players");
    }
    if (new Set(valid).size !== valid.length) {
      return Alert.alert("Player names must be unique");
    }

    const existing = await getLocalSession();
    const existingScores: Record<string, number> = {};
    existing?.players.forEach((p) => {
      existingScores[p.name] = p.score;
    });

    await saveLocalSession({
      players: valid.map((name) => ({
        name,
        score: existingScores[name] ?? 0,
      })),
    });

    navigation.goBack();
  };

  const handleClearScores = () => {
    Alert.alert(
      "Clear Scores?",
      "This will reset all points to 0 but keep player names.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await saveLocalSession({
              players: playerNames
                .map((n) => n.trim())
                .filter((n) => n.length > 0)
                .map((name) => ({ name, score: 0 })),
            });
            navigation.goBack();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Players</Text>
      <Text style={styles.subtitle}>
        These names are used across all Quick Play games
      </Text>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {playerNames.map((name, index) => (
          <View key={index} style={styles.nameRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{index + 1}</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder={`Player ${index + 1}`}
              placeholderTextColor="#888"
              value={name}
              onChangeText={(t) => updateName(index, t)}
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
          <TouchableOpacity style={styles.addBtn} onPress={addPlayer}>
            <Text style={styles.addBtnText}>+ Add Player</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Players →</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.clearBtn} onPress={handleClearScores}>
        <Text style={styles.clearBtnText}>Reset Scores</Text>
      </TouchableOpacity>
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
  backBtn: { marginBottom: 16 },
  backText: { color: "#888", fontSize: 14 },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  subtitle: {
    color: "#888",
    fontSize: 13,
    marginBottom: 24,
    lineHeight: 20,
  },
  list: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0F3460",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  input: {
    flex: 1,
    backgroundColor: "#16213E",
    color: "#fff",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#0F3460",
  },
  removeBtn: { color: "#E63946", fontSize: 16, padding: 4 },
  addBtn: {
    borderWidth: 1,
    borderColor: "#0F3460",
    borderRadius: 10,
    borderStyle: "dashed",
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  addBtnText: { color: "#888", fontSize: 14 },
  saveBtn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 16,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  clearBtn: {
    alignItems: "center",
    padding: 14,
    marginTop: 8,
  },
  clearBtnText: { color: "#888", fontSize: 14 },
});
