import { useEffect, useState } from "react";
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
import { leaveGroup, removePlayer } from "../firebase/groups";
import { clearSession } from "../utils/session";
import { BackHandler } from "react-native";

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

  useEffect(() => {
    if (group?.currentGame === "imposter") {
      navigation.replace("ImposterFlow", { groupId, playerId });
    } else if (group?.currentGame === "stop-the-timer") {
      navigation.replace("TimerFlow", { groupId, playerId });
    } else if (group?.currentGame === "pass-the-bomb") {
      navigation.replace("BombFlow", { groupId, playerId });
    }
  }, [group?.currentGame, groupId, playerId, navigation]);

  const shareGroupCode = async () => {
    if (!group) return;
    await Share.share({
      message: `Join my party games group! Code: ${group.code}`,
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
            await leaveGroup(
              group.id,
              playerId,
              group.hostId === playerId,
              group.players,
            );
            await clearSession();
            navigation.replace("Home");
          },
        },
      ],
    );
  };
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

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
        <Text style={styles.leaveBtnText}>← Leave</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Party Group</Text>

      <TouchableOpacity style={styles.codeBox} onPress={shareGroupCode}>
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
      </TouchableOpacity>

      <QRCodeDisplay
        code={group.code}
        visible={showQR}
        onClose={() => setShowQR(false)}
      />

      <Text style={styles.playersTitle}>Players ({group.players.length})</Text>

      <FlatList
        data={group.players}
        keyExtractor={(item) => item.id}
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
            {isHost && item.id !== playerId && (
              <TouchableOpacity
                style={styles.kickBtn}
                onPress={() => handleKick(item.id, item.name)}
              >
                <Text style={styles.kickBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      <TouchableOpacity
        style={styles.continueBtn}
        onPress={() => navigation.navigate("GameMenu", { groupId, playerId })}
      >
        <Text style={styles.continueBtnText}>Continue to Games →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7FA",
    padding: 24,
    paddingTop: 60,
  },
  loadingText: {
    color: "#fff",
    textAlign: "center",
    marginTop: 100,
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1A1A2E",
    textAlign: "center",
    marginBottom: 24,
  },
  codeBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 32,
    borderWidth: 1.5,
    borderColor: "#E63946",
  },
  codeLabel: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 8,
  },
  code: {
    color: "#E63946",
    fontSize: 42,
    fontWeight: "bold",
    letterSpacing: 8,
  },
  shareHint: {
    color: "#888",
    fontSize: 12,
    marginTop: 8,
  },
  playersTitle: {
    color: "#888",
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 12,
  },
  list: {
    flex: 1,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: "#EAEAEE",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0F3460",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  playerName: {
    color: "#1A1A2E",
    fontSize: 16,
    flex: 1,
  },
  hostBadge: {
    backgroundColor: "#E63946",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hostText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  youBadge: {
    backgroundColor: "#0F3460",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  youText: {
    color: "#888",
    fontSize: 12,
  },
  continueBtn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 16,
  },
  continueBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },

  codeActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  codeActionBtn: {
    backgroundColor: "#1A1A2E",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E63946",
  },
  codeActionText: {
    color: "#E63946",
    fontSize: 13,
    fontWeight: "600",
  },

  leaveBtn: {
    marginBottom: 12,
  },
  leaveBtnText: {
    color: "#888",
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
    color: "#E63946",
    fontSize: 14,
    fontWeight: "700",
  },
});
