// src/shared/passPhone/HandOff.tsx
// 📱 The "Pass the phone to …" screen every pass-the-phone game shows
// between players: big name, a short note, one button for the next player
// to press once they're holding the phone (and nobody else is peeking).
// Each game passes its own colours so it matches that game's look.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { display } from "../theme/fonts";

export type HandOffTheme = { bg: string; text: string; muted: string; accent: string; accentText: string };

export const DARK_HANDOFF: HandOffTheme = {
  bg: "#0D1B2A",
  text: "#FFFFFF",
  muted: "#9AA7B5",
  accent: "#4FC3F7",
  accentText: "#0D1B2A",
};

type Props = {
  name: string;
  emoji?: string;
  hint?: string;
  button?: string;
  step?: string;            // "2 of 6"
  onReady: () => void;
  onQuit?: () => void;      // small link at the bottom
  theme?: HandOffTheme;
};

export default function HandOff({ name, emoji = "📱", hint, button = "I'm ready →", step, onReady, onQuit, theme = DARK_HANDOFF }: Props) {
  // A short fade so the last player's screen never flashes into the next.
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [name]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Animated.View style={[styles.inner, { opacity: fade }]}>
        {step ? <Text style={[styles.step, { color: theme.muted }]}>{step}</Text> : null}
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={[styles.title, { color: theme.muted }]}>Pass the phone to</Text>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={2} adjustsFontSizeToFit>
          {name}
        </Text>
        {hint ? <Text style={[styles.hint, { color: theme.muted }]}>{hint}</Text> : null}
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.accent }]} onPress={onReady}>
          <Text style={[styles.btnText, { color: theme.accentText }]}>{button}</Text>
        </TouchableOpacity>
      </Animated.View>
      {onQuit ? (
        <TouchableOpacity style={styles.quit} onPress={onQuit} hitSlop={10}>
          <Text style={[styles.quitText, { color: theme.muted }]}>End game</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 28, justifyContent: "center" },
  inner: { alignItems: "center", gap: 10 },
  step: { fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  emoji: { fontSize: 64, marginBottom: 8 },
  title: { fontSize: 16, fontWeight: "600" },
  name: { fontSize: 44, ...display, textAlign: "center" },
  hint: { fontSize: 15, textAlign: "center", lineHeight: 22, marginTop: 4, maxWidth: 320 },
  btn: { marginTop: 28, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 36, alignSelf: "stretch", alignItems: "center" },
  btnText: { fontSize: 18, fontWeight: "900" },
  quit: { position: "absolute", bottom: 40, alignSelf: "center" },
  quitText: { fontSize: 14, fontWeight: "600" },
});
