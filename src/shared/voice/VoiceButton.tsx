// src/shared/voice/VoiceButton.tsx
// 🎙️ "Voice" button for a group's screens (Party Group, Game Menu). Tap to
// join the group's voice chat; once you're in, it shows you're on and opens
// nothing else (the floating call bar takes over). Hidden in builds without
// voice (Expo Go).
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useVoice } from "./VoiceProvider";

type Props = {
  groupId: string;
  style?: StyleProp<ViewStyle>; // the screen's own button look
  textStyle?: StyleProp<TextStyle>;
  label?: string; // when off; default "🎙️ Voice"
  compact?: boolean; // icon only (for a row of small buttons)
};

export default function VoiceButton({ groupId, style, textStyle, label = "🎙️ Voice", compact }: Props) {
  const v = useVoice();
  if (!v.available) return null;
  const inThis = v.groupId === groupId && v.status !== "off" && v.status !== "error";
  const busy = inThis && (v.status === "connecting" || v.status === "reconnecting");
  return (
    <TouchableOpacity
      style={[style, inThis && styles.on]}
      onPress={() => (inThis ? v.toggleMic() : v.join(groupId))}
      disabled={busy}
      accessibilityLabel={inThis ? (v.micOn ? "Voice on. Tap to mute." : "Voice on, muted. Tap to unmute.") : "Join voice chat"}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={[textStyle, inThis && styles.onText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {compact ? (inThis && !v.micOn ? "🔇" : "🎙️") : inThis ? (v.micOn ? "🎙️ On" : "🔇 Muted") : label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  on: { backgroundColor: "#1F9E68", borderColor: "#1F9E68" },
  onText: { color: "#FFFFFF" },
});
