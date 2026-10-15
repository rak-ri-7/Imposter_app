import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Vibration,
  Alert,
} from "react-native";
import { Group, PassGameState } from "../../../../shared/types";
import {
  answerPassQuestion,
  choosePassTarget,
  votePassCallout,
  CalloutChoice,
  passAlive,
  totalPassesLeft,
  calloutVoters,
  calloutVotesNeeded,
  sideById,
  sideOf,
  CALLOUT_MIN_VOTERS,
  calloutPenalty,
  CURRENCY,
  EARN_HAZARD,
  walletOf,
  itemsOf,
  applyPassItem,
  skipStuckHolder,
  isSideGone,
  PassItem,
  STORE,
  glovesLeft,
} from "../../logic/pass/passGame";
import { pickPassCategory } from "../../logic/pass/passGame";
import { QUIZ_CATEGORIES, QuizCategory } from "../../data/quizQuestions";
import PassStoreSheet from "./PassStoreSheet";
import PassReceiptsSheet from "./PassReceiptsSheet";
import PassHauntPanel from "./PassHauntPanel";
import PassPerkNews from "./PassPerkNews";
import { LUCKY, ticketsAllowed } from "../../logic/pass/passPerks";
import PassLuckySheet from "./PassLuckySheet";
import { playSound } from "../../../../shared/sounds/soundManager";

// Set this to one of your existing "wrong answer" sound keys.
const WRONG_SOUND = "wrong-answer";
const RIGHT_SOUND = "right-answer";

type Props = { group: Group; playerId: string };

