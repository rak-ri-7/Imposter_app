// src/shared/components/HowToPlay.tsx
// 📖 The rules in a game's lobby, without the wall of text: one line that
// says how you win (the game's `hook`), and a "How to play" link that slides
// up the steps. The sheet shows the short version from the game menu first
// (so it matches what the host read there), then, if the game has them, all
// the details.
//
// Each game passes its own colours so it matches that game's look.
import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { games } from "../../games/registry";
import type { GameType } from "../types";
import StepSlides from "./StepSlides";
import { display, displaySemi } from "../theme/fonts";

export type HowToTheme = {
  text: string;   // the hook line
  muted: string;
  accent: string; // the link, numbers
  sheet: string;  // sheet background
  panel: string;  // step cards in the sheet
  sheetText: string;
  sheetMuted: string;
  numberText?: string; // text on the accent number bubble
};

type Props = {
  game: GameType;
  theme: HowToTheme;
  hook?: string;       // defaults to the game's hook
  details?: string[];  // the full rules (mode-specific ones too)
  detailsTitle?: string;
  center?: boolean;
  children?: ReactNode; // extra bits for the sheet's foot (e.g. a collection button)
};

export default function HowToPlay({ game, theme: t, hook, details, detailsTitle = "ALL THE DETAILS", center, children }: Props) {
  const [open, setOpen] = useState(false);
  const def = games.find((g) => g.id === game);
  const line = hook ?? def?.hook;
  const short = def?.howTo ?? [];

  return (
    <View style={[styles.wrap, center && { alignItems: "center" }]}>
      {!!line && <Text style={[styles.hook, { color: t.text }, center && { textAlign: "center" }]}>{line}</Text>}
      <TouchableOpacity onPress={() => setOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="How to play">
        <Text style={[styles.link, { color: t.accent }]}>📖 How to play ›</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={{ flex: 1, minHeight: 80 }} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: t.sheet }]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={[styles.title, { color: t.sheetText }]}>
                {def?.emoji} How to play {def?.name}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Close">
                <Text style={[styles.close, { color: t.sheetMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {short.length > 0 && (
                <StepSlides
                  game={game}
                  colors={{ card: t.panel, text: t.sheetText, muted: t.sheetMuted, accent: t.accent, numberText: t.numberText ?? t.sheet, frame: t.sheet }}
                />
              )}
              {!!details?.length && (
                <>
                  <Text style={[styles.label, { color: t.sheetMuted }]}>{detailsTitle}</Text>
                  {details.map((d, i) => (
                    <Text key={i} style={[styles.detail, { color: t.sheetText }]}>
                      •  {d}
                    </Text>
                  ))}
                </>
              )}
              {children}
            </ScrollView>
            <TouchableOpacity style={[styles.got, { backgroundColor: t.accent }]} onPress={() => setOpen(false)}>
              <Text style={[styles.gotText, { color: t.numberText ?? t.sheet }]}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 6, marginBottom: 14 },
  hook: { fontSize: 15, lineHeight: 21, fontWeight: "600" },
  link: { fontSize: 14, fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { maxHeight: "85%", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingBottom: 22 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(128,128,128,0.45)", marginTop: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 },
  title: { flex: 1, fontSize: 18, ...display },
  close: { fontSize: 18, fontWeight: "700" },
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start", borderRadius: 14, padding: 12, marginBottom: 8 },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 1 },
  numText: { fontSize: 13, fontWeight: "900" },
  stepText: { flex: 1, fontSize: 14.5, lineHeight: 21 },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 2, marginTop: 14, marginBottom: 8 },
  detail: { fontSize: 13.5, lineHeight: 20, marginBottom: 7 },
  got: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  gotText: { fontSize: 16, ...displaySemi },
});
