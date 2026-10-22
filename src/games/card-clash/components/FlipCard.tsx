// A card that can turn over: shows the back until `flipped`, then rotates
// to the front. The front sets the size; the back covers it exactly.
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View, ViewStyle } from "react-native";
import CardBack from "./CardBack";

type Props = {
  flipped: boolean;
  front: React.ReactNode;
  duration?: number;
  delay?: number;
  style?: ViewStyle;
  onFlipped?: () => void;
  gold?: boolean; // gold-edged back
};

export default function FlipCard({ flipped, front, duration = 420, delay = 0, style, onFlipped, gold }: Props) {
  const v = useRef(new Animated.Value(flipped ? 1 : 0)).current;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const anim = Animated.timing(v, {
      toValue: flipped ? 1 : 0,
      duration,
      delay,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => finished && flipped && onFlipped?.());
    return () => anim.stop();
  }, [flipped]);

  // A little lift in the middle of the turn sells the flip.
  const scale = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] });
  const backRot = v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const frontRot = v.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
  // Hide each face once it's turned away (backfaceVisibility is patchy on Android).
  const backOpacity = v.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const frontOpacity = v.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1] });

  return (
    <View style={style}>
      <Animated.View
        style={{ alignSelf: "flex-start", opacity: frontOpacity, transform: [{ perspective: 1000 }, { rotateY: frontRot }, { scale }] }}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        {front}
      </Animated.View>
      {size && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: size.w,
            height: size.h,
            opacity: backOpacity,
            transform: [{ perspective: 1000 }, { rotateY: backRot }, { scale }],
          }}
        >
          <CardBack width={size.w} height={size.h} gold={gold} />
        </Animated.View>
      )}
    </View>
  );
}
