// 💰 The table: seats (chips, dealer, who's to act), the pot, the live
// stats, your secret card with its rank on each live stat, and the betting
// buttons. The same screen shows the dealer's choice and the showdown.
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Vibration, useWindowDimensions } from "react-native";
import type { Group, HoldemGameState, HoldemMode } from "../../../shared/types";
import { cardById, statByKey } from "../../card-clash/data/decks";
import { formatStat } from "../../card-clash/data/types";
import { MiniCard } from "../../card-clash/components/ClashCardView";
import CardBack from "../../card-clash/components/CardBack";
import { CC, SERIF } from "../../card-clash/theme";
import { BIG_BLIND, deckPercentile, legalActions, live, maxRaiseTo, minRaiseTo, potTotal, toCall } from "../logic/engine";
import { DECKS } from "../../card-clash/data/decks";
import { CHOOSE_MS, TURN_MS, chooseHoldemMode, holdemAct, holdemNextHand, showdownMs } from "../logic/game";

type Props = { group: Group; gs: HoldemGameState; playerId: string; stepSeenAt: number };

const ACTION_WORD: Record<string, string> = {
  check: "checked",
  call: "called",
  raise: "raised",
  fold: "folded",
  ante: "anted",
  blind: "posted the blind",
  bet: "bet",
  "all-in": "is ALL-IN",
};

