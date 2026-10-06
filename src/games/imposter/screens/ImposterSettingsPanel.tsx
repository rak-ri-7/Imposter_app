import { View, Text, TouchableOpacity, StyleSheet, Switch } from "react-native";
import { ImposterSettings } from "../../../shared/types";

type Props = {
  settings: ImposterSettings;
  maxImposters: number;
  onChange: (settings: ImposterSettings) => void;
};

export default function ImposterSettingsPanel({
  settings,
  maxImposters,
  onChange,
}: Props) {
  const setCount = (count: number) => {
    onChange({ ...settings, imposterCount: count });
  };

  const toggleHints = () => {
    onChange({ ...settings, hintsEnabled: !settings.hintsEnabled });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚙️ Game Settings</Text>

      <View style={styles.row}>
        <View style={styles.labelBox}>
          <Text style={styles.label}>Imposters</Text>
          <Text style={styles.labelSub}>How many imposters in this round?</Text>
        </View>
        <View style={styles.countBtns}>
          {[1, 2, 3].map((n) => (
            <TouchableOpacity
              key={n}
              style={[
                styles.countBtn,
                settings.imposterCount === n && styles.countBtnActive,
                n > maxImposters && styles.countBtnDisabled,
              ]}
              onPress={() => n <= maxImposters && setCount(n)}
              disabled={n > maxImposters}
            >
              <Text
                style={[
                  styles.countBtnText,
                  settings.imposterCount === n && styles.countBtnTextActive,
                  n > maxImposters && styles.countBtnTextDisabled,
                ]}
              >
                {n}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.row}>
        <View style={styles.labelBox}>
          <Text style={styles.label}>Imposter Hints</Text>
          <Text style={styles.labelSub}>
            Imposters can request one hint per turn
          </Text>
        </View>
        <Switch
          value={settings.hintsEnabled}
          onValueChange={toggleHints}
          trackColor={{ false: "#333", true: "#E63946" }}
          thumbColor={settings.hintsEnabled ? "#fff" : "#888"}
        />
      </View>

      {settings.imposterCount > 1 && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            With {settings.imposterCount} imposters, voting happens in{" "}
            {settings.imposterCount} rounds. Players know how many imposters
            there are!
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#16213E",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#0F3460",
  },
  title: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  labelBox: {
    flex: 1,
  },
  label: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  labelSub: {
    color: "#888",
    fontSize: 11,
    lineHeight: 16,
  },
  countBtns: {
    flexDirection: "row",
    gap: 8,
  },
  countBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0F3460",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  countBtnActive: {
    backgroundColor: "#E63946",
    borderColor: "#E63946",
  },
  countBtnDisabled: {
    opacity: 0.3,
  },
  countBtnText: {
    color: "#888",
    fontSize: 15,
    fontWeight: "600",
  },
  countBtnTextActive: {
    color: "#fff",
  },
  countBtnTextDisabled: {
    color: "#555",
  },
  divider: {
    height: 0.5,
    backgroundColor: "#0F3460",
    marginVertical: 14,
  },
  infoBox: {
    backgroundColor: "#1A1A2E",
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  infoText: {
    color: "#FFD700",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
