// src/shared/components/WinnerPodium.tsx
// 🏆 "Podium Spotlight": the winner moment at the end of every game.
// Spotlights sweep a dark stage, the podium rises 3rd → 2nd → 1st with a
// drumroll, then the winner's step lands with a crown, confetti, a fanfare
// and a triple buzz. About 5 seconds; tap anywhere to jump to the end.
//
// It works for players or teams (an entry with `members`), and for ties
// (entries sharing a rank stand on the same step). Each game's end screen
// shows it once with useCelebrateOnce(key) and passes its own ranking.
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import PixelAvatar from "../avatars/PixelAvatar";
import { playSound, stopSound } from "../audio/sounds";
import { haptics } from "../haptics";
import { display, displaySemi } from "../theme/fonts";
import { padBottom, useBottomInset } from "../hooks/useSafeBottom";

export type PodiumMember = { id: string; name: string; avatar?: string | null };
export type PodiumEntry = {
  id: string;
  name: string;
  rank: number;               // 1 = winner; equal ranks share a step
  score?: string;             // "₹34,000", "28 pts", "12 cards"…
  avatar?: string | null;     // a player's avatar id (missing = their steady fallback)
  members?: PodiumMember[];   // a team: these avatars stand on the step
  color?: string;             // a team's colour
};

type Props = {
  visible: boolean;
  title?: string;             // "And the winner is…" (or "It's a tie!" when tied)
  subtitle: string;           // e.g. "QUIZ BOARD · FINAL"
  entries: PodiumEntry[];
  onDone: () => void;
  doneLabel?: string;
};

// ── Plays once per game ending (survives re-renders and re-mounts) ──────
const seen = new Set<string>();
export const useCelebrateOnce = (key: string | null | undefined) => {
  const [show, setShow] = useState(() => !!key && !seen.has(key));
  useEffect(() => {
    if (key && !seen.has(key)) setShow(true);
  }, [key]);
  const done = () => {
    if (key) seen.add(key);
    setShow(false);
  };
  return [show, done] as const;
};

// ── Timeline (ms) ───────────────────────────────────────────────────────
const END = 4800;
const STEP_AT = { 3: 900, 2: 1700, 1: 2600 } as const;
const POP_DELAY = 280; // avatar pops after its step lands
const CROWN_AT = 3250;
const SIDE_CONFETTI_AT = 3600;
const BUTTON_AT = 4200;

const GOLD = "#C9A45C";
const STEP_STYLE = {
  1: { h: 150, top: "#EBC86E", bottom: "#B08A3E" },
  2: { h: 104, top: "#A3ACBE", bottom: "#6F7789" },
  3: { h: 76, top: "#D9A272", bottom: "#9C6A43" },
} as const;
const CONFETTI_COLORS = ["#EBC86E", "#E63946", "#4FC3F7", "#7CD992", "#F28AC1", "#FFFFFF"];

const clampIn = (clock: Animated.Value, a: number, b: number, from = 0, to = 1, easing?: (t: number) => number) =>
  clock.interpolate({ inputRange: [a, b], outputRange: [from, to], extrapolate: "clamp", easing });

