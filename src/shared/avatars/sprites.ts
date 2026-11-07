// src/shared/avatars/sprites.ts
// 🐾 Pixel avatars, drawn in code (no image files): each one is a 14 × 14
// grid of colours. Most are built from one chibi head shape with different
// ears, markings and colours so the whole set looks like one family; a few
// (robot, ghost, alien, slime) have their own shapes. A dark outline is
// added around every shape automatically.
//
// To add an avatar: add an entry to SPECS (or a custom shape) and give it a
// unique id. Ids are saved with players, so never rename an existing one.

export type Pixel = string | null; // a colour, or transparent
export type Sprite = { id: string; name: string; bg: string; grid: Pixel[][] };

const N = 14;
const OUTLINE = "#2A1E1C";
const EYE = "#2A1E1C";
const WHITE = "#FFFFFF";
const BLUSH = "#F49AA8";

type XY = [number, number];
const blank = (): Pixel[][] => Array.from({ length: N }, () => Array<Pixel>(N).fill(null));
const mirror = (cells: XY[]): XY[] => cells.map(([x, y]) => [N - 1 - x, y] as XY);
const both = (cells: XY[]): XY[] => [...cells, ...mirror(cells)];
const rect = (x0: number, y0: number, x1: number, y1: number): XY[] => {
    const out: XY[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
    return out;
};
const paint = (g: Pixel[][], cells: XY[], c: Pixel) => cells.forEach(([x, y]) => x >= 0 && y >= 0 && x < N && y < N && (g[y][x] = c));

// The round head every animal shares (columns 2-11, rows 3-12).
const HEAD: XY[] = [...rect(4, 3, 9, 3), ...rect(3, 4, 10, 4), ...rect(2, 5, 11, 10), ...rect(3, 11, 10, 11), ...rect(4, 12, 9, 12)];

// Outline: every empty cell touching a filled one turns dark.
const outline = (g: Pixel[][]) => {
    const fill = g.map((row) => row.map((c) => c !== null));
    for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
            if (fill[y][x]) continue;
            const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => fill[y + dy]?.[x + dx]);
            if (near) g[y][x] = OUTLINE;
        }
    return g;
};

type Ears = "none" | "cat" | "bear" | "bunny" | "fox" | "mouse" | "dog" | "monkey" | "tuft" | "horn";
type Spec = {
    id: string;
    name: string;
    bg: string;
    face: string;
    ears?: Ears;
    ear?: string;            // ear colour (defaults to face)
    inner?: string;          // inside of the ear
    muzzle?: string;         // lighter snout patch
    nose?: string;
    beak?: string;
    blush?: boolean;
    extra?: (g: Pixel[][]) => void;
};

const earCells = (e: Ears): { outer: XY[]; inner: XY[] } => {
    switch (e) {
        case "cat":
            return { outer: both([[2, 1], [2, 2], [3, 2], [2, 3], [3, 3], [4, 2]]), inner: both([[3, 3]]) };
        case "fox":
            return { outer: both([[2, 0], [2, 1], [3, 1], [2, 2], [3, 2], [4, 2], [2, 3], [3, 3]]), inner: both([[3, 2], [3, 3]]) };
        case "bear":
            return { outer: both(rect(2, 1, 4, 3)), inner: both([[3, 2]]) };
        case "mouse":
            return { outer: both([...rect(1, 1, 4, 3), [2, 0], [3, 0], [1, 4]]), inner: both(rect(2, 1, 3, 2)) };
        case "bunny":
            return { outer: both(rect(4, 0, 5, 3)), inner: both([[4, 1], [4, 2]]) };
        case "dog":
            return { outer: both([...rect(1, 4, 2, 9)]), inner: [] };
        case "monkey":
            return { outer: both([[1, 6], [1, 7], [1, 8], [0, 7]]), inner: both([[1, 7]]) };
        case "tuft":
            return { outer: [[6, 1], [7, 1], [7, 2], [6, 2], [8, 0]], inner: [] };
        case "horn":
            return { outer: [[7, 0], [7, 1], [6, 2], [7, 2]], inner: [] };
        default:
            return { outer: [], inner: [] };
    }
};

