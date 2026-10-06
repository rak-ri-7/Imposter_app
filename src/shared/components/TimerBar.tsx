import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Animated } from "react-native";

type Props = {
  duration?: number;
  onExpire?: () => void;
  running: boolean;
};

export default function TimerBar({ duration = 30, onExpire, running }: Props) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [widthAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (!running) {
      setTimeLeft(duration);
      widthAnim.setValue(1);
      return;
    }

    setTimeLeft(duration);
    widthAnim.setValue(1);

    Animated.timing(widthAnim, {
      toValue: 0,
      duration: duration * 1000,
      useNativeDriver: false,
    }).start();

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [running, duration]);

  const isUrgent = timeLeft <= 10;

  return (
    <View style={styles.container}>
      <View style={styles.barBackground}>
        <Animated.View
          style={[
            styles.barFill,
            {
              width: widthAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
              backgroundColor: isUrgent ? "#E63946" : "#4CAF50",
            },
          ]}
        />
      </View>
      <Text style={[styles.timer, isUrgent && styles.timerUrgent]}>
        {timeLeft}s
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  barBackground: {
    flex: 1,
    height: 6,
    backgroundColor: "#16213E",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  timer: {
    color: "#888",
    fontSize: 13,
    fontWeight: "600",
    width: 30,
    textAlign: "right",
  },
  timerUrgent: {
    color: "#E63946",
  },
});
