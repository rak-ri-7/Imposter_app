// src/shared/components/WelcomeScene.tsx
// 🎉 The welcome screen's art: our own pixel avatars, not one game's poster.
// Two scenes, and each launch of the app picks one at random:
//   • "crowd": all 24 avatars partying in three rows, hopping on their own
//     beats, game icons popping up over their heads, confetti drifting down.
//   • "table": game night round a card table under a hanging lamp, with a bit
//     of every game on the table and the players chatting in speech bubbles.
// Once you've started typing your name, your own avatar takes the front seat.
// Everything runs on the native driver; it stays still when the phone asks
// for reduced motion.
//
// The scene is drawn on a fixed canvas and scaled to fit whatever space the
// screen gives it (it shrinks when the keyboard is open, and hides when there
// is almost no room).
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import PixelAvatar from "../avatars/PixelAvatar";
import { AVATARS } from "../avatars/sprites";
import { displaySemi } from "../theme/fonts";

export type SceneKind = "crowd" | "table";

const CW = 380; // canvas width
const BULB_COLORS = ["#FFD56A", "#FF7A9C", "#7FD8FF", "#9BE58F"];

// ---------------------------------------------------------------- helpers

function useStill() {
  const [still, setStill] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setStill);
    return () => sub.remove();
  }, []);
  return still;
}

const shuffled = <T,>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** An avatar that hops now and then (or just stands, if `hop` is 0). */
const Hopper = memo(function Hopper({ id, size, hop, delay, still }: { id: string; size: number; hop: number; delay: number; still: boolean }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still || !hop) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(900 + (delay % 700)),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, hop, delay]);
  return (
    <Animated.View style={{ transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, -hop] }) }] }}>
      <PixelAvatar avatar={id} size={size} />
    </Animated.View>
  );
});

/** Your own avatar: pops in whenever you change it. */
function Me({ id, size }: { id: string; size: number }) {
  const s = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    s.setValue(0.6);
    Animated.spring(s, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
  }, [id]);
  return (
    <Animated.View style={{ transform: [{ scale: s }] }}>
      <PixelAvatar avatar={id} size={size} />
      <View style={styles.youTag}>
        <Text style={styles.youText}>YOU</Text>
      </View>
    </Animated.View>
  );
}

type Slot = { x: number; y: number }; // where the bubble's bottom-centre points

/** One speech bubble that hops from slot to slot, saying the next thing. */
function BubbleCycle({ slots, items, period, phase, still, emoji }: { slots: Slot[]; items: string[]; period: number; phase: number; still: boolean; emoji?: boolean }) {
  const [n, setN] = useState(phase);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) {
      a.setValue(1);
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    const show = () => {
      a.setValue(0);
      Animated.sequence([
        Animated.spring(a, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }),
        Animated.delay(period - 700),
        Animated.timing(a, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
      t = setTimeout(() => {
        setN((k) => k + 1);
        show();
      }, period + 260);
    };
    const first = setTimeout(show, (phase % 3) * 900);
    return () => {
      clearTimeout(first);
      clearTimeout(t);
    };
  }, [still]);
  const slot = slots[n % slots.length];
  const text = items[(n * 3 + phase) % items.length];
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bubbleWrap,
        { left: slot.x - 70, top: slot.y - 30, opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] },
      ]}
    >
      <View style={[styles.bubble, emoji && styles.bubbleEmoji]}>
        <Text style={emoji ? styles.bubbleEmojiText : styles.bubbleText}>{text}</Text>
      </View>
      <View style={styles.bubbleTail} />
    </Animated.View>
  );
}

// ---------------------------------------------------------------- lights

