// The back of every card: red diamond lattice, gold trim, centre emblem.
import { View, Text, StyleSheet } from "react-native";
import Svg, { Defs, Pattern, Path, Rect, LinearGradient, Stop } from "react-native-svg";
import { useRef } from "react";
import { CC, SERIF } from "../theme";

let bid = 0;

// `gold`: a ★ gold card face-down: gold edging and a glow.
export default function CardBack({ width, height, gold }: { width: number; height: number; gold?: boolean }) {
  const id = useRef(++bid).current;
  const cell = Math.max(10, Math.round(width / 9));
  const small = width < 120;
  return (
    <View style={[styles.card, gold && styles.cardGold, { width, height, borderRadius: width * 0.07 }]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={CC.backA} />
            <Stop offset="50%" stopColor={CC.backB} />
            <Stop offset="100%" stopColor={CC.backA} />
          </LinearGradient>
          <Pattern id={`lat${id}`} width={cell} height={cell} patternUnits="userSpaceOnUse">
            <Path
              d={`M${cell / 2} 0 L${cell} ${cell / 2} L${cell / 2} ${cell} L0 ${cell / 2} Z`}
              fill="none"
              stroke="rgba(245,197,66,0.35)"
              strokeWidth={1}
            />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#bg${id})`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#lat${id})`} />
      </Svg>
      <View style={[styles.inner, { borderRadius: width * 0.05, margin: width * 0.045 }]} />
      <View style={styles.center} pointerEvents="none">
        <View style={[styles.emblem, { width: width * 0.62, height: width * 0.62 * 0.72, borderRadius: width }]}>
          <Text style={{ fontSize: small ? width * 0.2 : width * 0.16 }}>🃏</Text>
          {!small && <Text style={[styles.title, { fontSize: width * 0.075 }]}>CLASH{"\n"}CARDS</Text>}
          {gold && <Text style={[styles.title, { fontSize: Math.max(9, width * 0.08) }]}>★</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderWidth: 3,
    borderColor: CC.backTrim,
    backgroundColor: CC.backA,
  },
  cardGold: { borderWidth: 5, borderColor: "#FFE27A", shadowColor: "#FFD54A", shadowOpacity: 1, shadowRadius: 10, elevation: 10 },
  inner: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 1.5,
    borderColor: "rgba(245,197,66,0.8)",
  },
  center: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  emblem: {
    backgroundColor: "#2A0710",
    borderWidth: 3,
    borderColor: CC.backTrim,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: CC.gold,
    fontFamily: SERIF,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 1,
    lineHeight: undefined,
  },
});
