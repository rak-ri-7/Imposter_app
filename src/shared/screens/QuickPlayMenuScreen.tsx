import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { games } from "../../games/registry";
import {
  getLocalSession,
  clearLocalSession,
  LocalSession,
} from "../utils/localSession";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "QuickPlay">;
};

export default function QuickPlayMenuScreen({ navigation }: Props) {
  const [session, setSession] = useState<LocalSession | null>(null);

  const passThePhoneGames = games.filter((g) =>
    g.modes.includes("pass-the-phone"),
  );

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, []),
  );

  const loadSession = async () => {
    const s = await getLocalSession();
    setSession(s);
  };

  const onSelectGame = (gameId: string, available: boolean) => {
    if (!available) return;
    if (!session || session.players.length < 2) {
      return Alert.alert(
        "No players set up",
        "Please add players before starting a game.",
        [{ text: "OK" }],
      );
    }
    if (gameId === "imposter") {
      navigation.navigate("ImposterQuickPlay");
    }
  };

  const handleSetupPlayers = () => {
    navigation.navigate("QuickPlaySetup");
  };

  const handleEndSession = () => {
    Alert.alert("End Session?", "This will clear all players and scores.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Session",
        style: "destructive",
        onPress: async () => {
          await clearLocalSession();
          setSession(null);
        },
      },
    ]);
  };

  const sortedPlayers = session
    ? [...session.players].sort((a, b) => b.score - a.score)
    : [];

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>⚡ Quick Play</Text>
      <Text style={styles.subtitle}>No internet needed</Text>

      {!session ? (
        <View style={styles.noSessionBox}>
          <Text style={styles.noSessionText}>
            No active session.{"\n"}Set up players to start playing!
          </Text>
          <TouchableOpacity
            style={styles.setupBtn}
            onPress={handleSetupPlayers}
          >
            <Text style={styles.setupBtnText}>Set Up Players →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.sessionHeader}>
            <Text style={styles.sessionPlayers}>
              {session.players.map((p) => p.name).join(", ")}
            </Text>
            <TouchableOpacity onPress={handleSetupPlayers}>
              <Text style={styles.editPlayers}>Edit</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>LEADERBOARD</Text>
          <View style={styles.leaderboard}>
            {sortedPlayers.map((player, index) => (
              <View key={player.name} style={styles.leaderRow}>
                <Text style={styles.leaderRank}>
                  {index === 0
                    ? "🥇"
                    : index === 1
                      ? "🥈"
                      : index === 2
                        ? "🥉"
                        : `${index + 1}.`}
                </Text>
                <Text style={styles.leaderName}>{player.name}</Text>
                <Text style={styles.leaderScore}>{player.score} pts</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionLabel}>GAMES</Text>
      <FlatList
        data={passThePhoneGames}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => {
          const available = item.available !== false;
          return (
            <TouchableOpacity
              style={[
                styles.gameCard,
                available && styles.gameCardAvailable,
                !available && styles.gameCardDisabled,
              ]}
              onPress={() => onSelectGame(item.id, available)}
              disabled={!available}
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
            </TouchableOpacity>
          );
        }}
      />

      {session && (
        <TouchableOpacity
          style={styles.endSessionBtn}
          onPress={handleEndSession}
        >
          <Text style={styles.endSessionText}>End Session</Text>
        </TouchableOpacity>
      )}
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
  backBtn: {
    marginBottom: 16,
  },
  backText: {
    color: "#888",
    fontSize: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#1A1A2E",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    marginBottom: 20,
  },
  noSessionBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#EAEAEE",
  },
  noSessionText: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  setupBtn: {
    backgroundColor: "#E63946",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    width: "100%",
  },
  setupBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    gap: 8,
  },
  sessionPlayers: {
    color: "#1A1A2E",
    fontSize: 13,
    flex: 1,
  },
  editPlayers: {
    color: "#E63946",
    fontSize: 13,
    fontWeight: "600",
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
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#EAEAEE",
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 10,
  },
  leaderRank: {
    fontSize: 16,
    width: 28,
  },
  leaderName: {
    color: "#1A1A2E",
    fontSize: 14,
    flex: 1,
  },
  leaderScore: {
    color: "#D4A017",
    fontSize: 14,
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
    minHeight: 130,
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
  endSessionBtn: {
    alignItems: "center",
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E63946",
    borderRadius: 14,
  },
  endSessionText: {
    color: "#E63946",
    fontSize: 14,
    fontWeight: "600",
  },
});
