// src/shared/components/AwayOverlay.tsx
// Covers the game while someone has dropped out, so nobody can play on
// without them. The host can choose to continue without them.
import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { getServerNow } from "../firebase/time";

type Props = {
  // 'pause': nothing can happen while they're gone, so cover the screen.
  // 'end-round': a live round with running clocks: ask the host whether to
  //   end it; everyone else just sees a banner.
  mode?: "pause" | "end-round";
  onEndRound?: () => void;
  // Wording for the host's end-round prompt (defaults to Pass the Bomb's).
  endRoundText?: { body: string; button: string };
  awayIds: string[];
  lastSeen: Record<string, number>;
  meOffline: boolean;
  isHost: boolean;
  nameOf: (id: string) => string;
  onContinueWithout: (ids: string[]) => void;
};

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function AwayOverlay({
  mode = "pause",
  onEndRound,
  endRoundText = {
    body: "End this round? Nobody loses a life and bets are refunded. Everyone waits on the replay screen until they're back.",
    button: "End round",
  },
  awayIds,
  lastSeen,
  meOffline,
  isHost,
  nameOf,
  onContinueWithout,
}: Props) {
  const [, setTick] = useState(0);
  // Host said "keep playing" for this set of away players: don't ask again
  // until the set changes.
  const [keptPlaying, setKeptPlaying] = useState("");
  const visible = meOffline || awayIds.length > 0;
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [visible]);

  if (!visible) return null;

  const names = awayIds.map(nameOf);
  const list =
    names.length <= 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const oldest = Math.min(...awayIds.map((id) => lastSeen[id] ?? getServerNow()));

  const confirmContinue = () =>
    Alert.alert(
      `Continue without ${list}?`,
      "The game carries on. If they come back they can still play, and the game will pause again if they drop out later.",
      [
        { text: "Keep waiting", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => onContinueWithout(awayIds),
        },
      ],
    );

  if (mode === "end-round" && !meOffline) {
    const key = awayIds.join(",");
    if (!isHost || keptPlaying === key) {
      return (
        <View pointerEvents="none" style={styles.banner}>
          <Text style={styles.bannerText}>
            ⚠️ {list} dropped out
            {isHost ? "" : " – waiting for the host"}
          </Text>
        </View>
      );
    }
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setKeptPlaying(key)}>
        <View style={styles.overlay}>
          <View style={styles.box}>
            <Text style={styles.title}>{list} dropped out</Text>
            <Text style={styles.sub}>{endRoundText.body}</Text>
            <TouchableOpacity
              style={[styles.btn, styles.btnSolid]}
              onPress={() => onEndRound?.()}
            >
              <Text style={[styles.btnText, styles.btnSolidText]}>
                {endRoundText.button}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={() => setKeptPlaying(key)}>
              <Text style={styles.btnText}>Keep playing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <ActivityIndicator size="large" color="#E63946" />
          {meOffline ? (
            <>
              <Text style={styles.title}>You're offline</Text>
              <Text style={styles.sub}>
                Reconnecting… The game will pick up where you left off.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>Game paused</Text>
              <Text style={styles.sub}>
                Waiting for {list} to reconnect
              </Text>
              <Text style={styles.timer}>{fmt(getServerNow() - oldest)}</Text>
              {isHost ? (
                <TouchableOpacity style={styles.btn} onPress={confirmContinue}>
                  <Text style={styles.btnText}>Continue without them</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.note}>
                  The host can continue without them.
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,10,20,0.88)",
    justifyContent: "center",
    padding: 24,
  },
  box: {
    backgroundColor: "#1A1A2E",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  title: { color: "#fff", fontSize: 22, fontWeight: "bold", marginTop: 6 },
  sub: { color: "#C9C9D6", fontSize: 15, textAlign: "center" },
  timer: { color: "#E63946", fontSize: 28, fontWeight: "bold", fontVariant: ["tabular-nums"] },
  note: { color: "#888", fontSize: 12, textAlign: "center", marginTop: 6 },
  btn: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: "#E63946",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  btnText: { color: "#E63946", fontSize: 15, fontWeight: "600", textAlign: "center" },
  btnSolid: { backgroundColor: "#E63946", alignSelf: "stretch" },
  btnSolidText: { color: "#fff" },
  banner: {
    position: "absolute",
    top: 44,
    left: 16,
    right: 16,
    backgroundColor: "rgba(26,26,46,0.95)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E63946",
  },
  bannerText: { color: "#fff", fontSize: 14, textAlign: "center" },
});