const animal = (s: Spec): Sprite => {
    const g = blank();
    const ears = earCells(s.ears ?? "none");
    paint(g, ears.outer, s.ear ?? s.face);
    paint(g, HEAD, s.face);
    if (s.ears === "dog") paint(g, ears.outer, s.ear ?? s.face); // floppy ears sit over the head's sides
    paint(g, ears.inner, s.inner ?? s.face);
    if (s.muzzle) paint(g, [...rect(5, 9, 8, 11), [4, 10], [9, 10]], s.muzzle);
    // eyes (two pixels tall) with a highlight
    paint(g, [[4, 7], [4, 8], [9, 7], [9, 8]], EYE);
    paint(g, [[4, 7], [9, 7]], WHITE);
    paint(g, [[4, 8], [9, 8]], EYE);
    if (s.blush !== false) paint(g, [[3, 9], [10, 9]], BLUSH);
    if (s.nose) paint(g, [[6, 9], [7, 9]], s.nose);
    if (s.beak) paint(g, [[6, 9], [7, 9], [6, 10], [7, 10]], s.beak);
    s.extra?.(g);
    return { id: s.id, name: s.name, bg: s.bg, grid: outline(g) };
};

const SPECS: Spec[] = [
    { id: "cat", name: "Cat", bg: "#F4B860", face: "#F7A94B", ears: "cat", inner: "#F49AA8", nose: "#E2607A",
      extra: (g) => paint(g, [[5, 4], [7, 4]], "#D9822B") },
    { id: "dog", name: "Pup", bg: "#8FC1E3", face: "#E8C9A0", ears: "dog", ear: "#9B6A43", muzzle: "#FFF1DC", nose: EYE },
    { id: "panda", name: "Panda", bg: "#A8E6CF", face: WHITE, ears: "bear", ear: "#2A1E1C", inner: "#2A1E1C", nose: EYE,
      extra: (g) => { paint(g, both(rect(3, 6, 4, 8)), "#2A1E1C"); paint(g, [[4, 7], [9, 7]], WHITE); } },
    { id: "fox", name: "Fox", bg: "#7DCEA0", face: "#F08A3E", ears: "fox", inner: "#FFF1DC", nose: EYE,
      extra: (g) => paint(g, both([...rect(2, 9, 4, 10), [3, 11], [4, 11], [5, 11], [4, 12], [5, 12]]), "#FFF1DC") },
    { id: "bunny", name: "Bunny", bg: "#C3B1E1", face: "#F5F0F0", ears: "bunny", inner: "#F49AA8", nose: "#E2607A" },
    { id: "bear", name: "Bear", bg: "#F7D794", face: "#A86B3C", ears: "bear", inner: "#E8B88A", muzzle: "#E8B88A", nose: EYE },
    { id: "hamster", name: "Hamster", bg: "#D7BDE2", face: "#F2C38B", ears: "bear", inner: "#F49AA8", muzzle: "#FFF6E8", nose: "#E2607A" },
    { id: "frog", name: "Frog", bg: "#F9E79F", face: "#6FCF6A", ears: "none", blush: true,
      extra: (g) => { paint(g, both(rect(2, 2, 5, 5)), "#6FCF6A"); paint(g, both(rect(3, 3, 4, 4)), WHITE); paint(g, both([[4, 4]]), EYE);
        paint(g, [[4, 7], [4, 8], [9, 7], [9, 8]], "#6FCF6A"); paint(g, rect(5, 9, 8, 9), "#2E7D32"); } },
    { id: "pig", name: "Piggy", bg: "#AED6F1", face: "#F8B4C4", ears: "cat", ear: "#F08FA8", inner: "#F08FA8",
      extra: (g) => { paint(g, rect(5, 9, 8, 10), "#F08FA8"); paint(g, [[6, 10], [7, 10]].map(([x, y]) => [x - 0, y] as XY), "#C2577A"); paint(g, [[6, 9], [7, 9]], "#F08FA8"); } },
    { id: "mouse", name: "Mouse", bg: "#F5CBA7", face: "#B8B8C8", ears: "mouse", inner: "#F49AA8", nose: "#E2607A" },
    { id: "tiger", name: "Tiger", bg: "#85C1E9", face: "#F59B3A", ears: "bear", inner: "#FFF1DC", muzzle: "#FFF1DC", nose: "#E2607A",
      extra: (g) => paint(g, [[6, 3], [7, 3], [6, 4], [2, 6], [2, 7], [11, 6], [11, 7], [3, 5], [10, 5]], "#3B2A20") },
    { id: "monkey", name: "Monkey", bg: "#F9E79F", face: "#9B6A43", ears: "monkey", inner: "#E8C9A0",
      extra: (g) => { paint(g, [...rect(3, 6, 10, 10), ...rect(4, 11, 9, 11)], "#E8C9A0"); paint(g, [[4, 7], [9, 7]], WHITE); paint(g, [[4, 8], [9, 8]], EYE); paint(g, [[6, 10], [7, 10]], "#7A4E2E"); } },
    { id: "penguin", name: "Penguin", bg: "#AED6F1", face: "#2F3542", ears: "none", beak: "#F5A623", blush: true,
      extra: (g) => { paint(g, [...rect(3, 6, 10, 11), ...rect(4, 5, 5, 5), ...rect(8, 5, 9, 5), ...rect(4, 12, 9, 12)], WHITE);
        paint(g, [[4, 7], [9, 7]], WHITE); paint(g, [[4, 8], [9, 8]], EYE); paint(g, [[6, 9], [7, 9], [6, 10], [7, 10]], "#F5A623"); paint(g, [[3, 9], [10, 9]], BLUSH); } },
    { id: "chick", name: "Chick", bg: "#F5B7B1", face: "#FFD93D", ears: "tuft", ear: "#FFD93D", beak: "#F5872A" },
    { id: "owl", name: "Owl", bg: "#D7BDE2", face: "#8E6E53", ears: "cat", inner: "#6B4F3A", beak: "#F5A623", blush: false,
      extra: (g) => { paint(g, both(rect(3, 6, 5, 8)), "#FFF1DC"); paint(g, [[4, 7], [9, 7]], EYE); paint(g, [[4, 6], [9, 6]], "#FFF1DC"); paint(g, rect(6, 10, 7, 10), "#F5A623"); paint(g, [[6, 9], [7, 9]], "#F5A623"); } },
    { id: "koala", name: "Koala", bg: "#A3E4D7", face: "#9AA5B1", ears: "mouse", ear: "#9AA5B1", inner: "#F5F0F0",
      extra: (g) => paint(g, [...rect(6, 8, 7, 10), [5, 9], [8, 9]], "#2F3542") },
    { id: "lion", name: "Lion", bg: "#82E0AA", face: "#F7C05A", ears: "none", muzzle: "#FFF1DC", nose: "#7A4E2E",
      extra: (g) => {
        const ring: XY[] = [...rect(3, 1, 10, 2), ...rect(1, 3, 2, 11), ...rect(11, 3, 12, 11), ...rect(2, 2, 2, 2), ...rect(11, 2, 11, 2), ...rect(2, 12, 3, 12), ...rect(10, 12, 11, 12), ...rect(4, 13, 9, 13), [3, 3], [10, 3], [2, 11], [11, 11]];
        ring.forEach(([x, y]) => g[y][x] === null && (g[y][x] = "#C0662B"));
      } },
    { id: "unicorn", name: "Unicorn", bg: "#F5B7B1", face: "#FBF5FF", ears: "horn", ear: "#FFD93D", nose: "#F49AA8",
      extra: (g) => paint(g, [[10, 3], [11, 4], [11, 5], [12, 6], [12, 7], [11, 3], [12, 5]], "#B98AE8") },
];

