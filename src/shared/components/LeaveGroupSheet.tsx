// src/shared/components/LeaveGroupSheet.tsx
// 👋 "Leave the group?" in the app's own look (instead of the phone's plain
// alert). Used by the Party Group screen (dark) and the Game Menu (light).
// It tells you what leaving actually does: who becomes host, whether the
// group closes, whether you drop out of a running game. It does the leaving
// itself and takes you back to the start screen.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { Group } from "../types";
import { leaveGroup } from "../firebase/groups";
import { clearSession } from "../utils/session";
import { games } from "../../games/registry";
import PixelAvatar from "../avatars/PixelAvatar";
import { avatarIdFor } from "../avatars/sprites";
import { display, displaySemi } from "../theme/fonts";
import { useVoice } from "../voice/VoiceProvider";

type Props = {
  visible: boolean;
  onClose: () => void;
  group: Group;
  playerId: string;
  tone?: "dark" | "light";
};

const TONES = {
  dark: { card: "#17191C", border: "#2D3137", text: "#ECE7DD", muted: "#A9A49A", accent: "#C9A45C", accentText: "#121110", chip: "#22252A", danger: "#6B2A31" },
  light: { card: "#FFFFFF", border: "#EAEAEE", text: "#1A1A2E", muted: "#6E6E80", accent: "#1A1A2E", accentText: "#FFFFFF", chip: "#F3F3F7", danger: "#F3C4C8" },
};
const RED = "#E63946";

export default function LeaveGroupSheet({ visible, onClose, group, playerId, tone = "light" }: Props) {
  const navigation = useNavigation<any>();
  const voice = useVoice();
  const c = TONES[tone];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A small pop in.
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setBusy(false);
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }).start();
  }, [visible]);

  const me = group.players.find((p) => p.id === playerId);
  const others = group.players.filter((p) => p.id !== playerId);
  const isHost = group.hostId === playerId;
  const nextHost = isHost ? others[0] : undefined; // the server hands it to the first player left
  const running = group.currentGame && group.currentGame !== "menu" ? games.find((g) => g.id === group.currentGame) : undefined;

  const lines: string[] = [];
  if (others.length === 0) lines.push("You're the only one here, so the group closes when you leave.");
  else if (nextHost) lines.push(`You're the host. ${nextHost.name} takes over as host.`);
  if (running) lines.push(`You'll drop out of ${running.emoji} ${running.name} too.`);
  if (others.length > 0) lines.push(`You can come back any time with code ${group.code}.`);

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await leaveGroup(group.id, playerId, isHost, group.players);
      await clearSession();
      voice.leave(); // leaving the group ends its voice call too
      onClose();
      // Start clean: drop every screen of this group (including a minimised
      // game still waiting underneath).
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
    } catch {
      setBusy(false);
      setError("Couldn't leave right now. Check your connection and try again.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
      <Pressable style={styles.overlay} onPress={() => !busy && onClose()}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: c.card, borderColor: c.border },
            { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] },
          ]}
        >
          {/* Taps on the card itself don't close it */}
          <Pressable>
            <View style={styles.avatarWrap}>
              <PixelAvatar avatar={me ? avatarIdFor(me, group.players) : undefined} playerId={playerId} size={64} />
              <Text style={styles.wave}>👋</Text>
            </View>
            <Text style={[styles.title, { color: c.text }]}>Leave the group?</Text>
            <View style={[styles.codeChip, { backgroundColor: c.chip }]}>
              <Text style={[styles.codeText, { color: c.muted }]}>
                {group.code} · {group.players.length} player{group.players.length === 1 ? "" : "s"}
              </Text>
            </View>
            {lines.map((l, i) => (
              <Text key={i} style={[styles.line, { color: c.muted }]}>
                {l}
              </Text>
            ))}
            {error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity style={[styles.stay, { backgroundColor: c.accent }]} onPress={onClose} disabled={busy}>
              <Text style={[styles.stayText, { color: c.accentText }]}>Stay</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.leave, { borderColor: c.danger }]} onPress={leave} disabled={busy} accessibilityLabel="Leave group">
              {busy ? <ActivityIndicator color={RED} /> : <Text style={styles.leaveText}>Leave group</Text>}
            </TouchableOpacity>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 360, borderRadius: 24, borderWidth: 1, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 18 },
  avatarWrap: { alignSelf: "center", marginBottom: 12 },
  wave: { position: "absolute", right: -14, bottom: -6, fontSize: 26 },
  title: { fontSize: 22, ...display, textAlign: "center" },
  codeChip: { alignSelf: "center", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8, marginBottom: 12 },
  codeText: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  line: { fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 6 },
  error: { color: RED, fontSize: 13, textAlign: "center", marginTop: 6 },
  stay: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  stayText: { fontSize: 16, ...displaySemi },
  leave: { borderRadius: 14, borderWidth: 1.5, borderColor: "#F3C4C8", paddingVertical: 13, alignItems: "center", marginTop: 10, minHeight: 48, justifyContent: "center" },
  leaveText: { color: RED, fontSize: 15, ...displaySemi },
});