export default function HoldemTableScreen({ group, gs, playerId, stepSeenAt }: Props) {
  const { width: screenW } = useWindowDimensions();
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [raiseTo, setRaiseTo] = useState<number | null>(null); // the amount picker (street total)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  const myTurn = gs.phase === "betting" && gs.toAct === playerId;
  const iChoose = gs.phase === "choosing" && gs.dealerId === playerId;
  useEffect(() => {
    if (myTurn || iChoose) Vibration.vibrate([0, 80, 60, 80]);
    setRaiseTo(null);
  }, [gs.seq]);

  const nameOf = (id: string) =>
    id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone";
  const limit = gs.phase === "choosing" ? CHOOSE_MS : gs.phase === "betting" ? TURN_MS : showdownMs(gs);
  const secsLeft = Math.max(0, Math.ceil((stepSeenAt + limit - Date.now()) / 1000));

  const myCard = cardById(gs.cards[playerId] ?? "");
  const inHand = gs.inHand.includes(playerId);
  const iFolded = !!gs.folded[playerId];
  const pot = gs.phase === "showdown" ? (gs.last?.pots ?? []).reduce((a, p) => a + p.amount, 0) : potTotal(gs);
  const lastLog = [...gs.log].reverse().find((l) => l.action !== "ante");

  const send = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    Vibration.vibrate(30);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  // ── pieces ─────────────────────────────────────────────────────────
  const seats = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seats}>
      {gs.seats
        .filter((id) => gs.chips[id] !== undefined)
        .map((id) => {
          const turn = gs.phase === "betting" && gs.toAct === id;
          const out = !gs.inHand.includes(id);
          const folded = !!gs.folded[id];
          const allIn = gs.inHand.includes(id) && !folded && (gs.chips[id] ?? 0) === 0 && gs.phase !== "showdown";
          const bet = gs.streetBet[id] ?? 0;
          return (
            <View key={id} style={[styles.seat, turn && styles.seatTurn, (out || folded) && styles.seatDim]}>
              <Text style={[styles.seatName, id === playerId && styles.me]} numberOfLines={1}>
                {gs.dealerId === id ? "🎩 " : ""}
                {nameOf(id)}
                {gs.phase !== "showdown" && gs.sbId === id ? " · SB" : ""}
                {gs.phase !== "showdown" && gs.bbId === id ? " · BB" : ""}
              </Text>
              <Text style={styles.seatChips}>🪙 {gs.chips[id] ?? 0}</Text>
              <Text style={styles.seatState}>
                {out ? "out" : folded ? "folded" : allIn ? "ALL-IN" : bet > 0 ? `bet ${bet}` : turn ? "to act…" : " "}
              </Text>
            </View>
          );
        })}
    </ScrollView>
  );

  const statLabel = (k: string) => {
    const st = statByKey(gs.deck, k);
    return `${st?.emoji ?? ""} ${st?.label ?? k}`;
  };

  const statsRow = gs.stats.length > 0 && gs.phase !== "showdown" && (
    <View style={styles.statsBox}>
      <Text style={styles.streetLabel}>
        {gs.street.toUpperCase()} · {gs.mode === "scratch" ? "✂️ SCRATCH" : "🎴 DRAW"}
      </Text>
      {gs.lastStreetChange && (
        <Text style={styles.changeLine}>
          {gs.lastStreetChange.added
            ? `🔁 ${statLabel(gs.lastStreetChange.removed!)} out · ${statLabel(gs.lastStreetChange.added)} in`
            : `✂️ ${statLabel(gs.lastStreetChange.removed!)} struck`}
        </Text>
      )}
      <View style={styles.statTiles}>
        {gs.stats.map((k) => {
          const pct = myCard ? deckPercentile(gs.deck, myCard.id, k) : undefined;
          const st = statByKey(gs.deck, k);
          const isNew = gs.lastStreetChange?.added === k;
          return (
            <View key={k} style={[styles.statTile, isNew && styles.statTileNew]}>
              <Text style={styles.statTileName} numberOfLines={1}>
                {st?.emoji} {st?.label}
              </Text>
              {myCard && st && inHand && !iFolded && (
                <>
                  <Text style={styles.statTileVal}>{formatStat(st, myCard.stats[k] ?? 0)}</Text>
                  <View style={[styles.pctPill, { backgroundColor: pctColor(pct ?? 0) }]}>
                    <Text style={styles.pctText}>{pct! >= 50 ? `Top ${Math.max(1, 100 - pct!)}%` : `Bottom ${Math.max(1, pct! + 1)}%`}</Text>
                  </View>
                </>
              )}
              {isNew && <Text style={styles.newTag}>NEW</Text>}
            </View>
          );
        })}
      </View>
      <Text style={styles.howWin}>
        {gs.mode === "scratch"
          ? gs.stats.length === 1
            ? "Highest number on this stat wins"
            : `${gs.stats.length} left · one more gets struck${gs.street === "flop" ? " twice" : ""}`
          : "Win 2 of the 3 stats (👑 each) to take the pot"}
      </Text>
    </View>
  );

  // Pre-flop: no stats yet; your card's three strongest, to bet on.
  const myBest =
    myCard && inHand
      ? DECKS[gs.deck].stats
          .map((st) => ({ st, pct: deckPercentile(gs.deck, myCard.id, st.key) }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 3)
      : [];
  const preflopRow = gs.street === "preflop" && (gs.phase === "betting" || gs.phase === "choosing") && (
    <View style={styles.preBox}>
      <Text style={styles.preTitle}>
        PRE-FLOP{gs.mode ? ` · ${gs.mode === "scratch" ? "✂️ SCRATCH" : "🎴 DRAW"}` : ""}
      </Text>
      <Text style={styles.preSub}>No stats shown yet: bet on your card. 3 stats come on the flop.</Text>
      {myBest.length > 0 && !iFolded && (
        <>
          <Text style={styles.preSub}>Your card's strongest stats:</Text>
          {myBest.map(({ st, pct }) => (
            <View key={st.key} style={styles.preRow}>
              <Text style={styles.preStat}>
                {st.emoji} {st.label} · {formatStat(st, myCard!.stats[st.key] ?? 0)}
              </Text>
              <View style={[styles.pctPill, { backgroundColor: pctColor(pct) }]}>
                <Text style={styles.pctText}>{pct >= 50 ? `Top ${Math.max(1, 100 - pct)}%` : `Bottom ${Math.max(1, pct + 1)}%`}</Text>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );

  // ── 🎩 dealer's choice ──────────────────────────────────────────────
  const chooseUi = gs.phase === "choosing" && (
    <View style={styles.chooseBox}>
      {iChoose ? (
        <>
          <Text style={styles.chooseTitle}>🎩 You're the dealer: pick the mode</Text>
          <Text style={styles.chooseSub}>Look at your card first. Everyone will see what you chose.</Text>
          {(["draw", "scratch"] as HoldemMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, busy && styles.dim]}
              disabled={busy}
              onPress={() => send(() => chooseHoldemMode(group.id, playerId, gs.hand, m))}
            >
              <Text style={styles.modeTitle}>{m === "draw" ? "🎴 DRAW" : "✂️ SCRATCH"}</Text>
              <Text style={styles.modeSub}>
                {m === "draw"
                  ? "Stats get replaced each round · best of 3 wins · good for all-rounders"
                  : "Stats get struck each round · the last one decides · good for one monster stat"}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.timerText}>⏱ {secsLeft}s · then Draw</Text>
        </>
      ) : (
        <Text style={styles.chooseTitle}>🎩 {nameOf(gs.dealerId)} is choosing Draw or Scratch… ({secsLeft}s)</Text>
      )}
    </View>
  );

  // ── the showdown ────────────────────────────────────────────────────
  const res = gs.phase === "showdown" ? gs.last : undefined;
  const contenders = res ? Object.keys(res.cards) : [];
  const miniW = Math.min(118, (screenW - 32 - 16 * Math.max(0, contenders.length - 1)) / Math.max(2, contenders.length));
  const showdownUi = res && (
    <View style={styles.showBox}>
      {res.noShowdown ? (
        <Text style={styles.showTitle}>
          🪙 Everyone else folded · {nameOf(res.winnerIds[0])} {res.winnerIds[0] === playerId ? "take" : "takes"} {pot}
        </Text>
      ) : (
        <>
          <Text style={styles.showTitle}>🃏 SHOWDOWN · {res.mode === "scratch" ? "✂️ Scratch" : "🎴 Draw"}</Text>
          <View style={styles.showCards}>
            {contenders.map((id) => {
              const c = cardById(res.cards[id]);
              return (
                <View key={id} style={styles.showSeat}>
                  {c && (
                    <MiniCard
                      card={c}
                      deck={gs.deck}
                      width={miniW}
                      label={res.crowns ? "Crowns" : statByKey(gs.deck, res.stats[0])?.label ?? ""}
                      value={
                        res.crowns
                          ? "👑".repeat(res.crowns[id] ?? 0) || "–"
                          : formatStat(statByKey(gs.deck, res.stats[0])!, c.stats[res.stats[0]] ?? 0, true)
                      }
                      win={res.winnerIds.includes(id)}
                    />
                  )}
                  <Text style={[styles.showName, res.winnerIds.includes(id) && styles.me]}>{nameOf(id)}</Text>
                </View>
              );
            })}
          </View>
          {/* stat by stat */}
          <View style={styles.showRow}>
            <Text style={styles.showStat}> </Text>
            <View style={styles.showVals}>
              {contenders.map((id) => (
                <Text key={id} style={[styles.showVal, styles.showHead]} numberOfLines={1}>
                  {nameOf(id)}
                </Text>
              ))}
            </View>
          </View>
          {[...res.stats, ...(res.suddenDeath ?? [])].map((k, i) => {
            const st = statByKey(gs.deck, k)!;
            const vals = contenders.map((id) => cardById(res.cards[id])?.stats[k] ?? 0);
            const top = Math.max(...vals);
            const sd = i >= res.stats.length;
            return (
              <View key={k + i} style={[styles.showRow, sd && styles.showRowSd]}>
                <Text style={styles.showStat} numberOfLines={1}>
                  {sd ? "🔥 " : ""}
                  {st.emoji} {st.label}
                </Text>
                <View style={styles.showVals}>
                  {contenders.map((id, j) => (
                    <Text key={id} style={[styles.showVal, vals[j] === top && styles.showValTop]} numberOfLines={1}>
                      {vals[j] === top ? "👑 " : ""}
                      {formatStat(st, vals[j])}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })}
          {res.suddenDeath && res.suddenDeath.length > 0 && (
            <Text style={styles.sdNote}>🔥 Tied, so sudden death decided it</Text>
          )}
          <Text style={styles.winLine}>
            🏆 {res.winnerIds.map(nameOf).join(" & ")} {res.winnerIds.length > 1 ? "split" : res.winnerIds[0] === playerId ? "win" : "wins"}{" "}
            the pot
          </Text>
          {res.pots.length > 1 &&
            res.pots.map((p, i) => (
              <Text key={i} style={styles.potLine}>
                {i === 0 ? "Main pot" : `Side pot ${i}`} 🪙 {p.amount} → {p.winners.map(nameOf).join(" & ")}
              </Text>
            ))}
        </>
      )}
      {(res.gains[playerId] ?? 0) > 0 && <Text style={styles.myGain}>+{res.gains[playerId]} chips for you</Text>}
      {group.hostId === playerId && (
        <TouchableOpacity style={styles.nextBtn} onPress={() => holdemNextHand(group.id, gs.hand)}>
          <Text style={styles.nextText}>
            {gs.hand >= gs.handsTotal ? "🏁 Final results" : "Next hand"} ({secsLeft}s)
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── my card ────────────────────────────────────────────────────────
  const cardW = Math.min(150, screenW * 0.38);
  const myHand = gs.phase !== "showdown" && (
    <View style={styles.handRow}>
      {inHand && myCard ? (
        <View style={[iFolded && styles.dim]}>
          <MiniCard card={myCard} deck={gs.deck} width={cardW} label="YOUR CARD" value={iFolded ? "folded" : "secret"} />
        </View>
      ) : (
        <View style={styles.watchBox}>
          <Text style={styles.watchText}>{(gs.chips[playerId] ?? 0) === 0 ? "💀 Out of chips: watching" : "Watching this hand"}</Text>
        </View>
      )}
      <View style={styles.handSide}>
        {gs.inHand
          .filter((id) => id !== playerId)
          .map((id) => (
            <View key={id} style={[styles.oppCard, gs.folded[id] && styles.dim]}>
              <CardBack width={34} height={48} />
              <Text style={styles.oppName} numberOfLines={1}>
                {nameOf(id)}
              </Text>
            </View>
          ))}
      </View>
    </View>
  );

  // ── betting footer ─────────────────────────────────────────────────
  const legal = myTurn ? legalActions(gs, playerId) : [];
  const callAmt = toCall(gs, playerId);
  const canRaise = legal.includes("raise") || legal.includes("bet");
  const myStack = gs.chips[playerId] ?? 0;
  const minTo = Math.min(minRaiseTo(gs), maxRaiseTo(gs, playerId));
  const maxTo = maxRaiseTo(gs, playerId);
  const pickTo = Math.max(minTo, Math.min(maxTo, raiseTo ?? minTo));
  const potNow = potTotal(gs);
  // "Pot" raise: call, then raise by the pot as it would be after calling.
  const potTo = gs.currentBet + (potNow + toCall(gs, playerId));
  const halfTo = gs.currentBet + Math.floor((potNow + toCall(gs, playerId)) / 2);
  const clampTo = (n: number) => Math.max(minTo, Math.min(maxTo, Math.round(n / 10) * 10 || minTo));
  const raiseWord = gs.currentBet === 0 ? "BET" : "RAISE TO";
  const footer =
    gs.phase === "betting" &&
    (myTurn ? (
      <View style={styles.footer}>
        <Text style={styles.turnLine}>
          YOUR TURN · ⏱ {secsLeft}s · 🪙 {myStack}
        </Text>
        {canRaise && (
          <>
            <View style={styles.amountRow}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setRaiseTo(clampTo(pickTo - BIG_BLIND))}>
                <Text style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.amountText}>
                {pickTo >= maxTo ? `ALL-IN ${pickTo}` : `${raiseWord} ${pickTo}`}
              </Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setRaiseTo(clampTo(pickTo + BIG_BLIND))}>
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.quickRow}>
              {[
                ["Min", minTo],
                ["½ Pot", halfTo],
                ["Pot", potTo],
                ["All-in", maxTo],
              ].map(([label, n]) => (
                <TouchableOpacity
                  key={label as string}
                  style={[styles.quickBtn, pickTo === Math.max(minTo, Math.min(maxTo, n as number)) && styles.quickOn]}
                  onPress={() => setRaiseTo(Math.max(minTo, Math.min(maxTo, n as number)))}
                >
                  <Text style={styles.quickText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.actBtn, styles.foldBtn, busy && styles.dim]}
            disabled={busy}
            onPress={() => send(() => holdemAct(group.id, playerId, gs.seq, "fold"))}
          >
            <Text style={styles.actText}>FOLD</Text>
          </TouchableOpacity>
          {legal.includes("check") ? (
            <TouchableOpacity
              style={[styles.actBtn, busy && styles.dim]}
              disabled={busy}
              onPress={() => send(() => holdemAct(group.id, playerId, gs.seq, "check"))}
            >
              <Text style={styles.actText}>CHECK</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actBtn, busy && styles.dim]}
              disabled={busy}
              onPress={() => send(() => holdemAct(group.id, playerId, gs.seq, "call"))}
            >
              <Text style={styles.actText}>
                {callAmt >= myStack ? `ALL-IN ${callAmt}` : `CALL ${callAmt}`}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actBtn, styles.raiseBtn, (!canRaise || busy) && styles.dim]}
            disabled={!canRaise || busy}
            onPress={() => send(() => holdemAct(group.id, playerId, gs.seq, "raise", pickTo))}
          >
            <Text style={[styles.actText, styles.raiseText]} numberOfLines={1} adjustsFontSizeToFit>
              {!canRaise ? "RAISE" : pickTo >= maxTo ? "ALL-IN" : gs.currentBet === 0 ? "BET" : "RAISE"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    ) : (
      <View style={styles.footer}>
        <Text style={styles.waitLine}>
          {gs.toAct ? `${nameOf(gs.toAct)}'s turn · ⏱ ${secsLeft}s` : "…"}
          {live(gs).length > 0 && inHand && !iFolded && callAmt > 0 ? ` · you'll owe ${callAmt}` : ""}
        </Text>
      </View>
    ));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>
            HAND {gs.hand}
            <Text style={styles.titleOf}> / {gs.handsTotal}</Text>
          </Text>
          <View style={styles.potPill}>
            <Text style={styles.potText}>💰 {pot}</Text>
          </View>
        </View>
        {seats}
        {lastLog && gs.phase === "betting" && (
          <Text style={styles.lastAction}>
            {nameOf(lastLog.pid)} {ACTION_WORD[lastLog.action]}
            {lastLog.amount > 0 ? ` ${lastLog.amount}` : ""}
          </Text>
        )}
        {chooseUi}
        {preflopRow}
        {statsRow}
        {showdownUi}
        {myHand}
      </ScrollView>
      {footer}
    </View>
  );
}

// Strength colour for the "Top X%" pill.
const pctColor = (p: number) => (p >= 85 ? "#2E9E5B" : p >= 60 ? "#7BAF3A" : p >= 35 ? "#B58B1E" : "#B2443A");

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CC.bg },
  content: { padding: 16, paddingTop: 48, paddingBottom: 30, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: CC.gold, fontSize: 22, fontWeight: "900", fontFamily: SERIF, letterSpacing: 2 },
  titleOf: { color: CC.textMuted, fontSize: 15 },
  potPill: { backgroundColor: "#3A2A10", borderRadius: 14, borderWidth: 1.5, borderColor: CC.gold, paddingHorizontal: 12, paddingVertical: 4 },
  potText: { color: CC.gold, fontSize: 17, fontWeight: "900" },
  seats: { gap: 8, paddingVertical: 2 },
  seat: { backgroundColor: CC.panel, borderRadius: 12, borderWidth: 1.5, borderColor: CC.line, paddingVertical: 6, paddingHorizontal: 10, minWidth: 84 },
  seatTurn: { borderColor: CC.gold, borderWidth: 2.5 },
  seatDim: { opacity: 0.45 },
  seatName: { color: CC.text, fontSize: 13, fontWeight: "800" },
  me: { color: CC.gold },
  seatChips: { color: CC.text, fontSize: 13, fontWeight: "700", marginTop: 1 },
  seatState: { color: CC.textMuted, fontSize: 11, fontWeight: "800" },
  lastAction: { color: CC.textMuted, fontSize: 13, fontWeight: "700", textAlign: "center" },
  statsBox: { backgroundColor: CC.panel, borderRadius: 14, borderWidth: 1.5, borderColor: CC.line, padding: 12, gap: 8 },
  streetLabel: { color: CC.gold, fontSize: 13, fontWeight: "900", letterSpacing: 1.5, textAlign: "center" },
  changeLine: { color: CC.text, fontSize: 12, fontWeight: "700", textAlign: "center" },
  statTiles: { flexDirection: "row", gap: 8 },
  statTile: { flex: 1, backgroundColor: CC.parchment, borderRadius: 10, borderWidth: 2, borderColor: CC.goldDeep, padding: 8, alignItems: "center", gap: 3 },
  statTileNew: { borderColor: CC.wild, borderWidth: 3 },
  statTileName: { color: CC.ink, fontSize: 11, fontWeight: "800", textAlign: "center" },
  statTileVal: { color: CC.ink, fontSize: 15, fontWeight: "900", fontFamily: SERIF },
  pctPill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  pctText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  newTag: { color: CC.wild, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  howWin: { color: CC.textMuted, fontSize: 12, textAlign: "center" },
  chooseBox: { backgroundColor: CC.panel, borderRadius: 14, borderWidth: 2, borderColor: CC.gold, padding: 14, gap: 10 },
  chooseTitle: { color: CC.gold, fontSize: 16, fontWeight: "900", textAlign: "center" },
  chooseSub: { color: CC.textMuted, fontSize: 12, textAlign: "center" },
  modeBtn: { backgroundColor: CC.bg, borderRadius: 12, borderWidth: 2, borderColor: CC.gold, padding: 12 },
  modeTitle: { color: CC.gold, fontSize: 18, fontWeight: "900", fontFamily: SERIF },
  modeSub: { color: CC.text, fontSize: 12, marginTop: 2 },
  timerText: { color: CC.textMuted, fontSize: 12, textAlign: "center" },
  showBox: { backgroundColor: CC.panel, borderRadius: 14, borderWidth: 2, borderColor: CC.gold, padding: 12, gap: 8 },
  showTitle: { color: CC.gold, fontSize: 17, fontWeight: "900", textAlign: "center", fontFamily: SERIF },
  showCards: { flexDirection: "row", justifyContent: "center", gap: 16, flexWrap: "wrap" },
  showSeat: { alignItems: "center", gap: 4 },
  showName: { color: CC.text, fontSize: 12, fontWeight: "800" },
  showRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: CC.line, paddingTop: 6 },
  showRowSd: { backgroundColor: "#3A1520", borderRadius: 6 },
  showStat: { color: CC.text, fontSize: 12, fontWeight: "800", width: 110 },
  showVals: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
  showVal: { color: CC.textMuted, fontSize: 12, fontWeight: "700", flex: 1, textAlign: "center" },
  showHead: { color: CC.text, fontWeight: "900", flex: 1, textAlign: "center" },
  showValTop: { color: CC.gold, fontWeight: "900" },
  sdNote: { color: CC.lose, fontSize: 12, fontWeight: "800", textAlign: "center" },
  winLine: { color: CC.win, fontSize: 17, fontWeight: "900", textAlign: "center" },
  potLine: { color: CC.textMuted, fontSize: 12, textAlign: "center" },
  myGain: { color: CC.gold, fontSize: 15, fontWeight: "900", textAlign: "center" },
  nextBtn: { backgroundColor: CC.gold, borderRadius: 14, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  nextText: { color: "#1A0F00", fontSize: 15, fontWeight: "900" },
  handRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  handSide: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8, alignContent: "flex-start" },
  oppCard: { alignItems: "center", width: 56 },
  oppName: { color: CC.textMuted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  watchBox: { backgroundColor: CC.panel, borderRadius: 12, padding: 14 },
  watchText: { color: CC.textMuted, fontSize: 13, fontWeight: "700" },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, backgroundColor: CC.bg, borderTopWidth: 1, borderTopColor: CC.line, gap: 8 },
  turnLine: { color: CC.gold, fontSize: 12, fontWeight: "900", textAlign: "center", letterSpacing: 0.5 },
  waitLine: { color: CC.textMuted, fontSize: 14, fontWeight: "800", textAlign: "center", paddingVertical: 8 },
  btnRow: { flexDirection: "row", gap: 8 },
  actBtn: { flex: 1, backgroundColor: CC.panel, borderRadius: 14, borderWidth: 2, borderColor: CC.line, paddingVertical: 14, alignItems: "center" },
  foldBtn: { borderColor: CC.lose },
  raiseBtn: { backgroundColor: CC.gold, borderColor: CC.goldDeep },
  actText: { color: CC.text, fontSize: 15, fontWeight: "900" },
  raiseText: { color: "#1A0F00" },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBtn: { width: 46, height: 40, borderRadius: 12, backgroundColor: CC.panel, borderWidth: 1.5, borderColor: CC.line, alignItems: "center", justifyContent: "center" },
  stepText: { color: CC.text, fontSize: 22, fontWeight: "900" },
  amountText: { flex: 1, color: CC.gold, fontSize: 20, fontWeight: "900", textAlign: "center", fontFamily: SERIF },
  quickRow: { flexDirection: "row", gap: 6 },
  quickBtn: { flex: 1, backgroundColor: CC.panel, borderRadius: 10, borderWidth: 1.5, borderColor: CC.line, paddingVertical: 7, alignItems: "center" },
  quickOn: { borderColor: CC.gold },
  quickText: { color: CC.text, fontSize: 12, fontWeight: "800" },
  preBox: { backgroundColor: CC.panel, borderRadius: 14, borderWidth: 1.5, borderColor: CC.line, padding: 12, gap: 6 },
  preTitle: { color: CC.gold, fontSize: 13, fontWeight: "900", letterSpacing: 1.5, textAlign: "center" },
  preSub: { color: CC.textMuted, fontSize: 12, textAlign: "center" },
  preRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  preStat: { color: CC.text, fontSize: 13, fontWeight: "700", flex: 1 },
  dim: { opacity: 0.4 },
});
