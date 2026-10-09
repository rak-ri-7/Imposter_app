import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import { submitQuizAnswer } from "../logic/Fastestfinger";
import {
  advanceTournamentStage,
  resolveTournamentQuestion,
  closeGhostTournament,
  voteTournamentMode,
  tournamentChallengers,
  TournamentMode,
  QUESTION_HARD_CAP_MS,
} from "../logic/ghostTournament";
import { FAILSAFE_GRACE_MS, FAILSAFE_RETRY_MS } from "../logic/game";
import {
  playSound,
  explosionSoundForRound,
  pickDefuseSound,
} from "../../../shared/sounds/soundManager";
import BombHotPotatoScreen from "./BombHotPotatoScreen";
import { hpDudLine } from "../logic/hotPotatoDuel";

type Props = { group: Group; playerId: string };

const MODE_INFO: Record<
  TournamentMode,
  { emoji: string; name: string; line: string }
> = {
  quiz: {
    emoji: "⚡",
    name: "Quiz Showdown",
    line: "Everyone answers at once. Worst answer is out each round.",
  },
  "hot-potato": {
    emoji: "🔥",
    name: "Hot Potato",
    line: "Pass it round in a set order. Holding it when it blows? You're out.",
  },
};

export default function BombGhostTournamentScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const tournament = gameState.ghostTournament;
  const activeQuiz = gameState.activeQuiz;
  const isHost = group.hostId === playerId;
  const stage = tournament?.stage;
  const nextStageAt = tournament?.nextStageAt;

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const [voting, setVoting] = useState(false);
  const [now, setNow] = useState(Date.now());

  const getName = (id: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Unknown";
  const inPool = !!tournament?.poolIds.includes(playerId);
  const wasEliminated = !!tournament?.eliminatedIds.includes(playerId);

  const challengers = tournament ? tournamentChallengers(tournament) : [];
  const votes = (tournament?.modeVotes ?? {}) as Record<string, TournamentMode>;
  const allVoted = challengers.every((id) => !!votes[id]);
  const amChallenger = challengers.includes(playerId);
  const myVote = votes[playerId];

  useEffect(() => {
    playSound("tbc-start");
  }, []);

  // Intro countdown display (vote window).
  useEffect(() => {
    if (stage !== "intro") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [stage]);

  // ── Stage watchdog — every phone. Moves intro / between on to the next
  // question or fuse. The host acts on time; everyone else steps in
  // FAILSAFE_GRACE_MS late if the host is gone. The server re-checks
  // everything, so early or repeated calls do nothing. ─────────────────
  useEffect(() => {
    if (stage !== "intro" && stage !== "between") return;
    const graceMs = isHost ? 0 : FAILSAFE_GRACE_MS;
    let lastAttempt = 0;
    const check = () => {
      const t = Date.now();
      let due: number | undefined;
      if (stage === "intro") {
        const minAt = tournament?.introMinUntil ?? 0;
        due = allVoted ? minAt : nextStageAt;
      } else {
        due = nextStageAt;
      }
      if (!due || t < due + graceMs || t - lastAttempt < FAILSAFE_RETRY_MS)
        return;
      lastAttempt = t;
      advanceTournamentStage(group.id);
    };
    check();
    const interval = setInterval(check, 250);
    return () => clearInterval(interval);
  }, [
    isHost,
    stage,
    nextStageAt,
    allVoted,
    tournament?.introMinUntil,
    group.id,
  ]);

  // ── Quiz mode: resolve the question once every contender has answered,
  // or the window since the FIRST answer has run out. Nothing happens while
  // nobody has answered — same "let them think" rule as the other quiz
  // modes. Host on time, everyone else as a backup. ────────────────────
  useEffect(() => {
    if (stage !== "question" || !activeQuiz || !tournament) return;
    const poolIds = tournament.poolIds;
    const startedAt = activeQuiz.startedAt;
    const graceMs = isHost ? 0 : FAILSAFE_GRACE_MS;
    let lastAttempt = 0;

    const check = () => {
      const stamps = poolIds
        .map((id) => activeQuiz.answers[id]?.timestamp)
        .filter((ts): ts is number => ts !== undefined);
      // Normally the clock only starts at the first answer ("let them
      // think"). If nobody answers at all, the hard cap resolves it anyway.
      const everyoneIn = stamps.length === poolIds.length;
      const due =
        stamps.length === 0
          ? startedAt + QUESTION_HARD_CAP_MS
          : everyoneIn
            ? Math.max(...stamps)
            : Math.min(...stamps) + activeQuiz.durationMs;
      const t = Date.now();
      if (t < due + graceMs || t - lastAttempt < FAILSAFE_RETRY_MS) return;
      lastAttempt = t;
      resolveTournamentQuestion(group.id, startedAt);
    };

    check();
    const interval = setInterval(check, 250);
    return () => clearInterval(interval);
  }, [isHost, stage, activeQuiz, tournament?.poolIds, group.id]);

  // Quiz countdown display — blank until someone has answered.
  useEffect(() => {
    if (stage !== "question" || !activeQuiz) {
      setTimeLeft(null);
      return;
    }
    const tick = () => {
      const stamps = Object.values(activeQuiz.answers).map((a) => a.timestamp);
      if (stamps.length === 0) {
        setTimeLeft(null);
        return;
      }
      const elapsed = (Date.now() - Math.min(...stamps)) / 1000;
      setTimeLeft(Math.max(0, activeQuiz.durationMs / 1000 - elapsed));
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [stage, activeQuiz?.answers, activeQuiz?.durationMs]);

  useEffect(() => {
    setMyAnswer(null);
  }, [activeQuiz?.startedAt]);

  // Someone was knocked out — boom and buzz on every phone, once per
  // knockout. Knockouts from before this screen mounted don't replay.
  const eliminatedCount = tournament?.eliminatedIds.length ?? 0;
  const seenEliminatedRef = useRef(eliminatedCount);
  useEffect(() => {
    if (eliminatedCount > seenEliminatedRef.current) {
      Vibration.vibrate(500);
      playSound(explosionSoundForRound(gameState.roundNumber));
    }
    seenEliminatedRef.current = eliminatedCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eliminatedCount]);

  // A dud — the relief sound, once.
  const dudId =
    tournament?.stage === "between" ? tournament.lastDudId : undefined;
  useEffect(() => {
    if (!dudId) return;
    Vibration.vibrate(150);
    playSound(pickDefuseSound());
  }, [dudId, tournament?.nextStageAt]);

  const handleTap = async (index: number) => {
    if (myAnswer !== null || !inPool) return;
    setMyAnswer(index);
    await submitQuizAnswer(group, playerId, index);
  };

  const handleVote = async (mode: TournamentMode) => {
    if (!amChallenger || voting) return;
    setVoting(true);
    try {
      await voteTournamentMode(group.id, playerId, mode);
    } finally {
      setVoting(false);
    }
  };

  if (!tournament) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.waitingText}>Wrapping up the challenge...</Text>
      </View>
    );
  }

  const modeName = tournament.mode
    ? MODE_INFO[tournament.mode as TournamentMode].name
    : "";

  const renderPool = () => (
    <View style={styles.poolRow}>
      {tournament.poolIds.map((id) => {
        const answered = stage === "question" && !!activeQuiz?.answers[id];
        return (
          <View key={id} style={[styles.chip, answered && styles.chipDone]}>
            <Text style={[styles.chipText, answered && styles.chipTextDone]}>
              {getName(id)}
              {id === tournament.wireCutterId ? " 🛡️" : " 👻"}
            </Text>
          </View>
        );
      })}
    </View>
  );

  // ── Hot potato fuse — the shared hot potato screen does the rest ────
  if (tournament.stage === "fuse") {
    return (
      <BombHotPotatoScreen
        group={group}
        playerId={playerId}
        title="👻 GHOST CHALLENGE"
        subtitle={`${tournament.poolIds.length} still standing · last one standing wins the life`}
        watchText={
          wasEliminated
            ? "💥 You're out of the challenge — watching the rest sweat."
            : undefined
        }
      />
    );
  }

  // ── Intro + mode vote ─────────────────────────────────────────────
  if (tournament.stage === "intro") {
    const secondsLeft = Math.max(
      0,
      Math.ceil(((tournament.nextStageAt ?? now) - now) / 1000),
    );
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.title}>👻 GHOST CHALLENGE</Text>
        <Text style={styles.subtitle}>
          The shadows demand a duel for a life.
        </Text>
        <View style={styles.card}>
          {tournament.contenderIds.map((id) => (
            <View key={id} style={styles.contenderRow}>
              <Text style={styles.contenderName}>
                {getName(id)}
                {id === playerId ? " (you)" : ""}
              </Text>
              <Text
                style={
                  id === tournament.wireCutterId
                    ? styles.tagDefender
                    : styles.tagChallenger
                }
              >
                {id === tournament.wireCutterId
                  ? "🛡️ Defending"
                  : votes[id]
                    ? `👻 ${MODE_INFO[votes[id]].emoji} voted`
                    : "👻 Choosing..."}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.voteLabel}>
          {amChallenger
            ? challengers.length > 1
              ? "PICK THE GAME — MAJORITY WINS"
              : "PICK THE GAME"
            : "THE CHALLENGERS ARE PICKING THE GAME"}
        </Text>
        <View style={styles.voteRow}>
          {(Object.keys(MODE_INFO) as TournamentMode[]).map((mode) => {
            const info = MODE_INFO[mode];
            const count = Object.values(votes).filter((v) => v === mode).length;
            const mine = myVote === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.voteCard, mine && styles.voteCardMine]}
                onPress={() => handleVote(mode)}
                disabled={!amChallenger || voting}
                activeOpacity={amChallenger ? 0.7 : 1}
              >
                <Text style={styles.voteEmoji}>{info.emoji}</Text>
                <Text style={styles.voteName}>{info.name}</Text>
                <Text style={styles.voteLine}>{info.line}</Text>
                {count > 0 && (
                  <Text style={styles.voteCount}>
                    {count} vote{count === 1 ? "" : "s"}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.rules}>
          {allVoted
            ? "Votes are in — starting..."
            : `Starting in ${secondsLeft}s · a tie is a coin flip`}
        </Text>
        <Text style={styles.rules}>Last one standing wins the life.</Text>
        {tournament.debug && (
          <Text style={styles.debugTag}>🧪 Test run — nothing will change</Text>
        )}
      </View>
    );
  }

  // ── Between rounds ────────────────────────────────────────────────
  if (tournament.stage === "between") {
    const dudId = tournament.lastDudId;
    if (dudId) {
      const dud = hpDudLine(tournament.lastDudLine);
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.bigEmoji}>{dud.emoji}</Text>
          <Text style={styles.title}>IT'S A DUD!</Text>
          <Text style={styles.dudTitle}>{dud.title}</Text>
          <Text style={styles.dudLine}>{dud.line}</Text>
          <Text style={styles.subtitle}>
            {dudId === playerId
              ? "It fizzled in your hands. You live!"
              : `It fizzled on ${getName(dudId)}. Nobody's out.`}
            {"\n"}New fuse, new order…
          </Text>
          {renderPool()}
        </View>
      );
    }
    const outId = tournament.lastEliminatedId;
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.bigEmoji}>💥</Text>
        <Text style={styles.title}>
          {outId
            ? outId === playerId
              ? "You're out!"
              : `${getName(outId)} is out!`
            : "Someone is out!"}
        </Text>
        <Text style={styles.subtitle}>
          {tournament.poolIds.length} still standing
          {tournament.mode === "hot-potato" ? " — new fuse, new order…" : ""}
        </Text>
        {renderPool()}
      </View>
    );
  }

  // ── Result ────────────────────────────────────────────────────────
  if (tournament.stage === "result") {
    const winnerId = tournament.winnerId;
    const winnerName = winnerId ? getName(winnerId) : "Nobody";
    const cutterName = getName(tournament.wireCutterId);
    const winnerIsCutter = winnerId === tournament.wireCutterId;

    return (
      <View style={styles.centerContainer}>
        <Text style={styles.bigEmoji}>{winnerIsCutter ? "🛡️" : "👻"}</Text>
        <Text style={styles.title}>
          {winnerIsCutter
            ? `${winnerName} defended!`
            : `${winnerName} wins their life back!`}
        </Text>
        <Text style={styles.subtitle}>
          {tournament.debug
            ? "🧪 Test run — nothing was changed."
            : winnerIsCutter
              ? "The explosion is undone — they get their life back."
              : `They rejoin the game. ${cutterName} stays down the life they lost.`}
        </Text>
        {winnerId === playerId && !tournament.debug && (
          <Text style={styles.youWon}>That's you! 🎉</Text>
        )}

        {isHost ? (
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => closeGhostTournament(group.id)}
          >
            <Text style={styles.continueBtnText}>Continue to Replay →</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.waitingText}>
            Waiting for host to continue...
          </Text>
        )}
      </View>
    );
  }

  // ── Quiz question ─────────────────────────────────────────────────
  if (!activeQuiz) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.waitingText}>Next question loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>👻 GHOST CHALLENGE</Text>
      {!!modeName && <Text style={styles.modeTag}>{modeName}</Text>}
      {renderPool()}

      {inPool ? (
        <>
          <View style={styles.timerRow}>
            {timeLeft === null ? (
              <Text style={styles.waitingFirst}>
                ⏳ Waiting for first answer...
              </Text>
            ) : (
              <Text
                style={[styles.timerText, timeLeft <= 2 && styles.timerUrgent]}
              >
                {timeLeft.toFixed(1)}s
              </Text>
            )}
          </View>

          <Text style={styles.prompt}>{activeQuiz.question.prompt}</Text>

          <View style={styles.optionsGrid}>
            {activeQuiz.question.options.map((opt, index) => {
              const selected = myAnswer === index;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.optionBtn,
                    selected && styles.optionBtnSelected,
                  ]}
                  onPress={() => handleTap(index)}
                  disabled={myAnswer !== null}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selected && styles.optionTextSelected,
                    ]}
                  >
                    {opt.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {myAnswer !== null && (
            <Text style={styles.lockedInText}>
              ✓ Locked in — waiting on the others...
            </Text>
          )}
        </>
      ) : (
        <View style={styles.watchBox}>
          <Text style={styles.watchEmoji}>{wasEliminated ? "💥" : "👀"}</Text>
          <Text style={styles.watchText}>
            {wasEliminated
              ? "You're out of the challenge."
              : "Watching the ghost challenge..."}
          </Text>
          <Text style={styles.watchSub}>
            {tournament.poolIds.length} still fighting
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    padding: 20,
    paddingTop: 20,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#FFD700",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  modeTag: {
    color: "#888",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 12,
  },
  bigEmoji: { fontSize: 72, marginBottom: 12 },
  dudTitle: {
    color: "#AAAAAA",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
  },
  dudLine: {
    color: "#ddd",
    fontSize: 15,
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "#FFD700",
    marginBottom: 18,
    gap: 10,
  },
  contenderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  contenderName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  tagDefender: { color: "#4FC3F7", fontSize: 13, fontWeight: "700" },
  tagChallenger: { color: "#B388FF", fontSize: 13, fontWeight: "700" },

  voteLabel: {
    color: "#aaa",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1.5,
    marginBottom: 10,
    textAlign: "center",
  },
  voteRow: { flexDirection: "row", gap: 10, width: "100%", marginBottom: 14 },
  voteCard: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#333",
    padding: 12,
    alignItems: "center",
  },
  voteCardMine: { borderColor: "#B388FF", backgroundColor: "#1A1230" },
  voteEmoji: { fontSize: 28, marginBottom: 4 },
  voteName: { color: "#fff", fontSize: 14, fontWeight: "800", marginBottom: 4 },
  voteLine: {
    color: "#888",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
  },
  voteCount: {
    color: "#B388FF",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 6,
  },

  rules: {
    color: "#666",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  debugTag: { color: "#FF4500", fontSize: 12, marginTop: 16 },
  poolRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#333",
  },
  chipDone: { borderColor: "#4CAF50", backgroundColor: "#0A1E0A" },
  chipText: { color: "#888", fontSize: 12 },
  chipTextDone: { color: "#4CAF50", fontWeight: "600" },
  timerRow: { alignItems: "center", marginBottom: 16, minHeight: 34 },
  waitingFirst: {
    color: "#FFD700",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  timerText: { color: "#fff", fontSize: 28, fontWeight: "bold" },
  timerUrgent: { color: "#E63946" },
  prompt: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 24,
    lineHeight: 28,
  },
  optionsGrid: { gap: 12, marginBottom: 16 },
  optionBtn: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#333",
  },
  optionBtnSelected: { borderColor: "#FFD700", backgroundColor: "#2A2200" },
  optionText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  optionTextSelected: { color: "#FFD700" },
  lockedInText: {
    color: "#4CAF50",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  watchBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  watchEmoji: { fontSize: 64, marginBottom: 12 },
  watchText: {
    color: "#aaa",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 6,
  },
  watchSub: { color: "#555", fontSize: 13 },
  youWon: {
    color: "#4CAF50",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
  },
  continueBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 12,
  },
  continueBtnText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  waitingText: { color: "#888", fontSize: 14, textAlign: "center" },
});
