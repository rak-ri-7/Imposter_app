// src/games/quiz-board/screens/QuizLobbyScreen.tsx
import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { QUIZ_CATEGORIES } from "../../../shared/quiz";
import type { QuizCategory } from "../../../shared/quiz";
import type { Group, QuizBoardMode } from "../../../shared/types";
import {
  BOARD_CATEGORIES,
  MAX_CATEGORIES,
  MIN_CATEGORIES,
  randomCategories,
} from "../logic/board";
import { startQuizBoard } from "../logic/game";
import { RetroButton } from "../components";
import { QB, bevel, displayText } from "../theme";

type Props = { group: Group; playerId: string };

const RULES: Record<QuizBoardMode, string[]> = {
  options: [
    "Pick a tile. Everyone sees the question and 4 options.",
    "Tap your answer within 30 seconds. One tap, no changes.",
    "Fastest correct answer wins the tile's rupees.",
    "Every wrong answer LOSES the tile's rupees. Not sure? Don't answer.",
    "Whoever wins picks the next tile.",
  ],
  buzzer: [
    "Pick a tile. Everyone sees the question. No options.",
    "Know it? Hit BUZZ. You have 30 seconds.",
    "Answer out loud in buzz order. Everyone who buzzes must answer.",
    "The answer shows on every phone at once, then the host marks who was right.",
    "Right: win the rupees. Every other buzzer LOSES them. Think before you buzz!",
  ],
};

export default function QuizLobbyScreen({ group, playerId }: Props) {
  const isHost = group.hostId === playerId;
  const [mode, setMode] = useState<QuizBoardMode>("options");
  const [cats, setCats] = useState<QuizCategory[]>(() => randomCategories());
  const [starting, setStarting] = useState(false);

  const toggle = (c: QuizCategory) => {
    setCats((cur) => {
      if (cur.includes(c)) return cur.filter((x) => x !== c);
      if (cur.length >= MAX_CATEGORIES) return cur;
      return [...cur, c];
    });
  };

  const start = async () => {
    if (group.players.length < 2) return Alert.alert("Need at least 2 players!");
    if (cats.length < MIN_CATEGORIES) {
      return Alert.alert(`Pick at least ${MIN_CATEGORIES} categories`);
    }
    setStarting(true);
    try {
      await startQuizBoard(group, { mode, categories: cats });
    } catch (e) {
      console.error(e);
      Alert.alert("Couldn't build the board", String((e as Error)?.message ?? e));
      setStarting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.marquee}>
          <Text style={displayText(40, QB.gold)}>Quiz Board</Text>
          <Text style={displayText(13, QB.white)}>
            ₹1,000 – ₹6,000 · {cats.length} × 6 tiles
          </Text>
        </View>

        {isHost && (
          <>
            <Text style={styles.label}>GAME MODE</Text>
            <View style={styles.modeRow}>
              {(["options", "buzzer"] as QuizBoardMode[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setMode(m)}
                  style={[styles.mode, mode === m && styles.modeOn]}
                >
                  <Text style={displayText(18, mode === m ? QB.gold : QB.white)}>
                    {m === "options" ? "🅰 Options" : "🔴 Buzzer"}
                  </Text>
                  <Text style={styles.modeDesc}>
                    {m === "options"
                      ? "4 choices, scored by the app"
                      : "Say it out loud, host judges"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.catHeader}>
              <Text style={styles.label}>
                CATEGORIES ({cats.length}/{MAX_CATEGORIES})
              </Text>
              <TouchableOpacity onPress={() => setCats(randomCategories())}>
                <Text style={displayText(13, QB.gold)}>🎲 Random 5</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.chips}>
              {BOARD_CATEGORIES.map((c) => {
                const on = cats.includes(c);
                const full = !on && cats.length >= MAX_CATEGORIES;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => toggle(c)}
                    disabled={full}
                    style={[styles.chip, on && styles.chipOn, full && styles.chipFull]}
                  >
                    <Text style={displayText(12, on ? "#1A1300" : QB.white)}>
                      {QUIZ_CATEGORIES[c].emoji} {QUIZ_CATEGORIES[c].label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.label}>
          HOW TO PLAY{isHost ? "" : " — host is setting up the board"}
        </Text>
        <View style={styles.rules}>
          {(isHost ? RULES[mode] : [...RULES.options.slice(0, 1), "The host picks the mode: Options (4 choices) or Buzzer (answer out loud).", "Wrong answers cost money in both modes, so be careful!"]).map(
            (r, i) => (
              <Text key={i} style={styles.rule}>
                {i + 1}. {r}
              </Text>
            ),
          )}
        </View>

        <Text style={styles.label}>CONTESTANTS ({group.players.length})</Text>
        <View style={styles.chips}>
          {group.players.map((p) => (
            <View key={p.id} style={styles.player}>
              <Text style={displayText(13)}>
                {p.name}
                {p.id === playerId ? " (you)" : ""}
                {p.id === group.hostId ? " ★" : ""}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {isHost ? (
          <RetroButton
            label={starting ? "Building board…" : "Start the show ▶"}
            onPress={start}
            disabled={starting || cats.length < MIN_CATEGORIES}
          />
        ) : (
          <Text style={[displayText(15, QB.dim), styles.center]}>
            Waiting for the host to start…
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: QB.bg, paddingTop: 50 },
  scroll: { padding: 16, gap: 10, paddingBottom: 30 },
  marquee: {
    alignItems: "center",
    paddingVertical: 18,
    backgroundColor: QB.tile,
    marginBottom: 6,
    ...bevel,
    borderWidth: 4,
  },
  label: { color: QB.dim, fontSize: 12, letterSpacing: 2, marginTop: 8 },
  modeRow: { flexDirection: "row", gap: 8 },
  mode: {
    flex: 1,
    padding: 12,
    backgroundColor: QB.panel,
    borderWidth: 3,
    borderColor: QB.tileDark,
    gap: 4,
  },
  modeOn: { borderColor: QB.gold },
  modeDesc: { color: QB.dim, fontSize: 12 },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: QB.tile,
    ...bevel,
    borderWidth: 2,
  },
  chipOn: { backgroundColor: QB.gold, borderColor: QB.goldDark },
  chipFull: { opacity: 0.4 },
  rules: { backgroundColor: QB.panel, padding: 12, gap: 6 },
  rule: { color: QB.white, fontSize: 14, lineHeight: 20 },
  player: { backgroundColor: QB.panel, paddingHorizontal: 10, paddingVertical: 6 },
  footer: { padding: 16, paddingBottom: 28, borderTopWidth: 2, borderTopColor: QB.tileDark },
  center: { textAlign: "center" },
});
