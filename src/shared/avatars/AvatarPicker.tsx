// src/shared/avatars/AvatarPicker.tsx
// A sheet of every avatar to choose from. Ones already taken by someone in
// the group are dimmed and can't be picked, so everyone stays easy to tell
// apart.
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import PixelAvatar from "./PixelAvatar";
import { AVATARS } from "./sprites";

type Props = {
    visible: boolean;
    selected?: string | null;
    taken?: Record<string, string>; // avatar id -> name of who has it
    onPick: (id: string) => void;
    onClose: () => void;
};

const COLS = 4;

export default function AvatarPicker({ visible, selected, taken = {}, onPick, onClose }: Props) {
    const { width } = useWindowDimensions();
    const inner = Math.min(width, 520) - 40 - 2; // sheet padding and border
    const cell = Math.floor((inner - (COLS - 1) * 12) / COLS) - 1;
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Pressable style={{ flex: 1 }} onPress={onClose} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={styles.title}>Pick your avatar</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={12}>
                            <Text style={styles.close}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={styles.grid}>
                        {AVATARS.map((a) => {
                            const owner = taken[a.id];
                            const on = a.id === selected;
                            return (
                                <TouchableOpacity
                                    key={a.id}
                                    disabled={!!owner}
                                    onPress={() => onPick(a.id)}
                                    style={[styles.cell, { width: cell }, on && styles.cellOn]}
                                    accessibilityLabel={owner ? `${a.name}, taken by ${owner}` : a.name}
                                >
                                    <PixelAvatar avatar={a.id} size={cell - 12} dim={!!owner} />
                                    <Text style={[styles.name, on && { color: GOLD }]} numberOfLines={1}>
                                        {owner ? owner : a.name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const GOLD = "#C9A45C";
const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
    sheet: {
        backgroundColor: "#17191C",
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingHorizontal: 20,
        paddingBottom: 28,
        maxHeight: "78%",
        borderWidth: 1,
        borderColor: "#2D3137",
        width: "100%",
        maxWidth: 520,
        alignSelf: "center",
    },
    handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#3A3F46", marginTop: 10 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
    title: { color: "#ECE7DD", fontSize: 18, fontWeight: "900" },
    close: { color: "#A9A49A", fontSize: 18, fontWeight: "800" },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingBottom: 8 },
    cell: { alignItems: "center", gap: 6, paddingVertical: 6, borderRadius: 16, borderWidth: 2, borderColor: "transparent" },
    cellOn: { borderColor: GOLD, backgroundColor: "#22252A" },
    name: { color: "#A9A49A", fontSize: 12, fontWeight: "800", maxWidth: "100%" },
});
