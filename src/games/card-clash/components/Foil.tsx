// A foil gradient filling its parent (card frames, banners), plus an
// optional moving "holo" shine for rare cards.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, Easing } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";

let gid = 0;

export function FoilFill({
  colors,
  radius = 0,
  vertical = false,
}: {
  colors: string[];
  radius?: number;
  vertical?: boolean;
}) {
  const id = useRef(`foil${++gid}`).current;
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2={vertical ? "0" : "1"} y2="1">
            {colors.map((c, i) => (
              <Stop key={i} offset={`${(i / Math.max(1, colors.length - 1)) * 100}%`} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

// A soft white band that sweeps across the card every few seconds.
export function HoloShine({ width, height, active = true }: { width: number; height: number; active?: boolean }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(x, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active]);
  if (!active) return null;
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-width, width * 1.5] });
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
      <Animated.View
        style={{
          position: "absolute",
          top: -height * 0.2,
          width: width * 0.35,
          height: height * 1.4,
          backgroundColor: "rgba(255,255,255,0.22)",
          transform: [{ translateX }, { rotate: "20deg" }],
        }}
      />
    </View>
  );
}