/** Party string lights for the top of the screen (crowd scene). */
export function PartyLights({ width }: { width: number }) {
  const still = useStill();
  const N = Math.max(9, Math.round(width / 29));
  const sag = 56;
  const pt = (t: number) => ({
    x: -10 + t * (width + 20),
    y: (1 - t) * (1 - t) * 18 + 2 * (1 - t) * t * (18 + sag) + t * t * 18,
  });
  const glows = useRef<Animated.Value[]>([]).current;
  while (glows.length < N) glows.push(new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const loops = glows.slice(0, N).map((v, i) => {
      const l = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 900 + (i % 4) * 260, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 900 + (i % 3) * 300, useNativeDriver: true }),
        ]),
      );
      v.setValue((i % 3) / 3);
      l.start();
      return l;
    });
    return () => loops.forEach((l) => l.stop());
  }, [still, N]);
  return (
    <View style={[StyleSheet.absoluteFill, { height: 110 }]} pointerEvents="none">
      <Svg width={width} height={100} style={StyleSheet.absoluteFill}>
        <Path d={`M -10 18 Q ${width / 2} ${18 + sag * 2} ${width + 10} 18`} stroke="#5A3A68" strokeWidth={2} fill="none" />
      </Svg>
      {Array.from({ length: N }, (_, i) => {
        const p = pt((i + 0.5) / N);
        const c = BULB_COLORS[i % 4];
        return (
          <View key={i} style={{ position: "absolute", left: p.x - 10, top: p.y - 3, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
            <Animated.View
              style={{
                position: "absolute",
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: c,
                opacity: still ? 0.3 : glows[i].interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.5] }),
              }}
            />
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} />
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- crowd

const CROWD_H = 250;
const CROWD_ROWS = [
  { n: 9, size: 28, y: 120, op: 0.55, hop: 6 },
  { n: 8, size: 36, y: 148, op: 0.8, hop: 9 },
  { n: 7, size: 46, y: 182, op: 1, hop: 12 },
];
const CROWD_EMOJI = ["🎲", "💣", "🃏", "❓", "🎉", "⏱️", "🕵️", "💰", "🔑", "🏆"];
const CONFETTI = [
  { x: 40, c: "#FFD56A", d: 6200 },
  { x: 92, c: "#FF7A9C", d: 7400 },
  { x: 150, c: "#7FD8FF", d: 5600 },
  { x: 205, c: "#FF7A9C", d: 6800 },
  { x: 258, c: "#FFD56A", d: 7900 },
  { x: 305, c: "#7FD8FF", d: 6000 },
  { x: 345, c: "#9BE58F", d: 7100 },
];

function Confetti({ still }: { still: boolean }) {
  const vs = useRef(CONFETTI.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (still) return;
    const loops = vs.map((v, i) => {
      v.setValue(((i * 37) % 100) / 100);
      // start part-way, then loop from the top
      const first = Animated.timing(v, { toValue: 1, duration: CONFETTI[i].d * (1 - ((i * 37) % 100) / 100), easing: Easing.linear, useNativeDriver: true });
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(v, { toValue: 1, duration: CONFETTI[i].d, easing: Easing.linear, useNativeDriver: true }),
        ]),
      );
      const all = Animated.sequence([first, loop]);
      all.start();
      return all;
    });
    return () => loops.forEach((l) => l.stop());
  }, [still]);
  return (
    <>
      {CONFETTI.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: p.x,
            top: 0,
            width: 7,
            height: 10,
            borderRadius: 2,
            backgroundColor: p.c,
            opacity: still ? 0.9 : vs[i].interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: still ? 20 + ((i * 23) % 60) : vs[i].interpolate({ inputRange: [0, 1], outputRange: [-10, 150] }) },
              { translateX: still ? 0 : vs[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, i % 2 ? 10 : -10, 0] }) },
              { rotate: still ? `${i * 37}deg` : vs[i].interpolate({ inputRange: [0, 1], outputRange: [`${i * 37}deg`, `${i * 37 + (i % 2 ? 360 : -360)}deg`] }) },
            ],
          }}
        />
      ))}
    </>
  );
}

