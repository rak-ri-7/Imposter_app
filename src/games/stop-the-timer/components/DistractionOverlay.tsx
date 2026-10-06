// src/games/timer/components/DistractionOverlay.tsx
import { useEffect, useRef } from "react";
import { Animated, View, Text, StyleSheet, Dimensions } from "react-native";
import { ActiveDistraction } from "../logic/distractions";

type Props = {
  distraction: ActiveDistraction | null;
};

const { width, height } = Dimensions.get("window");

export default function DistractionOverlay({ distraction }: Props) {
  const flashAnim = useRef(new Animated.Value(0)).current;
  const jumpscareScale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (
      distraction?.type === "flash" ||
      distraction?.type === "dark" ||
      distraction?.type === "colorChaos"
    ) {
      flashAnim.setValue(0);
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: Math.max(200, distraction.durationMs - 100),
          useNativeDriver: true,
        }),
      ]).start();
    }

    if (distraction?.type === "jumpscare") {
      jumpscareScale.setValue(0.3);
      Animated.spring(jumpscareScale, {
        toValue: 1,
        friction: 3,
        tension: 120,
        useNativeDriver: true,
      }).start();
    }
  }, [distraction?.id]);

  if (!distraction) return null;

  if (distraction.type === "flash") {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fullscreen,
          { backgroundColor: "#fff", opacity: flashAnim },
        ]}
      />
    );
  }

  if (distraction.type === "dark") {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fullscreen,
          { backgroundColor: "#000", opacity: flashAnim },
        ]}
      />
    );
  }

  if (distraction.type === "colorChaos") {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fullscreen,
          {
            backgroundColor: "#E63946",
            opacity: flashAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.9],
            }),
          },
        ]}
      />
    );
  }

  // Full-screen takeover jump scare.
  if (distraction.type === "jumpscare") {
    return (
      <View pointerEvents="none" style={styles.jumpscareFullscreen}>
        <Animated.Text
          style={[
            styles.jumpscareEmoji,
            { transform: [{ scale: jumpscareScale }] },
          ]}
        >
          {distraction.value}
        </Animated.Text>
      </View>
    );
  }

  if (distraction.type === "fakeNumber") {
    return (
      <View pointerEvents="none" style={styles.centerOverlay}>
        <Text style={styles.fakeNumberText}>{distraction.value}</Text>
      </View>
    );
  }

  if (distraction.type === "fakeStop") {
    return (
      <View pointerEvents="none" style={styles.fakeStopFullscreen}>
        <Text style={styles.fakeStopText}>STOP!</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  fullscreen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  centerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  jumpscareFullscreen: {
    position: "absolute",
    top: 0,
    left: 0,
    width,
    height,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  jumpscareEmoji: { fontSize: 260 },
  fakeNumberText: { fontSize: 100, fontWeight: "bold", color: "#FFD700" },
  fakeStopFullscreen: {
    position: "absolute",
    top: 0,
    left: 0,
    width,
    height,
    backgroundColor: "#E63946",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  fakeStopText: { fontSize: 80, fontWeight: "bold", color: "#fff" },
});
