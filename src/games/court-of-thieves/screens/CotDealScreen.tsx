// 🤝 The deal phase. Everyone gets the same screen and the same messages,
// whatever their role. Write to a role ("the Thief"), to "the witness", or
// to a player by name; the person who gets it doesn't learn who sent it
// (unless they're paid to). Offers move money; the Thief pays 2:1 real:fake.
import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable } from "react-native";
import type { CotGameState, CotMsg, CotRole, CotThread, Group } from "../../../shared/types";
import {
  AMOUNT_STEP,
  MAX_OFFER,
  MAX_PARTNERS,
  MSG_COOLDOWN_MS,
  partnersOf,
  total,
  type CotTarget,
  type OfferChoice,
} from "../logic/engine";
import { TEMPLATES, fillTemplate, type CotTemplate } from "../logic/templates";
import { cotReply, cotRespond, cotSend } from "../logic/game";
import { CT, rupees, seatColor } from "../theme";
import { useServerNow } from "../../../shared/hooks/useServerNow";

type Props = { group: Group; gs: CotGameState; playerId: string };

const ROLE_TARGETS: { role: CotRole; label: string; emoji: string }[] = [
  { role: "thief", label: "the Thief", emoji: "🧤" },
  { role: "police", label: "the Police", emoji: "🚓" },
  { role: "judge", label: "the Judge", emoji: "⚖️" },
  { role: "advocate", label: "the Advocate", emoji: "💼" },
];
const TO_LABEL: Record<string, string> = {
  thief: "the Thief",
  police: "the Police",
  judge: "the Judge",
  advocate: "the Advocate",
  citizen: "a Citizen",
  witness: "the witness",
  player: "you, by name",
};
const GROUPS: { id: CotTemplate["group"]; label: string }[] = [
  { id: "offer", label: "💰 Offers" },
  { id: "tip", label: "🔎 Tips" },
  { id: "talk", label: "💬 Talk" },
];

type Compose = { mode: "new" } | { mode: "reply"; thread: CotThread };

export default function CotDealScreen({ group, gs, playerId }: Props) {
  const now = useServerNow(250);
  const [compose, setCompose] = useState<Compose | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const name = (id: string) => group.players.find((p) => p.id === id)?.name ?? "Someone";
  const msLeft = Math.max(0, (gs.phaseEndsAt ?? now) - now);
  const mm = Math.floor(msLeft / 60000);
  const ss = Math.floor((msLeft % 60000) / 1000);
  const cooldown = Math.max(0, MSG_COOLDOWN_MS - (now - (gs.lastSentAt?.[playerId] ?? 0)));
  const partners = partnersOf(gs, playerId).length;
  const seen = gs.last?.seen;
  const wCount = gs.last?.witnessIds.length ?? 0;

  // My conversations, newest first, and a stable "Anonymous N" for each
  // stranger who wrote to me.
  const mine = useMemo(() => {
    const list = (gs.threads ?? []).filter((t) => t.a === playerId || t.b === playerId);
    const incoming = list.filter((t) => t.b === playerId).sort((x, y) => x.msgs[0].at - y.msgs[0].at);
    const anon: Record<string, number> = {};
    incoming.forEach((t, i) => (anon[t.id] = i + 1));
    const sorted = [...list].sort((x, y) => y.msgs[y.msgs.length - 1].at - x.msgs[x.msgs.length - 1].at);
    return { sorted, anon };
  }, [gs.threads, playerId]);

  const titleOf = (t: CotThread): { title: string; sub: string } => {
    if (t.a === playerId) {
      const who = t.aKnowsB || t.to === "player" ? name(t.b) : TO_LABEL[t.to] ?? "someone";
      return { title: `To ${who}`, sub: t.bKnowsA ? "They know it's you" : "They don't know it's you" };
    }
    const who = t.bKnowsA ? name(t.a) : `Anonymous ${mine.anon[t.id] ?? ""}`.trim();
    return { title: who, sub: `wrote to ${TO_LABEL[t.to] ?? "you"}` };
  };

  const send = async (fn: () => Promise<{ success: boolean; reason?: string }>) => {
    if (busy) return false;
    setBusy(true);
    try {
      const r = await fn();
      if (!r.success && r.reason && r.reason !== "stale") setToast(r.reason);
      return r.success;
    } finally {
      setBusy(false);
    }
  };

  const respond = (t: CotThread, m: CotMsg, choice: OfferChoice) => send(() => cotRespond(group.id, playerId, t.id, m.id, choice));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>🤝 Deals</Text>
          <Text style={styles.sub}>
            {seen ? `👀 ${wCount} ${wCount === 1 ? "person" : "people"} saw the heist` : "🙈 Nobody saw a thing"} · deals {partners}/{MAX_PARTNERS}
          </Text>
        </View>
        <View style={styles.timer}>
          <Text style={[styles.timerText, msLeft < 20000 && { color: CT.bad }]}>
            {mm}:{ss.toString().padStart(2, "0")}
          </Text>
        </View>
      </View>
      <View style={styles.purseRow}>
        <View style={[styles.dot, { backgroundColor: seatColor(gs.seats, playerId) }]} />
        <Text style={styles.purseText}>Your purse: {rupees(total(gs.purse[playerId]))}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
        {mine.sorted.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📨</Text>
            <Text style={styles.emptyText}>No messages yet. Make an offer, sell a tip, or bluff.</Text>
          </View>
        )}
        {mine.sorted.map((t) => {
          const { title, sub } = titleOf(t);
          return (
            <View key={t.id} style={styles.thread}>
              <View style={styles.threadHead}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.threadTitle}>{title}</Text>
                  <Text style={styles.threadSub}>{sub}</Text>
                </View>
                <TouchableOpacity style={[styles.replyBtn, cooldown > 0 && styles.dim]} onPress={() => setCompose({ mode: "reply", thread: t })}>
                  <Text style={styles.replyText}>Reply</Text>
                </TouchableOpacity>
              </View>
              {t.msgs.map((m) => (
                <Bubble key={m.id} m={m} me={playerId} aboutName={(id) => (id === playerId ? "you" : name(id))} onRespond={(c) => respond(t, m, c)} busy={busy} />
              ))}
            </View>
          );
        })}
      </ScrollView>

      {toast && <Text style={styles.toast}>{toast}</Text>}
      <TouchableOpacity style={[styles.newBtn, cooldown > 0 && styles.dim]} onPress={() => setCompose({ mode: "new" })}>
        <Text style={styles.newText}>{cooldown > 0 ? `New message in ${Math.ceil(cooldown / 1000)}…` : "✉️  New message"}</Text>
      </TouchableOpacity>

      {compose && (
        <ComposeSheet
          gs={gs}
          group={group}
          playerId={playerId}
          compose={compose}
          title={compose.mode === "reply" ? titleOf(compose.thread).title : undefined}
          cooldown={cooldown}
          busy={busy}
          onClose={() => setCompose(null)}
          onSend={async (target, input) => {
            const ok =
              compose.mode === "reply"
                ? await send(() => cotReply(group.id, playerId, compose.thread.id, input))
                : await send(() => cotSend(group.id, playerId, target!, input));
            if (ok) setCompose(null);
          }}
        />
      )}
    </View>
  );
}

