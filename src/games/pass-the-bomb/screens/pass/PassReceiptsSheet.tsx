import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from "react-native";
import { Group, PassGameState, PassReceipt } from "../../../../shared/types";
import { sideById, STORE } from "../../logic/pass/passGame";

type Props = {
  sideId: string | null; // whose receipts to show; null = closed
  onClose: () => void;
  group: Group;
};

const ITEM_LABEL: Record<PassReceipt["item"], string> = {
  pass: "🎟️ Extra pass",
  fiftyFifty: "✂️ 50/50",
  swap: "🔄 Swap",
  gloves: "🧤 Hush Gloves",
  audit: "🔎 Audit",
};

// Every side's Kiosk purchases are public record. Nobody is told when
// someone buys something — but anyone can come and look.
export default function PassReceiptsSheet({ sideId, onClose, group }: Props) {
  const gs = group.gameState as PassGameState;
  const side = sideById(gs, sideId);
  const receipts = [...(sideId ? (gs.receipts?.[sideId] ?? []) : [])].reverse();
  const playerName = (id?: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Someone";

  const describe = (r: PassReceipt) => {
    const label = ITEM_LABEL[r.item] ?? r.item;
    const target = r.targetId ? sideById(gs, r.targetId)?.name : undefined;
    if (r.item === "pass" && target) return `${label} to ${target}`;
    if (r.item === "audit" && target) return `${label} on ${target}`;
    return label;
  };

  return (
    <Modal
      visible={!!sideId}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity style={styles.sheet} activeOpacity={1}>
          <Text style={styles.title}>🧾 {side?.name ?? "Receipts"}</Text>
          <Text style={styles.sub}>
            Everything bought at the {STORE.name} — public record
          </Text>

          <ScrollView style={styles.list}>
            {receipts.length === 0 ? (
              <Text style={styles.empty}>No purchases yet.</Text>
            ) : (
              receipts.map((r, i) => (
                <View key={i} style={styles.row}>
                  <Text style={styles.round}>R{r.round}</Text>
                  <Text style={styles.what}>{describe(r)}</Text>
                  {gs.teamMode && (
                    <Text style={styles.by}>by {playerName(r.byPlayerId)}</Text>
                  )}
                </View>
              ))
            )}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
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
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "#888", fontSize: 12, marginTop: 2, marginBottom: 10 },
  list: { maxHeight: 360 },
  empty: {
    color: "#666",
    fontSize: 13,
    textAlign: "center",
    marginVertical: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#2A2A2A",
  },
  round: { color: "#FF4500", fontSize: 12, fontWeight: "800", width: 30 },
  what: { color: "#fff", fontSize: 14, flex: 1 },
  by: { color: "#666", fontSize: 11 },
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
});
