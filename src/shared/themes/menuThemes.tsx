// src/shared/themes/menuThemes.tsx
// 🎨 Game-menu themes: a wallpaper drawn in code (no image files) plus the
// colours the menu's text, buttons and chips use on top of it. A theme is
// chosen for the whole group.
//
// To add one: add an entry to MENU_THEMES with a unique id (ids are saved on
// the group, so don't rename them), its colours, and a Wallpaper.
import { memo, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

export type MenuThemeColors = {
  bg: string;          // under the wallpaper (and while it draws)
  text: string;        // title
  muted: string;       // section labels, small text
  accent: string;      // main buttons, selected chip
  accentText: string;
  chip: string;        // filter chips
  chipText: string;
  chipBorder: string;
  panel: string;       // the standings bar
  panelBorder: string;
};

export type MenuTheme = {
  id: string;
  name: string;
  emoji: string;
  vibe: string;
  colors: MenuThemeColors;
  Wallpaper?: (p: { w: number; h: number }) => ReactNode;
};

// ── Wallpapers ────────────────────────────────────────────────────────

// 🕹️ Synthwave: purple night, striped sun, glowing grid.
const NeonArcade = ({ w, h }: { w: number; h: number }) => {
  const horizon = h * 0.62;
  const cx = w / 2;
  const sunR = w * 0.3;
  const lines: ReactNode[] = [];
  for (let i = -10; i <= 10; i++) {
    lines.push(<Path key={`v${i}`} d={`M ${cx + i * 18} ${horizon} L ${cx + i * w * 0.32} ${h}`} stroke="#FF2BD6" strokeWidth={1.4} opacity={0.7} />);
  }
  for (let k = 1; k <= 9; k++) {
    const y = horizon + (h - horizon) * Math.pow(k / 9, 1.8);
    lines.push(<Path key={`h${k}`} d={`M 0 ${y} L ${w} ${y}`} stroke="#FF2BD6" strokeWidth={1.4} opacity={0.75} />);
  }
  const stars = Array.from({ length: 40 }, (_, i) => {
    const x = (i * 97.3) % w;
    const y = ((i * 53.7) % (horizon * 0.85)) + 6;
    return <Circle key={i} cx={x} cy={y} r={i % 5 === 0 ? 1.6 : 0.9} fill="#FFFFFF" opacity={0.75} />;
  });
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0B0221" />
          <Stop offset="0.62" stopColor="#3B0A5C" />
          <Stop offset="1" stopColor="#12001F" />
        </LinearGradient>
        <LinearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE259" />
          <Stop offset="1" stopColor="#FF2BD6" />
        </LinearGradient>
      </Defs>
      <Rect width={w} height={h} fill="url(#sky)" />
      {stars}
      <Circle cx={cx} cy={horizon - sunR * 0.35} r={sunR} fill="url(#sun)" opacity={0.9} />
      {[0, 1, 2, 3, 4].map((i) => (
        <Rect key={i} x={cx - sunR} y={horizon - sunR * 0.55 + i * sunR * 0.16} width={sunR * 2} height={3 + i * 1.6} fill="#2A0845" />
      ))}
      <Rect x={0} y={horizon} width={w} height={h - horizon} fill="#12001F" />
      {lines}
      <Rect x={0} y={horizon - 1} width={w} height={2} fill="#FF2BD6" />
    </Svg>
  );
};

// 📼 90s Memphis: cream paper with squiggles, triangles, dots and zigzags.
const Memphis = ({ w, h }: { w: number; h: number }) => (
  <Svg width={w} height={h}>
    <Defs>
      <Pattern id="memphis" patternUnits="userSpaceOnUse" width={180} height={180}>
        <Rect width={180} height={180} fill="#FFF4D6" />
        <Path d="M 12 30 q 10 -14 20 0 t 20 0 t 20 0" stroke="#1FB5A8" strokeWidth={4} fill="none" strokeLinecap="round" />
        <Path d="M 120 20 l 22 38 l -44 0 z" fill="#FF5FA2" />
        <Circle cx={40} cy={110} r={12} fill="none" stroke="#6C4AB6" strokeWidth={4} />
        <Path d="M 100 120 l 10 -12 l 10 12 l 10 -12 l 10 12 l 10 -12" stroke="#FFC93C" strokeWidth={4} fill="none" strokeLinejoin="round" />
        <Rect x={140} y={140} width={18} height={18} fill="#1FB5A8" transform="rotate(20 149 149)" />
        <Circle cx={80} cy={70} r={4} fill="#2B1B4A" />
        <Circle cx={160} cy={90} r={4} fill="#2B1B4A" />
        <Circle cx={20} cy={160} r={4} fill="#2B1B4A" />
        <Path d="M 60 150 l 26 0" stroke="#FF5FA2" strokeWidth={5} strokeLinecap="round" />
        <Path d="M 66 160 l 26 0" stroke="#FF5FA2" strokeWidth={5} strokeLinecap="round" />
      </Pattern>
    </Defs>
    <Rect width={w} height={h} fill="url(#memphis)" />
  </Svg>
);