function Bubble({
  m,
  me,
  aboutName,
  onRespond,
  busy,
}: {
  m: CotMsg;
  me: string;
  aboutName: (id: string) => string;
  onRespond: (c: OfferChoice) => void;
  busy: boolean;
}) {
  const mine = m.from === me;
  const text = fillTemplate(m.tpl, m.amount, m.about ? aboutName(m.about) : undefined);
  const offer = m.offer;
  const statusText =
    offer?.status === "now"
      ? "✅ Paid"
      : offer?.status === "later"
        ? "🤞 Paid at round end, unless they're convicted"
        : offer?.status === "refused"
          ? "✖️ Refused"
          : offer?.status === "failed"
            ? "⚠️ Couldn't pay"
            : mine && offer
              ? "Waiting for an answer…"
              : null;
  return (
    <View style={[styles.bubbleWrap, mine ? styles.right : styles.left]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, offer && styles.bubbleOffer]}>
        <Text style={[styles.bubbleText, mine && { color: CT.ink }]}>{text}</Text>
        {statusText && <Text style={[styles.bubbleStatus, mine && { color: CT.ink }]}>{statusText}</Text>}
      </View>
      {!mine && offer?.status === "open" && (
        <View style={styles.offerBtns}>
          {offer.kind === "hush" && (
            <>
              <OfferBtn label="Take it now" onPress={() => onRespond("now")} busy={busy} strong />
              <OfferBtn label="On acquittal" onPress={() => onRespond("later")} busy={busy} />
            </>
          )}
          {offer.kind === "demand" && <OfferBtn label={`Pay ${rupees(m.amount ?? 0)}`} onPress={() => onRespond("now")} busy={busy} strong />}
          {offer.kind === "reveal" && <OfferBtn label="Take ₹500, reveal me" onPress={() => onRespond("now")} busy={busy} strong />}
          <OfferBtn label="Refuse" onPress={() => onRespond("refuse")} busy={busy} />
        </View>
      )}
    </View>
  );
}

