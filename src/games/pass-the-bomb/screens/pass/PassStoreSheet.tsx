import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from "react-native";
import { Group, PassGameState } from "../../../../shared/types";
import {
  buyPass,
  buyPassItem,
  passAlive,
  totalPassesLeft,
  passPrice,
  itemPrice,
  walletOf,
  itemsOf,
  sideById,
  sideOf,
  CURRENCY,
  EARN_FIRST_TRY,
  EARN_SECOND_TRY,
  EARN_STREAK_BONUS,
  EARN_STREAK_EVERY,
  EARN_SURVIVE_ROUND,
  EARN_HAZARD,
  EARN_CLUTCH,
  CLUTCH_MAX_LEFT,
  PassItem,
  StoreResult,
  STORE,
  buyHushGloves,
  buyAudit,
  glovesLeft,
  PRICE_GLOVES,
  GLOVES_TURNS,
  PRICE_AUDIT,
} from "../../logic/pass/passGame";
import PassLuckyCentre from "./PassLuckyCentre";

type Props = {
  visible: boolean;
  onClose: () => void;
  group: Group;
  playerId: string;
};

const ITEMS: { id: PassItem; emoji: string; name: string; desc: string }[] = [
  {
    id: "fiftyFifty",
    emoji: "✂️",
    name: "50/50",
    desc: "On your turn, knock out two wrong answers",
  },
  {
    id: "swap",
    emoji: "🔄",
    name: "Swap",
    desc: "On your turn, trade your question for a new one — no pass lost",
  },
];