export default function WinnerPodium({ visible, title, subtitle, entries, onDone, doneLabel = "See full results →" }: Props) {
  const bottomInset = useBottomInset(); // clear of the phone's bottom bar
  const { width, height } = useWindowDimensions();
  const clock = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Group by rank: the top three distinct places get a step each.
  const places = useMemo(() => {
    const ranks = [...new Set(entries.map((e) => e.rank))].sort((a, b) => a - b).slice(0, 3);
    return ranks.map((r, i) => ({ place: (i + 1) as 1 | 2 | 3, entries: entries.filter((e) => e.rank === r) }));
  }, [entries]);
  const tie = (places[0]?.entries.length ?? 0) > 1;
  const heading = title ?? (tie ? "It's a tie!" : "And the winner is…");

  // Every player on the podium, for avatar fallbacks.
  const everyone = useMemo(
    () => entries.flatMap((e) => (e.members?.length ? e.members : [{ id: e.id, name: e.name, avatar: e.avatar }])),
    [entries],
  );

  // ── Run the show ──
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  useEffect(() => {
    if (!visible) return;
    clock.setValue(0);
    Animated.timing(clock, { toValue: END, duration: END, easing: Easing.linear, useNativeDriver: true }).start();
    const has = (p: 1 | 2 | 3) => places.some((x) => x.place === p);
    at(250, () => playSound("podiumRoll"));
    if (has(3)) {
      at(STEP_AT[3], () => playSound("podiumDrum"));
      at(STEP_AT[3] + POP_DELAY, () => (playSound("podiumPop"), haptics.tap()));
    }
    if (has(2)) {
      at(STEP_AT[2], () => playSound("podiumDrum"));
      at(STEP_AT[2] + POP_DELAY, () => (playSound("podiumPop"), haptics.tap()));
    }
    at(STEP_AT[1], () => (stopSound("podiumRoll"), playSound("podiumDrum"), haptics.heavy()));
    at(STEP_AT[1] + POP_DELAY, () => (playSound("podiumFanfare"), haptics.success()));
    at(SIDE_CONFETTI_AT, () => haptics.press());
    return () => {
      clear();
      stopSound("podiumRoll");
    };
  }, [visible]);

  const skipToEnd = () => {
    clear();
    stopSound("podiumRoll");
    clock.stopAnimation();
    clock.setValue(END);
  };

  // ── Layout ──
  const gutter = 18;
  const stepW = Math.min(118, Math.floor((width - gutter * 2 - 16) / 3));
  const centreX = width / 2;
  const xFor = { 1: centreX - stepW / 2, 2: centreX - stepW * 1.5 - 8, 3: centreX + stepW / 2 + 8 } as const;
  const floor = 112 + bottomInset; // podium bottom, above the button

  // Confetti: one burst from the winner's step, two cannons from the sides.
  const confetti = useMemo(() => {
    const out: { x0: number; y0: number; dx: number; up: number; fall: number; start: number; dur: number; rot: number; c: string; w: number; h: number }[] = [];
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const add = (n: number, x0: number, y0: number, spreadX: number, dirX: number, start: number) => {
      for (let i = 0; i < n; i++) {
        out.push({
          x0, y0,
          dx: dirX ? dirX * (40 + r() * spreadX) : (r() - 0.5) * spreadX * 2,
          up: 120 + r() * 220,
          fall: height * (0.35 + r() * 0.5),
          start: start + r() * 160,
          dur: 1500 + r() * 900,
          rot: (r() - 0.5) * 1440,
          c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          w: 6 + r() * 5,
          h: 9 + r() * 6,
        });
      }
    };
    const winY = height - floor - STEP_STYLE[1].h - 60;
    add(54, centreX, winY, 170, 0, STEP_AT[1] + POP_DELAY);
    add(22, 0, height - 40, 230, 1, SIDE_CONFETTI_AT);
    add(22, width, height - 40, 230, -1, SIDE_CONFETTI_AT);
    return out;
  }, [width, height]);

  if (!visible) return null;

  const beam = (side: -1 | 0 | 1, appearAt: number) => {
    const sweep = clock.interpolate({
      inputRange: [0, 800, 1600, 2400, 3200, END],
      outputRange: side === 0 ? ["0deg", "0deg", "0deg", "0deg", "0deg", "0deg"] : side < 0 ? ["-30deg", "-12deg", "-34deg", "-14deg", "-22deg", "-22deg"] : ["30deg", "12deg", "34deg", "14deg", "22deg", "22deg"],
    });
    const opacity =
      side === 0
        ? clampIn(clock, STEP_AT[1], STEP_AT[1] + 300)
        : clock.interpolate({ inputRange: [appearAt, appearAt + 500, STEP_AT[1], STEP_AT[1] + 400], outputRange: [0, 1, 1, 0.3], extrapolate: "clamp" });
    const bw = side === 0 ? stepW * 1.25 : 120;
    return (
      <Animated.View
        key={side}
        pointerEvents="none"
        style={[
          styles.beam,
          { width: bw, height: height * 0.95, left: side === 0 ? centreX - bw / 2 : side < 0 ? 24 : width - 24 - bw, opacity, transform: [{ rotate: sweep }], transformOrigin: "top" },
        ]}
      >
        <Svg width={bw} height={height * 0.95}>
          <Defs>
            <LinearGradient id={`beam${side}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFF0BE" stopOpacity={0.34} />
              <Stop offset="1" stopColor="#FFF0BE" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={bw} height={height * 0.95} fill={`url(#beam${side})`} />
        </Svg>
      </Animated.View>
    );
  };

  const renderPlace = ({ place, entries: es }: { place: 1 | 2 | 3; entries: PodiumEntry[] }) => {
    const st = STEP_STYLE[place];
    const rise = clampIn(clock, STEP_AT[place], STEP_AT[place] + 450, st.h + floor, 0, Easing.out(Easing.cubic));
    const popStart = STEP_AT[place] + POP_DELAY - 30;
    const pop = clampIn(clock, popStart, popStart + 500, 0, 1, Easing.out(Easing.back(1.8)));
    const popOpacity = clampIn(clock, popStart, popStart + 180);
    const winner = place === 1;
    const team = es.length === 1 && !!es[0].members?.length;
    const faces: PodiumMember[] = team ? es[0].members!.slice(0, 4) : es.map((e) => ({ id: e.id, name: e.name, avatar: e.avatar }));
    const big = winner ? (faces.length > 2 ? 46 : faces.length > 1 ? 54 : 70) : faces.length > 1 ? 40 : 56;
    const name = team ? es[0].name : es.map((e) => e.name).join(" & ");
    const score = es[0].score;
    const crownY = clampIn(clock, CROWN_AT, CROWN_AT + 420, -34, 0, Easing.out(Easing.back(2)));
    const crownO = clampIn(clock, CROWN_AT, CROWN_AT + 180);

    return (
      <View key={place} pointerEvents="none" style={[styles.place, { left: xFor[place], width: stepW, bottom: floor }]}>
        {/* who stands here */}
        <Animated.View style={[styles.who, { opacity: popOpacity, transform: [{ translateY: Animated.multiply(Animated.add(pop, -1), -22) }, { scale: Animated.add(Animated.multiply(pop, 0.2), 0.8) }] }]}>
          {winner && (
            <Animated.Text style={[styles.crown, { opacity: crownO, transform: [{ translateY: crownY }] }]}>👑</Animated.Text>
          )}
          <View style={[styles.faces, team && es[0].color ? { borderColor: es[0].color } : null]}>
            {faces.map((f, i) => (
              <View key={f.id} style={[styles.face, { width: big + 6, height: big + 6, marginLeft: i ? -(big * 0.22) : 0, zIndex: faces.length - i }]}>
                <PixelAvatar avatar={f.avatar ?? undefined} playerId={f.id} size={big} />
              </View>
            ))}
          </View>
          <Text style={[styles.name, winner && styles.nameWin]} numberOfLines={2}>
            {name}
          </Text>
          {!!score && <Text style={styles.score}>{score}</Text>}
        </Animated.View>
        {/* the step */}
        <Animated.View style={{ height: st.h, transform: [{ translateY: rise }] }}>
          <Svg width={stepW} height={st.h} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={`step${place}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={st.top} />
                <Stop offset="1" stopColor={st.bottom} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={stepW} height={st.h + 12} rx={10} fill={`url(#step${place})`} />
          </Svg>
          <Text style={styles.stepNum}>{es[0].rank}</Text>
        </Animated.View>
      </View>
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone} statusBarTranslucent>
      <Pressable style={styles.stage} onPress={skipToEnd} accessibilityLabel="Skip to the end">
        {/* floor glow */}
        <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="floorGlow" cx="50%" cy="100%" rx="75%" ry="55%">
              <Stop offset="0" stopColor="#3A2A66" stopOpacity={0.9} />
              <Stop offset="1" stopColor="#0C0A18" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={width / 2} cy={height} rx={width * 0.9} ry={height * 0.5} fill="url(#floorGlow)" />
        </Svg>
        {beam(-1, 100)}
        {beam(1, 100)}
        {beam(0, 0)}

        <Animated.Text style={[styles.title, { opacity: clampIn(clock, 200, 600) }]}>{heading}</Animated.Text>
        <Animated.Text style={[styles.subtitle, { opacity: clampIn(clock, 400, 800) }]}>{subtitle}</Animated.Text>

        {places.map(renderPlace)}

        {/* confetti */}
        {confetti.map((p, i) => {
          const prog = clampIn(clock, p.start, p.start + p.dur);
          const tx = prog.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
          const ty = prog.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, -p.up, p.fall], easing: Easing.inOut(Easing.quad) });
          const rot = prog.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.rot}deg`] });
          const op = clock.interpolate({ inputRange: [p.start - 1, p.start, p.start + p.dur * 0.85, p.start + p.dur], outputRange: [0, 1, 1, 0], extrapolate: "clamp" });
          return (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={{ position: "absolute", left: p.x0, top: p.y0, width: p.w, height: p.h, backgroundColor: p.c, borderRadius: 2, opacity: op, transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }] }}
            />
          );
        })}

        <Animated.View style={[styles.btnWrap, { bottom: 40 + bottomInset }, { opacity: clampIn(clock, BUTTON_AT, BUTTON_AT + 400) }]}>
          <TouchableOpacity style={styles.btn} onPress={onDone} accessibilityRole="button">
            <Text style={styles.btnText}>{doneLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: "#0C0A18", overflow: "hidden" },
  beam: { position: "absolute", top: -30 },
  title: { position: "absolute", top: 70, left: 16, right: 16, textAlign: "center", color: "#FFFFFF", fontSize: 31, ...display },
  subtitle: { position: "absolute", top: 112, left: 16, right: 16, textAlign: "center", color: GOLD, fontSize: 13, letterSpacing: 3, ...displaySemi },
  place: { position: "absolute", alignItems: "stretch" },
  who: { alignItems: "center", marginBottom: 10 },
  crown: { fontSize: 30, marginBottom: -10, zIndex: 3 },
  faces: { flexDirection: "row", justifyContent: "center" },
  face: { borderRadius: 16, borderWidth: 3, borderColor: "#FFFFFF", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  name: { color: "#FFFFFF", fontSize: 16, textAlign: "center", marginTop: 6, ...display },
  nameWin: { fontSize: 21 },
  score: { color: GOLD, fontSize: 13, marginTop: 1, ...displaySemi },
  stepNum: { color: "rgba(255,255,255,0.92)", fontSize: 34, textAlign: "center", marginTop: 8, ...display },
  btnWrap: { position: "absolute", left: 24, right: 24, bottom: 40 },
  btn: { height: 52, borderRadius: 14, backgroundColor: "#FFC83D", borderBottomWidth: 4, borderBottomColor: "#D18F00", alignItems: "center", justifyContent: "center" },
  btnText: { color: "#121110", fontSize: 19, ...display },
});

// ── Helpers for the games' end screens ─────────────────────────────────
type Person = { id: string; name: string; avatar?: string };

// A game's standings rows ({ playerId, rank }) → podium entries.
export const podiumEntries = <R extends { playerId: string; rank: number }>(
  rows: R[],
  players: Person[],
  score?: (r: R) => string | undefined,
): PodiumEntry[] =>
  rows
    .filter((r) => r.rank <= 3)
    .map((r) => {
      const p = players.find((x) => x.id === r.playerId);
      return { id: r.playerId, name: p?.name ?? "Someone", avatar: p?.avatar, rank: r.rank, score: score?.(r) };
    });

// Drop-in for an end screen: plays the podium once for this ending.
// `id` should change with each new ending (e.g. group id + final scores).
export function EndPodium({ id, subtitle, entries, doneLabel }: { id: string | null; subtitle: string; entries: PodiumEntry[]; doneLabel?: string }) {
  const [show, done] = useCelebrateOnce(entries.length ? id : null);
  return <WinnerPodium visible={show} subtitle={subtitle} entries={entries} onDone={done} doneLabel={doneLabel} />;
}
