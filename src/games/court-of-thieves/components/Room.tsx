// The room seen from above: everyone's seat in a circle (in the order the
// app seated them), each player's handbag on the rug in front of them, the
// Thief's glove and their fading footprints.
//
// `look` decides what this phone can see:
//   'dark'    lights out: shapes barely there (a ⚡ flash shows a colourless glove)
//   'thief'   the Thief's night vision: their own glove and prints, bag money
//   'witness' early lights: the glove and prints in colour, live
//   'lit'     lights on: everyone's balance, prints still fading
import { View, Pressable, StyleSheet } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from "react-native-svg";
import type { CotGameState, CotSpot, Group } from "../../../shared/types";
import { printsAt, thiefAt, thiefOf } from "../logic/engine";
import { CT, rupees, seatColor } from "../theme";

export type RoomLook = "dark" | "flash" | "thief" | "witness" | "lit";

type Props = {
  gs: CotGameState;
  group: Group;
  playerId: string;
  size: number;
  look: RoomLook;
  now: number;                                   // server ms
  balances?: Record<string, number>;             // shown under seats / on bags
  deltas?: Record<string, number>;               // +/- since before the outage
  bagAmounts?: Record<string, number>;           // the Thief's live view of each bag
  highlight?: string;                            // a bag the Thief is at / aiming for
  onPressSpot?: (spot: CotSpot) => void;         // Thief: tap a bag, or your seat to go home
};

type Pt = { x: number; y: number };

export const roomGeometry = (gs: CotGameState, size: number) => {
  const c = size / 2;
  const n = gs.seats.length;
  const seatR = size * 0.4;
  const bagR = size * 0.24;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const seat = (id: string): Pt => {
    const a = ang(gs.seats.indexOf(id));
    return { x: c + seatR * Math.cos(a), y: c + seatR * Math.sin(a) };
  };
  const bag = (id: string): Pt => {
    const a = ang(gs.seats.indexOf(id));
    return { x: c + bagR * Math.cos(a), y: c + bagR * Math.sin(a) };
  };
  const thief = thiefOf(gs);
  // Home = just inside the Thief's own seat.
  const spot = (s: CotSpot): Pt => {
    if (s !== "home") return bag(s);
    const a = ang(gs.seats.indexOf(thief ?? gs.seats[0]));
    const r = seatR - size * 0.07;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  };
  // A gentle curve between two spots, bowed towards the middle of the room.
  const curve = (a: CotSpot, b: CotSpot) => {
    const A = spot(a);
    const B = spot(b);
    const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const C = { x: M.x + (c - M.x) * 0.35, y: M.y + (c - M.y) * 0.35 };
    const at = (t: number): Pt => {
      const u = 1 - t;
      return { x: u * u * A.x + 2 * u * t * C.x + t * t * B.x, y: u * u * A.y + 2 * u * t * C.y + t * t * B.y };
    };
    const dir = (t: number): number => {
      const u = 1 - t;
      const dx = 2 * u * (C.x - A.x) + 2 * t * (B.x - C.x);
      const dy = 2 * u * (C.y - A.y) + 2 * t * (B.y - C.y);
      return Math.atan2(dy, dx);
    };
    return { at, dir };
  };
  return { c, seat, bag, spot, curve, seatR, bagR };
};

const Glove = ({ x, y, color, scale }: { x: number; y: number; color: string; scale: number }) => (
  <G transform={`translate(${x - 23 * scale} ${y - 34 * scale}) scale(${scale})`}>
    <G stroke={CT.ink} strokeWidth={1.5}>
      <Rect x={9} y={5} width={7} height={22} rx={3.5} fill={color} />
      <Rect x={17} y={1} width={7} height={25} rx={3.5} fill={color} />
      <Rect x={25} y={2} width={7} height={24} rx={3.5} fill={color} />
      <Rect x={33} y={7} width={6.5} height={20} rx={3.25} fill={color} />
      <Rect x={1} y={21} width={15} height={7} rx={3.5} fill={color} transform="rotate(-35 8 25)" />
      <Rect x={8} y={18} width={32} height={24} rx={10} fill={color} />
      <Rect x={11} y={39} width={26} height={11} rx={3} fill={color} opacity={0.75} />
    </G>
  </G>
);