function Crowd({ me, still }: { me?: string; still: boolean }) {
  // A fresh shuffle each launch (all 24 still appear).
  const order = useMemo(() => shuffled(AVATARS.map((a) => a.id)), []);
  const people = useMemo(() => {
    const ids = order.filter((x) => x !== me);
    const out: { key: string; id: string; size: number; x: number; y: number; op: number; hop: number; delay: number; isMe: boolean }[] = [];
    let k = 0;
    CROWD_ROWS.forEach((r, ri) => {
      // Keep a margin at both sides, like the table scene.
      const M = 22;
      const gap = (CW - 2 * M) / r.n;
      for (let i = 0; i < r.n; i++) {
        const isMe = !!me && ri === 2 && i === 3;
        const id = isMe ? me! : ids[k++ % ids.length];
        out.push({
          key: `${ri}-${i}`,
          id,
          size: r.size,
          x: M + gap * i + (gap - r.size) / 2,
          y: r.y - (i % 2) * 3,
          op: r.op,
          hop: (i + ri) % 3 === 0 ? r.hop : 0,
          delay: ((i * 7 + ri * 5) % 11) * 170,
          isMe,
        });
      }
    });
    return out;
  }, [order, me]);

  // Bubbles over the middle and front rows.
  const slots = useMemo(
    () => people.filter((p) => p.key.startsWith("1-") || p.key.startsWith("2-")).filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x + p.size / 2, y: p.y - 4 })),
    [people],
  );

  return (
    <>
      <Confetti still={still} />
      {people.map((p) => (
        <View key={p.key} style={{ position: "absolute", left: p.x, top: p.y, opacity: p.op }}>
          {p.isMe ? <Me id={p.id} size={p.size} /> : <Hopper id={p.id} size={p.size} hop={p.hop} delay={p.delay} still={still} />}
        </View>
      ))}
      <View style={styles.floor} />
      <BubbleCycle slots={slots} items={CROWD_EMOJI} period={2400} phase={0} still={still} emoji />
      <BubbleCycle slots={[...slots].reverse()} items={CROWD_EMOJI} period={2800} phase={2} still={still} emoji />
    </>
  );
}

// ---------------------------------------------------------------- table

const TABLE_H = 310;
const T_CX = CW / 2;
const T_CY = 212;
const T_RX = 124; // seats + avatars stay inside the canvas (with a margin)
const T_RY = 58;
const SEATS = 12;
const TABLE_LINES = ["Me next!", "Rematch?", "It wasn’t me", "Trust me.", "One more round", "I knew it!", "Who’s bluffing?", "Not again…", "Pass it on!", "Shh!"];
const TABLE_BITS: [string, number, number, number][] = [
  ["🃏", -66, -10, -12],
  ["🎲", -26, 12, 0],
  ["💣", 22, -14, 0],
  ["⏱️", 62, 6, 0],
  ["❓", 6, 22, 10],
  ["🔑", -90, 14, 20],
  ["💰", 92, -16, 0],
];

