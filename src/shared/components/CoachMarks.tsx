// src/shared/components/CoachMarks.tsx
// 👉 A short first-time tour: the screen dims, one feature at a time is lit
// up, and a small bubble says what it does. "Next" walks on, "Skip" ends it.
// It shows once per phone (remembered under `storageKey`).
//
// Each step points at a ref of something already on screen. Steps whose
// target isn't there (or has no size yet) are quietly skipped.
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Animated,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { display, displaySemi } from "../theme/fonts";
import { haptics } from "../haptics";

export type CoachStep = {
  target: RefObject<any>;
  title: string;
  text: string;
  /** Light up only the top part of a tall target (e.g. the first row of a list). */
  maxHeight?: number;
};

type Props = {
  storageKey: string;
  steps: CoachStep[];
  /** Hold the tour back while something else is on screen (a sheet, a toast…). */
  paused?: boolean;
  /** Wait this long after the screen opens so everything has its place. */
  delayMs?: number;
};

type Box = { x: number; y: number; w: number; h: number };

const DIM = "rgba(14,6,20,0.78)";
const SUN = "#FFC83D";
const PAD = 6; // breathing room around the lit-up item
const BUBBLE_W = 280;

const measure = (ref: RefObject<any>): Promise<Box | null> =>
  new Promise((resolve) => {
    const node = ref.current;
    if (!node?.measureInWindow) return resolve(null);
    node.measureInWindow((x: number, y: number, w: number, h: number) =>
      resolve(w > 0 && h > 0 ? { x, y, w, h } : null),
    );
  });

export default function CoachMarks({ storageKey, steps, paused = false, delayMs = 1200 }: Props) {
  const { width: winW, height: winH } = useWindowDimensions();
  const root = useRef<View>(null);
  const [ready, setReady] = useState(false); // not seen before
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [done, setDone] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  // Seen it already on this phone?
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then((v) => alive && !v && setTimeout(() => alive && setReady(true), delayMs))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [storageKey]);

  const active = ready && !done && !paused;

  const finish = () => {
    setDone(true);
    AsyncStorage.setItem(storageKey, String(Date.now())).catch(() => {});
  };

  // Find where the current step's item sits (relative to this overlay).
  useEffect(() => {
    if (!active) return;
    let alive = true;
    (async () => {
      for (let i = index; i < steps.length; i++) {
        const [t, me] = await Promise.all([measure(steps[i].target), measure(root)]);
        if (!alive) return;
        if (t && me) {
          const h = steps[i].maxHeight ? Math.min(t.h, steps[i].maxHeight!) : t.h;
          if (i !== index) setIndex(i);
          setBox({ x: t.x - me.x - PAD, y: t.y - me.y - PAD, w: t.w + PAD * 2, h: h + PAD * 2 });
          fade.setValue(0);
          Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
          return;
        }
      }
      if (alive) finish(); // nothing left to point at
    })();
    return () => {
      alive = false;
    };
  }, [active, index, winW, winH]);

  // Android back = skip
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      finish();
      return true;
    });
    return () => sub.remove();
  }, [active]);

  if (!active) return null;

  const step = steps[index];
  const last = index >= steps.length - 1;
  const next = () => {
    haptics.tap();
    if (last) finish();
    else {
      setBox(null);
      setIndex(index + 1);
    }
  };

  // Bubble below the item if there's room, otherwise above it.
  let bubble: React.ReactNode = null;
  if (box && step) {
    const below = box.y + box.h + 190 < winH;
    const left = Math.max(12, Math.min(winW - BUBBLE_W - 12, box.x + box.w / 2 - BUBBLE_W / 2));
    const arrowX = Math.max(18, Math.min(BUBBLE_W - 18, box.x + box.w / 2 - left)) - 9;
    bubble = (
      <Animated.View
        style={[
          styles.bubble,
          { left, opacity: fade },
          below ? { top: box.y + box.h + 12 } : { bottom: winH - box.y + 12 },
        ]}
      >
        <View style={[styles.arrow, below ? styles.arrowUp : styles.arrowDown, { left: arrowX }]} />
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.text}>{step.text}</Text>
        <View style={styles.row}>
          <TouchableOpacity onPress={finish} hitSlop={10} accessibilityLabel="Skip the tour">
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
          <Text style={styles.count}>
            {index + 1} of {steps.length}
          </Text>
          <TouchableOpacity style={styles.next} onPress={next}>
            <Text style={styles.nextText}>{last ? "Got it!" : "Next"}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  return (
    <View ref={root} style={StyleSheet.absoluteFill} collapsable={false}>
      {box ? (
        <>
          {/* Four dark panels around the lit-up item; tapping the dark = Next */}
          <Pressable style={[styles.dim, { left: 0, right: 0, top: 0, height: Math.max(0, box.y) }]} onPress={next} />
          <Pressable style={[styles.dim, { left: 0, right: 0, top: box.y + box.h, bottom: 0 }]} onPress={next} />
          <Pressable style={[styles.dim, { left: 0, width: Math.max(0, box.x), top: box.y, height: box.h }]} onPress={next} />
          <Pressable style={[styles.dim, { left: box.x + box.w, right: 0, top: box.y, height: box.h }]} onPress={next} />
          {/* The ring; it also blocks taps so the tour doesn't open things */}
          <Pressable
            style={[styles.ring, { left: box.x, top: box.y, width: box.w, height: box.h }]}
            onPress={next}
          />
          {bubble}
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: DIM },
  ring: { position: "absolute", borderRadius: 16, borderWidth: 2.5, borderColor: SUN },
  bubble: {
    position: "absolute",
    width: BUBBLE_W,
    backgroundColor: "#FFFDF6",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  arrow: { position: "absolute", width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderLeftColor: "transparent", borderRightColor: "transparent" },
  arrowUp: { top: -9, borderBottomWidth: 10, borderBottomColor: "#FFFDF6" },
  arrowDown: { bottom: -9, borderTopWidth: 10, borderTopColor: "#FFFDF6" },
  title: { color: "#2A1236", fontSize: 18, ...display },
  text: { color: "#4A3A55", fontSize: 14, lineHeight: 20, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  skip: { color: "#8A7A95", fontSize: 14, ...displaySemi },
  count: { flex: 1, textAlign: "center", color: "#B0A3B8", fontSize: 12, ...displaySemi },
  next: {
    backgroundColor: SUN,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderBottomWidth: 3,
    borderBottomColor: "#D18F00",
  },
  nextText: { color: "#2A1800", fontSize: 15, ...display },
});
