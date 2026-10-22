// 🔨 The Auction Bomb, on the play screen. The holder gets one Pass button;
// once tapped, every other living player can MATCH the top bid or RAISE it.
// Lowest bid gets the bomb (a tie: the bomb rolls the die), everyone pays
// their bid, the holder takes the pot.
import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Vibration, Modal } from "react-native";
import { Group, BombGameState, AuctionRecord } from "../../../../shared/types";
import {
  startAuction,
  placeBid,
  bidInfo,
  cantMove,
  highestBid,
  auctionPot,
  BidKind,
  AUCTION_ROLL_MS,
} from "../../logic/timer/bombAuction";

type Props = {
  group: Group;
  playerId: string;
  readHoldMs: () => number;
};

const SOLD_SHOW_MS = 3500;
const ROLL_SPIN_MS = AUCTION_ROLL_MS - 1000; // names flicker, then the answer

const joinNames = (names: string[]) =>
  names.length <= 1
    ? names[0] ?? ""
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export default function BombAuctionPanel({ group, playerId, readHoldMs }: Props) {
  const gameState = group.gameState as BombGameState;
  const auction = gameState.auction;
  const isHolder = gameState.currentHolderId === playerId;
  const isGhost = gameState.ghosts.includes(playerId);
  const fpOf = (id: string) => Math.floor(gameState.fusePoints?.[id] ?? 0);
  const myFp = fpOf(playerId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const nameOf = (id: string) =>
    id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone";

  // Countdown from when THIS phone saw the auction open (phone clocks may
  // disagree). Bidders feel a buzz when it opens.
  const seenAt = useRef<{ id: string; at: number } | null>(null);
  if (auction && seenAt.current?.id !== auction.id) {
    seenAt.current = { id: auction.id, at: Date.now() };
  }
  useEffect(() => {
    if (auction && auction.bids[playerId] !== undefined && !isGhost) {
      Vibration.vibrate([0, 150, 80, 150]);
    }
  }, [auction?.id]);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!auction) return;
    const t = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [auction?.id]);
  const msLeft =
    auction && seenAt.current
      ? Math.max(0, seenAt.current.at + auction.durationMs - Date.now())
      : 0;

  // After each sale: the 🎲 roll (a tie) or a "SOLD!" banner.
  const log = gameState.auctionLog ?? [];
  const last: AuctionRecord | undefined = log[log.length - 1];
  const [shown, setShown] = useState<{ rec: AuctionRecord; at: number } | null>(null);
  const logLen = useRef(log.length);
  useEffect(() => {
    if (log.length > logLen.current && last) {
      setShown({ rec: last, at: Date.now() });
      const total = (last.tied ? AUCTION_ROLL_MS : 0) + SOLD_SHOW_MS;
      const t = setTimeout(() => setShown(null), total);
      logLen.current = log.length;
      return () => clearTimeout(t);
    }
    logLen.current = log.length;
  }, [log.length]);

  // The flickering name while the bomb "chooses".
  const [spinIdx, setSpinIdx] = useState(0);
  const rolling = !!shown?.rec.tied && Date.now() - shown.at < AUCTION_ROLL_MS;
  const spinning = rolling && Date.now() - shown!.at < ROLL_SPIN_MS;
  useEffect(() => {
    if (!shown?.rec.tied) return;
    const t = setInterval(() => setSpinIdx((n) => n + 1), 110);
    const stop = setTimeout(() => clearInterval(t), AUCTION_ROLL_MS + 50);
    if (shown.rec.loserId === playerId) {
      setTimeout(() => Vibration.vibrate([0, 200, 80, 200]), ROLL_SPIN_MS);
    }
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [shown?.at]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 1800);
  };

  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await startAuction(group, playerId, readHoldMs());
      if (!res.success && res.reason === "paused") flash("Wait for the bomb to finish choosing…");
      else if (!res.success && res.reason !== "running") flash("Couldn't start the auction, try again");
    } finally {
      setBusy(false);
    }
  };

  const handleBid = async (kind: BidKind) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await placeBid(group, playerId, kind);
      if (res.success) Vibration.vibrate(30);
      else if (res.reason === "cant-afford") flash(`Not enough FP for ${res.bid}`);
    } finally {
      setBusy(false);
    }
  };

  // ── 🎲 The tie roll (full screen) ───────────────────────────────
  const rollModal = shown?.rec.tied ? (
    <Modal visible={rolling} transparent animationType="fade">
      <View style={styles.rollOverlay}>
        <View style={styles.rollCard}>
          <Text style={styles.rollDice}>🎲</Text>
          <Text style={styles.rollText}>
            {joinNames(shown.rec.tied.map(nameOf))} all bid{" "}
            {shown.rec.bids[shown.rec.tied[0]]} FP…
          </Text>
          <Text style={styles.rollSub}>The bomb is choosing…</Text>
          <Text style={[styles.rollName, !spinning && styles.rollNameFinal]}>
            {spinning
              ? nameOf(shown.rec.tied[spinIdx % shown.rec.tied.length])
              : `💣 It went to ${nameOf(shown.rec.loserId)}!`}
          </Text>
        </View>
      </View>
    </Modal>
  ) : null;

  const sold =
    !auction && shown && !rolling ? (
      <View style={styles.soldBox}>
        <Text style={styles.soldTitle}>🔨 SOLD!</Text>
        <Text style={styles.soldText}>
          {nameOf(shown.rec.loserId)} got the bomb (bid {shown.rec.bids[shown.rec.loserId]} FP)
          {shown.rec.tied ? " after the roll" : ""} · {nameOf(shown.rec.holderId)} pocketed{" "}
          {shown.rec.pot} FP
        </Text>
      </View>
    ) : null;

  // ── No auction running ──────────────────────────────────────────
  if (!auction) {
    return (
      <View style={styles.wrap}>
        {rollModal}
        {sold}
        {isHolder && !isGhost ? (
          <TouchableOpacity
            style={[styles.passBtn, (busy || rolling) && styles.dim]}
            onPress={handleStart}
            disabled={busy || rolling}
            activeOpacity={0.7}
          >
            <Text style={styles.passBtnText}>🔨 PASS</Text>
            <Text style={styles.passBtnSub}>
              Everyone else bids · lowest bid gets the bomb · you keep the pot
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              🔨 {nameOf(gameState.currentHolderId)} {isHolder ? "have" : "has"} the Auction Bomb.
              {!isGhost
                ? ` When they pass, match or raise the top bid. Lowest bid gets it. You have ${myFp} FP.`
                : ""}
            </Text>
          </View>
        )}
        {msg && <Text style={styles.msg}>{msg}</Text>}
      </View>
    );
  }

  // ── Auction running ─────────────────────────────────────────────
  const bids = auction.bids;
  const entries = Object.entries(bids).sort((a, b) => b[1] - a[1]);
  const top = highestBid(bids);
  const low = Math.min(...Object.values(bids));
  const lowCount = Object.values(bids).filter((b) => b === low).length;
  const pot = auctionPot(auction); // FP already collected
  const amBidding = bids[playerId] !== undefined && !isGhost;
  const match = amBidding ? bidInfo(auction, playerId, myFp, "match") : null;
  const raise = amBidding ? bidInfo(auction, playerId, myFp, "raise") : null;
  const closed = msLeft <= 0;

  return (
    <View style={styles.wrap}>
      {rollModal}
      <View style={styles.auctionBox}>
        <View style={styles.auctionHeader}>
          <Text style={styles.auctionTitle}>
            🔨 {isHolder ? "YOUR AUCTION" : `${nameOf(auction.holderId).toUpperCase()}'S AUCTION`}
          </Text>
          <Text style={[styles.countdown, msLeft < 2500 && styles.countdownUrgent]}>
            {closed ? "…" : `${(msLeft / 1000).toFixed(1)}s`}
          </Text>
        </View>
        {auction.first && (
          <Text style={styles.hint}>Match or raise · lowest bid gets the bomb</Text>
        )}
        <Text style={styles.potLine}>
          Pot: <Text style={styles.potNum}>{pot} FP</Text>
          {isHolder ? " → yours" : ` → ${nameOf(auction.holderId)}`}
        </Text>

        {entries.map(([id, bid]) => {
          const stuck = cantMove(auction, id, fpOf(id));
          return (
            <View key={id} style={[styles.bidRow, id === playerId && styles.bidRowMe]}>
              <Text style={styles.bidName} numberOfLines={1}>
                {bid === low ? (lowCount > 1 ? "🎲 " : "💣 ") : bid === top ? "🛡️ " : "   "}
                {nameOf(id)}
                <Text style={styles.bidFp}>
                  {"  "}
                  {fpOf(id)} FP{stuck ? " 🚫" : ""}
                </Text>
              </Text>
              <Text style={[styles.bidAmt, bid === low && styles.bidAmtLow]}>{bid} FP</Text>
            </View>
          );
        })}

        {amBidding && match && raise && (
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.matchBtn, (!match.ok || closed || busy) && styles.dim]}
              onPress={() => handleBid("match")}
              disabled={!match.ok || closed || busy}
              activeOpacity={0.7}
            >
              <Text style={styles.matchBtnText}>
                {!match.ok && match.reason === "already-matched" ? "✓ Matched" : `🤝 Match ${match.bid}`}
              </Text>
              <Text style={styles.btnCost}>
                {!match.ok && match.reason === "already-matched" ? " " : `+${match.cost} FP`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.raiseBtn, (!raise.ok || closed || busy) && styles.dim]}
              onPress={() => handleBid("raise")}
              disabled={!raise.ok || closed || busy}
              activeOpacity={0.7}
            >
              <Text style={styles.raiseBtnText}>
                {!raise.ok && raise.reason === "already-top" ? "🛡️ Top bid" : `⬆️ Raise to ${raise.bid}`}
              </Text>
              <Text style={[styles.btnCost, styles.btnCostDark]}>
                {!raise.ok && raise.reason === "already-top" ? " " : `+${raise.cost} FP`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {amBidding && cantMove(auction, playerId, myFp) && (
          <Text style={styles.msg}>You can't afford to match ({myFp} FP)</Text>
        )}
        {closed && <Text style={styles.holderNote}>Bidding closed…</Text>}
        {isHolder && !closed && (
          <Text style={styles.holderNote}>
            The fuse is still burning… the lowest bid takes the bomb.
          </Text>
        )}
        {msg && <Text style={styles.msg}>{msg}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  dim: { opacity: 0.45 },
  passBtn: {
    backgroundColor: "#E63946",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FF8A8A",
  },
  passBtnText: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: 2 },
  passBtnSub: { color: "#FFD6D6", fontSize: 11, marginTop: 4, textAlign: "center", paddingHorizontal: 10 },
  infoBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  infoText: { color: "#ccc", fontSize: 13, textAlign: "center", lineHeight: 18 },
  auctionBox: {
    backgroundColor: "#1E1A0A",
    borderWidth: 2,
    borderColor: "#FFD700",
    borderRadius: 16,
    padding: 12,
  },
  auctionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  auctionTitle: { color: "#FFD700", fontSize: 14, fontWeight: "900", letterSpacing: 1, flex: 1 },
  countdown: { color: "#fff", fontSize: 22, fontWeight: "900" },
  countdownUrgent: { color: "#E63946" },
  hint: {
    color: "#000",
    backgroundColor: "#FFD700",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    borderRadius: 8,
    paddingVertical: 3,
    marginTop: 6,
    overflow: "hidden",
  },
  potLine: { color: "#ddd", fontSize: 13, marginVertical: 6 },
  potNum: { color: "#FFD700", fontWeight: "900", fontSize: 16 },
  bidRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  bidRowMe: { backgroundColor: "#2A2306" },
  bidName: { color: "#fff", fontSize: 14, flex: 1 },
  bidFp: { color: "#888", fontSize: 11 },
  bidAmt: { color: "#4CAF50", fontSize: 14, fontWeight: "800" },
  bidAmtLow: { color: "#E63946" },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  matchBtn: {
    flex: 1,
    backgroundColor: "#2E2E2E",
    borderWidth: 2,
    borderColor: "#FFD700",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  matchBtnText: { color: "#FFD700", fontSize: 16, fontWeight: "900" },
  raiseBtn: {
    flex: 1,
    backgroundColor: "#FFD700",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  raiseBtnText: { color: "#000", fontSize: 16, fontWeight: "900" },
  btnCost: { color: "#C9B46A", fontSize: 11, fontWeight: "700", marginTop: 2 },
  btnCostDark: { color: "#5A4A10" },
  holderNote: { color: "#C9B46A", fontSize: 11, textAlign: "center", marginTop: 8 },
  msg: { color: "#FF8A8A", fontSize: 12, textAlign: "center", marginTop: 6 },
  soldBox: {
    backgroundColor: "#0A1E0A",
    borderWidth: 1,
    borderColor: "#4CAF50",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  soldTitle: { color: "#4CAF50", fontSize: 15, fontWeight: "900", textAlign: "center" },
  soldText: { color: "#ddd", fontSize: 12, textAlign: "center", marginTop: 2 },
  rollOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    padding: 24,
  },
  rollCard: {
    backgroundColor: "#1E1A0A",
    borderWidth: 2,
    borderColor: "#FFD700",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  rollDice: { fontSize: 64 },
  rollText: { color: "#fff", fontSize: 17, fontWeight: "800", textAlign: "center", marginTop: 8 },
  rollSub: { color: "#C9B46A", fontSize: 13, marginTop: 4 },
  rollName: { color: "#FFD700", fontSize: 28, fontWeight: "900", marginTop: 18, textAlign: "center" },
  rollNameFinal: { color: "#E63946" },
});