function OfferBtn({ label, onPress, busy, strong }: { label: string; onPress: () => void; busy: boolean; strong?: boolean }) {
  return (
    <TouchableOpacity style={[styles.offerBtn, strong && styles.offerBtnStrong, busy && styles.dim]} disabled={busy} onPress={onPress}>
      <Text style={[styles.offerBtnText, strong && { color: CT.ink }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Write a message ──────────────────────────────────────────────────
function ComposeSheet({
  gs,
  group,
  playerId,
  compose,
  title,
  cooldown,
  busy,
  onClose,
  onSend,
}: {
  gs: CotGameState;
  group: Group;
  playerId: string;
  compose: Compose;
  title?: string;
  cooldown: number;
  busy: boolean;
  onClose: () => void;
  onSend: (target: CotTarget | null, input: { tpl: string; amount?: number; about?: string }) => void;
}) {
  const [target, setTarget] = useState<CotTarget | null>(null);
  const [tab, setTab] = useState<CotTemplate["group"]>("offer");
  const [tpl, setTpl] = useState<CotTemplate | null>(null);
  const [amount, setAmount] = useState(500);
  const [about, setAbout] = useState<string | null>(null);
  const others = gs.seats.filter((id) => id !== playerId);
  const name = (id: string) => group.players.find((p) => p.id === id)?.name ?? "?";
  const needTarget = compose.mode === "new";
  const ready = (!needTarget || !!target) && !!tpl && (!tpl.about || !!about) && cooldown === 0 && !busy;
  const targetKey = (t: CotTarget) => (t.kind === "role" ? t.role : t.kind === "witness" ? "witness" : t.id);
  const isTarget = (t: CotTarget) => !!target && targetKey(target) === targetKey(t);

  const pick = (t: CotTemplate) => {
    setTpl(t);
    if (t.suggest) setAmount(t.suggest);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
          <Text style={styles.sheetTitle}>{compose.mode === "reply" ? `Reply · ${title}` : "New message"}</Text>

          {needTarget && (
            <>
              <Text style={styles.label}>SEND TO</Text>
              <View style={styles.chips}>
                {ROLE_TARGETS.map((r) => {
                  const t: CotTarget = { kind: "role", role: r.role };
                  return (
                    <Chip key={r.role} on={isTarget(t)} onPress={() => setTarget(t)}>
                      {r.emoji} {r.label}
                    </Chip>
                  );
                })}
                <Chip on={isTarget({ kind: "witness" })} onPress={() => setTarget({ kind: "witness" })}>
                  👀 the witness
                </Chip>
              </View>
              <View style={styles.chips}>
                {others.map((id) => {
                  const t: CotTarget = { kind: "player", id };
                  return (
                    <Chip key={id} on={isTarget(t)} onPress={() => setTarget(t)} dot={seatColor(gs.seats, id)}>
                      {name(id)}
                    </Chip>
                  );
                })}
              </View>
              <Text style={styles.hintSmall}>Writing to a role or the witness keeps it anonymous. By name, you know who gets it.</Text>
            </>
          )}

          <Text style={styles.label}>MESSAGE</Text>
          <View style={styles.tabs}>
            {GROUPS.map((g) => (
              <TouchableOpacity key={g.id} style={[styles.tab, tab === g.id && styles.tabOn]} onPress={() => setTab(g.id)}>
                <Text style={[styles.tabText, tab === g.id && styles.tabTextOn]}>{g.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ gap: 6 }}>
            {TEMPLATES.filter((t) => t.group === tab).map((t) => {
              const on = tpl?.id === t.id;
              return (
                <TouchableOpacity key={t.id} style={[styles.tplRow, on && styles.tplOn]} onPress={() => pick(t)}>
                  <Text style={[styles.tplText, on && { color: CT.ink }]}>
                    {fillTemplate(t.id, on ? amount : t.amount === "fixed" ? 500 : undefined, on && about ? name(about) : undefined)
                      .replace("₹0", "₹___")
                      .replace("someone", "___")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {tpl?.amount === "pick" && (
            <View style={styles.amountRow}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setAmount((a) => Math.max(AMOUNT_STEP, a - AMOUNT_STEP))}>
                <Text style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.amountText}>{rupees(amount)}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setAmount((a) => Math.min(MAX_OFFER, a + AMOUNT_STEP))}>
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stepBtnWide} onPress={() => setAmount((a) => Math.min(MAX_OFFER, a + 500))}>
                <Text style={styles.stepText}>+500</Text>
              </TouchableOpacity>
            </View>
          )}
          {tpl?.about && (
            <>
              <Text style={styles.label}>WHO?</Text>
              <View style={styles.chips}>
                {gs.seats.map((id) => (
                  <Chip key={id} on={about === id} onPress={() => setAbout(id)} dot={seatColor(gs.seats, id)}>
                    {id === playerId ? "Me" : name(id)}
                  </Chip>
                ))}
              </View>
            </>
          )}
        </ScrollView>
        <TouchableOpacity
          style={[styles.sendBtn, !ready && styles.dim]}
          disabled={!ready}
          onPress={() => tpl && onSend(target, { tpl: tpl.id, amount: tpl.amount === "pick" ? amount : undefined, about: about ?? undefined })}
        >
          <Text style={styles.sendText}>{cooldown > 0 ? `Wait ${Math.ceil(cooldown / 1000)} s` : busy ? "Sending…" : "Send"}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function Chip({ children, on, onPress, dot }: { children: React.ReactNode; on: boolean; onPress: () => void; dot?: string }) {
  return (
    <TouchableOpacity style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      {dot && <View style={[styles.chipDot, { backgroundColor: dot }]} />}
      <Text style={[styles.chipText, on && { color: CT.ink }]}>{children}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CT.bg },
  header: { paddingTop: 52, paddingHorizontal: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: CT.text, fontSize: 28, fontWeight: "900" },
  sub: { color: CT.textMuted, fontSize: 13, fontWeight: "700", marginTop: 2 },
  timer: { backgroundColor: CT.panel, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  timerText: { color: CT.gold, fontSize: 20, fontWeight: "900" },
  purseRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  purseText: { color: CT.text, fontSize: 15, fontWeight: "800" },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: CT.textMuted, fontSize: 14, textAlign: "center" },
  thread: { backgroundColor: CT.panel, borderRadius: 18, padding: 12, gap: 8, borderWidth: 1, borderColor: CT.line },
  threadHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  threadTitle: { color: CT.text, fontSize: 16, fontWeight: "900" },
  threadSub: { color: CT.textDim, fontSize: 12, fontWeight: "600" },
  replyBtn: { borderColor: CT.gold, borderWidth: 1.5, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 12 },
  replyText: { color: CT.gold, fontSize: 13, fontWeight: "800" },
  bubbleWrap: { maxWidth: "88%", gap: 6 },
  left: { alignSelf: "flex-start" },
  right: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubble: { borderRadius: 16, paddingVertical: 9, paddingHorizontal: 12 },
  bubbleMine: { backgroundColor: CT.gold },
  bubbleTheirs: { backgroundColor: CT.panelHi },
  bubbleOffer: { borderWidth: 1.5, borderColor: CT.goldDeep },
  bubbleText: { color: CT.text, fontSize: 15, fontWeight: "700", lineHeight: 20 },
  bubbleStatus: { color: CT.textMuted, fontSize: 12, fontWeight: "700", marginTop: 4 },
  offerBtns: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  offerBtn: { borderColor: CT.line, borderWidth: 1.5, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  offerBtnStrong: { backgroundColor: CT.gold, borderColor: CT.gold },
  offerBtnText: { color: CT.text, fontSize: 13, fontWeight: "800" },
  toast: { color: CT.gold, textAlign: "center", fontSize: 14, fontWeight: "800", paddingVertical: 6 },
  newBtn: { margin: 16, marginTop: 4, backgroundColor: CT.gold, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  newText: { color: CT.ink, fontSize: 17, fontWeight: "900" },
  dim: { opacity: 0.45 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { maxHeight: "86%", backgroundColor: CT.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 10, borderTopWidth: 1, borderColor: CT.line },
  sheetTitle: { color: CT.text, fontSize: 20, fontWeight: "900" },
  label: { color: CT.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  hintSmall: { color: CT.textDim, fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderColor: CT.line, borderWidth: 1.5, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  chipOn: { backgroundColor: CT.gold, borderColor: CT.gold },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { color: CT.text, fontSize: 14, fontWeight: "800" },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: "center", backgroundColor: CT.panel },
  tabOn: { backgroundColor: CT.panelHi, borderColor: CT.gold, borderWidth: 1.5 },
  tabText: { color: CT.textMuted, fontSize: 14, fontWeight: "800" },
  tabTextOn: { color: CT.gold },
  tplRow: { backgroundColor: CT.panel, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14 },
  tplOn: { backgroundColor: CT.gold },
  tplText: { color: CT.text, fontSize: 15, fontWeight: "700" },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center" },
  stepBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: CT.gold, alignItems: "center", justifyContent: "center" },
  stepBtnWide: { height: 48, borderRadius: 24, borderWidth: 2, borderColor: CT.gold, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  stepText: { color: CT.gold, fontSize: 20, fontWeight: "900" },
  amountText: { color: CT.gold, fontSize: 28, fontWeight: "900", minWidth: 120, textAlign: "center" },
  sendBtn: { backgroundColor: CT.gold, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  sendText: { color: CT.ink, fontSize: 17, fontWeight: "900" },
});