// ── Shapes of their own ─────────────────────────────────────────────
const custom = (id: string, name: string, bg: string, draw: (g: Pixel[][]) => void): Sprite => {
    const g = blank();
    draw(g);
    return { id, name, bg, grid: outline(g) };
};

const CUSTOM: Sprite[] = [
    custom("robot", "Robot", "#F9E79F", (g) => {
        paint(g, [[6, 0], [7, 0], [6, 1], [7, 1]], "#E74C3C");
        paint(g, [[6, 2], [7, 2]], "#7F8C8D");
        paint(g, rect(2, 3, 11, 11), "#B4C0CC");
        paint(g, rect(3, 5, 10, 8), "#2F3542");
        paint(g, [[4, 6], [5, 6], [8, 6], [9, 6], [4, 7], [9, 7]], "#4FE3E3");
        paint(g, [[5, 10], [6, 10], [7, 10], [8, 10]], "#7F8C8D");
        paint(g, [[1, 6], [1, 7], [12, 6], [12, 7]], "#7F8C8D");
    }),
    custom("ghost", "Ghost", "#C3B1E1", (g) => {
        paint(g, [...rect(4, 2, 9, 2), ...rect(3, 3, 10, 3), ...rect(2, 4, 11, 11), [2, 12], [4, 12], [5, 12], [8, 12], [9, 12], [11, 12]], "#F8F8FF");
        paint(g, [[4, 6], [4, 7], [9, 6], [9, 7]], EYE);
        paint(g, [[6, 9], [7, 9], [6, 10], [7, 10]], EYE);
        paint(g, [[3, 8], [10, 8]], BLUSH);
    }),
    custom("alien", "Alien", "#D7BDE2", (g) => {
        paint(g, [[3, 0], [10, 0], [3, 1], [10, 1], [4, 2], [9, 2]], "#7BD66B");
        paint(g, [...rect(4, 3, 9, 3), ...rect(3, 4, 10, 4), ...rect(2, 5, 11, 8), ...rect(3, 9, 10, 9), ...rect(4, 10, 9, 10), ...rect(5, 11, 8, 11)], "#7BD66B");
        paint(g, [...rect(3, 6, 5, 7), [4, 8], ...rect(8, 6, 10, 7), [9, 8]], EYE);
        paint(g, [[4, 6], [9, 6]], WHITE);
        paint(g, [[6, 10], [7, 10]], "#3E8E35");
    }),
    custom("slime", "Slime", "#AED6F1", (g) => {
        paint(g, [...rect(6, 3, 7, 3), ...rect(5, 4, 8, 4), ...rect(4, 5, 9, 5), ...rect(3, 6, 10, 7), ...rect(2, 8, 11, 11), ...rect(3, 12, 10, 12)], "#5DD39E");
        paint(g, [[6, 4], [5, 5]], "#B8F2D6");
        paint(g, [[4, 8], [4, 9], [9, 8], [9, 9]], EYE);
        paint(g, [[4, 8], [9, 8]], WHITE);
        paint(g, [[6, 10], [7, 10]], EYE);
        paint(g, [[3, 10], [10, 10]], BLUSH);
    }),
    custom("mushroom", "Shroom", "#A3E4D7", (g) => {
        paint(g, [...rect(4, 1, 9, 1), ...rect(2, 2, 11, 2), ...rect(1, 3, 12, 6)], "#E74C3C");
        paint(g, [[3, 3], [4, 3], [8, 4], [9, 4], [5, 2], [11, 5], [2, 5]], WHITE);
        paint(g, [...rect(3, 7, 10, 11), ...rect(4, 12, 9, 12)], "#FBEBD3");
        paint(g, [[5, 8], [5, 9], [8, 8], [8, 9]], EYE);
        paint(g, [[5, 8], [8, 8]], WHITE);
        paint(g, [[4, 10], [9, 10]], BLUSH);
        paint(g, [[6, 10], [7, 10]], EYE);
    }),
    custom("onigiri", "Rice Ball", "#F5CBA7", (g) => {
        paint(g, [...rect(6, 1, 7, 1), ...rect(5, 2, 8, 2), ...rect(4, 3, 9, 4), ...rect(3, 5, 10, 6), ...rect(2, 7, 11, 11), ...rect(3, 12, 10, 12)], WHITE);
        paint(g, rect(4, 9, 9, 12), "#2F3542");
        paint(g, [[4, 6], [4, 7], [9, 6], [9, 7]], EYE);
        paint(g, [[3, 8], [10, 8]], BLUSH);
        paint(g, [[6, 7], [7, 7]], EYE);
    }),
];

export const AVATARS: Sprite[] = [...SPECS.map(animal), ...CUSTOM];
export const DEFAULT_AVATAR = "cat";
export const avatarById = (id: string | undefined | null): Sprite | null => AVATARS.find((a) => a.id === id) ?? null;

// A stable pick for players who never chose one (from their id), avoiding
// any avatar in `inUse` when there's a free one.
export const fallbackAvatar = (playerId: string, inUse: (string | undefined)[] = []): Sprite => {
    let h = 0;
    for (const ch of playerId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const free = AVATARS.filter((a) => !inUse.includes(a.id));
    const pool = free.length ? free : AVATARS;
    return pool[h % pool.length];
};

// The avatar id to show for a player in a group: theirs, or a stand-in no
// one else in the group is using.
export const avatarIdFor = (p: { id: string; avatar?: string }, everyone: { id: string; avatar?: string }[]): string =>
    avatarById(p.avatar)?.id ?? fallbackAvatar(p.id, everyone.filter((o) => o.id !== p.id).map((o) => o.avatar)).id;
