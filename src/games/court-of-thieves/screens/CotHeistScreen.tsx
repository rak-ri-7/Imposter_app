// 🔦 The blackout. What each phone shows:
//   everyone       a dark room ("Power's out!"), ⚡ flashes show a shadow
//   the Thief      night vision: tap a bag to sneak there (walk or tiptoe),
//                  set an amount with − / +, take it or put it in, get home.
//                  The last 3 s the bulb flickers: get out.
//   the witness(es) 3 s early: the room in colour, the glove and footprints live
// No vibration anywhere in here: a buzz would give the Thief away.
import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable, useWindowDimensions } from "react-native";
import type { CotGameState, CotSpot, Group } from "../../../shared/types";
import {
  AMOUNT_STEP,
  EARLY_MS,
  FLASH_MS,
  moveMs,
  simulate,
  thiefAt,
  total,
  transferMs,
  type HeistInput,
} from "../logic/engine";
import { cotHeistAct } from "../logic/game";
import Room, { type RoomLook } from "../components/Room";
import { CT, rupees, seatColor } from "../theme";
import { useServerNow } from "../../../shared/hooks/useServerNow";
import { padBottom, useBottomInset } from "../../../shared/hooks/useSafeBottom";

type Props = { group: Group; gs: CotGameState; playerId: string };