// 🌿 Monsoon: deep greens, big leaves, rain.
const Leaf = ({ x, y, s, r, c }: { x: number; y: number; s: number; r: number; c: string }) => (
  <G transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <Path d="M 0 0 C 30 -40 90 -40 120 0 C 90 40 30 40 0 0 Z" fill={c} />
    <Path d="M 0 0 L 118 0" stroke="#0B2E22" strokeWidth={2} opacity={0.5} />
  </G>
);
const Monsoon = ({ w, h }: { w: number; h: number }) => {
  const leaves = [
    { x: -30, y: 80, s: 1.4, r: 20, c: "#2E8B57" },
    { x: w - 60, y: 30, s: 1.2, r: 150, c: "#3FA66A" },
    { x: w * 0.35, y: h * 0.38, s: 0.9, r: -35, c: "#1F7A4D" },
    { x: -40, y: h * 0.55, s: 1.6, r: -15, c: "#256F4A" },
    { x: w - 30, y: h * 0.7, s: 1.5, r: 200, c: "#2E8B57" },
    { x: w * 0.5, y: h * 0.9, s: 1.3, r: -60, c: "#3FA66A" },
    { x: w * 0.1, y: h * 0.25, s: 0.7, r: 60, c: "#4CAF7A" },
    { x: w * 0.7, y: h * 0.5, s: 0.8, r: 110, c: "#4CAF7A" },
  ];
  const rain = Array.from({ length: 70 }, (_, i) => {
    const x = (i * 61.7) % w;
    const y = (i * 131.3) % h;
    return <Path key={i} d={`M ${x} ${y} l -4 14`} stroke="#BFEFD9" strokeWidth={1.3} opacity={0.35} strokeLinecap="round" />;
  });
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="forest" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0F3D2E" />
          <Stop offset="1" stopColor="#1E6B4F" />
        </LinearGradient>
      </Defs>
      <Rect width={w} height={h} fill="url(#forest)" />
      {leaves.map((l, i) => (
        <Leaf key={i} {...l} />
      ))}
      {rain}
    </Svg>
  );
};

// ☁️ Pastel: pink-to-blue sky, fluffy clouds, tiny stars and hearts.
const Cloud = ({ x, y, s }: { x: number; y: number; s: number }) => (
  <G transform={`translate(${x} ${y}) scale(${s})`} opacity={0.95}>
    <Circle cx={30} cy={30} r={22} fill="#FFFFFF" />
    <Circle cx={60} cy={20} r={28} fill="#FFFFFF" />
    <Circle cx={92} cy={32} r={20} fill="#FFFFFF" />
    <Rect x={10} y={30} width={100} height={22} rx={11} fill="#FFFFFF" />
  </G>
);
const Star = ({ x, y, c }: { x: number; y: number; c: string }) => (
  <Path d={`M ${x} ${y - 7} L ${x + 2} ${y - 2} L ${x + 7} ${y} L ${x + 2} ${y + 2} L ${x} ${y + 7} L ${x - 2} ${y + 2} L ${x - 7} ${y} L ${x - 2} ${y - 2} Z`} fill={c} />
);
const Heart = ({ x, y, c }: { x: number; y: number; c: string }) => (
  <Path d={`M ${x} ${y + 6} C ${x - 10} ${y - 2} ${x - 6} ${y - 10} ${x} ${y - 4} C ${x + 6} ${y - 10} ${x + 10} ${y - 2} ${x} ${y + 6} Z`} fill={c} />
);
const Pastel = ({ w, h }: { w: number; h: number }) => {
  const bits = Array.from({ length: 26 }, (_, i) => {
    const x = (i * 83.1) % w;
    const y = (i * 149.9) % h;
    const c = ["#FFB3D9", "#B9A6FF", "#9FD8FF", "#FFD27F"][i % 4];
    return i % 3 === 0 ? <Heart key={i} x={x} y={y} c={c} /> : <Star key={i} x={x} y={y} c={c} />;
  });
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="pastel" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE3F1" />
          <Stop offset="1" stopColor="#DDEBFF" />
        </LinearGradient>
      </Defs>
      <Rect width={w} height={h} fill="url(#pastel)" />
      <Cloud x={-20} y={40} s={1.3} />
      <Cloud x={w - 120} y={h * 0.22} s={1.1} />
      <Cloud x={w * 0.25} y={h * 0.55} s={1.5} />
      <Cloud x={-30} y={h * 0.8} s={1.2} />
      <Cloud x={w - 140} y={h * 0.88} s={1.4} />
      {bits}
    </Svg>
  );
};

