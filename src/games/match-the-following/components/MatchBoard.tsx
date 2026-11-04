// The two columns and the lines between them. Tap a name then an answer
// (or an answer then a name) to draw a line in that player's pen colour.
// Tap the same pair again to rub it out. Joining an answer that already has
// a line moves the line. Read-only when `onChange` is missing; `marks`
// colours each line right (green) or wrong (red) for the reveal.
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { MF } from "../theme";

export type BoardName = { id: string; label: string; color: string };
export type BoardAnswer = { id: string; text: string; empty?: boolean };

type Props = {
  names: BoardName[];
  answers: BoardAnswer[];
  lines: Record<string, string>;
  onChange?: (lines: Record<string, string>) => void;
  marks?: Record<string, boolean>;
};

const NAME_W = 112;
const GAP = 64;

type Box = { y: number; h: number };

export default function MatchBoard({ names, answers, lines, onChange, marks }: Props) {
  const [selName, setSelName] = useState<string | null>(null);
  const [selAns, setSelAns] = useState<string | null>(null);
  const [nameBox, setNameBox] = useState<Record<string, Box>>({});
  const [ansBox, setAnsBox] = useState<Record<string, Box>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const editable = !!onChange;

  const connect = (n: string, a: string) => {
    if (!onChange) return;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(lines)) if (v !== a && k !== n) next[k] = v;
    if (lines[n] !== a) next[n] = a; // same pair again = rub it out
    onChange(next);
    setSelName(null);
    setSelAns(null);
  };
  const tapName = (n: string) => {
    if (!editable) return;
    if (selAns) connect(n, selAns);
    else setSelName(selName === n ? null : n);
  };
  const tapAns = (a: string) => {
    if (!editable) return;
    if (selName) connect(selName, a);
    else setSelAns(selAns === a ? null : a);
  };
  const keep = (set: typeof setNameBox, id: string) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    set((m) => (m[id]?.y === y && m[id]?.h === height ? m : { ...m, [id]: { y, h: height } }));
  };
  const colorOf = (id: string) => names.find((n) => n.id === id)?.color ?? MF.ink;

  return (
    <View style={styles.wrap} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <View style={styles.row}>
        <View style={{ width: NAME_W, gap: 10 }}>
          {names.map((n) => {
            const on = selName === n.id;
            const mark = marks?.[n.id];
            return (
              <Pressable
                key={n.id}
                onLayout={keep(setNameBox, n.id)}
                onPress={() => tapName(n.id)}
                accessibilityLabel={`${n.label}${lines[n.id] ? ", joined" : ""}`}
                style={[styles.name, { borderColor: n.color }, on && { backgroundColor: n.color }]}
              >
                <Text style={[styles.nameText, { color: on ? "#fff" : n.color }]} numberOfLines={2}>
                  {n.label}
                </Text>
                {mark !== undefined && <Text style={[styles.mark, { color: mark ? MF.right : MF.wrong }]}>{mark ? "✓" : "✗"}</Text>}
              </Pressable>
            );
          })}
        </View>
        <View style={{ width: GAP }} />
        <View style={{ flex: 1, gap: 10 }}>
          {answers.map((a) => {
            const on = selAns === a.id;
            const joined = Object.entries(lines).find(([, v]) => v === a.id)?.[0];
            return (
              <Pressable
                key={a.id}
                onLayout={keep(setAnsBox, a.id)}
                onPress={() => tapAns(a.id)}
                style={[styles.answer, joined && { borderColor: colorOf(joined) }, on && styles.answerOn]}
              >
                <Text style={[styles.answerText, a.empty && styles.answerEmpty]}>{a.empty ? "…(no answer)" : a.text}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {size.w > 0 && (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          {Object.entries(lines).map(([n, a]) => {
            const nb = nameBox[n];
            const ab = ansBox[a];
            if (!nb || !ab) return null;
            const x1 = NAME_W;
            const y1 = nb.y + nb.h / 2;
            const x2 = NAME_W + GAP;
            const y2 = ab.y + ab.h / 2;
            const mark = marks?.[n];
            const color = mark === undefined ? colorOf(n) : mark ? MF.right : MF.wrong;
            return (
              <Path
                key={n}
                d={`M${x1} ${y1} C${x1 + GAP * 0.6} ${y1} ${x2 - GAP * 0.6} ${y2} ${x2} ${y2}`}
                stroke={color}
                strokeWidth={3}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={mark === false ? "6 5" : undefined}
              />
            );
          })}
          {Object.entries(lines).map(([n, a]) => {
            const nb = nameBox[n];
            const ab = ansBox[a];
            if (!nb || !ab) return null;
            const color = marks?.[n] === undefined ? colorOf(n) : marks[n] ? MF.right : MF.wrong;
            return [
              <Circle key={`${n}-s`} cx={NAME_W} cy={nb.y + nb.h / 2} r={4.5} fill={color} />,
              <Circle key={`${n}-e`} cx={NAME_W + GAP} cy={ab.y + ab.h / 2} r={4.5} fill={color} />,
            ];
          })}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  row: { flexDirection: "row", alignItems: "flex-start" },
  name: {
    minHeight: 52,
    borderWidth: 2,
    borderRadius: 14,
    backgroundColor: MF.card,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  nameText: { fontSize: 15, fontWeight: "900", flexShrink: 1 },
  mark: { fontSize: 16, fontWeight: "900" },
  answer: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: MF.cardLine,
    borderRadius: 14,
    backgroundColor: MF.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
  },
  answerOn: { borderColor: MF.ink, backgroundColor: "#EEF2FF" },
  answerText: { color: MF.pencil, fontSize: 15, fontWeight: "600", lineHeight: 20 },
  answerEmpty: { color: MF.faint, fontStyle: "italic" },
});
