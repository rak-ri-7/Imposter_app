// Calling: your top card slides off your pile and flips face-up. The caller
// taps a stat (or their 🃏 Wildcard) to pick it, then locks it in with
// CLASH! (it gets stamped CALLED!). If time runs out, whatever is picked is
// called. The first clash opens with the deal.
// Lifelines (once a game each): ⏭️ Skip, for anyone, slides your top card
// off to the bottom of your pile and draws the next; 🔍 Hint, for the
// caller, privately shows each opponent's continent / animal group.
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Vibration,
  Animated,
  Easing,
  useWindowDimensions,
  Modal,
} from "react-native";
import type { ClashGameState, Group } from "../../../shared/types";
import { cardById } from "../data/decks";
import { prefetchCardPhotos } from "../data/photos";
import {
  CALL_MS,
  FINISH_OPTIONS,
  PASS_AFTER,
  callStat,
  canPassCall,
  clashesLeft,
  finishIn,
  passCall,
  scratchedStats,
  skipCard,
  takeHint,
} from "../logic/game";
import { DECKS } from "../data/decks";
import { hintFor, HINT_KIND } from "../data/hints";
import ClashCardView from "../components/ClashCardView";
import FlipCard from "../components/FlipCard";
import PileBar, { Rect } from "../components/PileBar";
import FlyingCards, { Flight } from "../components/FlyingCards";
import { CC, SERIF } from "../theme";

type Props = { group: Group; gs: ClashGameState; playerId: string };

const DRAW_DELAY = 350; // slide in, then flip
// The caller's phone sends a picked-but-unconfirmed stat this long before its
// own deadline, so it lands before the host's random fallback.
const AUTO_SEND_EARLY_MS = 1500;