function Table({ me, still }: { me?: string; still: boolean }) {
  const order = useMemo(() => shuffled(AVATARS.map((a) => a.id)), []);
  const seats = useMemo(() => {
    const ids = order.filter((x) => x !== me);
    return Array.from({ length: SEATS }, (_, i) => {
      const a = ((i + 0.5) / SEATS) * Math.PI * 2 - Math.PI / 2;
      const x = T_CX + Math.cos(a) * (T_RX + 20);
      const y = T_CY + Math.sin(a) * (T_RY + 28);
      const size = Math.round(34 + (Math.sin(a) + 1) * 11);
      const isMe = !!me && i === 5;
      return { i, x, y, size, front: Math.sin(a) > 0, id: isMe ? me! : ids[i % ids.length], isMe, hop: i % 3 === 0 ? 6 : 0 };
    });
  }, [order, me]);

  const cone = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const l = Animated.loop(
      Animated.sequence([
        Animated.timing(cone, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(cone, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    l.start();
    return () => l.stop();
  }, [still]);

  const seat = (s: (typeof seats)[number]) => (
    <View key={s.i} style={{ position: "absolute", left: s.x - s.size / 2, top: s.y - s.size + (s.i % 3 === 0 ? -6 : 0) }}>
      {s.isMe ? <Me id={s.id} size={s.size} /> : <Hopper id={s.id} size={s.size} hop={s.hop} delay={s.i * 230} still={still} />}
    </View>
  );
  // Bubbles over the back seats and the two ends.
  const slots = useMemo(
    () => seats.filter((s) => !s.isMe && (!s.front || s.i === 0 || s.i === SEATS - 1 || s.i === 4)).map((s) => ({ x: Math.min(Math.max(s.x, 72), CW - 72), y: s.y - s.size - 4 })),
    [seats],
  );

  return (
    <>
      <Svg width={CW} height={TABLE_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="cord" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#5A3A68" stopOpacity="0" />
            <Stop offset="1" stopColor="#5A3A68" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="felt" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#2E8B57" />
            <Stop offset="1" stopColor="#1F6B43" />
          </LinearGradient>
        </Defs>
        <Rect x={T_CX - 1} y={0} width={2} height={84} fill="url(#cord)" />
        <Ellipse cx={T_CX} cy={T_CY + 10} rx={T_RX + 6} ry={T_RY + 8} fill="#5A3A22" />
        <Ellipse cx={T_CX} cy={T_CY} rx={T_RX} ry={T_RY} fill="url(#felt)" />
        <Ellipse cx={T_CX} cy={T_CY} rx={T_RX - 10} ry={T_RY - 8} fill="none" stroke="#3FA56B" strokeWidth={1.5} opacity={0.6} />
      </Svg>
      {/* The lamp's light, breathing slowly */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: still ? 0.85 : cone.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }]} pointerEvents="none">
        <Svg width={CW} height={TABLE_H}>
          <Defs>
            <RadialGradient id="lamp" cx="50%" cy="0%" r="80%">
              <Stop offset="0" stopColor="#FFD98A" stopOpacity="0.4" />
              <Stop offset="1" stopColor="#FFD98A" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Path d={`M ${T_CX - 70} ${T_CY + 40} L ${T_CX - 18} 96 L ${T_CX + 18} 96 L ${T_CX + 70} ${T_CY + 40} Z`} fill="url(#lamp)" />
        </Svg>
      </Animated.View>
      <Svg width={CW} height={TABLE_H} style={StyleSheet.absoluteFill}>
        <Path d={`M ${T_CX - 22} 98 Q ${T_CX} 76 ${T_CX + 22} 98 Z`} fill="#F2C66D" />
        <Ellipse cx={T_CX} cy={100} rx={10} ry={3} fill="#FFF3C8" />
      </Svg>
      {seats.filter((s) => !s.front).map(seat)}
      {TABLE_BITS.map(([e, dx, dy, r], i) => (
        <Text key={i} style={{ position: "absolute", left: T_CX + dx - 12, top: T_CY + dy - 14, fontSize: 22, transform: [{ rotate: `${r}deg` }] }}>
          {e}
        </Text>
      ))}
      {seats.filter((s) => s.front).map(seat)}
      <BubbleCycle slots={slots} items={TABLE_LINES} period={2600} phase={0} still={still} />
      <BubbleCycle slots={[...slots].reverse()} items={TABLE_LINES} period={3100} phase={1} still={still} />
    </>
  );
}

// ---------------------------------------------------------------- the scene

/** Fills the space it's given with the chosen scene, scaled to fit. */
export default function WelcomeScene({ kind, me }: { kind: SceneKind; me?: string }) {
  const still = useStill();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: Math.round(width), h: Math.round(height) });
  };
  const H = kind === "crowd" ? CROWD_H : TABLE_H;
  // Never wider than the screen (with a little air) and never blown up past
  // life size, which only makes the pixels chunky.
  const scale = Math.min((box.w - 8) / CW, box.h / H, 1);
  return (
    <View style={styles.fill} onLayout={onLayout} pointerEvents="none">
      {box.w > 0 && scale > 0.42 && (
        <View
          style={{
            position: "absolute",
            width: CW,
            height: H,
            left: (box.w - CW) / 2,
            top: (box.h - H) / 2,
            transform: [{ scale }],
          }}
        >
          {kind === "crowd" ? <Crowd me={me} still={still} /> : <Table me={me} still={still} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Wider than the screen padding, so the scene can use the full width.
  fill: { flex: 1, alignSelf: "stretch", marginHorizontal: -24, overflow: "visible" },
  floor: { position: "absolute", left: 18, right: 18, top: 236, height: 4, borderRadius: 2, backgroundColor: "#43204F" },
  bubbleWrap: { position: "absolute", width: 140, alignItems: "center" },
  bubble: { backgroundColor: "#FFFFFF", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  bubbleEmoji: { paddingHorizontal: 6, paddingVertical: 2 },
  bubbleText: { fontSize: 12, color: "#1A1A2E", ...displaySemi },
  bubbleEmojiText: { fontSize: 15 },
  bubbleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
    marginTop: -1,
  },
  youTag: { position: "absolute", bottom: -8, alignSelf: "center", backgroundColor: "#F2C66D", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  youText: { fontSize: 9, color: "#121110", ...displaySemi, letterSpacing: 0.5 },
});