// 🌌 Deep space: stars, nebula glow, a ringed planet and a shooting star.
const DeepSpace = ({ w, h }: { w: number; h: number }) => {
  const stars = Array.from({ length: 90 }, (_, i) => {
    const x = (i * 73.13) % w;
    const y = (i * 151.7) % h;
    const r = i % 9 === 0 ? 1.8 : i % 3 === 0 ? 1.1 : 0.7;
    return <Circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" opacity={i % 4 === 0 ? 0.95 : 0.55} />;
  });
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="space" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#050816" />
          <Stop offset="1" stopColor="#0E1A3D" />
        </LinearGradient>
        <RadialGradient id="neb1" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#7B5CFF" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#7B5CFF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="neb2" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#00C2FF" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#00C2FF" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="planet" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFB86B" />
          <Stop offset="1" stopColor="#C2410C" />
        </LinearGradient>
      </Defs>
      <Rect width={w} height={h} fill="url(#space)" />
      <Circle cx={w * 0.2} cy={h * 0.3} r={w * 0.6} fill="url(#neb1)" />
      <Circle cx={w * 0.9} cy={h * 0.75} r={w * 0.55} fill="url(#neb2)" />
      {stars}
      <G transform={`translate(${w * 0.78} ${h * 0.14})`}>
        <Circle r={34} fill="url(#planet)" />
        <Path d="M -62 6 C -40 -14 40 -22 62 -6" stroke="#FFE2B8" strokeWidth={4} fill="none" opacity={0.85} />
        <Path d="M -62 6 C -30 26 30 18 62 -6" stroke="#FFE2B8" strokeWidth={4} fill="none" opacity={0.5} />
      </G>
      <Path d={`M ${w * 0.08} ${h * 0.08} l ${w * 0.22} ${h * 0.06}`} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" opacity={0.8} />
      <Circle cx={w * 0.3} cy={h * 0.14} r={2.5} fill="#FFFFFF" />
    </Svg>
  );
};

// 👾 8-bit: little pixel invaders, hearts and coins on midnight blue.
const pix = (rows: string[], x: number, y: number, s: number, colors: Record<string, string>, key: string) =>
  rows.flatMap((row, j) =>
    [...row].map((ch, i) =>
      ch === "." ? null : <Rect key={`${key}-${i}-${j}`} x={x + i * s} y={y + j * s} width={s} height={s} fill={colors[ch]} />,
    ),
  );
