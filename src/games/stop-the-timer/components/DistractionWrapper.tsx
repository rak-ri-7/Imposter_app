// src/games/timer/components/DistractionWrapper.tsx
import { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";
import { ActiveDistraction } from "../logic/distractions";

type Props = {
  children: React.ReactNode;
  distraction: ActiveDistraction | null;
};

export default function DistractionWrapper({ children, distraction }: Props) {
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const moveAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shakeLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const moveLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    shakeLoopRef.current?.stop();
    moveLoopRef.current?.stop();
    scaleAnim.stopAnimation();
    shakeAnim.setValue(0);
    moveAnim.setValue(0);
    scaleAnim.setValue(1);

    if (!distraction) return;

    if (distraction.type === "shake") {
      shakeLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, {
            toValue: 8,
            duration: 40,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: -8,
            duration: 40,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: 6,
            duration: 40,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: -6,
            duration: 40,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: 0,
            duration: 40,
            useNativeDriver: true,
          }),
        ]),
      );
      shakeLoopRef.current.start();
    }

    if (distraction.type === "moveText") {
      moveLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(moveAnim, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(moveAnim, {
            toValue: -1,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(moveAnim, {
            toValue: 0.6,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(moveAnim, {
            toValue: -0.6,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(moveAnim, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }),
        ]),
      );
      moveLoopRef.current.start();
    }

    if (distraction.type === "shrinkText") {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.35,
          duration: distraction.durationMs * 0.4,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: distraction.durationMs * 0.6,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => {
      shakeLoopRef.current?.stop();
      moveLoopRef.current?.stop();
    };
  }, [distraction?.id]);

  const hideContent = distraction?.type === "disappear";
  const invertActive = distraction?.type === "invertText";

  const translateX = Animated.add(
    shakeAnim,
    moveAnim.interpolate({ inputRange: [-1, 1], outputRange: [-60, 60] }),
  );

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { transform: [{ translateX }, { scale: scaleAnim }] },
      ]}
    >
      <View style={{ opacity: hideContent ? 0 : 1 }}>{children}</View>

      {invertActive && (
        <View pointerEvents="none" style={styles.invertOverlay} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  invertOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    opacity: 0.85,
  },
});
