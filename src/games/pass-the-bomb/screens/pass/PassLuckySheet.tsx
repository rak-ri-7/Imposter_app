import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
} from "react-native";
import { Group, PassGameState } from "../../../../shared/types";
import { sideOf, walletOf, CURRENCY } from "../../logic/pass/passGame";
import { LUCKY } from "../../logic/pass/passPerks";
import PassLuckyCentre from "./PassLuckyCentre";

type Props = {
  visible: boolean;
  onClose: () => void;
  group: Group;
  playerId: string;
};

// The Lucky Centre as its own sheet, opened from the 🍀 button on the play
// and round-end screens (no longer buried inside the Front Office).
export default function PassLuckySheet({
  visible,
  onClose,
  group,
  playerId,
}: Props) {
  const gs = group.gameState as PassGameState;
  const funds = walletOf(gs, sideOf(gs, playerId));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* Tap outside to close — a sibling, not a parent, so it can't steal scrolls. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {LUCKY.icon} {LUCKY.name}
            </Text>
            <Text style={styles.wallet}>
              {CURRENCY.icon} {funds} {CURRENCY.short}
            </Text>
          </View>

          <ScrollView style={styles.list}>
            <PassLuckyCentre group={group} playerId={playerId} />
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
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  wallet: { color: "#FFD700", fontSize: 16, fontWeight: "800" },
  list: { flexShrink: 1 },
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
