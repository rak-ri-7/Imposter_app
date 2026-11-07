// src/shared/components/PosterWall.tsx
// The welcome screen's background: a wall of game posters, tilted, with
// the columns drifting slowly (every other column the opposite way), like
// the sign-in screens of streaming apps. A dark gradient sits on top so the
// title and buttons stay readable. Still (no drifting) when the phone asks
// for reduced motion.
//
// To add a game's poster later: put a 2:3 JPG in src/shared/assets/posters
// and add it to POSTERS below.
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

const POSTERS = [
  require("../assets/posters/imposter.jpg"),
  require("../assets/posters/roof-race.jpg"),
  require("../assets/posters/match-the-following.jpg"),
  require("../assets/posters/court-of-thieves.jpg"),
  require("../assets/posters/bomb-story.jpg"),
  require("../assets/posters/quiz-board.jpg"),
  require("../assets/posters/card-stats.jpg"),
  require("../assets/posters/holdem-deck.jpg"),
  require("../assets/posters/stop-the-timer.jpg"),
];

const TILT_DEG = -15;
const SECONDS_PER_LOOP = 70; // how long a column takes to drift one full set of posters

export default function PosterWall() {
  const { width, height } = useWindowDimensions();
  const [still, setStill] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setStill);
    return () => sub.remove();
  }, []);

  // Sizes from the screen: posters about a quarter of the width.
  const layout = useMemo(() => {
    const w = Math.round(width * 0.27);
    const h = Math.round(w * 1.5);
    const gap = Math.round(w * 0.1);
    const step = h + gap;
    const rad = (Math.abs(TILT_DEG) * Math.PI) / 180;
    // The tilted wall must still cover the whole (upright) screen.
    const needW = width * Math.cos(rad) + height * Math.sin(rad);
    const needH = height * Math.cos(rad) + width * Math.sin(rad);
    const cols = Math.ceil(needW / (w + gap)) + 1;
    const rows = Math.ceil(needH / step) + 1; // one "set" of posters per column
    return { w, h, gap, step, cols, rows, setH: rows * step, wallW: cols * (w + gap) - gap };
  }, [width, height]);

  // One drift per column; even columns drift up, odd ones down.
  const drift = useRef<Animated.Value[]>([]).current;
  while (drift.length < layout.cols) drift.push(new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const loops = drift.slice(0, layout.cols).map((v, c) => {
      v.setValue(0);
      const loop = Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: (SECONDS_PER_LOOP + (c % 3) * 8) * 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
      return loop;
    });
    return () => loops.forEach((l) => l.stop());
  }, [still, layout.cols]);

  const { w, h, gap, cols, rows, setH, wallW } = layout;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={{
          position: "absolute",
          width: wallW,
          height: setH,
          left: (width - wallW) / 2,
          top: (height - setH) / 2,
          flexDirection: "row",
          gap,
          transform: [{ rotate: `${TILT_DEG}deg` }],
        }}
      >
        {Array.from({ length: cols }, (_, c) => {
          // Each column holds its set twice, so moving by one set loops seamlessly.
          const up = c % 2 === 0;
          const start = (c % 2) * 0.5; // offset alternate columns by half a poster set
          const translateY = still
            ? -setH * start
            : drift[c].interpolate({
                inputRange: [0, 1],
                outputRange: up ? [-setH * start, -setH * (1 + start)] : [-setH * (1 + start), -setH * start],
                extrapolate: "extend",
              });
          return (
            <Animated.View key={c} style={{ width: w, gap, transform: [{ translateY }] }}>
              {Array.from({ length: rows * 3 }, (_, r) => (
                <Image
                  key={r}
                  source={POSTERS[(c * 5 + (r % rows) * 2 + (c >> 1) * 3) % POSTERS.length]}
                  style={{ width: w, height: h, borderRadius: Math.round(w * 0.09) }}
                  resizeMode="cover"
                  fadeDuration={0}
                />
              ))}
            </Animated.View>
          );
        })}
      </View>
      {/* Darker towards the bottom, where the title and buttons are. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#07080A" stopOpacity="0.35" />
            <Stop offset="0.35" stopColor="#07080A" stopOpacity="0.45" />
            <Stop offset="0.6" stopColor="#07080A" stopOpacity="0.85" />
            <Stop offset="0.78" stopColor="#07080A" stopOpacity="0.97" />
            <Stop offset="1" stopColor="#07080A" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#shade)" />
      </Svg>
    </View>
  );
}
