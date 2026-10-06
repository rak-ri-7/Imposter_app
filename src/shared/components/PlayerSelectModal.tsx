// src/shared/components/PlayerSelectModal.tsx
import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from "react-native";
import { Player } from "../types";

type Props = {
  visible: boolean;
  players: Player[];
  minPlayers: number;
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
};

export default function PlayerSelectModal({
  visible,
  players,
  minPlayers,
  onConfirm,
  onCancel,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setSelected(new Set(players.map((p) => p.id)));
    }
  }, [visible]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canConfirm = selected.size >= minPlayers;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>Select Players</Text>
          <Text style={styles.subtitle}>
            Choose who's playing this round ({selected.size} selected, need{" "}
            {minPlayers}+)
          </Text>

          <FlatList
            data={players}
            keyExtractor={(item) => item.id}
            style={styles.list}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id);
              return (
                <TouchableOpacity
                  style={[styles.row, isSelected && styles.rowSelected]}
                  onPress={() => toggle(item.id)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxChecked,
                    ]}
                  >
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.isHost && (
                    <View style={styles.hostBadge}>
                      <Text style={styles.hostBadgeText}>Host</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />

          <TouchableOpacity
            style={[
              styles.confirmBtn,
              !canConfirm && styles.confirmBtnDisabled,
            ]}
            onPress={() => canConfirm && onConfirm(Array.from(selected))}
            disabled={!canConfirm}
          >
            <Text style={styles.confirmBtnText}>
              Start with {selected.size} players →
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  box: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1A1A2E",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    marginBottom: 16,
  },
  list: { marginBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#EAEAEE",
  },
  rowSelected: { borderColor: "#E63946", backgroundColor: "#FDEAEA" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#E63946", borderColor: "#E63946" },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  name: { fontSize: 15, color: "#1A1A2E", flex: 1 },
  hostBadge: {
    backgroundColor: "#E63946",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hostBadgeText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  confirmBtn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  confirmBtnDisabled: { backgroundColor: "#ccc" },
  confirmBtnText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  cancelBtn: { alignItems: "center", padding: 12, marginTop: 6 },
  cancelBtnText: { color: "#888", fontSize: 14 },
});
