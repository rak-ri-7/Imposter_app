// src/games/quiz-board/screens/QuizQuestionScreen.tsx
// One screen for the whole life of a question so the card never jumps:
// question → locking → (judging) → result.
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
} from "react-native";
import { QUIZ_CATEGORIES, formatRupees } from "../../../shared/quiz";
import type { Group } from "../../../shared/types";
import { getServerNow } from "../../../shared/firebase/time";
import { playSound } from "../../../shared/sounds/soundManager";
import type { QuizBoardCtx } from "../logic/useQuizBoard";
import {
  buzzIn,
  closeQuestion,
  continueToBoard,
  judgeRound,
  pauseQuestion,
  pickOption,
  resumeQuestion,
} from "../logic/game";
import { RetroButton, RoundOutcome, WinnerPicker } from "../components";
import { QB, bevel, digitText, displayText } from "../theme";

type Props = { group: Group; playerId: string; ctx: QuizBoardCtx };

const LETTERS = ["A", "B", "C", "D"];

export default function QuizQuestionScreen({ group, playerId, ctx }: Props) {
  const { gs, phase, isHost, remainingMs, queue, hasBuzzed, myPick, nameOf } = ctx;
  const [judgeOpen, setJudgeOpen] = useState(false);
  const [localBuzz, setLocalBuzz] = useState(false);
  const blink = useRef(new Animated.Value(1)).current;

  const current = gs?.current;
  useEffect(() => setLocalBuzz(false), [current?.questionId]);

  // Flashing "LOCKING ANSWERS" during the silent pause.
  useEffect(() => {
    if (phase !== "locking") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.2, duration: 350, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);

  if (!gs || !current) return <View style={styles.container} />;

  const tile = gs.tiles[current.tileIndex];
  const cat = QUIZ_CATEGORIES[tile.category];
  const paused = phase === "question" && !!gs.isPaused;
  const revealed = phase === "judging" || phase === "result";
  const round = phase === "result" ? ctx.lastRound : undefined;
  const secs = Math.ceil(remainingMs / 1000);
  const pct = Math.max(0, Math.min(1, remainingMs / gs.windowMs));
  const correctIndex = current.options.findIndex((o) => o.correct);

  const onBuzz = async () => {
    if (hasBuzzed || localBuzz || paused) return;
    setLocalBuzz(true);
    playSound("wire-lock-in");
    try {
      await buzzIn(group.id, playerId);
    } catch (e) {
      console.error(e);
      setLocalBuzz(false);
    }
  };

  const onOption = (i: number) => {
    if (myPick !== undefined || paused) return;
    pickOption(group.id, playerId, i).catch(console.error);
  };

  const confirmForceEnd = () =>
    Alert.alert(
      "End this round now?",
      "The answer will be shown on everyone's phone, along with a note that you ended it early.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End round",
          style: "destructive",
          onPress: () => closeQuestion(group.id, getServerNow(), true),
        },
      ],
    );

  const onJudge = (id: string | null) => {
    setJudgeOpen(false);
    const who = id ? nameOf(id) : "Nobody";
    Alert.alert(
      `${who} was right?`,
      id
        ? `${who} wins ${formatRupees(tile.value)}. Everyone else who buzzed loses it.`
        : `Everyone who buzzed loses ${formatRupees(tile.value)}.`,
      [
        { text: "Back", style: "cancel", onPress: () => setJudgeOpen(true) },
        { text: "Confirm", onPress: () => judgeRound(group.id, id) },
      ],
    );
  };

  return (
    <View style={styles.container}>
      {/* top line: category and value */}
      <View style={styles.topLine}>
        <Text numberOfLines={1} style={[displayText(14), styles.flex]}>
          {cat.emoji} {cat.label}
        </Text>
        <Text style={digitText(20)}>{formatRupees(tile.value)}</Text>
      </View>

      {/* timer bar */}
      {phase === "question" && (
        <View style={styles.timerRow}>
          <View style={styles.timerTrack}>
            <View
              style={[
                styles.timerFill,
                { width: `${pct * 100}%`, backgroundColor: secs <= 5 ? QB.red : QB.gold },
              ]}
            />
          </View>
          <Text style={digitText(18, secs <= 5 ? QB.red : QB.white)}>
            {paused ? "II" : `${secs}s`}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* the question card */}
        <View style={styles.card}>
          {paused ? (
            <Text style={[displayText(30, QB.gold), styles.center]}>
              ⏸ Paused{"\n"}
              <Text style={displayText(14, QB.dim)}>question hidden</Text>
            </Text>
          ) : (
            <Text style={[displayText(current.prompt.length > 90 ? 20 : 25), styles.center]}>
              {current.prompt}
            </Text>
          )}
        </View>

        {/* answer reveal — same moment on every phone */}
        {revealed && (
          <View style={styles.answerBox}>
            <Text style={displayText(11, QB.dim)}>ANSWER</Text>
            <Text style={[displayText(26, QB.gold), styles.center]}>{current.answer}</Text>
            {gs.forceEnded && (
              <Text style={styles.warn}>⚠ Host ended this round early</Text>
            )}
          </View>
        )}

        {phase === "locking" && (
          <Animated.Text style={[displayText(20, QB.gold), styles.center, { opacity: blink }]}>
            Locking answers…
          </Animated.Text>
        )}

        {/* OPTIONS MODE */}
        {gs.mode === "options" && !paused && (
          <View style={styles.options}>
            {current.options.map((o, i) => {
              const mine = (round?.picks?.[playerId] ?? myPick) === i;
              const showRight = revealed && i === correctIndex;
              const showWrong = revealed && mine && i !== correctIndex;
              return (
                <TouchableOpacity
                  key={i}
                  disabled={phase !== "question" || myPick !== undefined}
                  onPress={() => onOption(i)}
                  style={[
                    styles.option,
                    mine && styles.optionMine,
                    showRight && styles.optionRight,
                    showWrong && styles.optionWrong,
                    phase === "question" && myPick !== undefined && !mine && styles.dim,
                  ]}
                >
                  <Text style={digitText(18)}>{LETTERS[i]}</Text>
                  <Text style={[displayText(16), styles.flex]}>{o.text}</Text>
                  {round?.picks &&
                    Object.entries(round.picks)
                      .filter(([, p]) => p === i)
                      .map(([id]) => (
                        <Text key={id} style={styles.pickName}>
                          {nameOf(id)}
                        </Text>
                      ))}
                </TouchableOpacity>
              );
            })}
            {phase === "question" && (
              <Text style={styles.note}>
                {myPick !== undefined ? "Locked in. " : ""}
                {ctx.answeredCount}/{ctx.players.length} answered · wrong answers lose{" "}
                {formatRupees(tile.value)}
              </Text>
            )}
          </View>
        )}

        {/* BUZZER MODE */}
        {gs.mode === "buzzer" && phase !== "result" && (
          <View style={styles.buzzArea}>
            {phase === "question" && !paused && (
              <TouchableOpacity
                onPress={onBuzz}
                disabled={hasBuzzed || localBuzz}
                activeOpacity={0.7}
                style={[styles.buzzer, (hasBuzzed || localBuzz) && styles.buzzerDone]}
              >
                <Text style={displayText(hasBuzzed || localBuzz ? 18 : 30)}>
                  {hasBuzzed || localBuzz
                    ? queue.indexOf(playerId) >= 0
                      ? `#${queue.indexOf(playerId) + 1} in line`
                      : "Buzzed!"
                    : "BUZZ"}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={displayText(12, QB.dim)}>
              {queue.length ? "ANSWER IN THIS ORDER" : "NOBODY HAS BUZZED YET"}
            </Text>
            {queue.map((id, i) => (
              <View key={id} style={[styles.queueRow, i === 0 && styles.queueFirst]}>
                <Text style={digitText(18)}>{i + 1}</Text>
                <Text style={[displayText(18), styles.flex]}>
                  {nameOf(id)}
                  {id === playerId ? " (you)" : ""}
                </Text>
              </View>
            ))}

            {phase === "judging" && !isHost && (
              <Text style={[styles.note, styles.center]}>Host is marking the answers…</Text>
            )}
          </View>
        )}

        {/* RESULT */}
        {round && (
          <RoundOutcome round={round} ctx={ctx} playerId={playerId} />
        )}
      </ScrollView>

      {/* host controls */}
      {isHost && (
        <View style={styles.footer}>
          {phase === "question" && (
            <View style={styles.row}>
              <RetroButton
                label={paused ? "▶ Resume" : "⏸ Pause"}
                variant="blue"
                style={styles.flex}
                onPress={() =>
                  paused
                    ? resumeQuestion(group.id, getServerNow())
                    : pauseQuestion(group.id, getServerNow())
                }
              />
              <RetroButton
                label="End round"
                variant="red"
                style={styles.flex}
                onPress={confirmForceEnd}
              />
            </View>
          )}
          {phase === "judging" && (
            <RetroButton label="Mark who was right" onPress={() => setJudgeOpen(true)} />
          )}
          {phase === "result" && (
            <RetroButton label="Back to the board ▶" onPress={() => continueToBoard(group.id)} />
          )}
        </View>
      )}
      {!isHost && phase === "result" && (
        <View style={styles.footer}>
          <Text style={[styles.note, styles.center]}>Waiting for the host…</Text>
        </View>
      )}

      <WinnerPicker
        visible={judgeOpen}
        title="Who was right?"
        candidates={queue}
        nameOf={nameOf}
        onCancel={() => setJudgeOpen(false)}
        onPick={onJudge}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: QB.bg, paddingTop: 48 },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  timerTrack: { flex: 1, height: 10, backgroundColor: QB.tileDark },
  timerFill: { height: 10 },
  scroll: { padding: 16, gap: 14, paddingBottom: 30 },
  card: {
    backgroundColor: QB.tile,
    minHeight: 200,
    justifyContent: "center",
    padding: 18,
    ...bevel,
    borderWidth: 5,
  },
  center: { textAlign: "center" },
  answerBox: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    borderWidth: 3,
    borderColor: QB.gold,
    backgroundColor: QB.frame,
  },
  warn: { color: QB.red, fontSize: 13, fontWeight: "bold", marginTop: 4 },
  options: { gap: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: QB.panel,
    ...bevel,
  },
  optionMine: { borderTopColor: QB.gold, borderLeftColor: QB.gold, borderBottomColor: QB.gold, borderRightColor: QB.gold },
  optionRight: { backgroundColor: "#11603A" },
  optionWrong: { backgroundColor: QB.redDark },
  dim: { opacity: 0.5 },
  pickName: { color: QB.white, fontSize: 11 },
  note: { color: QB.dim, fontSize: 12, textAlign: "center" },
  buzzArea: { gap: 8, alignItems: "stretch" },
  buzzer: {
    alignSelf: "center",
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: QB.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 8,
    borderTopColor: "#FF7A84",
    borderLeftColor: "#FF7A84",
    borderBottomColor: QB.redDark,
    borderRightColor: QB.redDark,
    marginVertical: 10,
  },
  buzzerDone: { backgroundColor: QB.redDark, opacity: 0.8 },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    backgroundColor: QB.panel,
  },
  queueFirst: { borderWidth: 2, borderColor: QB.gold },
  footer: {
    padding: 16,
    paddingBottom: 28,
    borderTopWidth: 2,
    borderTopColor: QB.tileDark,
    gap: 8,
  },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
});
