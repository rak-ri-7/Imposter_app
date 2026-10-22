// Card backs flying across the screen (dealing, and beaten cards going to
// the winner's pile). Positions are window coordinates; the overlay
// measures itself so they land in the right place.
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import CardBack from "./CardBack";
import type { Rect } from "./PileBar";

export type Flight = { id: string; from: Rect; to: Rect; delay: number };

const DURATION = 650;

function Flyer({ f, origin, onDone }: { f: Flight; origin: { x: number; y: number }; onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: DURATION,
      delay: f.delay,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(() => onDone());
    return () => anim.stop();
  }, []);
  const w = 46;
  const h = 64;
  const sx = f.from.x - origin.x + f.from.w / 2 - w / 2;
  const sy = f.from.y - origin.y + f.from.h / 2 - h / 2;
  const ex = f.to.x - origin.x + f.to.w / 2 - w / 2;
  const ey = f.to.y - origin.y + f.to.h / 2 - h / 2;
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        opacity: t.interpolate({ inputRange: [0, 0.05, 0.85, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [sx, ex] }) },
          // an arc: up a little, then down onto the pile
          {
            translateY: t.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [sy, Math.min(sy, ey) - 40, ey],
            }),
          },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
          { scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.15, 0.45] }) },
        ],
      }}
    >
      <CardBack width={w} height={h} />
    </Animated.View>
  );
}

export default function FlyingCards({ flights, onAllDone }: { flights: Flight[]; onAllDone?: () => void }) {
  const ref = useRef<View>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const left = useRef(flights.length);
  useEffect(() => {
    left.current = flights.length;
  }, [flights]);
  return (
    <View
      ref={ref}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={() => ref.current?.measureInWindow((x, y) => setOrigin({ x, y }))}
    >
      {origin &&
        flights.map((f) => (
          <Flyer
            key={f.id}
            f={f}
            origin={origin}
            onDone={() => {
              left.current -= 1;
              if (left.current === 0) onAllDone?.();
            }}
          />
        ))}
    </View>
  );
}
