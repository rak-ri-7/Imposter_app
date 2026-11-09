// src/shared/components/GameIntro.tsx
// 🎬 "Now playing": the curtain-up moment when a game begins. The game's
// full poster fills the screen, the title pops up over it with a whoosh,
// a chime and a buzz, a little band of our avatars runs across the bottom
// (they are the countdown: when they reach the far side), and after a few seconds
// it fades away by itself (tap anywhere to skip).
//
// It sits once above the whole app (see App.tsx) and watches which screen
// is showing: the first time a game's screen opens, it plays. Coming back
// to a minimised game is the same screen, so it doesn't play again; a new
// game (or a rematch from the menu) is a new screen, so it does.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, BackHandler, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { games } from "../../games/registry";
import type { GameType } from "../types";
import { POSTER_BY_GAME } from "../assets/posters";
import { GAME_COLOR } from "./MiniGame";
import { playSound } from "../audio/sounds";
import { haptics } from "../haptics";
import { display, displaySemi } from "../theme/fonts";
import PixelAvatar from "../avatars/PixelAvatar";
import { AVATARS } from "../avatars/sprites";

// ── The runners ─────────────────────────────────────────────────────────
// A pixel avatar on a little body, legs and arms swinging, bobbing as it
// runs. `step` is a looping 0→1 value shared by the whole band.
const SHIRTS = ["#FFC83D", "#F72585", "#4CC9F0", "#3DDC97", "#FF9F1C", "#7B6CF6"];
function Runner({ id, size, shirt, step, phase }: { id: string; size: number; shirt: string; step: Animated.Value; phase: number }) {
  // Shift each runner's stride a little so they don't move in lockstep.
  const s = step.interpolate({ inputRange: [0, 1], outputRange: [phase, phase + 1] });
  const swing = (deg: number) =>
    s.interpolate({ inputRange: [0, 0.5, 1, 1.5, 2], outputRange: [`${deg}deg`, `${-deg}deg`, `${deg}deg`, `${-deg}deg`, `${deg}deg`] });
  const hop = s.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2], outputRange: [0, -4, 0, -4, 0, -4, 0, -4, 0] });
  const bw = size * 0.62;
  const bh = size * 0.4;
  const legH = size * 0.3;
  const limb = (left: number, top: number, h: number, w: number, color: string, deg: number) => (
    // Rotate about the top end: shift down half, rotate, shift back.
    <Animated.View
      style={{
        position: "absolute",
        left,
        top,
        width: w,
        height: h,
        borderRadius: w / 2,
        backgroundColor: color,
        transform: [{ translateY: -h / 2 }, { rotate: swing(deg) }, { translateY: h / 2 }],
      }}
    />
  );
  return (
    <Animated.View style={{ width: size, height: size + bh + legH * 0.8, transform: [{ translateY: hop }, { rotate: "6deg" }] }}>
      {/* legs */}
      {limb(size / 2 - 5, size * 0.84 + bh - 2, legH, 5, "#2A1E1C", 32)}
      {limb(size / 2, size * 0.84 + bh - 2, legH, 5, "#2A1E1C", -32)}
      {/* back arm, body, front arm */}
      {limb(size / 2 - bw / 2 - 1, size * 0.9, size * 0.32, 5, shirt, -40)}
      <View style={{ position: "absolute", left: (size - bw) / 2, top: size * 0.84, width: bw, height: bh, borderTopLeftRadius: bw / 2, borderTopRightRadius: bw / 2, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, backgroundColor: shirt }} />
      {limb(size / 2 + bw / 2 - 4, size * 0.9, size * 0.32, 5, shirt, 40)}
      <PixelAvatar avatar={id} size={size} tile={false} />
    </Animated.View>
  );
}

const pickBand = () => {
  const ids = [...AVATARS.map((a) => a.id)];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const start = Math.floor(Math.random() * SHIRTS.length);
  return ids.slice(0, 3).map((id, i) => ({ id, shirt: SHIRTS[(start + i * 2) % SHIRTS.length] }));
};

// Which screen means which game starting.
const ROUTE_GAME: Record<string, GameType> = {
  ImposterFlow: "imposter",
  ImposterQuickPlay: "imposter",
  TimerFlow: "stop-the-timer",
  TimerPass: "stop-the-timer",
  BombFlow: "pass-the-bomb",
  QuizBoardFlow: "quiz-board",
  QuizPass: "quiz-board",
  ClashFlow: "card-clash",
  HoldemFlow: "clash-holdem",
  CotFlow: "court-of-thieves",
  MtfFlow: "match-the-following",
  MtfPass: "match-the-following",
  RrfFlow: "roof-race",
};

const SHOW_MS = 2800; // how long it stays before fading away
const seen = new Set<string>(); // screens it has already played for

export type CurrentRoute = { name: string; key: string } | undefined;