const INVADER = ["..a.....a..", "...a...a...", "..aaaaaaa..", ".aa.aaa.aa.", "aaaaaaaaaaa", "a.aaaaaaa.a", "a.a.....a.a", "...aa.aa..."];
const HEART = [".rr.rr.", "rrrrrrr", "rrrrrrr", ".rrrrr.", "..rrr..", "...r..."];
const COIN = [".yyy.", "yyoyy", "yyoyy", "yyoyy", ".yyy."];
const Pixel = ({ w, h }: { w: number; h: number }) => (
  <Svg width={w} height={h}>
    <Defs>
      <Pattern id="pixel" patternUnits="userSpaceOnUse" width={150} height={150}>
        <Rect width={150} height={150} fill="#16163A" />
        {pix(INVADER, 12, 14, 4, { a: "#39FF88" }, "inv")}
        {pix(HEART, 96, 30, 4, { r: "#FF4D6D" }, "hrt")}
        {pix(COIN, 40, 92, 4, { y: "#FFD23F", o: "#E09400" }, "coin")}
        {pix(INVADER, 90, 96, 3, { a: "#4CC9F0" }, "inv2")}
        <Rect x={70} y={70} width={3} height={3} fill="#FFFFFF" opacity={0.6} />
        <Rect x={140} y={10} width={3} height={3} fill="#FFFFFF" opacity={0.6} />
        <Rect x={10} y={140} width={3} height={3} fill="#FFFFFF" opacity={0.6} />
      </Pattern>
    </Defs>
    <Rect width={w} height={h} fill="url(#pixel)" />
  </Svg>
);

// 🪔 Diwali: strings of lights across a deep sky, diyas along the bottom.
const Diya = ({ x, y }: { x: number; y: number }) => (
  <G transform={`translate(${x} ${y})`}>
    <Circle cx={0} cy={-18} r={14} fill="#FFB703" opacity={0.25} />
    <Path d="M 0 -26 C 6 -16 5 -10 0 -8 C -5 -10 -6 -16 0 -26 Z" fill="#FFD166" />
    <Path d="M -18 -6 C -14 8 14 8 18 -6 Z" fill="#C2410C" />
    <Path d="M -18 -6 L 18 -6" stroke="#FDBA74" strokeWidth={2} />
  </G>
);
const Diwali = ({ w, h }: { w: number; h: number }) => {
  const strings = [0.12, 0.3, 0.5].map((f, k) => {
    const y0 = h * f;
    const sag = 40 + k * 10;
    const bulbs = Array.from({ length: 11 }, (_, i) => {
      const t = i / 10;
      const x = t * w;
      const y = y0 + 4 * sag * t * (1 - t);
      const c = ["#FFD166", "#FF6B6B", "#4ECDC4", "#FFB703", "#F72585"][(i + k) % 5];
      return (
        <G key={i}>
          <Circle cx={x} cy={y + 6} r={9} fill={c} opacity={0.25} />
          <Circle cx={x} cy={y + 6} r={4} fill={c} />
        </G>
      );
    });
    return (
      <G key={k}>
        <Path d={`M 0 ${y0} Q ${w / 2} ${y0 + 2 * sag} ${w} ${y0}`} stroke="#5B2333" strokeWidth={1.5} fill="none" />
        {bulbs}
      </G>
    );
  });
  const sparks = Array.from({ length: 30 }, (_, i) => (
    <Circle key={i} cx={(i * 89.7) % w} cy={(i * 127.3) % h} r={1.2} fill="#FFE8A3" opacity={0.6} />
  ));
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="diwali" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1A0B2E" />
          <Stop offset="1" stopColor="#4A1030" />
        </LinearGradient>
      </Defs>
      <Rect width={w} height={h} fill="url(#diwali)" />
      {sparks}
      {strings}
      {Array.from({ length: 6 }, (_, i) => (
        <Diya key={i} x={(w / 6) * i + w / 12} y={h - 18} />
      ))}
    </Svg>
  );
};

// 🌸 Rangoli: a repeating flower-mandala tile in festival colours.
const Rangoli = ({ w, h }: { w: number; h: number }) => {
  const S = 210;
  const petals = (n: number, r: number, len: number, c: string, k: string) =>
    Array.from({ length: n }, (_, i) => (
      <Path
        key={`${k}${i}`}
        d={`M 0 ${-r} C ${len * 0.5} ${-r - len * 0.5} ${len * 0.5} ${-r - len} 0 ${-r - len * 1.2} C ${-len * 0.5} ${-r - len} ${-len * 0.5} ${-r - len * 0.5} 0 ${-r} Z`}
        fill={c}
        transform={`rotate(${(360 / n) * i})`}
      />
    ));
  return (
    <Svg width={w} height={h}>
      <Defs>
        <Pattern id="rangoli" patternUnits="userSpaceOnUse" width={S} height={S}>
          <Rect width={S} height={S} fill="#FFF1E6" />
          <G transform={`translate(${S / 2} ${S / 2})`} opacity={0.55}>
            {petals(12, 26, 30, "#F4A261", "o")}
            {petals(8, 12, 22, "#E63971", "p")}
            <Circle r={12} fill="#2A9D8F" />
            <Circle r={6} fill="#FFD166" />
            {Array.from({ length: 16 }, (_, i) => (
              <Circle key={i} cx={0} cy={-66} r={3} fill="#7B2CBF" transform={`rotate(${22.5 * i})`} />
            ))}
          </G>
          {[[0, 0], [S, 0], [0, S], [S, S]].map(([x, y], i) => (
            <G key={i} transform={`translate(${x} ${y})`} opacity={0.55}>
              {petals(6, 4, 12, "#2A9D8F", `c${i}`)}
              <Circle r={4} fill="#E63971" />
            </G>
          ))}
        </Pattern>
      </Defs>
      <Rect width={w} height={h} fill="url(#rangoli)" />
    </Svg>
  );
};

