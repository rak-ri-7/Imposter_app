import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../../App";
import { useGroup } from "../../shared/hooks/useGroup";
import { useImposterGame } from "./logic/useImposterGame";
import { ImposterSettings } from "../../shared/types";
import ImposterSettingsPanel from "./screens/ImposterSettingsPanel";
import WordRevealScreen from "./screens/WordRevealScreen";
import DescribeScreen from "./screens/DescribeScreen";
import VoteScreen from "./screens/VoteScreen";
import ResultScreen from "./screens/ResultScreen";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "ImposterFlow">;
  route: RouteProp<RootStackParamList, "ImposterFlow">;
};

export default function ImposterFlowScreen({ navigation, route }: Props) {
  const { groupId, playerId } = route.params;
  const { group, loading } = useGroup(groupId);
  const [settings, setSettings] = useState<ImposterSettings>({
    imposterCount: 1,
    hintsEnabled: true,
  });

  useEffect(() => {
    if (group?.currentGame === "menu") {
      navigation.replace("GameMenu", { groupId, playerId });
    }
  }, [group?.currentGame]);

  if (loading || !group) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (group.currentGame === "menu") return null;

  if (group.status === "lobby") {
    return (
      <ImposterLobby
        group={group}
        playerId={playerId}
        settings={settings}
        onSettingsChange={setSettings}
      />
    );
  }

  if (group.status === "reveal") {
    return <WordRevealScreen group={group} playerId={playerId} />;
  }

  if (group.status === "describe") {
    return <DescribeScreen group={group} playerId={playerId} />;
  }

  if (group.status === "vote") {
    return <VoteScreen group={group} playerId={playerId} />;
  }

  if (group.status === "result") {
    return <ResultScreen group={group} playerId={playerId} />;
  }

  return null;
}

function ImposterLobby({
  group,
  playerId,
  settings,
  onSettingsChange,
}: {
  group: any;
  playerId: string;
  settings: ImposterSettings;
  onSettingsChange: (s: ImposterSettings) => void;
}) {
  const { isHost, handleStartGame, loading } = useImposterGame(group, playerId);
  const maxImposters = Math.max(1, Math.floor(group.players.length / 3));

  const onStart = async () => {
    if (group.players.length < 3) {
      return Alert.alert("Need at least 3 players to start!");
    }
    if (settings.imposterCount > maxImposters) {
      return Alert.alert(
        `Too many imposters`,
        `With ${group.players.length} players, max imposters is ${maxImposters}`,
      );
    }
    await handleStartGame(settings);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.lobbyTitle}>🕵️ Imposter</Text>
      <Text style={styles.lobbySubtitle}>Ready to play?</Text>

      {isHost && (
        <ImposterSettingsPanel
          settings={settings}
          maxImposters={maxImposters}
          onChange={onSettingsChange}
        />
      )}

      {!isHost && (
        <View style={styles.settingsPreview}>
          <Text style={styles.settingsPreviewText}>
            Host is setting up the game...
          </Text>
        </View>
      )}

      <FlatList
        data={group.players}
        keyExtractor={(item: any) => item.id}
        style={styles.list}
        renderItem={({ item }) => (
          <View style={styles.playerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.playerName}>{item.name}</Text>
            {item.isHost && (
              <View style={styles.hostBadge}>
                <Text style={styles.hostText}>Host</Text>
              </View>
            )}
            {item.id === playerId && !item.isHost && (
              <View style={styles.youBadge}>
                <Text style={styles.youText}>You</Text>
              </View>
            )}
          </View>
        )}
      />

      {isHost ? (
        <TouchableOpacity
          style={styles.startBtn}
          onPress={onStart}
          disabled={loading}
        >
          <Text style={styles.startBtnText}>Start Game</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingText}>Waiting for host to start...</Text>
        </View>
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
  loadingText: {
    color: "#fff",
    textAlign: "center",
    marginTop: 100,
    fontSize: 16,
  },
  lobbyTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
  },
  lobbySubtitle: {
    color: "#888",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
  },
  settingsPreview: {
    backgroundColor: "#16213E",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    alignItems: "center",
  },
  settingsPreviewText: {
    color: "#888",
    fontSize: 13,
  },
  list: { flex: 1 },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16213E",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0F3460",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  playerName: { color: "#fff", fontSize: 16, flex: 1 },
  hostBadge: {
    backgroundColor: "#E63946",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hostText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  youBadge: {
    backgroundColor: "#0F3460",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  youText: { color: "#888", fontSize: 12 },
  startBtn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 16,
  },
  startBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  waitingBox: { padding: 18, alignItems: "center" },
  waitingText: { color: "#888", fontSize: 14, textAlign: "center" },
});