export default function PassStoreSheet({
  visible,
  onClose,
  group,
  playerId,
}: Props) {
  const gs = group.gameState as PassGameState;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);

  const mySide = sideOf(gs, playerId);
  const team = gs.teamMode;
  const funds = walletOf(gs, mySide);
  const owned = itemsOf(gs, mySide);
  const others = passAlive(gs).filter((id) => id !== mySide);
  const pPrice = mySide ? passPrice(gs, mySide) : 0;
  const aimingAtMe = gs.phase === "pass-playing" && gs.turn.targetId === mySide;

  const audit = async (targetId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const { result, total } = await buyAudit(group, playerId, targetId);
      setNote(
        result === "ok"
          ? {
              ok: true,
              text: `🔎 Audit: ${sideById(gs, targetId)?.name} has ${total} passes left`,
            }
          : {
              ok: false,
              text:
                result === "insufficient"
                  ? `Not enough ${CURRENCY.short}`
                  : "Can't audit right now",
            },
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (visible) setNote(null);
  }, [visible]);

  const run = async (action: () => Promise<StoreResult>, okText: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await action();
      setNote(
        r === "ok"
          ? { text: okText, ok: true }
          : {
              ok: false,
              text:
                r === "insufficient"
                  ? `Not enough ${CURRENCY.short}`
                  : r === "not-allowed"
                    ? "Can't buy that right now"
                    : "Something went wrong — try again",
            },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {STORE.icon} The {STORE.name}
            </Text>
            <Text style={styles.wallet}>
              {CURRENCY.icon} {funds} {CURRENCY.short}
            </Text>
          </View>
          {team && (
            <Text style={styles.teamNote}>
              Team wallet — shared with your teammates
            </Text>
          )}
          {aimingAtMe && (
            <Text style={styles.warning}>
              😬 The bomb is aiming at {team ? "your team" : "you"}!
            </Text>
          )}
          {note && (
            <Text style={[styles.note, !note.ok && styles.noteError]}>
              {note.text}
            </Text>
          )}

          <ScrollView
            style={styles.list}
            contentContainerStyle={{ paddingBottom: 12 }}
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            <Text style={styles.section}>
              EXTRA PASSES · {pPrice} {CURRENCY.short} each
            </Text>
            <Text style={styles.sectionHint}>
              Goes on {team ? "your team's" : "your"} pile. Price climbs each
              time; unspent extras carry over.
            </Text>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>+1 pass</Text>
                <Text style={styles.rowSub}>
                  {team ? "Your team has" : "You have"}{" "}
                  {totalPassesLeft(gs, mySide)} left
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.buyBtn, funds < pPrice && styles.buyBtnOff]}
                disabled={busy || funds < pPrice}
                onPress={() => run(() => buyPass(group, playerId), "+1 pass")}
              >
                <Text style={styles.buyText}>{pPrice}</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.section, { marginTop: 16 }]}>POWER-UPS</Text>
            {ITEMS.map((it) => {
              const price = itemPrice(it.id);
              return (
                <View key={it.id} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>
                      {it.emoji} {it.name}
                      {owned[it.id] > 0 ? `  · own ${owned[it.id]}` : ""}
                    </Text>
                    <Text style={styles.rowSub}>{it.desc}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.buyBtn, funds < price && styles.buyBtnOff]}
                    disabled={busy || funds < price}
                    onPress={() =>
                      run(
                        () => buyPassItem(group, playerId, it.id),
                        `${it.name} bought!`,
                      )
                    }
                  >
                    <Text style={styles.buyText}>{price}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {gs.hiddenPasses ? (
              <>
                <Text style={[styles.section, { marginTop: 16 }]}>
                  DISCRETION
                </Text>
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>
                      🧤 Hush Gloves
                      {glovesLeft(gs, mySide) > 0
                        ? `  · ${glovesLeft(gs, mySide)} turns left`
                        : ""}
                    </Text>
                    <Text style={styles.rowSub}>
                      Your fumbles make no sound or flash, and haunting ghosts
                      can't catch them, for your next {GLOVES_TURNS} turns with
                      the bomb
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.buyBtn,
                      funds < PRICE_GLOVES && styles.buyBtnOff,
                    ]}
                    disabled={busy || funds < PRICE_GLOVES}
                    onPress={() =>
                      run(
                        () => buyHushGloves(group, playerId),
                        "🧤 Gloves on — fumble in peace",
                      )
                    }
                  >
                    <Text style={styles.buyText}>{PRICE_GLOVES}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.section, { marginTop: 16 }]}>
                  AUDIT · {PRICE_AUDIT} {CURRENCY.short}
                </Text>
                <Text style={styles.sectionHint}>
                  Privately see someone's exact passes left, right now. Audits
                  go on your receipts.
                </Text>
                {others.map((id) => (
                  <View key={`audit-${id}`} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.rowName}>
                        🔎 Audit {sideById(gs, id)?.name}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.buyBtn,
                        funds < PRICE_AUDIT && styles.buyBtnOff,
                      ]}
                      disabled={busy || funds < PRICE_AUDIT}
                      onPress={() => audit(id)}
                    >
                      <Text style={styles.buyText}>{PRICE_AUDIT}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            ) : null}
            <PassLuckyCentre group={group} playerId={playerId} />
            <Text style={styles.earnInfo}>
              Earn {CURRENCY.short}: right first try +{EARN_FIRST_TRY} · right
              second try +{EARN_SECOND_TRY} · {EARN_STREAK_EVERY} first-tries in
              a row +{EARN_STREAK_BONUS} bonus · survive a round +
              {EARN_SURVIVE_ROUND} · bomb passed to you +{EARN_HAZARD} · survive
              a round on ≤{CLUTCH_MAX_LEFT} passes +{EARN_CLUTCH} more
            </Text>
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#161616",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  wallet: { color: "#FFD700", fontSize: 16, fontWeight: "800" },
  teamNote: { color: "#888", fontSize: 11, marginBottom: 6 },
  warning: {
    color: "#E63946",
    fontSize: 13,
    fontWeight: "700",
    marginVertical: 6,
  },
  note: {
    color: "#4CAF50",
    fontSize: 12,
    fontWeight: "600",
    marginVertical: 4,
  },
  list: { flexShrink: 1, marginTop: 8 },
  section: {
    color: "#FF4500",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sectionHint: { color: "#666", fontSize: 11, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  rowText: { flex: 1 },
  rowName: { color: "#fff", fontSize: 14, fontWeight: "700" },
  rowSub: { color: "#888", fontSize: 11, marginTop: 2 },
  buyBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 54,
    alignItems: "center",
  },
  buyBtnOff: { backgroundColor: "#333" },
  buyText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  earnInfo: { color: "#666", fontSize: 11, lineHeight: 16, marginTop: 12 },
  closeBtn: {
    marginTop: 12,
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  closeText: { color: "#888", fontSize: 14, fontWeight: "600" },
  noteError: { color: "#E63946" },
});