// 🌊 Ocean: deep blue water, rolling waves, bubbles and little fish.
const Fish = ({ x, y, s, c, flip }: { x: number; y: number; s: number; c: string; flip?: boolean }) => (
  <G transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} opacity={0.8}>
    <Path d="M 0 0 C 10 -10 30 -10 40 0 C 30 10 10 10 0 0 Z" fill={c} />
    <Path d="M 40 0 L 52 -9 L 52 9 Z" fill={c} />
    <Circle cx={10} cy={-2} r={2} fill="#06223A" />
  </G>
);
const Ocean = ({ w, h }: { w: number; h: number }) => {
  const wave = (y: number, amp: number, c: string, k: string) => {
    let d = `M 0 ${y}`;
    const step = w / 6;
    for (let i = 0; i < 6; i++) d += ` q ${step / 2} ${i % 2 ? amp : -amp} ${step} 0`;
    d += ` L ${w} ${h} L 0 ${h} Z`;
    return <Path key={k} d={d} fill={c} />;
  };
  const bubbles = Array.from({ length: 28 }, (_, i) => (
    <Circle key={i} cx={(i * 67.9) % w} cy={(i * 113.1) % h} r={2 + (i % 4)} fill="none" stroke="#BDF3FF" strokeWidth={1.2} opacity={0.45} />
  ));
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0A9396" />
          <Stop offset="0.5" stopColor="#005F73" />
          <Stop offset="1" stopColor="#03263B" />
        </LinearGradient>
      </Defs>
      <Rect width={w} height={h} fill="url(#sea)" />
      {bubbles}
      <Fish x={w * 0.1} y={h * 0.3} s={1} c="#FFB703" />
      <Fish x={w * 0.85} y={h * 0.45} s={0.8} c="#FB8500" flip />
      <Fish x={w * 0.3} y={h * 0.62} s={0.7} c="#8ECAE6" />
      {wave(h * 0.8, 14, "#0A4C66", "w1")}
      {wave(h * 0.86, 12, "#073B54", "w2")}
      {wave(h * 0.92, 10, "#04293D", "w3")}
    </Svg>
  );
};

// 🏏 Cricket ground: mowed stripes, the pitch with creases, a ball.
const Cricket = ({ w, h }: { w: number; h: number }) => {
  const band = 46;
  const stripes = Array.from({ length: Math.ceil(h / band) + 1 }, (_, i) => (
    <Rect key={i} x={0} y={i * band} width={w} height={band} fill={i % 2 ? "#2F8F3A" : "#38A845"} />
  ));
  const px = w * 0.62;
  const pw = 70;
  return (
    <Svg width={w} height={h}>
      {stripes}
      <Rect x={px} y={h * 0.08} width={pw} height={h * 0.84} fill="#C9B27C" opacity={0.85} />
      {[0.14, 0.86].map((f, i) => (
        <G key={i}>
          <Rect x={px - 10} y={h * f} width={pw + 20} height={3} fill="#FFFFFF" />
          <Rect x={px + pw / 2 - 9} y={h * f - 16} width={3} height={18} fill="#F4E9D8" />
          <Rect x={px + pw / 2 - 1.5} y={h * f - 16} width={3} height={18} fill="#F4E9D8" />
          <Rect x={px + pw / 2 + 6} y={h * f - 16} width={3} height={18} fill="#F4E9D8" />
        </G>
      ))}
      <Circle cx={w * 0.22} cy={h * 0.2} r={w * 0.38} fill="none" stroke="#FFFFFF" strokeWidth={2} opacity={0.35} />
      <G transform={`translate(${w * 0.2} ${h * 0.62})`}>
        <Circle r={16} fill="#C1121F" />
        <Path d="M -11 -11 C -4 -4 -4 4 -11 11" stroke="#FFE5E5" strokeWidth={1.5} fill="none" strokeDasharray="2 2" />
        <Path d="M 11 -11 C 4 -4 4 4 11 11" stroke="#FFE5E5" strokeWidth={1.5} fill="none" strokeDasharray="2 2" />
      </G>
    </Svg>
  );
};

