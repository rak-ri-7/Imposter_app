import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import QRCode from "react-native-qrcode-svg";

type Props = {
  code: string;
  visible: boolean;
  onClose: () => void;
};

export default function QRCodeDisplay({ code, visible, onClose }: Props) {
  const deepLink = `wgawpt://join/${code}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>Scan to Join</Text>
          <Text style={styles.subtitle}>Point your camera at this QR code</Text>

          <View style={styles.qrWrapper}>
            <QRCode
              value={deepLink}
              size={200}
              color="#1A1A2E"
              backgroundColor="#fff"
            />
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or join manually</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.codeLabel}>ROOM CODE</Text>
          <Text style={styles.code}>{code}</Text>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  box: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1A1A2E",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#888",
    marginBottom: 24,
    textAlign: "center",
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    marginBottom: 20,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: "#EAEAEE",
  },
  dividerText: {
    color: "#888",
    fontSize: 12,
  },
  codeLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 6,
  },
  code: {
    color: "#E63946",
    fontSize: 36,
    fontWeight: "bold",
    letterSpacing: 8,
    marginBottom: 24,
  },
  closeBtn: {
    backgroundColor: "#E63946",
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 14,
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
