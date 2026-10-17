// Read-only question card for people watching a quiz duel (knocked-out
// players, and the waiting opponent in Hot Seat). Shows the question, who
// picked what, crossed-out options, and the right answer once settled.
import { View, Text, StyleSheet } from "react-native";

type Props = {
  prompt: string;
  options: { text: string; correct: boolean }[];
  // option index -> names of the duellers who picked it
  picksByOption?: Record<number, string[]>;
  eliminated?: number[];   // wrong options already crossed out
  revealCorrect?: boolean; // the question is settled: show the right answer
};

export default function DuelSpectatorQuiz({
  prompt,
  options,
  picksByOption = {},
  eliminated = [],
  revealCorrect = false,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>👀 YOU'RE WATCHING</Text>
      <Text style={styles.prompt}>{prompt}</Text>
      <View style={styles.options}>
        {options.map((opt, i) => {
          const out = eliminated.includes(i);
          const right = revealCorrect && opt.correct;
          const names = picksByOption[i] ?? [];
          const wrongPick = names.length > 0 && revealCorrect && !opt.correct;
          return (
            <View
              key={i}
              style={[
                styles.option,
                out && styles.optionOut,
                wrongPick && styles.optionWrong,
                right && styles.optionRight,
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  out && styles.optionTextOut,
                  right && styles.optionTextRight,
                ]}
              >
                {right ? "✅ " : out || wrongPick ? "❌ " : ""}
                {opt.text}
              </Text>
              {names.length > 0 && (
                <Text style={styles.picker}>👆 {names.join(", ")}</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#141414",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#333",
    padding: 14,
    marginTop: 4,
  },
  label: {
    color: "#777",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  prompt: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 14,
    lineHeight: 23,
  },
  options: { gap: 8 },
  option: {
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  optionOut: { opacity: 0.45, borderColor: "#5A1A1A" },
  optionWrong: { borderColor: "#FF4500", backgroundColor: "#2A0A0A" },
  optionRight: { borderColor: "#4CAF50", backgroundColor: "#0A2A0A" },
  optionText: { color: "#ddd", fontSize: 15, fontWeight: "600" },
  optionTextOut: { textDecorationLine: "line-through", color: "#888" },
  optionTextRight: { color: "#7CFC7C" },
  picker: { color: "#FFD700", fontSize: 12, fontWeight: "700", marginTop: 4 },
});