// ── The themes ────────────────────────────────────────────────────────
export const CLASSIC_ID = "classic";

export const MENU_THEMES: MenuTheme[] = [
  {
    id: CLASSIC_ID,
    name: "Classic",
    emoji: "⬜",
    vibe: "Clean and simple",
    colors: {
      bg: "#F7F7FA", text: "#1A1A2E", muted: "#888888", accent: "#1A1A2E", accentText: "#FFFFFF",
      chip: "#FFFFFF", chipText: "#1A1A2E", chipBorder: "#E2E2EA", panel: "#FFFFFF", panelBorder: "#EAEAEE",
    },
  },
  {
    id: "neon-arcade",
    name: "Neon Arcade",
    emoji: "🕹️",
    vibe: "Synthwave sun and a glowing grid",
    colors: {
      bg: "#0B0221", text: "#FFFFFF", muted: "#D9C6FF", accent: "#FF2BD6", accentText: "#FFFFFF",
      chip: "rgba(20,4,40,0.75)", chipText: "#F3E9FF", chipBorder: "#7B3FB0", panel: "rgba(20,4,40,0.8)", panelBorder: "#7B3FB0",
    },
    Wallpaper: NeonArcade,
  },
  {
    id: "memphis-90s",
    name: "90s Memphis",
    emoji: "📼",
    vibe: "Squiggles, zigzags and loud shapes",
    colors: {
      bg: "#FFF4D6", text: "#2B1B4A", muted: "#6C4AB6", accent: "#FF5FA2", accentText: "#FFFFFF",
      chip: "#FFFFFF", chipText: "#2B1B4A", chipBorder: "#2B1B4A", panel: "#FFFFFF", panelBorder: "#2B1B4A",
    },
    Wallpaper: Memphis,
  },
  {
    id: "monsoon",
    name: "Monsoon Leaves",
    emoji: "🌿",
    vibe: "Rain on big green leaves",
    colors: {
      bg: "#0F3D2E", text: "#F1FFF6", muted: "#BFEFD9", accent: "#F5C542", accentText: "#173B2C",
      chip: "rgba(10,40,30,0.75)", chipText: "#F1FFF6", chipBorder: "#3FA66A", panel: "rgba(10,40,30,0.8)", panelBorder: "#3FA66A",
    },
    Wallpaper: Monsoon,
  },
  {
    id: "pastel-clouds",
    name: "Pastel Clouds",
    emoji: "☁️",
    vibe: "Soft sky, clouds, stars and hearts",
    colors: {
      bg: "#FFE3F1", text: "#5B3A8E", muted: "#8E6CC0", accent: "#FF7EB6", accentText: "#FFFFFF",
      chip: "#FFFFFF", chipText: "#5B3A8E", chipBorder: "#E7D6FF", panel: "rgba(255,255,255,0.9)", panelBorder: "#E7D6FF",
    },
    Wallpaper: Pastel,
  },
  {
    id: "deep-space",
    name: "Deep Space",
    emoji: "🌌",
    vibe: "Stars, nebulas and a ringed planet",
    colors: {
      bg: "#050816", text: "#FFFFFF", muted: "#A9C1FF", accent: "#7B5CFF", accentText: "#FFFFFF",
      chip: "rgba(8,14,40,0.8)", chipText: "#E3EAFF", chipBorder: "#3A4C8F", panel: "rgba(8,14,40,0.85)", panelBorder: "#3A4C8F",
    },
    Wallpaper: DeepSpace,
  },
  {
    id: "pixel-8bit",
    name: "8-bit Pixel",
    emoji: "👾",
    vibe: "Invaders, hearts and coins",
    colors: {
      bg: "#16163A", text: "#39FF88", muted: "#9BE8C0", accent: "#39FF88", accentText: "#0B0B24",
      chip: "rgba(11,11,36,0.85)", chipText: "#DFFFEA", chipBorder: "#2B8A5B", panel: "rgba(11,11,36,0.88)", panelBorder: "#2B8A5B",
    },
    Wallpaper: Pixel,
  },
  {
    id: "diwali",
    name: "Diwali Lights",
    emoji: "🪔",
    vibe: "Strings of lights and glowing diyas",
    colors: {
      bg: "#1A0B2E", text: "#FFE8A3", muted: "#F5C6A5", accent: "#FFB703", accentText: "#3A0D1F",
      chip: "rgba(40,10,35,0.82)", chipText: "#FFF1D0", chipBorder: "#8C3B4B", panel: "rgba(40,10,35,0.86)", panelBorder: "#8C3B4B",
    },
    Wallpaper: Diwali,
  },
  {
    id: "rangoli",
    name: "Rangoli",
    emoji: "🌸",
    vibe: "Festival flower patterns",
    colors: {
      bg: "#FFF1E6", text: "#7B2CBF", muted: "#B5446E", accent: "#E63971", accentText: "#FFFFFF",
      chip: "#FFFFFF", chipText: "#5A189A", chipBorder: "#F4A261", panel: "rgba(255,255,255,0.92)", panelBorder: "#F4A261",
    },
    Wallpaper: Rangoli,
  },
  {
    id: "ocean",
    name: "Ocean",
    emoji: "🌊",
    vibe: "Deep blue water, waves and fish",
    colors: {
      bg: "#005F73", text: "#FFFFFF", muted: "#BDF3FF", accent: "#FFB703", accentText: "#03263B",
      chip: "rgba(3,38,59,0.75)", chipText: "#E8FBFF", chipBorder: "#0A9396", panel: "rgba(3,38,59,0.8)", panelBorder: "#0A9396",
    },
    Wallpaper: Ocean,
  },
  {
    id: "cricket",
    name: "Cricket Ground",
    emoji: "🏏",
    vibe: "Mowed stripes, the pitch and a red ball",
    colors: {
      bg: "#2F8F3A", text: "#FFFFFF", muted: "#E4F7DF", accent: "#C1121F", accentText: "#FFFFFF",
      chip: "rgba(20,70,28,0.85)", chipText: "#FFFFFF", chipBorder: "#9BD48F", panel: "rgba(20,70,28,0.88)", panelBorder: "#9BD48F",
    },
    Wallpaper: Cricket,
  },
];