// − / + that repeat while held.
function StepButton({ label, onStep, disabled, color }: { label: string; onStep: () => void; disabled?: boolean; color: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    stepRef.current();
    const loop = (delay: number) => {
      timer.current = setTimeout(() => {
        stepRef.current();
        loop(Math.max(60, delay * 0.8));
      }, delay);
    };
    loop(350);
  };
  useEffect(() => stop, []);
  return (
    <Pressable
      accessibilityLabel={label === "−" ? "Less" : "More"}
      onPressIn={disabled ? undefined : start}
      onPressOut={stop}
      style={[styles.stepBtn, { borderColor: color }, disabled && styles.dim]}
    >
      <Text style={[styles.stepText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export default function CotHeistScreen({ group, gs, playerId }: Props) {
  const { width } = useWindowDimensions();
  const now = useServerNow(80);
  const size = Math.min(width, 430);
  const isThief = gs.roles[playerId] === "thief";
  const isWitness = (gs.witnessIds ?? []).includes(playerId);
  const outageAt = gs.outageAt ?? 0;
  const lightsAt = gs.lightsAt ?? 0;
  const nameOf = (id: string) => (id === playerId ? "You" : group.players.find((p) => p.id === id)?.name ?? "Someone");
  const bottomInset = useBottomInset(); // clear of the phone's bottom bar

  // ── Before the dark ──
  if (now < outageAt) {
    const n = Math.max(1, Math.ceil((outageAt - now) / 1000));
    return (
      <View style={[styles.center, { backgroundColor: CT.bg }]}>
        <Text style={styles.bigEmoji}>💡</Text>
        <Text style={styles.title}>Lights out in {n}…</Text>
        <Text style={styles.subtle}>Hold your phone close.</Text>
      </View>
    );
  }
  // ── The lights are back: waiting for the result to land ──
  if (now >= lightsAt) {
    return (
      <View style={[styles.center, { backgroundColor: CT.lit }]}>
        <Text style={styles.bigEmoji}>💡</Text>
        <Text style={[styles.title, { color: CT.litText }]}>Lights on!</Text>
      </View>
    );
  }
  if (isThief) return <ThiefView group={group} gs={gs} playerId={playerId} now={now} size={size} nameOf={nameOf} />;

  const early = isWitness && now >= lightsAt - EARLY_MS;
  if (early) {
    const secs = Math.max(1, Math.ceil((lightsAt - now) / 1000));
    return (
      <View style={[styles.fill, { backgroundColor: "#211C3D" }, padBottom(styles.fill, bottomInset)]}>
        <View style={styles.witnessBar}>
          <View style={styles.witnessPill}>
            <Text style={styles.witnessPillText}>👀 Your lights are back early!</Text>
          </View>
          <View style={styles.witnessCount}>
            <Text style={styles.witnessCountText}>{secs}s</Text>
          </View>
        </View>
        <View style={styles.roomWrap}>
          <Room gs={gs} group={group} playerId={playerId} size={size} look="witness" now={now} />
        </View>
        <View style={styles.witnessCard}>
          <Text style={styles.witnessTitle}>You're watching the heist</Text>
          <Text style={styles.witnessBody}>
            Notice the glove's colour and which bags its footprints visit. Everyone's lights come back in {secs}.
          </Text>
          <Text style={styles.witnessWarn}>⚠️ Keep a straight face!</Text>
        </View>
      </View>
    );
  }

  const flashAt = (gs.flashes ?? []).find((f) => now >= f && now < f + FLASH_MS);
  const flashing = flashAt !== undefined;
  const look: RoomLook = flashing ? "flash" : "dark";
  const bright = flashing && now - (flashAt ?? 0) < 120;
  return (
    <View style={[styles.fill, { backgroundColor: bright ? "#D9DEFF" : CT.bgDeep }, padBottom(styles.fill, bottomInset)]}>
      <View style={styles.darkTop}>
        <Text style={styles.darkTopText}>🔌 No power</Text>
      </View>
      <View style={styles.roomWrap}>
        <Room gs={gs} group={group} playerId={playerId} size={size} look={look} now={now} />
      </View>
      <View style={styles.darkInfo}>
        <Text style={styles.bolt}>⚡</Text>
        <Text style={styles.darkTitle}>Power's out!</Text>
        <Text style={styles.darkBody}>Sit tight and keep your eyes on the screen. Lightning might show you a shadow.</Text>
        <View style={styles.darkPill}>
          <Text style={styles.darkPillText}>Lights return any moment…</Text>
        </View>
      </View>
    </View>
  );
}

// ── The Thief's night vision ─────────────────────────────────────────
function ThiefView({
  group,
  gs,
  playerId,
  now,
  size,
  nameOf,
}: {
  group: Group;
  gs: CotGameState;
  playerId: string;
  now: number;
  size: number;
  nameOf: (id: string) => string;
}) {
  const [mode, setMode] = useState<"walk" | "tiptoe">("walk");
  const [amount, setAmount] = useState(500);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lightsAt = gs.lightsAt ?? 0;
  const view = thiefAt(gs, now);
  const sim = simulate(gs, gs.heist ?? [], now);
  const busy = !!view.move || !!view.work || pending;
  const atBag = !view.move && view.spot !== "home" ? view.spot : null;
  const warning = now >= lightsAt - EARLY_MS;
  const warnSecs = Math.max(1, Math.ceil((lightsAt - now) / 1000));
  const flicker = warning && Math.floor(now / 140) % 4 === 0;
  const myColor = seatColor(gs.seats, playerId);
  const bagAmounts = Object.fromEntries(gs.seats.map((id) => [id, total(sim.purse[id])]));
  const glove = total(sim.glove);
  const ownPurse = total(sim.purse[playerId]);
  const bagHas = atBag ? bagAmounts[atBag] ?? 0 : 0;
  const maxAmount = Math.max(AMOUNT_STEP, Math.max(bagHas, glove + ownPurse));

  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(null), 2200);
    return () => clearTimeout(t);
  }, [err]);

  const act = async (input: HeistInput) => {
    if (busy) return setErr("Still busy…");
    setPending(true);
    try {
      const r = await cotHeistAct(group.id, playerId, input);
      if (!r.success && r.reason && r.reason !== "stale") setErr(r.reason);
    } finally {
      setPending(false);
    }
  };

  const goTo = (spot: CotSpot) => {
    if (spot === (view.move ? null : view.spot)) return;
    act({ k: "move", to: spot, mode });
  };

  // What the bottom panel says.
  let status: string;
  if (view.move) {
    const dest = view.move.to === "home" ? "your seat" : `${nameOf(view.move.to)}'s bag`;
    status = `${view.move.mode === "tiptoe" ? "🤫 Tiptoeing" : "👣 Walking"} to ${dest}…`;
  } else if (view.work) {
    status = `${view.work.k === "take" ? "Taking" : "Putting in"} ${rupees(view.work.amount)}… ${Math.round(view.work.p * 100)}%`;
  } else if (atBag) status = `${nameOf(atBag)}'s bag`;
  else status = "Tap a bag to sneak over";
  const progress = view.move?.p ?? view.work?.p ?? null;
  const bottomInset = useBottomInset(); // clear of the phone's bottom bar

  return (
    <View style={[styles.fill, { backgroundColor: CT.nv }, padBottom(styles.fill, bottomInset)]}>
      {warning ? (
        <View style={[styles.warnBar, { opacity: flicker ? 0.25 : 1 }]}>
          <Text style={styles.warnText}>💡 The power is flickering back! {warnSecs}</Text>
        </View>
      ) : (
        <View style={styles.thiefBar}>
          <View style={[styles.thiefPill, { backgroundColor: myColor }]}>
            <Text style={styles.thiefPillText}>🧤 You're the Thief</Text>
          </View>
          <Text style={styles.thiefHint}>Lights back: any moment</Text>
        </View>
      )}
      <View style={styles.roomWrap}>
        <Room
          gs={gs}
          group={group}
          playerId={playerId}
          size={size}
          look="thief"
          now={now}
          bagAmounts={bagAmounts}
          highlight={view.move && view.move.to !== "home" ? view.move.to : view.work?.bag ?? atBag ?? undefined}
          onPressSpot={goTo}
        />
      </View>

      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {status}
          </Text>
          {atBag && !busy && <Text style={styles.sheetSide}>{rupees(bagHas)} inside</Text>}
        </View>
        {progress !== null && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        )}

        {atBag && !view.work && (
          <>
            <View style={styles.amountRow}>
              <StepButton label="−" color={CT.gold} disabled={amount <= AMOUNT_STEP} onStep={() => setAmount((a) => Math.max(AMOUNT_STEP, a - AMOUNT_STEP))} />
              <View style={styles.amountMid}>
                <Text style={styles.amountText}>{rupees(amount)}</Text>
                <Text style={styles.amountSub}>{(transferMs(amount) / 1000).toFixed(1)} s to move</Text>
              </View>
              <StepButton label="+" color={CT.gold} disabled={amount >= maxAmount} onStep={() => setAmount((a) => Math.min(maxAmount, a + AMOUNT_STEP))} />
            </View>
            <View style={styles.twoBtns}>
              <TouchableOpacity
                style={[styles.mainBtn, (busy || amount > bagHas) && styles.dim]}
                disabled={busy || amount > bagHas}
                onPress={() => act({ k: "take", amount })}
              >
                <Text style={styles.mainBtnText}>Take {rupees(amount)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ghostBtn, (busy || amount > glove + ownPurse) && styles.dim]}
                disabled={busy || amount > glove + ownPurse}
                onPress={() => act({ k: "plant", amount })}
              >
                <Text style={styles.ghostBtnText}>Put in {rupees(amount)}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.infoText}>🧤 Glove: {rupees(glove)}</Text>
          <Text style={styles.infoText}>👛 Your purse: {rupees(ownPurse)}</Text>
        </View>

        {atBag && !busy ? (
          <View style={styles.twoBtns}>
            <TouchableOpacity style={styles.homeBtn} onPress={() => act({ k: "move", to: "home", mode: "tiptoe" })}>
              <Text style={styles.homeBtnTitle}>Tiptoe home</Text>
              <Text style={styles.homeBtnSub}>{(moveMs(gs, atBag, "home", "tiptoe") / 1000).toFixed(1)} s · no prints</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.homeBtn} onPress={() => act({ k: "move", to: "home", mode: "walk" })}>
              <Text style={styles.homeBtnTitle}>Walk home</Text>
              <Text style={styles.homeBtnSub}>{(moveMs(gs, atBag, "home", "walk") / 1000).toFixed(1)} s · leaves prints</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {atBag && !busy ? (
          <TouchableOpacity onPress={() => setMode(mode === "walk" ? "tiptoe" : "walk")}>
            <Text style={styles.hint}>
              Tap another bag to {mode === "walk" ? "👣 walk" : "🤫 tiptoe"} there · switch
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.modeRow}>
            <Text style={styles.modeLabel}>MOVE BY</Text>
            {(["walk", "tiptoe"] as const).map((m) => (
              <TouchableOpacity key={m} style={[styles.modeBtn, mode === m && styles.modeOn]} onPress={() => setMode(m)}>
                <Text style={[styles.modeText, mode === m && styles.modeTextOn]}>
                  {m === "walk" ? "👣 Walk · fast, prints" : "🤫 Tiptoe · slow, none"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {err && <Text style={styles.err}>{err}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  bigEmoji: { fontSize: 56 },
  title: { color: CT.text, fontSize: 32, fontWeight: "900" },
  subtle: { color: CT.textMuted, fontSize: 15 },
  dim: { opacity: 0.4 },
  roomWrap: { alignItems: "center" },

  // everyone in the dark
  darkTop: { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 8, alignItems: "flex-end" },
  darkTopText: { color: CT.textDim, fontSize: 13, fontWeight: "700" },
  darkInfo: { alignItems: "center", paddingHorizontal: 32, gap: 8, marginTop: 8 },
  bolt: { fontSize: 40 },
  darkTitle: { color: "#F2F0FF", fontSize: 32, fontWeight: "900" },
  darkBody: { color: CT.textMuted, fontSize: 15, lineHeight: 22, textAlign: "center" },
  darkPill: { marginTop: 10, backgroundColor: "#1A1830", borderColor: "#2E2B4F", borderWidth: 1, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
  darkPillText: { color: "#D7D3F0", fontSize: 14, fontWeight: "700" },

  // witness
  witnessBar: { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  witnessPill: { backgroundColor: "#FFB547", borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, flexShrink: 1 },
  witnessPillText: { color: CT.ink, fontSize: 15, fontWeight: "800" },
  witnessCount: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: CT.gold, alignItems: "center", justifyContent: "center" },
  witnessCountText: { color: CT.gold, fontSize: 20, fontWeight: "900" },
  witnessCard: { margin: 20, marginTop: 12, padding: 20, backgroundColor: "#2C2650", borderColor: "#3F3870", borderWidth: 1, borderRadius: 24, gap: 10 },
  witnessTitle: { color: CT.text, fontSize: 22, fontWeight: "900" },
  witnessBody: { color: "#D9D4F2", fontSize: 15, lineHeight: 22 },
  witnessWarn: { color: CT.gold, fontSize: 14, fontWeight: "800" },

  // thief
  thiefBar: { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  thiefPill: { borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  thiefPillText: { color: CT.ink, fontSize: 15, fontWeight: "800" },
  thiefHint: { color: CT.nvMuted, fontSize: 13, fontWeight: "700" },
  warnBar: { paddingTop: 48, paddingBottom: 14, backgroundColor: CT.gold, alignItems: "center" },
  warnText: { color: CT.ink, fontSize: 18, fontWeight: "900" },
  sheet: {
    flex: 1,
    backgroundColor: CT.nvPanel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: CT.nvLine,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sheetTitle: { color: CT.nvText, fontSize: 19, fontWeight: "900", flexShrink: 1 },
  sheetSide: { color: CT.nvMuted, fontSize: 13, fontWeight: "700" },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: CT.nvLine, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: CT.gold },
  amountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stepBtn: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 28, fontWeight: "900", marginTop: -2 },
  amountMid: { alignItems: "center", flex: 1 },
  amountText: { color: CT.gold, fontSize: 32, fontWeight: "900" },
  amountSub: { color: CT.nvMuted, fontSize: 12, fontWeight: "700" },
  twoBtns: { flexDirection: "row", gap: 10 },
  mainBtn: { flex: 1, backgroundColor: CT.gold, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  mainBtnText: { color: CT.ink, fontSize: 16, fontWeight: "900" },
  ghostBtn: { flex: 1, borderColor: "#6FA99C", borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  ghostBtnText: { color: CT.nvText, fontSize: 16, fontWeight: "800" },
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  infoText: { color: CT.nvMuted, fontSize: 13, fontWeight: "700" },
  homeBtn: { flex: 1, borderColor: CT.nvLine, borderWidth: 1.5, borderRadius: 16, paddingVertical: 10, alignItems: "center", gap: 2 },
  homeBtnTitle: { color: CT.nvText, fontSize: 16, fontWeight: "900" },
  homeBtnSub: { color: CT.nvMuted, fontSize: 12, fontWeight: "700" },
  modeRow: { gap: 8 },
  modeLabel: { color: CT.nvMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  modeBtn: { borderColor: CT.nvLine, borderWidth: 1.5, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  modeOn: { backgroundColor: CT.gold, borderColor: CT.gold },
  modeText: { color: CT.nvText, fontSize: 15, fontWeight: "800" },
  modeTextOn: { color: CT.ink },
  hint: { color: CT.nvMuted, fontSize: 12, fontWeight: "700", textAlign: "center" },
  err: { color: CT.gold, fontSize: 13, fontWeight: "800", textAlign: "center" },
});