export default function PassPlayScreen({ group, playerId }: Props) {
  const gs = group.gameState as PassGameState;
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [luckyOpen, setLuckyOpen] = useState(false);
  const [receiptsFor, setReceiptsFor] = useState<string | null>(null);

  const playerName = (id?: string | null) =>
    group.players.find((p) => p.id === id)?.name ?? "Someone";
  // A side's display name: the player's name in solo, the team name in teams.
  const sideName = (id?: string | null) => sideById(gs, id)?.name ?? "Someone";

  const team = gs.teamMode;
  const mySide = sideOf(gs, playerId);
  const alive = passAlive(gs);
  const isHolder = !!mySide && mySide === gs.holderId;
  const isOut = !mySide || gs.ghosts.includes(mySide);
  const turn = gs.turn;
  const targetId = turn.targetId;
  const holderName = sideName(gs.holderId);
  const holderTotal = totalPassesLeft(gs, gs.holderId);
  // Advanced mode: nobody sees anyone else's pass count — only their own.
  const hidden = !!gs.hiddenPasses;
  const canSeeCount = (sideId: string) => !hidden || sideId === mySide;
  const muffled = !!turn.muffled;
  const you = team ? "your team" : "you";
  const You = team ? "Your team" : "You";

  // ── Short banner when something happens ────────────────────────────
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFlash = (text: string, ms = 1800) => {
    setFlash(text);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), ms);
  };
  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const prevSeqRef = useRef(turn.seq);
  useEffect(() => {
    if (prevSeqRef.current === turn.seq) return;
    prevSeqRef.current = turn.seq;
    const justNow = (e?: { seq: number }) => !!e && e.seq === turn.seq - 1;

    if (justNow(gs.lastCallout)) {
      const c = gs.lastCallout!;
      if (c.sideId === mySide) {
        Vibration.vibrate([0, 300, 100, 300]);
        showFlash(
          `🚨 Caught! ${You} lost ${calloutPenalty(gs)} passes.\nThat question is gone — here's a new one` +
            (c.targetKept === false ? ", and pick a new target." : "."),
          3500,
        );
      } else {
        showFlash(
          `🚨 ${sideName(c.sideId)} caught — ${calloutPenalty(gs)} passes stripped, question skipped`,
          3000,
        );
      }
    } else if (justNow(gs.lastSwap)) {
      if (gs.lastSwap!.sideId !== mySide)
        showFlash(`🔄 ${sideName(gs.lastSwap!.sideId)} swapped their question`);
    } else if (justNow(gs.lastPass)) {
      playSound(RIGHT_SOUND); // correct answer — everyone hears it
      const p = gs.lastPass!;
      const earn = justNow(gs.lastEarn) ? gs.lastEarn! : null;
      if (p.to === mySide) {
        Vibration.vibrate([0, 150, 80, 150]);
        showFlash(
          `💣 ${sideName(p.from)} passed it to ${you.toUpperCase()}!  +${EARN_HAZARD} ${CURRENCY.icon}`,
        );
      } else if (p.from === mySide && earn && earn.amount > 0) {
        showFlash(
          `💣 Passed! +${earn.amount} ${CURRENCY.icon}` +
            (earn.streak > 0 && earn.streak % 3 === 0
              ? `  🔥 ${earn.streak} in a row`
              : ""),
        );
      } else {
        showFlash(`💣 ${sideName(p.from)} → ${sideName(p.to)}`);
      }
    }
  }, [turn.seq]);

  // A callout that fizzled out (taken back or talked down).
  const droppedSeq = gs.lastCalloutDropped?.seq;
  const prevDroppedRef = useRef(droppedSeq);
  useEffect(() => {
    if (prevDroppedRef.current === droppedSeq) return;
    prevDroppedRef.current = droppedSeq;
    if (droppedSeq === turn.seq) showFlash("🤝 Cheating call dropped");
  }, [droppedSeq]);

  // A wrong tap. The holding side feels it (in team play, every member).
  // Everyone else hears a buzz and sees a quick flash — unless the holder
  // is wearing Hush Gloves, in which case the fumble is silent.
  const wrongCount = turn.wrongPicks.length;
  const prevWrongRef = useRef(wrongCount);
  useEffect(() => {
    const prev = prevWrongRef.current;
    prevWrongRef.current = wrongCount;
    if (wrongCount <= prev) return;
    if (isHolder) {
      Vibration.vibrate(250);
      showFlash(
        muffled
          ? "❌ Wrong — 1 pass gone (🧤 silent)"
          : "❌ Wrong — 1 pass gone",
      );
    } else if (!muffled) {
      playSound(WRONG_SOUND);
      showFlash(`❌ ${holderName} fumbled`, 1000);
    }
  }, [wrongCount, turn.seq]);

  // ── Holder actions ─────────────────────────────────────────────────
  const card = turn.card;
  const cardPending = card?.status === "pending";
  const catLabel = (c?: QuizCategory) =>
    c ? `${QUIZ_CATEGORIES[c].emoji} ${QUIZ_CATEGORIES[c].label}` : "";

  const pickCategory = async (c: QuizCategory | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await pickPassCategory(group, playerId, turn.seq, c);
    } finally {
      setBusy(false);
    }
  };

  const pickTarget = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await choosePassTarget(group, playerId, id);
    } finally {
      setBusy(false);
    }
  };

  const answer = async (index: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await answerPassQuestion(group, playerId, index, turn.seq);
    } finally {
      setBusy(false);
    }
  };

  // ── Items (holder, on their own question) ──────────────────────────
  const myItems = itemsOf(gs, mySide);
  const removed = turn.removed ?? [];
  const untriedWrong = turn.question.options.filter(
    (o, i) =>
      !o.correct && !turn.wrongPicks.includes(i) && !removed.includes(i),
  ).length;
  const spendItem = async (item: PassItem) => {
    if (busy) return;
    setBusy(true);
    try {
      await applyPassItem(group, playerId, item, turn.seq);
    } finally {
      setBusy(false);
    }
  };

  // The store closes itself the moment the bomb lands on you.
  useEffect(() => {
    if (isHolder) setStoreOpen(false);
    setLuckyOpen(false);
  }, [isHolder]);
  const canShop = !isHolder && !isOut;

  // ── Callout ────────────────────────────────────────────────────────
  const callout = gs.callout?.seq === turn.seq ? gs.callout : null;
  const cheatingVotes = callout?.voterIds ?? [];
  const letGoVotes = callout?.againstIds ?? [];
  const calloutLive = cheatingVotes.length > 0;
  const iSaidCheating = cheatingVotes.includes(playerId);
  const iSaidLetGo = letGoVotes.includes(playerId);
  const votesNeeded = calloutVotesNeeded(gs);
  const voters = calloutVoters(gs);
  const canCallout =
    voters.includes(playerId) && voters.length >= CALLOUT_MIN_VOTERS;

  const vote = (choice: CalloutChoice) =>
    votePassCallout(group, playerId, turn.seq, choice);

  const calloutStatus = calloutLive ? (
    <View style={styles.calloutBanner}>
      <Text style={styles.calloutBannerText}>
        🚨 {playerName(cheatingVotes[0])}
        {cheatingVotes.length > 1 ? ` +${cheatingVotes.length - 1}` : ""} called
        cheating on {isHolder ? you : holderName}
      </Text>
      <Text style={styles.calloutBannerCount}>
        {cheatingVotes.length}/{votesNeeded} to convict · {letGoVotes.length}{" "}
        say let it go
      </Text>
    </View>
  ) : null;

  // Cheating can only be called once the holder has seen a question.
  const questionSeen = (!!targetId && !cardPending) || wrongCount > 0;

  // ── Stuck holder ───────────────────────────────────────────────────
  const holderGone = isSideGone(gs, gs.holderId, group.players);
  const isGroupHost = group.hostId === playerId;
  const confirmSkip = () => {
    if (holderGone) {
      skipStuckHolder(group, playerId, turn.seq);
      return;
    }
    Alert.alert(
      "Skip the holder?",
      `${holderName} will lose a life, as if the bomb went off. Only do this if they've stopped responding.`,
      [
        { text: "Wait", style: "cancel" },
        {
          text: "Skip them",
          style: "destructive",
          onPress: () => skipStuckHolder(group, playerId, turn.seq),
        },
      ],
    );
  };

  const calloutControls = !canCallout ? null : !calloutLive ? (
    !questionSeen ? null : (
      <TouchableOpacity
        style={styles.calloutBtn}
        onPress={() => vote("cheating")}
      >
        <Text style={styles.calloutText}>🚨 They're cheating!</Text>
      </TouchableOpacity>
    )
  ) : (
    <View style={styles.calloutRow}>
      <TouchableOpacity
        style={[styles.calloutBtn, iSaidCheating && styles.calloutBtnActive]}
        onPress={() => vote(iSaidCheating ? null : "cheating")}
      >
        <Text
          style={[
            styles.calloutText,
            iSaidCheating && styles.calloutTextActive,
          ]}
        >
          {iSaidCheating
            ? "✓ Cheating (tap to take back)"
            : "🚨 Agree — cheating"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.calloutBtn, iSaidLetGo && styles.letGoBtnActive]}
        onPress={() => vote(iSaidLetGo ? null : "let-go")}
      >
        <Text
          style={[styles.calloutText, iSaidLetGo && styles.letGoTextActive]}
        >
          {iSaidLetGo ? "✓ Let it go (tap to undo)" : "🤝 Let it go"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // ── Pieces ─────────────────────────────────────────────────────────
  const scoreboard = (
    <View style={styles.board}>
      {gs.sides.map((side) => {
        const ghost = gs.ghosts.includes(side.id);
        const holding = side.id === gs.holderId;
        const mine = side.id === mySide;
        return (
          <TouchableOpacity
            key={side.id}
            activeOpacity={0.7}
            onPress={() => setReceiptsFor(side.id)}
            style={[
              styles.boardRow,
              holding && styles.boardRowHolding,
              ghost && styles.boardRowGhost,
            ]}
          >
            {side.color ? (
              <View style={[styles.teamDot, { backgroundColor: side.color }]} />
            ) : null}
            <View style={styles.boardNameCol}>
              <Text style={styles.boardName} numberOfLines={1}>
                {holding ? "💣 " : ghost ? "👻 " : ""}
                {side.name}
                {mine ? (team ? " (your team)" : " (you)") : ""}
              </Text>
              {team && (
                <Text style={styles.boardMembers} numberOfLines={1}>
                  {side.memberIds.map((id) => playerName(id)).join(", ")}
                </Text>
              )}
            </View>
            <Text style={styles.boardLives}>
              {ghost ? "out" : "❤️".repeat(gs.lives[side.id] ?? 0)}
            </Text>
            {!ghost && (
              <Text style={styles.boardPasses}>
                {canSeeCount(side.id)
                  ? `${totalPassesLeft(gs, side.id)} passes`
                  : "🔒"}
              </Text>
            )}
            <Text style={styles.receiptIcon}>🧾</Text>
          </TouchableOpacity>
        );
      })}
      <Text style={styles.boardHint}>Tap anyone to see their receipts</Text>
    </View>
  );

  const question = (
    <View style={styles.questionBox}>
      {turn.sentCategory && (
        <Text style={styles.sentTag}>
          {catLabel(turn.sentCategory.category)} · picked by{" "}
          {sideName(turn.sentCategory.bySideId)}
        </Text>
      )}
      <Text style={styles.questionText}>{turn.question.prompt}</Text>
      {turn.question.options.map((opt, i) => {
        const tried = turn.wrongPicks.includes(i);
        const gone = removed.includes(i);
        return (
          <TouchableOpacity
            key={i}
            style={[
              styles.option,
              tried && styles.optionWrong,
              gone && styles.optionRemoved,
            ]}
            disabled={tried || gone || busy}
            onPress={() => answer(i)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.optionText,
                tried && styles.optionTextWrong,
                gone && styles.optionTextRemoved,
              ]}
            >
              {gone ? "✂️ removed" : opt.text}
            </Text>
          </TouchableOpacity>
        );
      })}
      {(myItems.fiftyFifty > 0 || myItems.swap > 0) && (
        <View style={styles.itemRow}>
          {myItems.fiftyFifty > 0 && (
            <TouchableOpacity
              style={[styles.itemBtn, untriedWrong < 2 && styles.itemBtnOff]}
              disabled={busy || untriedWrong < 2}
              onPress={() => spendItem("fiftyFifty")}
            >
              <Text style={styles.itemText}>
                ✂️ 50/50 ({myItems.fiftyFifty})
              </Text>
            </TouchableOpacity>
          )}
          {myItems.swap > 0 && (
            <TouchableOpacity
              style={styles.itemBtn}
              disabled={busy}
              onPress={() => spendItem("swap")}
            >
              <Text style={styles.itemText}>🔄 Swap ({myItems.swap})</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {team && (
        <Text style={styles.teamHint}>
          Anyone on your team can answer — first tap counts!
        </Text>
      )}
    </View>
  );

  let main;
  if (isHolder && !targetId) {
    // Step 1: pick who it's going to (only when there's a real choice).
    const others = alive.filter((id) => id !== gs.holderId);
    main = (
      <>
        <Text style={styles.bigLine}>
          💣 {You} {team ? "has" : "have"} the bomb!
        </Text>
        <Text style={styles.subLine}>
          Pick who {you} {team ? "is" : "are"} passing to, then answer to pass.
          {canSeeCount(gs.holderId) ? ` ${holderTotal} passes left.` : ""}
        </Text>
        {card && (
          <Text style={styles.cardNote}>
            🎯 Category Card! After you pick who, you choose their category.
          </Text>
        )}
        {calloutStatus}
        {others.map((id) => (
          <TouchableOpacity
            key={id}
            style={styles.targetBtn}
            disabled={busy}
            onPress={() => pickTarget(id)}
          >
            <Text style={styles.targetName}>{sideName(id)}</Text>
            <Text style={styles.targetPasses}>
              {canSeeCount(id) ? `${totalPassesLeft(gs, id)} left` : "🔒"}
            </Text>
          </TouchableOpacity>
        ))}
      </>
    );
  } else if (isHolder && cardPending) {
    // Step 1½: Category Card — pick what the receiver gets.
    main = (
      <>
        <Text style={styles.bigLine}>🎯 Category Card</Text>
        <Text style={styles.subLine}>
          Pick {sideName(targetId)}'s category. It only counts if your pass
          lands.
        </Text>
        <View style={styles.cardRow}>
          {card!.offered.map((c) => (
            <TouchableOpacity
              key={c}
              style={styles.cardChip}
              disabled={busy}
              onPress={() => pickCategory(c)}
            >
              <Text style={styles.cardChipText}>{catLabel(c)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.cardSkip}
          disabled={busy}
          onPress={() => pickCategory(null)}
        >
          <Text style={styles.cardSkipText}>No thanks — surprise them</Text>
        </TouchableOpacity>
      </>
    );
  } else if (isHolder) {
    // Step 2: answer to pass.
    main = (
      <>
        <Text style={styles.bigLine}>
          Passing to {sideName(targetId)} · {holderTotal} passes left
        </Text>
        {card?.status === "picked" && (
          <Text style={styles.cardNote}>
            🎯 Sending them {catLabel(card.pick)}
          </Text>
        )}
        <Text style={styles.subLine}>Every wrong answer costs a pass</Text>
        {muffled && (
          <Text style={styles.glovesNote}>
            🧤 Hush Gloves on — your fumbles are silent
            {glovesLeft(gs, mySide) > 0
              ? ` (${glovesLeft(gs, mySide)} more turns)`
              : " (last turn)"}
          </Text>
        )}
        {calloutStatus}
        {question}
      </>
    );
  } else {
    // Watching — the question stays hidden from everyone but the holder.
    const aimingAtMe = !!targetId && targetId === mySide;
    main = (
      <>
        <Text style={styles.bigLine}>💣 {holderName} has the bomb</Text>
        {hidden ? (
          <Text style={styles.hiddenTicker}>
            🔒 Passes hidden — keep count yourself
          </Text>
        ) : (
          <>
            <Text style={styles.ticker}>{holderTotal}</Text>
            <Text style={styles.tickerLabel}>passes left</Text>
          </>
        )}
        <Text style={styles.subLine}>
          {targetId
            ? cardPending
              ? `🎯 ${holderName} is picking a category for ${aimingAtMe ? you.toUpperCase() : sideName(targetId)}…`
              : card?.status === "picked"
                ? aimingAtMe
                  ? `😬 ${holderName} is sending YOU ${catLabel(card.pick)}`
                  : `Sending ${sideName(targetId)} ${catLabel(card.pick)}`
                : aimingAtMe
                  ? `😬 Aiming at ${you.toUpperCase()}`
                  : `Aiming at ${sideName(targetId)}`
            : muffled && wrongCount > 0
              ? "🤔 Answering…"
              : "Choosing a target…"}
        </Text>
        {targetId && !muffled && (
          <Text style={styles.answering}>
            🤔 Answering…
            {wrongCount > 0 ? `  ❌ ${wrongCount} wrong so far` : ""}
          </Text>
        )}
        {isOut && (
          <Text style={styles.outNote}>👻 You're out — enjoy the show</Text>
        )}

        {calloutStatus}
        {calloutControls}

        {(holderGone || isGroupHost) && (
          <TouchableOpacity style={styles.skipBtn} onPress={confirmSkip}>
            <Text style={styles.skipText}>
              {holderGone
                ? `⏭️ ${holderName} left — skip them`
                : "⏭️ Holder not responding? Skip (host)"}
            </Text>
          </TouchableOpacity>
        )}
      </>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.round}>
          ROUND {gs.round}
          {team ? " · TEAMS" : ""}
        </Text>
        <View style={styles.headerRight}>
          {!isOut && (
            <Text style={styles.walletChip}>
              {CURRENCY.icon} {walletOf(gs, mySide)}
            </Text>
          )}
          {canShop && ticketsAllowed(gs) && (
            <TouchableOpacity
              style={styles.storeBtn}
              onPress={() => setStoreOpen(true)}
            >
              <Text style={styles.storeBtnText}>
                {STORE.icon} {STORE.name}
              </Text>
              <Text style={styles.luckyBtnText}>{LUCKY.icon}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <PassHauntPanel group={group} playerId={playerId} />
        {main}
        {scoreboard}
      </ScrollView>

      <PassReceiptsSheet
        sideId={receiptsFor}
        onClose={() => setReceiptsFor(null)}
        group={group}
      />

      <PassStoreSheet
        visible={storeOpen && canShop}
        onClose={() => setStoreOpen(false)}
        group={group}
        playerId={playerId}
      />
      <PassLuckySheet
        visible={luckyOpen && canShop}
        onClose={() => setLuckyOpen(false)}
        group={group}
        playerId={playerId}
      />

      <PassPerkNews group={group} playerId={playerId} variant="toast" />

      {flash && (
        <View pointerEvents="none" style={styles.flash}>
          <Text style={styles.flashText}>{flash}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D0D0D", paddingHorizontal: 20 },
  scroll: { paddingBottom: 40 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  round: {
    color: "#FF4500",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },
  walletChip: { color: "#FFD700", fontSize: 13, fontWeight: "800" },
  storeBtn: {
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  storeBtnText: { color: "#FFD700", fontSize: 12, fontWeight: "700" },
  optionRemoved: { opacity: 0.35, borderColor: "#333" },
  optionTextRemoved: { color: "#666", fontStyle: "italic" },
  itemRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  itemBtn: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
    backgroundColor: "#1F1A08",
  },
  itemBtnOff: { opacity: 0.35 },
  itemText: { color: "#FFD700", fontSize: 13, fontWeight: "700" },
  bigLine: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
  },
  cardNote: {
    color: "#4FC3F7",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginVertical: 10,
  },
  cardChip: {
    borderWidth: 1,
    borderColor: "#4FC3F7",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: "45%",
    alignItems: "center",
  },
  cardChipText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  cardSkip: { alignSelf: "center", padding: 10 },
  cardSkipText: { color: "#888", fontSize: 13 },
  sentTag: {
    color: "#4FC3F7",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  subLine: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  ticker: {
    color: "#FF4500",
    fontSize: 64,
    fontWeight: "900",
    textAlign: "center",
  },
  tickerLabel: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 12,
  },
  hiddenTicker: {
    color: "#888",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginVertical: 12,
  },
  glovesNote: {
    color: "#B39DDB",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 10,
  },
  receiptIcon: { fontSize: 12, opacity: 0.5 },
  boardHint: { color: "#444", fontSize: 10, textAlign: "center", marginTop: 6 },
  answering: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  },
  outNote: {
    color: "#666",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 12,
  },

  targetBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#FF4500",
  },
  targetBtnEmpty: { opacity: 0.35, borderColor: "#333" },
  targetName: { color: "#fff", fontSize: 16, fontWeight: "700" },
  targetPasses: { color: "#FFD700", fontSize: 13, fontWeight: "600" },

  questionBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  questionText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    marginBottom: 12,
  },
  option: {
    backgroundColor: "#2A2A2A",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#444",
  },
  optionWrong: { backgroundColor: "#2D0A0E", borderColor: "#E63946" },
  optionText: { color: "#fff", fontSize: 15 },
  optionTextWrong: { color: "#E63946", textDecorationLine: "line-through" },
  teamHint: { color: "#666", fontSize: 11, textAlign: "center", marginTop: 4 },

  calloutBtn: {
    alignSelf: "center",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#444",
    backgroundColor: "#1A1A1A",
    marginBottom: 16,
  },
  skipBtn: {
    alignSelf: "center",
    marginTop: 4,
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  skipText: { color: "#666", fontSize: 12, fontWeight: "600" },
  calloutBtnActive: { borderColor: "#E63946", backgroundColor: "#2D0A0E" },
  calloutText: { color: "#aaa", fontSize: 13, fontWeight: "700" },
  calloutTextActive: { color: "#E63946" },
  calloutRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  letGoBtnActive: { borderColor: "#4CAF50", backgroundColor: "#0A1E0A" },
  letGoTextActive: { color: "#4CAF50" },
  calloutBanner: {
    backgroundColor: "#2D0A0E",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E63946",
    padding: 10,
    marginBottom: 12,
  },
  calloutBannerText: {
    color: "#E63946",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  calloutBannerCount: {
    color: "#aaa",
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
  },

  board: {
    backgroundColor: "#141414",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#222",
    marginTop: 8,
  },
  boardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 8,
    borderRadius: 8,
  },
  boardRowHolding: { backgroundColor: "#2A1A1A" },
  boardRowGhost: { opacity: 0.4 },
  teamDot: { width: 10, height: 10, borderRadius: 5 },
  boardNameCol: { flex: 1 },
  boardName: { color: "#fff", fontSize: 14 },
  boardMembers: { color: "#666", fontSize: 11, marginTop: 1 },
  boardLives: { fontSize: 11, color: "#888" },
  boardPasses: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "700",
    minWidth: 70,
    textAlign: "right",
  },

  flash: {
    position: "absolute",
    top: 8,
    left: 16,
    right: 16,
    backgroundColor: "rgba(26,26,26,0.96)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FF4500",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  flashText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  luckyBtn: {
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  luckyBtnText: { fontSize: 14 },
});
