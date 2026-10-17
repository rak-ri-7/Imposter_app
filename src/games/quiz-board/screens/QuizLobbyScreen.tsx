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
import { QUIZ_CATEGORIES, formatRupees } from "../../../shared/quiz";
import type { QuizCategory } from "../../../shared/quiz";
import type { Group, QuizBoardMode, QuizBoardSize } from "../../../shared/types";
import {
  BOARD_CATEGORIES,
  BOARD_SIZES,
  QB_CLIENT_VERSION,
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
    "🌟 Golden tiles are hidden on the board: the picker bets (up to the top prize) before seeing the question and answers alone, or passes and it plays as a normal tile.",
    "💰 Double Money: the last few tiles are worth twice as much.",
  ],
  buzzer: [
    "Pick a tile. Everyone sees the question. No options.",
    "Know it? Hit BUZZ. You have 30 seconds.",
    "Answer out loud in buzz order. Everyone who buzzes must answer.",
    "The answer shows on every phone at once, then the host marks who was right.",
    "Right: win the rupees. Every other buzzer LOSES them. Think before you buzz!",
    "🌟 Golden tiles are hidden on the board: the picker bets (up to the top prize) before seeing the question and answers alone, or passes and it plays as a normal tile.",
    "💰 Double Money: the last few tiles are worth twice as much.",
  ],
};

export default function QuizLobbyScreen({ group, playerId }: Props) {
  const isHost = group.hostId === playerId;
  const [mode, setMode] = useState<QuizBoardMode>("options");
  const [size, setSize] = useState<QuizBoardSize>("full");
  const show = BOARD_SIZES[size];
  const need = show.categories;
  const [cats, setCats] = useState<QuizCategory[]>(() =>
    randomCategories(BOARD_SIZES.full.categories),
  );
  const [starting, setStarting] = useState(false);

  // Switching show size keeps the picks, trimming or topping up to fit.
  const chooseSize = (next: QuizBoardSize) => {
    setSize(next);
    const want = BOARD_SIZES[next].categories;
    setCats((cur) => {
      if (cur.length >= want) return cur.slice(0, want);
      const extra = randomCategories(BOARD_CATEGORIES.length).filter(
        (c) => !cur.includes(c),
      );
      return [...cur, ...extra.slice(0, want - cur.length)];
    });
  };

  // Tap a picked category to drop it. Tap a new one to add it; if the show
  // is already full, it replaces the pick made longest ago. (The board starts
  // full, so new categories must never be blocked, or only Random works.)
  const toggle = (c: QuizCategory) => {
    setCats((cur) => {
      if (cur.includes(c)) return cur.filter((x) => x !== c);
      const kept = cur.length >= need ? cur.slice(cur.length - need + 1) : cur;
      return [...kept, c];
    });
  };

  // Phones that haven't opened Quiz Board with the current code. One stale
  // phone can break the question timer for everybody.
  const stale = group.players.filter(
    (p) => (group.quizClientVersions?.[p.id] ?? 0) < QB_CLIENT_VERSION,
  );

  const start = async () => {
    if (group.players.length < 2) return Alert.alert("Need at least 2 players!");
    if (cats.length !== need) {
      return Alert.alert(`Pick ${need} categories for the ${show.label}`);
    }
    if (stale.length > 0) {
      return Alert.alert(
        "Some phones need a reload",
        `${stale.map((p) => p.name).join(", ")} ${stale.length === 1 ? "is" : "are"} on an old version of the app, which can make questions end instantly. Ask them to reload (shake → Reload).`,
        [
          { text: "Wait", style: "cancel" },
          { text: "Start anyway", style: "destructive", onPress: () => void doStart() },
        ],
      );
    }
    await doStart();
  };

  const doStart = async () => {
    setStarting(true);
    try {
      await startQuizBoard(group, { mode, categories: cats, size });
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
          {isHost && (
            <Text style={displayText(13, QB.white)}>
              {show.emoji} {show.label} ·{" "}
              {formatRupees(show.rows[0].value)} –{" "}
              {formatRupees(show.rows[show.rows.length - 1].value)} · {need} ×{" "}
              {show.rows.length} tiles
            </Text>
          )}
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

            <Text style={styles.label}>SHOW LENGTH</Text>
            <View style={styles.modeRow}>
              {(["quick", "full"] as QuizBoardSize[]).map((k) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => chooseSize(k)}
                  style={[styles.mode, size === k && styles.modeOn]}
                >
                  <Text style={displayText(18, size === k ? QB.gold : QB.white)}>
                    {BOARD_SIZES[k].emoji} {BOARD_SIZES[k].label}
                  </Text>
                  <Text style={styles.modeDesc}>{BOARD_SIZES[k].blurb}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.catHeader}>
              <Text style={styles.label}>
                CATEGORIES ({cats.length}/{need})
                {cats.length >= need ? " · TAP TO SWAP" : ""}
              </Text>
              <TouchableOpacity onPress={() => setCats(randomCategories(need))}>
                <Text style={displayText(13, QB.gold)}>🎲 Random {need}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.chips}>
              {BOARD_CATEGORIES.map((c) => {
                const on = cats.includes(c);
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => toggle(c)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text
                      style={
                        on
                          ? displayText(12, QB.ink, false) // dark on gold: no shadow
                          : displayText(12, QB.white)
                      }
                    >
                      {on ? "✓ " : ""}
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
          {(isHost ? RULES[mode] : [...RULES.options.slice(0, 1), "The host picks the mode: Options (4 choices) or Buzzer (answer out loud).", "Wrong answers cost money in both modes, so be careful!", RULES.options[5], RULES.options[6]]).map(
            (r, i) => (
              <Text key={i} style={styles.rule}>
                {i + 1}. {r}
              </Text>
            ),
          )}
        </View>

        {stale.length > 0 && (
          <View style={styles.staleBox}>
            <Text style={styles.staleTitle}>⚠️ Old app version</Text>
            <Text style={styles.staleText}>
              {stale.map((p) => p.name).join(", ")}{" "}
              {stale.length === 1 ? "needs" : "need"} to reload the app (shake
              the phone → Reload). Old versions can make questions end the
              moment they appear.
            </Text>
          </View>
        )}

        <Text style={styles.label}>CONTESTANTS ({group.players.length})</Text>
        <View style={styles.chips}>
          {group.players.map((p) => (
            <View key={p.id} style={styles.player}>
              <Text style={displayText(13)}>
                {p.name}
                {p.id === playerId ? " (you)" : ""}
                {p.id === group.hostId ? " ★" : ""}
                {stale.some((x) => x.id === p.id) ? " ⚠️" : " ✓"}
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
            disabled={starting || cats.length !== need}
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
  rules: { backgroundColor: QB.panel, padding: 12, gap: 6 },
  rule: { color: QB.white, fontSize: 14, lineHeight: 20 },
  player: { backgroundColor: QB.panel, paddingHorizontal: 10, paddingVertical: 6 },
  staleBox: {
    backgroundColor: "#3A1010",
    borderWidth: 2,
    borderColor: "#FF6B3D",
    padding: 12,
    marginTop: 8,
    gap: 4,
  },
  staleTitle: { color: "#FFB199", fontSize: 14, fontWeight: "800" },
  staleText: { color: QB.white, fontSize: 13, lineHeight: 19 },
  footer: { padding: 16, paddingBottom: 28, borderTopWidth: 2, borderTopColor: QB.tileDark },
  center: { textAlign: "center" },
});