export default function GameIntro({ route }: { route: CurrentRoute }) {
  const insets = useSafeAreaInsets();
  const [game, setGame] = useState<GameType | null>(null);
  const [still, setStill] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(0)).current;
  const run = useRef(new Animated.Value(0)).current;  // 0 → 1 across the screen
  const step = useRef(new Animated.Value(0)).current; // the running stride
  const [band, setBand] = useState(pickBand);
  const { width } = useWindowDimensions();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closing = useRef(false);
  const stride = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
  }, []);

  // A game's screen just opened for the first time → curtain up.
  useEffect(() => {
    if (!route) return;
    const g = ROUTE_GAME[route.name];
    if (!g || seen.has(route.key)) return;
    seen.add(route.key);
    open(g);
  }, [route?.key]);

  const open = (g: GameType) => {
    if (timer.current) clearTimeout(timer.current);
    closing.current = false;
    setGame(g);
    fade.setValue(0);
    pop.setValue(0);
    zoom.setValue(0);
    run.setValue(0);
    step.setValue(0);
    setBand(pickBand());
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    Animated.timing(zoom, { toValue: 1, duration: SHOW_MS + 400, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(240),
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
    ]).start();
    Animated.timing(run, { toValue: 1, duration: SHOW_MS, easing: Easing.linear, useNativeDriver: true }).start();
    stride.current?.stop();
    if (!still) {
      stride.current = Animated.loop(Animated.timing(step, { toValue: 1, duration: 360, easing: Easing.linear, useNativeDriver: true }));
      stride.current.start();
    }
    playSound("gameStart");
    haptics.heavy();
    setTimeout(() => haptics.success(), 360);
    timer.current = setTimeout(close, SHOW_MS);
  };

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
      stride.current?.stop();
      setGame(null);
    });
  };

  // The phone's back button skips the intro (rather than leaving the game).
  useEffect(() => {
    if (!game) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [game]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!game) return null;
  const def = games.find((x) => x.id === game);
  const poster = POSTER_BY_GAME[game];
  const color = GAME_COLOR[game] ?? "#FFC83D";

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, { opacity: fade }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={`Now playing ${def?.name ?? ""}. Tap to start.`}>
        {/* The poster, easing in slowly */}
        {poster ? (
          <Animated.Image
            source={poster}
            resizeMode="cover"
            style={[
              StyleSheet.absoluteFill,
              { width: "100%", height: "100%" },
              !still && { transform: [{ scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] }) }] },
            ]}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
        )}

        {/* Darken the bottom so the title reads on any poster */}
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="introShade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000" stopOpacity="0.15" />
              <Stop offset="0.45" stopColor="#000" stopOpacity="0.05" />
              <Stop offset="0.72" stopColor="#000" stopOpacity="0.7" />
              <Stop offset="1" stopColor="#000" stopOpacity="0.92" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#introShade)" />
        </Svg>

        <View style={[styles.content, { paddingBottom: insets.bottom + 92 }]}>
          <Animated.View
            style={{
              alignItems: "center",
              opacity: pop,
              transform: [
                { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
                { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
              ],
            }}
          >
            <View style={[styles.nowChip, { backgroundColor: color }]}>
              <Text style={styles.nowText}>NOW PLAYING</Text>
            </View>
            <Text style={styles.emoji}>{def?.emoji}</Text>
            <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit>
              {def?.name}
            </Text>
            {!!def?.hook && <Text style={styles.hook}>{def.hook}</Text>}
          </Animated.View>
        </View>

        {/* Time left before it fades away */}
        {/* The band running across: when they reach the far side, we're off */}
        <View style={[styles.track, { bottom: insets.bottom + 6 }]} pointerEvents="none">
          <View style={[styles.ground, { backgroundColor: color }]} />
          <Animated.View
            style={[
              styles.band,
              { transform: [{ translateX: run.interpolate({ inputRange: [0, 1], outputRange: [-130, width + 10] }) }] },
            ]}
          >
            {band.map((b, i) => (
              <Runner key={b.id} id={b.id} size={i === 0 ? 42 : 36} shirt={b.shirt} step={step} phase={i * 0.37} />
            ))}
            <View style={styles.speed}>
              <View style={[styles.speedLine, { width: 14 }]} />
              <View style={[styles.speedLine, { width: 9, marginLeft: 5 }]} />
            </View>
          </Animated.View>
        </View>
        <Text style={[styles.skip, { top: insets.top + 14 }]}>Tap to skip</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#000", zIndex: 1000, elevation: 1000 },
  content: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 28 },
  nowChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10 },
  nowText: { color: "#FFFFFF", fontSize: 12, letterSpacing: 2.5, ...displaySemi },
  emoji: { fontSize: 40, marginBottom: 2 },
  title: {
    color: "#FFFFFF",
    fontSize: 38,
    lineHeight: 44,
    textAlign: "center",
    ...display,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  hook: { color: "rgba(255,255,255,0.88)", fontSize: 16, lineHeight: 22, textAlign: "center", marginTop: 8, ...displaySemi },
  track: { position: "absolute", left: 0, right: 0, height: 76, justifyContent: "flex-end" },
  ground: { position: "absolute", left: 0, right: 0, bottom: 6, height: 3, opacity: 0.55 },
  band: { position: "absolute", left: 0, bottom: 7, flexDirection: "row-reverse", alignItems: "flex-end", gap: 6 },
  speed: { justifyContent: "center", gap: 4, marginRight: 2, marginBottom: 18 },
  speedLine: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.7)" },
  skip: { position: "absolute", right: 14, color: "#FFFFFF", fontSize: 12, ...displaySemi, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden" },
});
