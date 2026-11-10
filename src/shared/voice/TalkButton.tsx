// src/shared/voice/TalkButton.tsx
// 💬 One "Talk" button for the Game Menu's top bar, instead of separate Chat
// and Voice buttons. Tapping it drops down a small menu:
//   • 💬 Chat (with the unread count)
//   • 🎙️ Join voice chat, or, once you're in: Mute/Unmute and Leave voice
// In builds without voice (Expo Go) it's simply the Chat button.
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { displaySemi } from "../theme/fonts";
import { haptics } from "../haptics";
import { useVoice } from "./VoiceProvider";

type Props = {
  groupId: string;
  unread: number;
  onChat: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const MENU_W = 220;

export default function TalkButton({ groupId, unread, onChat, style, textStyle }: Props) {
  const v = useVoice();
  const { width: winW } = useWindowDimensions();
  const btn = useRef<View>(null);
  const [menu, setMenu] = useState<null | { x: number; y: number }>(null);

  const inVoice = v.groupId === groupId && v.status !== "off" && v.status !== "error";
  const joining = inVoice && (v.status === "connecting" || v.status === "reconnecting");

  const badge =
    unread > 0 ? (
      <View style={styles.unreadBadge}>
        <Text style={styles.unreadText}>{unread > 9 ? "9+" : unread}</Text>
      </View>
    ) : null;

  // No voice in this build: just Chat
  if (!v.available) {
    return (
      <TouchableOpacity style={style} onPress={onChat}>
        <Text style={textStyle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          💬 Chat
        </Text>
        {badge}
      </TouchableOpacity>
    );
  }

  const open = () => {
    haptics.tap();
    btn.current?.measureInWindow((x, y, w, h) => {
      // Right-align the menu under the button, kept on screen
      const left = Math.max(8, Math.min(winW - MENU_W - 8, x + w - MENU_W));
      setMenu({ x: left, y: y + h + 6 });
    });
  };
  const close = () => setMenu(null);
  const pick = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <>
      <TouchableOpacity ref={btn as any} style={[style, inVoice && styles.btnLive]} onPress={open} accessibilityLabel="Chat and voice">
        <Text style={textStyle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {inVoice ? (v.micOn ? "🎙️" : "🔇") : "💬"} Talk ▾
        </Text>
        {badge}
      </TouchableOpacity>

      <Modal visible={!!menu} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        {menu && (
          <View style={[styles.menu, { left: menu.x, top: menu.y }]}>
            <TouchableOpacity style={styles.item} onPress={pick(onChat)}>
              <Text style={styles.itemText}>💬 Chat</Text>
              {unread > 0 && (
                <View style={styles.itemBadge}>
                  <Text style={styles.unreadText}>{unread > 9 ? "9+" : unread}</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.divider} />
            {!inVoice ? (
              <TouchableOpacity style={styles.item} onPress={pick(() => v.join(groupId))}>
                <Text style={styles.itemText}>🎙️ Join voice chat</Text>
              </TouchableOpacity>
            ) : joining ? (
              <View style={styles.item}>
                <ActivityIndicator size="small" color="#1F9E68" />
                <Text style={[styles.itemText, { marginLeft: 8 }]}>{v.status === "reconnecting" ? "Reconnecting…" : "Joining voice…"}</Text>
              </View>
            ) : (
              <>
                <View style={styles.liveRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>
                    In voice · {v.people.length} {v.people.length === 1 ? "person" : "people"}
                  </Text>
                </View>
                <TouchableOpacity style={styles.item} onPress={pick(v.toggleMic)}>
                  <Text style={styles.itemText}>{v.micOn ? "🔇 Mute me" : "🎤 Unmute me"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.item} onPress={pick(v.leave)}>
                  <Text style={[styles.itemText, { color: "#E63946" }]}>📴 Leave voice</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btnLive: { backgroundColor: "#1F9E68" },
  unreadBadge: {
    position: "absolute",
    top: -6,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#E63946",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  unreadText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  menu: {
    position: "absolute",
    width: MENU_W,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  item: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11 },
  itemText: { color: "#1A1A2E", fontSize: 15, ...displaySemi },
  itemBadge: {
    marginLeft: "auto",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#E63946",
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { height: 1, backgroundColor: "#EAEAEE", marginHorizontal: 10 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3DDC97" },
  liveText: { color: "#6E6E80", fontSize: 12, ...displaySemi },
});
