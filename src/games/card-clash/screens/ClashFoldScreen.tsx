// 🏳️ After a fold: the decider (the caller with 2 players, or the main
// clash's winner) takes the folded card or calls the bluff. Bluff called:
// the folder picks a stat blind (their next card stays face-down) and the
// decider's card meets the folder's next card. Then the result: who won,
// and what the folded card really was.
import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Vibration, useWindowDimensions } from "react-native";
import type { ClashGameState, Group } from "../../../shared/types";
import { cardById, statByKey } from "../data/decks";
import { formatStat } from "../data/types";
import { CALL_MS, FOLD_DECIDE_MS, FOLD_RESULT_MS, canCallBluff, decideFold, foldPick, openStats } from "../logic/game";
import ClashCardView, { MiniCard } from "../components/ClashCardView";
import FlipCard from "../components/FlipCard";
import PileBar from "../components/PileBar";
import { CC, SERIF } from "../theme";

type Props = { group: Group; gs: ClashGameState; playerId: string };

const AUTO_SEND_EARLY_MS = 1500;

export default function ClashFoldScreen({ group, gs, playerId }: Props) {
  const f = gs.fold!;
  const { width: screenW } = useWindowDimensions();
  const nameOf = (id: string) =>
    id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone";
  const isDecider = f.deciderId === playerId;
  const isFolder = f.folderId === playerId;
  const deciderCard = cardById(f.deciderCard ?? "");
  const foldedCard = cardById(f.card);

  const seen = useRef(Date.now());
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 200);
    if ((gs.phase === "fold-decide" && isDecider) || (gs.phase === "fold-pick" && isFolder)) {
      Vibration.vibrate([0, 120, 60, 120]);
    }
    return () => clearInterval(t);
  }, []);
  const elapsed = Date.now() - seen.current;
  const limit = gs.phase === "fold-decide" ? FOLD_DECIDE_MS : gs.phase === "fold-pick" ? CALL_MS : FOLD_RESULT_MS;
  const secsLeft = Math.max(0, Math.ceil((limit - elapsed) / 1000));

  const decide = async (choice: "accept" | "bluff") => {
    if (busy) return;
    setBusy(true);
    Vibration.vibrate(50);
    try {
      await decideFold(group.id, playerId, gs.round, choice);
    } finally {
      setBusy(false);
    }
  };
  const sendPick = async () => {
    if (!picked || busy) return;
    setBusy(true);
    Vibration.vibrate(50);
    try {
      const res = await foldPick(group.id, playerId, gs.round, { statKey: picked });
      if (!res.success) setPicked(null);
    } finally {
      setBusy(false);
    }
  };
  // Out of time with a stat picked: send it rather than a random one.
  useEffect(() => {
    if (gs.phase === "fold-pick" && isFolder && picked && !busy && elapsed >= CALL_MS - AUTO_SEND_EARLY_MS) sendPick();
  });

  const cardW = Math.min(380, screenW - 32);
  const miniW = Math.min(150, (screenW - 32 - 40) / 2);

  // ── The result ────────────────────────────────────────────────────
  if (gs.phase === "fold-result" && f.result) {
    const res = f.result;
    const stat = f.statKey ? statByKey(gs.deck, f.statKey) : undefined;
    const next = cardById(res.folderNext);
    const flipped = elapsed > 900;
    const decided = elapsed > 1700;
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <PileBar group={group} gs={gs} playerId={playerId} />
          <View style={styles.titleBox}>
            <Text style={styles.title}>🏳️ THE FOLD</Text>
          </View>
          {f.accepted ? (
            <Text style={styles.big}>
              {isDecider ? "You took" : `${nameOf(f.deciderId!)} took`} {isFolder ? "your" : `${nameOf(f.folderId)}'s`} folded card
            </Text>
          ) : (
            <>
              <Text style={styles.sub}>
                Bluff called · {nameOf(f.folderId)} picked {stat?.emoji} {stat?.label.toUpperCase()}
                {f.auto ? " (out of time)" : ""}
              </Text>
              <View style={styles.faceoff}>
                {deciderCard && stat && (
                  <View style={styles.side}>
                    <MiniCard
                      card={deciderCard}
                      deck={gs.deck}
                      width={miniW}
                      gold={!!gs.gold?.[deciderCard.id]}
                      label={stat.label}
                      value={formatStat(stat, res.values[f.deciderId!] ?? 0, true)}
                      win={decided && res.winnerId === f.deciderId}
                    />
                    <Text style={styles.owner}>{nameOf(f.deciderId!)}</Text>
                  </View>
                )}
                <Text style={styles.vs}>VS</Text>
                {next && stat && (
                  <View style={styles.side}>
                    <FlipCard
                      flipped={flipped}
                      gold={!!gs.gold?.[next.id]}
                      front={
                        <MiniCard
                          card={next}
                          deck={gs.deck}
                          width={miniW}
                          gold={!!gs.gold?.[next.id]}
                          label={stat.label}
                          value={formatStat(stat, res.values[f.folderId] ?? 0, true)}
                          win={decided && res.winnerId === f.folderId}
                        />
                      }
                    />
                    <Text style={styles.owner}>{nameOf(f.folderId)}</Text>
                  </View>
                )}
              </View>
              {decided && (
                <Text style={[styles.big, { color: res.winnerId === playerId ? CC.win : CC.gold }]}>
                  🏆 {res.winnerId === playerId ? "You win" : `${nameOf(res.winnerId)} wins`}
                  {res.winnerId === f.folderId
                    ? ` · takes ${f.deciderId === playerId ? "your" : `${nameOf(f.deciderId!)}'s`} card`
                    : ` · takes both of ${isFolder ? "your" : `${nameOf(f.folderId)}'s`} cards`}
                  {res.tied ? " (tie broken)" : ""}
                </Text>
              )}
            </>
          )}
          {(f.accepted || decided) && foldedCard && (
            <View style={styles.revealBox}>
              <Text style={styles.revealLabel}>THE FOLDED CARD WAS</Text>
              {(() => {
                // Its number on the stat that was called when they folded.
                const callStat = gs.last?.round === gs.round ? statByKey(gs.deck, gs.last.statKey) : undefined;
                return (
                  <MiniCard
                    card={foldedCard}
                    deck={gs.deck}
                    width={miniW}
                    label={callStat ? `${callStat.label} (the call)` : ""}
                    value={callStat ? formatStat(callStat, foldedCard.stats[callStat.key] ?? 0, true) : "—"}
                  />
                );
              })()}
            </View>
          )}
          {decided &&
            (res.out ?? []).map((id) => (
              <Text key={id} style={styles.outText}>
                💀 {nameOf(id)} {id === playerId ? "are" : "is"} out of cards
              </Text>
            ))}
        </ScrollView>
      </View>
    );
  }

  // ── The decision / the blind pick ────────────────────────────────
  const picking = gs.phase === "fold-pick";
  const open = openStats(gs);
  const bluffOk = canCallBluff(gs);
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.round}>CLASH {gs.round}</Text>
          <View style={[styles.timerPill, secsLeft <= 5 && styles.timerUrgent]}>
            <Text style={styles.timer}>⏱ {secsLeft}s</Text>
          </View>
        </View>
        <PileBar group={group} gs={gs} playerId={playerId} />
        <View style={styles.titleBox}>
          <Text style={styles.title}>🏳️ {isFolder ? "YOU FOLDED" : `${nameOf(f.folderId).toUpperCase()} FOLDED`}</Text>
        </View>

        {!picking && isDecider && (
          <>
            <Text style={styles.sub}>
              Take {nameOf(f.folderId)}'s folded card, or call the bluff: {nameOf(f.folderId)} picks a NEW stat and their
              next card takes on your {deciderCard?.name}. Win and you get both their cards; lose and they take yours.
            </Text>
            {deciderCard && <ClashCardView card={deciderCard} deck={gs.deck} width={cardW} gold={!!gs.gold?.[deciderCard.id]} usedKeys={gs.scratched ? Object.keys(gs.scratched).filter((k) => gs.scratched?.[k]) : []} usedLabel="called" />}
          </>
        )}
        {!picking && !isDecider && (
          <Text style={styles.sub}>
            {nameOf(f.deciderId!)} {f.deciderId === playerId ? "are" : "is"} deciding: take the folded card, or call the bluff…
          </Text>
        )}

        {picking && isFolder && (
          <>
            <Text style={styles.sub}>
              🃏 Bluff called! Pick a stat for your NEXT card (still face-down) against {nameOf(f.deciderId!)}'s{" "}
              {deciderCard?.name}.
            </Text>
            <View style={styles.statGrid}>
              {open.map((k) => {
                const st = statByKey(gs.deck, k);
                const on = picked === k;
                return (
                  <TouchableOpacity key={k} style={[styles.statBtn, on && styles.statBtnOn]} onPress={() => setPicked(on ? null : k)}>
                    <Text style={[styles.statBtnText, on && styles.statBtnTextOn]}>
                      {st?.emoji} {st?.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
        {picking && !isFolder && (
          <Text style={styles.sub}>
            🃏 {nameOf(f.deciderId!)} called the bluff! {nameOf(f.folderId)} {isFolder ? "are" : "is"} picking a stat for their next card…
          </Text>
        )}
      </ScrollView>

      {!picking && isDecider && (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.acceptBtn, busy && styles.dim]} onPress={() => decide("accept")} disabled={busy}>
            <Text style={styles.acceptText}>✅ TAKE THE CARD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bluffBtn, (busy || !bluffOk) && styles.dim]}
            onPress={() => decide("bluff")}
            disabled={busy || !bluffOk}
          >
            <Text style={styles.bluffText}>{bluffOk ? "🃏 CALL THE BLUFF" : "🃏 No stats left to call it"}</Text>
          </TouchableOpacity>
        </View>
      )}
      {picking && isFolder && (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.acceptBtn, (!picked || busy) && styles.dim]} onPress={sendPick} disabled={!picked || busy}>
            <Text style={styles.acceptText}>{picked ? "⚔️ CLASH!" : "Pick a stat first"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CC.bg },
  content: { padding: 16, paddingTop: 48, paddingBottom: 40, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  round: { color: CC.gold, fontSize: 22, fontWeight: "900", fontFamily: SERIF, letterSpacing: 2 },
  timerPill: { backgroundColor: CC.panel, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  timerUrgent: { backgroundColor: CC.lose },
  timer: { color: CC.text, fontSize: 16, fontWeight: "900" },
  titleBox: { backgroundColor: CC.panel, borderRadius: 14, borderWidth: 2, borderColor: CC.textMuted, paddingVertical: 12, alignItems: "center" },
  title: { color: CC.text, fontSize: 24, fontWeight: "900", fontFamily: SERIF, letterSpacing: 2 },
  sub: { color: CC.text, fontSize: 14, fontWeight: "700", textAlign: "center", lineHeight: 20 },
  big: { color: CC.gold, fontSize: 18, fontWeight: "900", textAlign: "center", fontFamily: SERIF },
  faceoff: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  side: { alignItems: "center", gap: 4 },
  owner: { color: CC.textMuted, fontSize: 12, fontWeight: "800" },
  vs: { color: CC.gold, fontSize: 22, fontWeight: "900", fontFamily: SERIF },
  revealBox: { alignItems: "center", gap: 6, marginTop: 4 },
  revealLabel: { color: CC.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  outText: { color: CC.lose, fontSize: 14, fontWeight: "700", textAlign: "center" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  statBtn: { backgroundColor: CC.parchment, borderRadius: 10, borderWidth: 2, borderColor: CC.goldDeep, paddingVertical: 10, paddingHorizontal: 12 },
  statBtnOn: { backgroundColor: CC.gold },
  statBtnText: { color: CC.ink, fontSize: 14, fontWeight: "800", fontFamily: SERIF },
  statBtnTextOn: { fontWeight: "900" },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, gap: 8, backgroundColor: CC.bg, borderTopWidth: 1, borderTopColor: CC.line },
  acceptBtn: { backgroundColor: CC.gold, borderRadius: 16, borderWidth: 3, borderColor: CC.goldDeep, paddingVertical: 15, alignItems: "center" },
  acceptText: { color: "#1A0F00", fontSize: 18, fontWeight: "900", fontFamily: SERIF, letterSpacing: 1.5 },
  bluffBtn: { backgroundColor: CC.panel, borderRadius: 16, borderWidth: 2, borderColor: CC.wild, paddingVertical: 14, alignItems: "center" },
  bluffText: { color: CC.wild, fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  dim: { opacity: 0.4 },
});