export default function ClashCallScreen({ group, gs, playerId }: Props) {
  const { width: screenW } = useWindowDimensions();
  const isCaller = gs.callerId === playerId;
  const myPile = gs.piles[playerId] ?? [];
  const myCard = cardById(myPile[0] ?? "");
  const myGold = !!myCard && !!gs.gold?.[myCard.id];
  // Scratch-off: every called stat stays crossed out for everyone until all 10 are gone.
  const myScratched = myGold ? [] : scratchedStats(gs);
  const statCount = DECKS[gs.deck].stats.length;
  // Waves: 10 → a random 5 reopen → the other 5 → game over.
  const wave = gs.statWave ?? 1;
  const unlimited = gs.lengthMode === "unlimited";

  // 🏁 Host: finish in 5 / 10 more clashes (only ever shortens).
  const isHost = group.hostId === playerId;
  const left = clashesLeft(gs);
  const [finishOpen, setFinishOpen] = useState(false);
  const callFinish = async (n: number) => {
    setFinishOpen(false);
    Vibration.vibrate(40);
    await finishIn(group.id, playerId, n);
  };
  const allOff = scratchedStats(gs).length;
  const statsLeft = statCount - allOff;
  const waveNote =
    wave === 1
      ? `🔒 ${allOff} of ${statCount} stats gone for everyone · when all ${statCount} are gone, 5 random ones come back`
      : wave === 2
        ? `🔁 Second wave · ${statsLeft} of 5 stats left · then the last 5 come back`
        : unlimited
          ? `🔁 Third wave · ${statsLeft} of 5 stats left · then all ${statCount} come back`
          : `⚠️ FINAL 5 · ${statsLeft} stat${statsLeft === 1 ? "" : "s"} left · then most cards wins`;
  const out = gs.piles[playerId] !== undefined && myPile.length === 0;
  const callerName = group.players.find((p) => p.id === gs.callerId)?.name ?? "Someone";
  const nameOf = (id: string) =>
    id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone";
  const wildLeft = !gs.wildcardUsed?.[playerId];
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null); // selected, not locked in
  const [chosen, setChosen] = useState<string | null>(null); // locked in
  const [flipped, setFlipped] = useState(false);

  // The countdown runs from when this phone saw the round start.
  // (Keyed on the caller too: a 🎁 passed call starts a fresh 30s.)
  const seenKey = `${gs.round}:${gs.callerId}`;
  const seen = useRef<{ key: string; at: number } | null>(null);
  if (seen.current?.key !== seenKey) seen.current = { key: seenKey, at: Date.now() };
  const [, setTick] = useState(0);

  // Draw: slide the new top card in, then flip it. Runs again after a Skip.
  // slide: 0 = off to the left, 1 = in place, 2 = skipped off to the right.
  const slide = useRef(new Animated.Value(0)).current;
  const topId = myPile[0] ?? "";
  const draws = useRef(0);
  useEffect(() => {
    setChosen(null);
    setPicked(null);
    setFlipped(false);
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const firstDeal = draws.current === 0 && gs.round === 1;
    draws.current += 1;
    const f = setTimeout(() => setFlipped(true), DRAW_DELAY + (firstDeal ? 900 : 0));
    prefetchCardPhotos(myPile.slice(0, 3).map(cardById));
    return () => clearTimeout(f);
  }, [gs.round, topId]);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [gs.round]);
  useEffect(() => {
    if (isCaller) Vibration.vibrate([0, 100, 60, 100]);
    setPicked(null);
    setChosen(null);
  }, [gs.round, gs.callerId]);

  // 🎁 Pass the call: after PASS_AFTER calls in a row. With 3+ players a
  // 🎲 roll (shown on every phone) picks the new caller.
  const passed = gs.passedCall?.round === gs.round && gs.passedCall.to === gs.callerId ? gs.passedCall : null;
  const ROLL_SHOW_MS = 2600;
  const sinceSeen = Date.now() - seen.current.at;
  const rolling = !!passed && passed.pool.length > 1 && sinceSeen < ROLL_SHOW_MS;
  const showPassed = !!passed && sinceSeen < ROLL_SHOW_MS + 2500;
  const rollName = passed ? passed.pool[Math.floor(sinceSeen / 120) % passed.pool.length] : "";
  const canPass = isCaller && canPassCall(gs) && !chosen && !busy;
  const [passing, setPassing] = useState(false);
  const doPass = async () => {
    if (!canPass || passing) return;
    setPassing(true);
    Vibration.vibrate(40);
    try {
      await passCall(group.id, playerId, gs.round);
    } finally {
      setPassing(false);
    }
  };

  // ⏭️ Skip: the card flies off to the right, then the next one is drawn.
  const [skipping, setSkipping] = useState(false);
  const skipLeft = gs.skipsUsed?.[playerId] === undefined;
  const canSkip = skipLeft && myPile.length >= 2 && !chosen && !busy && !skipping && flipped;
  const skip = () => {
    if (!canSkip) return;
    setSkipping(true);
    setPicked(null);
    Vibration.vibrate(30);
    Animated.timing(slide, { toValue: 2, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(async () => {
      const res = await skipCard(group.id, playerId, gs.round);
      setSkipping(false);
      if (!res.success) Animated.timing(slide, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    });
  };

  // 🔍 Hint: live, so an opponent's skip updates it.
  const hintRound = gs.hintsUsed?.[playerId];
  const hintLeft = hintRound === undefined;
  const hintOn = isCaller && hintRound === gs.round;
  const [hinting, setHinting] = useState(false);
  const hint = async () => {
    if (!isCaller || !hintLeft || hinting || chosen) return;
    setHinting(true);
    Vibration.vibrate(20);
    try {
      await takeHint(group.id, playerId, gs.round);
    } finally {
      setHinting(false);
    }
  };
  const opponents = group.players.filter((p) => p.id !== playerId && (gs.piles[p.id]?.length ?? 0) > 0);
  const skippedBy = group.players.filter((p) => p.id !== playerId && gs.skipsUsed?.[p.id] === gs.round);
  const deadline = seen.current.at + CALL_MS;
  const secsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

  // The opening deal: card backs fly from the middle to every pile.
  const chipRects = useRef<Record<string, Rect>>({});
  const deckRef = useRef<View>(null);
  const [deal, setDeal] = useState<Flight[] | null>(null);
  const dealt = useRef(false);
  useEffect(() => {
    if (gs.round !== 1 || dealt.current) return;
    const go = setTimeout(() => {
      deckRef.current?.measureInWindow((x, y, w, h) => {
        const ids = Object.keys(chipRects.current);
        if (ids.length === 0) return;
        dealt.current = true;
        const flights: Flight[] = [];
        for (let k = 0; k < 3; k++) {
          ids.forEach((pid, i) =>
            flights.push({
              id: `deal-${k}-${pid}`,
              from: { x, y, w, h },
              to: chipRects.current[pid],
              delay: (k * ids.length + i) * 70,
            }),
          );
        }
        setDeal(flights);
      });
    }, 120);
    return () => clearTimeout(go);
  }, [gs.round]);

  const call = async (choice: { statKey: string } | { wildcard: true }) => {
    if (busy || chosen || !isCaller || !flipped || rolling) return;
    setBusy(true);
    setChosen("statKey" in choice ? choice.statKey : "wild");
    Vibration.vibrate(40);
    try {
      const res = await callStat(group.id, playerId, gs.round, choice);
      if (!res.success) setChosen(null);
    } finally {
      setBusy(false);
    }
  };

  const choiceOf = (k: string) => (k === "wild" ? ({ wildcard: true } as const) : { statKey: k });
  const lockIn = () => picked && call(choiceOf(picked));
  const pick = (k: string) => {
    if (busy || chosen || !isCaller || !flipped || rolling) return;
    Vibration.vibrate(15);
    setPicked((cur) => (cur === k ? null : k));
  };

  // Out of time with something picked: call it rather than a random stat.
  useEffect(() => {
    if (isCaller && picked && !chosen && !busy && Date.now() >= deadline - AUTO_SEND_EARLY_MS) lockIn();
  });

  const cardW = Math.min(380, screenW - 32);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.round}>CLASH {gs.round}</Text>
          <View style={styles.headerRight}>
            {isHost && (left === null || left > 1) && (
              <TouchableOpacity style={styles.finishBtn} onPress={() => setFinishOpen(true)}>
                <Text style={styles.finishBtnText}>🏁</Text>
              </TouchableOpacity>
            )}
            <View style={[styles.timerPill, secsLeft <= 5 && styles.timerUrgent]}>
              <Text style={styles.timer}>⏱ {secsLeft}s</Text>
            </View>
          </View>
        </View>
        {left !== null && (
          <View style={styles.finishBanner}>
            <Text style={styles.finishBannerText}>
              {left <= 1
                ? "🏁 FINAL CLASH · then most cards wins"
                : `🏁 Host called time · ${left} clashes left (including this one)`}
            </Text>
          </View>
        )}
        <PileBar group={group} gs={gs} playerId={playerId} onChipRect={(pid, r) => (chipRects.current[pid] = r)} />

        <View style={[styles.banner, isCaller && styles.bannerMine]}>
          <Text style={[styles.bannerText, isCaller && styles.bannerTextMine]}>
            {isCaller
              ? chosen
                ? "📣 Called! Flipping the cards…"
                : "📣 YOUR CALL! Pick the stat you think wins, then hit CLASH!"
              : `📣 ${callerName} is picking a stat…`}
          </Text>
        </View>

        {!out && myCard && (
          <View style={styles.lifelines}>
            <TouchableOpacity
              style={[styles.lifeBtn, !canSkip && styles.dim]}
              onPress={skip}
              disabled={!canSkip}
              activeOpacity={0.7}
            >
              <Text style={styles.lifeText}>
                {!skipLeft ? "⏭️ Skip used" : myPile.length < 2 ? "⏭️ Last card" : "⏭️ SKIP CARD"}
              </Text>
            </TouchableOpacity>
            {isCaller && (
              <TouchableOpacity
                style={[styles.lifeBtn, (!hintLeft || hinting || !!chosen) && styles.dim, hintOn && styles.lifeBtnOn]}
                onPress={hint}
                disabled={!hintLeft || hinting || !!chosen}
                activeOpacity={0.7}
              >
                <Text style={[styles.lifeText, hintOn && styles.lifeTextOn]}>
                  {hintOn ? "🔍 Hint shown ↓" : hintLeft ? "🔍 HINT" : "🔍 Hint used"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {!out && myCard && (myGold || allOff > 0 || wave > 1) && (
          <Text style={[styles.scratchNote, myGold && styles.scratchGold]}>
            {myGold
              ? "★ Gold card: every stat unlocked, nothing gets scratched"
              : waveNote}
          </Text>
        )}

        {showPassed && passed && (
          <View style={styles.passBox}>
            {rolling ? (
              <>
                <Text style={styles.passTitle}>🎲 {nameOf(passed.from)} passed the call… rolling</Text>
                <Text style={styles.passName}>{nameOf(rollName)}</Text>
              </>
            ) : (
              <Text style={styles.passTitle}>
                🎁 {nameOf(passed.from)} passed the call · {passed.to === playerId ? "it's YOUR call!" : `${nameOf(passed.to)} takes it!`}
              </Text>
            )}
          </View>
        )}

        {canPass && (
          <TouchableOpacity style={[styles.passBtn, passing && styles.dim]} onPress={doPass} disabled={passing} activeOpacity={0.7}>
            <Text style={styles.passBtnText}>
              🎁 PASS THE CALL · you've called {gs.streak?.count ?? PASS_AFTER} in a row
            </Text>
          </TouchableOpacity>
        )}

        {skippedBy.length > 0 && (
          <Text style={styles.skipNote}>⏭️ {skippedBy.map((p) => p.name).join(", ")} skipped a card</Text>
        )}

        {hintOn && (
          <View style={styles.hintBox}>
            <Text style={styles.hintTitle}>🔍 YOUR HINT · their {HINT_KIND[gs.deck]}</Text>
            {opponents.map((p) => {
              const h = hintFor(cardById(gs.piles[p.id][0]));
              return (
                <View key={p.id} style={styles.hintRow}>
                  <Text style={styles.hintName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.hintValue}>{h ? `${h.emoji} ${h.label}` : "?"}</Text>
                </View>
              );
            })}
          </View>
        )}

        <View ref={deckRef} collapsable={false}>
          {out || !myCard ? (
            <View style={styles.outBox}>
              <Text style={styles.outTitle}>You're out of cards 👻</Text>
              <Text style={styles.outText}>Watch the clashes until someone wins.</Text>
            </View>
          ) : (
            <Animated.View
              style={{
                alignItems: "center",
                opacity: slide.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
                transform: [
                  { translateX: slide.interpolate({ inputRange: [0, 1, 2], outputRange: [-screenW * 0.6, 0, screenW * 0.7] }) },
                  { rotate: slide.interpolate({ inputRange: [0, 1, 2], outputRange: ["-12deg", "0deg", "14deg"] }) },
                ],
              }}
            >
              <FlipCard
                flipped={flipped}
                gold={myGold}
                front={
                  <ClashCardView
                    card={myCard}
                    deck={gs.deck}
                    width={cardW}
                    gold={myGold}
                    onPickStat={isCaller ? pick : undefined}
                    disabled={busy || !!chosen || !flipped}
                    selectedKey={picked && picked !== "wild" ? picked : undefined}
                    usedKeys={myScratched}
                    usedLabel="called"
                    calledKey={chosen && chosen !== "wild" ? chosen : undefined}
                  />
                }
              />
            </Animated.View>
          )}
        </View>

        {!out && myCard && (
          <Text style={styles.under}>
            {myGold ? "★ Your top card is GOLD: lose and it gets a Gold Defence · " : "Your top card · "}
            {myPile.length} in your pile
          </Text>
        )}
        {isCaller && !out && myCard && (
          <>
            <TouchableOpacity
              style={[styles.wildBtn, picked === "wild" && styles.wildBtnOn, (!wildLeft || busy || !!chosen) && styles.dim]}
              onPress={() => pick("wild")}
              disabled={!wildLeft || busy || !!chosen}
            >
              <Text style={[styles.wildText, picked === "wild" && styles.wildTextOn]}>
                {!wildLeft
                  ? "🃏 Wildcard already used"
                  : picked === "wild"
                    ? "▶ 🃏 WILDCARD PICKED · a hidden surprise stat"
                    : "🃏 PLAY YOUR WILDCARD · a hidden surprise stat"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      {isCaller && !out && myCard && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.clashBtn, (!picked || busy || !!chosen) && styles.clashBtnOff]}
            onPress={lockIn}
            disabled={!picked || busy || !!chosen}
            activeOpacity={0.7}
          >
            <Text style={[styles.clashText, (!picked || !!chosen) && styles.clashTextOff]}>
              {chosen ? "CALLED!" : picked ? "⚔️ CLASH!" : "Pick a stat first"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <Modal visible={finishOpen} transparent animationType="fade" onRequestClose={() => setFinishOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🏁 Finish the game</Text>
            <Text style={styles.modalSub}>
              The game ends after this many more clashes (counting this one). Then most cards wins, ★ golds break ties.
            </Text>
            {FINISH_OPTIONS.filter((n) => left === null || n < left).map((n) => (
              <TouchableOpacity key={n} style={styles.modalBtn} onPress={() => callFinish(n)}>
                <Text style={styles.modalBtnText}>Finish in {n} clashes</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setFinishOpen(false)}>
              <Text style={styles.modalCancelText}>Keep playing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {deal && <FlyingCards flights={deal} onAllDone={() => setDeal(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CC.bg },
  content: { padding: 16, paddingTop: 48, paddingBottom: 40, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  round: { color: CC.gold, fontSize: 22, fontWeight: "900", fontFamily: SERIF, letterSpacing: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  finishBtn: { backgroundColor: CC.panel, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1.5, borderColor: CC.gold },
  finishBtnText: { fontSize: 16 },
  finishBanner: { backgroundColor: "#3A2A10", borderRadius: 12, borderWidth: 1.5, borderColor: CC.gold, paddingVertical: 8, alignItems: "center" },
  finishBannerText: { color: CC.gold, fontSize: 13, fontWeight: "900" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  modalBox: { backgroundColor: CC.panel, borderRadius: 18, borderWidth: 2, borderColor: CC.gold, padding: 20, gap: 10 },
  modalTitle: { color: CC.gold, fontSize: 22, fontWeight: "900", textAlign: "center", fontFamily: SERIF },
  modalSub: { color: CC.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  modalBtn: { backgroundColor: CC.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  modalBtnText: { color: "#1A0F00", fontSize: 16, fontWeight: "900" },
  modalCancel: { paddingVertical: 10, alignItems: "center" },
  modalCancelText: { color: CC.textMuted, fontSize: 14, fontWeight: "700" },
  timerPill: { backgroundColor: CC.panel, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  timerUrgent: { backgroundColor: CC.lose },
  timer: { color: CC.text, fontSize: 16, fontWeight: "900" },
  banner: { backgroundColor: CC.panel, borderRadius: 12, padding: 10, borderWidth: 1.5, borderColor: CC.line },
  bannerMine: { backgroundColor: CC.gold, borderColor: CC.goldDeep },
  bannerText: { color: CC.text, fontSize: 14, fontWeight: "700", textAlign: "center" },
  bannerTextMine: { color: "#1A0F00", fontWeight: "900" },
  under: { color: CC.textMuted, fontSize: 12, textAlign: "center" },
  wildBtn: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: CC.wild,
    backgroundColor: "#2E1A52",
    paddingVertical: 12,
    alignItems: "center",
  },
  wildBtnOn: { backgroundColor: CC.wild },
  lifelines: { flexDirection: "row", gap: 10 },
  lifeBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: CC.line,
    backgroundColor: CC.panel,
    paddingVertical: 11,
    alignItems: "center",
  },
  lifeBtnOn: { borderColor: CC.gold },
  lifeText: { color: CC.text, fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  lifeTextOn: { color: CC.gold },
  passBox: { backgroundColor: CC.panel, borderRadius: 14, borderWidth: 2, borderColor: CC.gold, padding: 12, alignItems: "center", gap: 4 },
  passTitle: { color: CC.text, fontSize: 14, fontWeight: "800", textAlign: "center" },
  passName: { color: CC.gold, fontSize: 26, fontWeight: "900", fontFamily: SERIF },
  passBtn: { borderRadius: 14, borderWidth: 2, borderColor: CC.gold, backgroundColor: "#3A2A10", paddingVertical: 11, alignItems: "center" },
  passBtnText: { color: CC.gold, fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  scratchNote: { color: CC.textMuted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  scratchGold: { color: CC.gold },
  skipNote: { color: CC.textMuted, fontSize: 13, fontWeight: "700", textAlign: "center" },
  hintBox: { backgroundColor: CC.panel, borderRadius: 14, borderWidth: 2, borderColor: CC.gold, padding: 12, gap: 6 },
  hintTitle: { color: CC.gold, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  hintRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hintName: { color: CC.text, fontSize: 15, fontWeight: "800", flex: 1 },
  hintValue: { color: CC.text, fontSize: 15, fontWeight: "900" },
  wildText: { color: CC.wild, fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  wildTextOn: { color: "#1A0F2E" },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, backgroundColor: CC.bg, borderTopWidth: 1, borderTopColor: CC.line },
  clashBtn: {
    backgroundColor: CC.gold,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: CC.goldDeep,
    paddingVertical: 16,
    alignItems: "center",
  },
  clashBtnOff: { backgroundColor: CC.panel, borderColor: CC.line },
  clashText: { color: "#1A0F00", fontSize: 20, fontWeight: "900", fontFamily: SERIF, letterSpacing: 2 },
  clashTextOff: { color: CC.textMuted, fontSize: 15, letterSpacing: 0.5 },
  outBox: { backgroundColor: CC.panel, borderRadius: 16, padding: 24, alignItems: "center" },
  outTitle: { color: CC.text, fontSize: 20, fontWeight: "900" },
  outText: { color: CC.textMuted, marginTop: 6 },
  dim: { opacity: 0.4 },
});
