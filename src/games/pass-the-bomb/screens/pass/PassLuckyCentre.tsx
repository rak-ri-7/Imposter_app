import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Group, PassGameState, PassTicketKind } from "../../../../shared/types";
import { sideOf, walletOf, CURRENCY } from "../../logic/pass/passGame";
import {
  LUCKY,
  TICKETS,
  ticketsAllowed,
  isRoundTicket,
} from "../../logic/pass/passPerks";
import { buyLuckyTicket } from "../../logic/pass/passPerkActions";

type Props = { group: Group; playerId: string };

// A section of the Kiosk sheet: self-bets on your own play. Solo only.
export default function PassLuckyCentre({ group, playerId }: Props) {
  const gs = group.gameState as PassGameState;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  if (!ticketsAllowed(gs)) return null;

  const mySide = sideOf(gs, playerId);
  const funds = walletOf(gs, mySide);
  const active = mySide ? gs.tickets?.[mySide] : undefined;

  const buy = async (kind: PassTicketKind) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await buyLuckyTicket(group, playerId, kind);
      setNote(
        r === "ok"
          ? {
              ok: true,
              text: `${TICKETS[kind].emoji} Ticket bought — good luck!`,
            }
          : {
              ok: false,
              text:
                r === "insufficient"
                  ? `Not enough ${CURRENCY.short}`
                  : "Can't buy a ticket right now",
            },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>
        {LUCKY.icon} {LUCKY.name.toUpperCase()}
      </Text>
      <Text style={styles.hint}>
        Bet on yourself. One ticket at a time — bust and the stake is gone.
      </Text>
      {note && (
        <Text style={[styles.note, !note.ok && styles.noteError]}>
          {note.text}
        </Text>
      )}

      {active ? (
        <View style={[styles.row, styles.activeRow]}>
          <View style={styles.rowText}>
            <Text style={styles.rowName}>
              {TICKETS[active.kind].emoji} {TICKETS[active.kind].name} — in play
            </Text>
            <Text style={styles.rowSub}>
              {TICKETS[active.kind].desc}
              {TICKETS[active.kind].goal
                ? `  ·  ${active.progress}/${TICKETS[active.kind].goal}`
                : ""}
              {`  ·  pays ${TICKETS[active.kind].payout}`}
            </Text>
          </View>
        </View>
      ) : (
        (Object.keys(TICKETS) as PassTicketKind[]).map((kind) => {
          const locked = isRoundTicket(kind) && gs.phase !== "pass-exploded";
          const t = TICKETS[kind];
          return (
            <View key={kind} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>
                  {t.emoji} {t.name}
                </Text>
                <Text style={styles.rowSub}>
                  {t.desc} · pays {t.payout}
                  {locked ? "  ·  🔒 between rounds only" : ""}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.buyBtn, funds < t.price && styles.buyBtnOff]}
                disabled={busy || locked || funds < t.price}
                onPress={() => buy(kind)}
              >
                <Text style={styles.buyText}>{t.price}</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  section: {
    color: "#4CAF50",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  hint: { color: "#666", fontSize: 11, marginBottom: 8 },
  note: { color: "#4CAF50", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  noteError: { color: "#E63946" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  activeRow: {
    borderWidth: 1,
    borderColor: "#4CAF50",
    backgroundColor: "#0F1F10",
  },
  rowText: { flex: 1 },
  rowName: { color: "#fff", fontSize: 14, fontWeight: "700" },
  rowSub: { color: "#888", fontSize: 11, marginTop: 2 },
  buyBtn: {
    backgroundColor: "#4CAF50",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 54,
    alignItems: "center",
  },
  buyBtnOff: { backgroundColor: "#333" },
  buyText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