export const menuThemeById = (id: string | undefined | null): MenuTheme =>
  MENU_THEMES.find((t) => t.id === id) ?? MENU_THEMES[0];

// The wallpaper, filling the screen behind everything.
export const ThemeWallpaper = memo(function ThemeWallpaper({ theme }: { theme: MenuTheme }) {
  const { width, height } = useWindowDimensions();
  if (!theme.Wallpaper) return null;
  const W = theme.Wallpaper;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <W w={width} h={height} />
    </View>
  );
});

const isDark = (hex: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
};

// Style overrides for the game menu (empty for Classic, so it looks exactly
// as before).
export const menuThemeStyles = (t: MenuTheme) => {
  if (t.id === CLASSIC_ID) return {} as Record<string, object>;
  const c = t.colors;
  return {
    container: { backgroundColor: c.bg },
    // A halo behind the title so busy wallpapers never swallow it: dark
    // behind light text, light behind dark text.
    title: { color: c.text, textShadowColor: isDark(c.text) ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
    sectionLabel: { color: c.muted, fontWeight: "800", textShadowColor: isDark(c.muted) ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
    filterEmpty: { color: c.muted },
    standBar: { backgroundColor: c.panel, borderColor: c.panelBorder },
    standText: { color: c.chipText },
    standBtn: { backgroundColor: c.accent },
    standBtnText: { color: c.accentText },
    filterChip: { backgroundColor: c.chip, borderColor: c.chipBorder },
    filterChipOn: { backgroundColor: c.accent, borderColor: c.accent },
    filterText: { color: c.chipText },
    filterTextOn: { color: c.accentText },
  } as Record<string, object>;
};