export default function Room({ gs, group, playerId, size, look, now, balances, deltas, bagAmounts, highlight, onPressSpot }: Props) {
  const g = roomGeometry(gs, size);
  const thief = thiefOf(gs);
  const thiefColor = thief ? seatColor(gs.seats, thief) : CT.gold;
  const dark = look === "dark";
  const flash = look === "flash";
  const lit = look === "lit";
  const nv = look === "thief";
  const s = size / 390; // drawn for a 390-wide room
  const nameOf = (id: string) => (id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "?");
  const textCol = lit ? CT.litText : nv ? CT.nvText : CT.text;
  const mutedCol = lit ? CT.litMuted : nv ? CT.nvMuted : CT.textMuted;

  // Who sees the glove and prints, and in what colour.
  const showThief = nv || look === "witness" || lit || flash;
  const gloveColor = flash ? "#1E1C33" : thiefColor;
  const view = thief && showThief ? thiefAt(gs, now) : null;
  let glovePt: Pt | null = null;
  if (view) {
    if (view.move) glovePt = g.curve(view.move.from, view.move.to).at(view.move.p);
    else if (view.work) glovePt = g.bag(view.work.bag);
    else if (view.spot !== "home") glovePt = g.spot(view.spot);
  }
  const prints = thief && showThief && !flash ? printsAt(gs, now) : [];

  const rug = lit ? CT.litRug : nv ? CT.nvRug : CT.darkRug;
  const rugLine = lit ? CT.litRugLine : nv ? CT.nvLine : CT.darkLine;
  const fade = dark ? 0.09 : flash ? 0.6 : 1;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G opacity={fade}>
          <Circle cx={g.c} cy={g.c} r={size * 0.29} fill={rug} stroke={rugLine} strokeWidth={2} strokeDasharray="6 8" />
          {gs.seats.map((id) => {
            const b = g.bag(id);
            const col = seatColor(gs.seats, id);
            const on = highlight === id;
            return (
              <G key={`bag-${id}`}>
                {on && <Circle cx={b.x} cy={b.y} r={29 * s} fill="none" stroke={CT.gold} strokeWidth={2} strokeDasharray="4 5" />}
                <G transform={`translate(${b.x} ${b.y}) scale(${s})`}>
                  <Path d="M-9 -8 Q0 -22 9 -8" fill="none" stroke={CT.bagHandle} strokeWidth={3} strokeLinecap="round" />
                  <Rect x={-16} y={-9} width={32} height={22} rx={7} fill={CT.bag} />
                  <Path d="M-16 -1 H16" stroke={CT.bagLine} strokeWidth={2} />
                  <Circle cx={0} cy={-1} r={3} fill={CT.gold} />
                  <Circle cx={12} cy={9} r={4} fill={col} stroke={CT.ink} strokeWidth={1.2} />
                </G>
                {nv && bagAmounts && id !== thief && (
                  <SvgText x={b.x} y={b.y + 28 * s} fontSize={11 * s} fontWeight="700" fill={CT.nvMuted} textAnchor="middle">
                    {rupees(bagAmounts[id] ?? 0)}
                  </SvgText>
                )}
              </G>
            );
          })}
          {gs.seats.map((id) => {
            const p = g.seat(id);
            const col = seatColor(gs.seats, id);
            const me = id === playerId;
            const below = p.y > g.c + 10;
            const ny = below ? p.y + 34 * s : p.y - 30 * s;
            const d = deltas?.[id] ?? 0;
            return (
              <G key={`seat-${id}`}>
                {me && <Circle cx={p.x} cy={p.y} r={27 * s} fill="none" stroke={textCol} strokeWidth={1.5} strokeDasharray="3 4" />}
                <Circle cx={p.x} cy={p.y} r={21 * s} fill={col} />
                <SvgText x={p.x} y={p.y + 6 * s} fontSize={17 * s} fontWeight="800" fill={CT.ink} textAnchor="middle">
                  {(group.players.find((x) => x.id === id)?.name ?? "?").slice(0, 1).toUpperCase()}
                </SvgText>
                <SvgText x={p.x} y={ny} fontSize={12.5 * s} fontWeight={me ? "800" : "600"} fill={textCol} textAnchor="middle">
                  {nameOf(id)}
                </SvgText>
                {balances && (
                  <SvgText
                    x={p.x}
                    y={ny + (below ? 15 : -15) * s}
                    fontSize={11.5 * s}
                    fontWeight="800"
                    fill={d < 0 ? (lit ? CT.litBad : CT.bad) : d > 0 ? (lit ? CT.litGood : CT.good) : mutedCol}
                    textAnchor="middle"
                  >
                    {rupees(balances[id] ?? 0)}
                  </SvgText>
                )}
              </G>
            );
          })}
        </G>
        {prints.map((pr, k) => {
          const cv = g.curve(pr.from, pr.to);
          const pt = cv.at(pr.p);
          const a = cv.dir(pr.p);
          const side = pr.i % 2 ? 4 : -4;
          const x = pt.x - Math.sin(a) * side * s;
          const y = pt.y + Math.cos(a) * side * s;
          const op = Math.max(0, 1 - pr.age / 3000) * 0.95;
          return (
            <G key={`pr-${k}`} transform={`translate(${x} ${y}) rotate(${(a * 180) / Math.PI + 90}) scale(${s})`} opacity={op}>
              <Ellipse cx={0} cy={-3} rx={4.2} ry={5.5} fill={thiefColor} />
              <Ellipse cx={0} cy={5.6} rx={3.2} ry={3} fill={thiefColor} />
            </G>
          );
        })}
        {glovePt && <Glove x={glovePt.x} y={glovePt.y} color={gloveColor} scale={s} />}
      </Svg>
      {onPressSpot && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {gs.seats
            .filter((id) => id !== thief)
            .map((id) => {
              const b = g.bag(id);
              return (
                <Pressable
                  key={`tap-${id}`}
                  accessibilityLabel={`${nameOf(id)}'s bag`}
                  onPress={() => onPressSpot(id)}
                  style={[styles.tap, { left: b.x - 28 * s, top: b.y - 28 * s, width: 56 * s, height: 56 * s }]}
                />
              );
            })}
          {thief && (
            <Pressable
              accessibilityLabel="Your seat"
              onPress={() => onPressSpot("home")}
              style={[
                styles.tap,
                { left: g.seat(thief).x - 30 * s, top: g.seat(thief).y - 30 * s, width: 60 * s, height: 60 * s },
              ]}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tap: { position: "absolute", borderRadius: 999 },
});
