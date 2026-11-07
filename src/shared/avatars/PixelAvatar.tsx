// src/shared/avatars/PixelAvatar.tsx
// Draws one pixel avatar (see sprites.ts) at any size, sharp-edged, on its
// rounded coloured tile. Pass the player's saved avatar id and their id: a
// player who never picked one still gets a steady avatar of their own.
import { memo, useMemo } from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { avatarById, fallbackAvatar, type Sprite } from "./sprites";

type Props = {
    avatar?: string | null;
    playerId?: string;
    size?: number;
    dim?: boolean;      // greyed out (taken by someone else, or offline)
    tile?: boolean;     // draw the coloured tile behind (default true)
};

// Merge each row's same-coloured neighbours into one rectangle: 14 × 14
// cells become ~60 rectangles instead of ~150.
const runs = (s: Sprite) => {
    const out: { x: number; y: number; w: number; c: string }[] = [];
    s.grid.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            const c = row[x];
            let w = 1;
            while (c && row[x + w] === c) w++;
            if (c) out.push({ x, y, w, c });
            x += w;
        }
    });
    return out;
};

const cache = new Map<string, ReturnType<typeof runs>>();
const runsOf = (s: Sprite) => {
    let r = cache.get(s.id);
    if (!r) cache.set(s.id, (r = runs(s)));
    return r;
};

function PixelAvatar({ avatar, playerId = "", size = 40, dim = false, tile = true }: Props) {
    const sprite = avatarById(avatar) ?? fallbackAvatar(playerId);
    const rects = useMemo(() => runsOf(sprite), [sprite.id]);
    const n = sprite.grid.length;
    const pad = tile ? 2 : 0; // a little breathing room inside the tile
    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: Math.round(size * 0.24),
                backgroundColor: tile ? sprite.bg : "transparent",
                opacity: dim ? 0.35 : 1,
                overflow: "hidden",
            }}
        >
            <Svg width={size} height={size} viewBox={`${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`}>
                {rects.map((r, i) => (
                    // a hair wider so no seams show between neighbours
                    <Rect key={i} x={r.x} y={r.y} width={r.w + 0.02} height={1.02} fill={r.c} />
                ))}
            </Svg>
        </View>
    );
}

export default memo(PixelAvatar);
