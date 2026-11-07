// src/shared/components/StepSlides.tsx
// 📸 A game's "how it works" steps as swipeable slides: a screenshot of that
// moment in the game beside the step, so people see it rather than read it.
// Steps without a screenshot still get a slide (text only). Used in the game
// menu's info sheet and in each lobby's "How to play" sheet.
import { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { games } from "../../games/registry";
import type { GameType } from "../types";
import { HOWTO_SHOTS } from "../assets/howto";

export type SlideColors = {
  card: string;       // slide background
  text: string;
  muted: string;
  accent: string;     // number bubble, active dot
  numberText: string; // text on the number bubble
  frame: string;      // border round the screenshot
};

const SHOT_W = 124;
const SHOT_H = Math.round((SHOT_W * 600) / 380); // screenshots are cropped to 380×600

export default function StepSlides({ game, colors: c }: { game: GameType; colors: SlideColors }) {
  const def = games.find((g) => g.id === game);
  const steps = def?.howTo ?? [];
  const shots = HOWTO_SHOTS[game] ?? [];
  const [w, setW] = useState(0);
  const [page, setPage] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!w) return;
    const p = Math.round(e.nativeEvent.contentOffset.x / w);
    if (p !== page) setPage(p);
  };

  return (
    <View onLayout={onLayout}>
      {w > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          decelerationRate="fast"
        >
          {steps.map((s, i) => {
            const shot = shots[i];
            return (
              <View key={i} style={{ width: w }}>
                <View style={[styles.slide, { backgroundColor: c.card }, !shot && styles.slideText]}>
                  {shot && (
                    <View style={[styles.frame, { borderColor: c.frame }]}>
                      <Image source={shot} style={styles.shot} resizeMode="cover" />
                    </View>
                  )}
                  <View style={styles.copy}>
                    <View style={styles.stepRow}>
                      <View style={[styles.num, { backgroundColor: c.accent }]}>
                        <Text style={[styles.numText, { color: c.numberText }]}>{i + 1}</Text>
                      </View>
                      <Text style={[styles.of, { color: c.muted }]}>
                        STEP {i + 1} OF {steps.length}
                      </Text>
                    </View>
                    <Text style={[styles.text, { color: c.text }, !shot && styles.textBig]}>{s}</Text>
                    {i === 0 && steps.length > 1 && <Text style={[styles.swipe, { color: c.muted }]}>Swipe for the next step ›</Text>}
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
      {steps.length > 1 && (
        <View style={styles.dots}>
          {steps.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === page ? c.accent : c.muted, opacity: i === page ? 1 : 0.35 }, i === page && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flexDirection: "row", gap: 14, borderRadius: 16, padding: 12, minHeight: SHOT_H + 24, alignItems: "center" },
  slideText: { paddingVertical: 22, paddingHorizontal: 18 },
  frame: { borderRadius: 14, borderWidth: 2, overflow: "hidden" },
  shot: { width: SHOT_W, height: SHOT_H },
  copy: { flex: 1, gap: 8 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  numText: { fontSize: 13, fontWeight: "900" },
  of: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  text: { fontSize: 14.5, lineHeight: 21 },
  textBig: { fontSize: 16, lineHeight: 23 },
  swipe: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { width: 18 },
});
