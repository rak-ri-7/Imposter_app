// src/games/timer/data/questions.ts
//
// Every question resolves to a whole number between MIN_ANSWER and
// MAX_ANSWER seconds. Each template returns { q, a } or null; anything
// invalid (null, non-integer, out of range) is simply re-rolled, so a
// template never has to call itself recursively.

export type Difficulty = 'easy' | 'medium' | 'hard';

export type Question = {
    question: string;
    answer: number;
    difficulty: Difficulty;
    templateId: string; // e.g. 'month:add' — the part before ':' is the family
};

export const MIN_ANSWER = 3;
export const MAX_ANSWER = 30;

// ── HELPERS ───────────────────────────────────────────────────
const pick = (min: number, max: number): number =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const choice = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

const shuffle = <T>(arr: T[]): T[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
};

const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const toRoman = (n: number) => {
    const table: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [value, sym] of table) {
        while (n >= value) {
            out += sym;
            n -= value;
        }
    }
    return out;
};

// Placeholders: month(6) → 'June'. Month numbers are 1-based.
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const month = (n: number) => MONTHS[n - 1];
const wrap12 = (n: number) => (((n - 1) % 12) + 12) % 12 + 1;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const wrap7 = (n: number) => (((n - 1) % 7) + 7) % 7 + 1;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const letterValue = (ch: string) => ALPHABET.indexOf(ch) + 1;

const GIRLS = ['Riya', 'Meera', 'Ananya', 'Isha', 'Priya', 'Sara'];
const BOYS = ['Arjun', 'Kabir', 'Rohan', 'Dev', 'Aditya', 'Vikram'];
const NAMES = [...GIRLS, ...BOYS];

// ── TEMPLATE PLUMBING ─────────────────────────────────────────
type Made = { q: string; a: number } | null;
type Template = { id: string; difficulty: Difficulty; make: () => Made };
const T = (id: string, difficulty: Difficulty, make: () => Made): Template => ({ id, difficulty, make });

// ── PLAIN MATHS ───────────────────────────────────────────────
const MATH: Template[] = [
    // easy
    T('math:add', 'easy', () => {
        const x = pick(1, 15), y = pick(1, 15);
        return { q: `${x} + ${y} = ?`, a: x + y };
    }),
    T('math:sub', 'easy', () => {
        const x = pick(10, 30), y = pick(1, x - 3);
        return { q: `${x} - ${y} = ?`, a: x - y };
    }),
    T('math:mul', 'easy', () => {
        const x = pick(2, 6), y = pick(2, 5);
        return { q: `${x} × ${y} = ?`, a: x * y };
    }),
    T('math:div', 'easy', () => {
        const ans = pick(3, 10), y = pick(2, 5);
        return { q: `${ans * y} ÷ ${y} = ?`, a: ans };
    }),
    T('math:half', 'easy', () => {
        const ans = pick(3, 15);
        return { q: `Half of ${ans * 2} = ?`, a: ans };
    }),
    T('math:double', 'easy', () => {
        const n = pick(2, 15);
        return { q: `Double ${n} = ?`, a: n * 2 };
    }),
    T('math:triple', 'easy', () => {
        const n = pick(2, 10);
        return { q: `Triple ${n} = ?`, a: n * 3 };
    }),
    T('math:add3', 'easy', () => {
        const x = pick(1, 9), y = pick(1, 9), z = pick(1, 9);
        return { q: `${x} + ${y} + ${z} = ?`, a: x + y + z };
    }),
    T('math:dozen-minus', 'easy', () => {
        const y = pick(1, 9);
        return { q: `A dozen minus ${y} = ?`, a: 12 - y };
    }),

    // medium
    T('alg:x-plus', 'medium', () => {
        const ans = pick(3, 20), y = pick(2, 10);
        return { q: `x + ${y} = ${ans + y}, x = ?`, a: ans };
    }),
    T('alg:2x', 'medium', () => {
        const ans = pick(3, 15);
        return { q: `2x = ${ans * 2}, x = ?`, a: ans };
    }),
    T('alg:x-minus', 'medium', () => {
        const ans = pick(6, 25), y = pick(2, 5);
        return { q: `x - ${y} = ${ans - y}, x = ?`, a: ans };
    }),
    T('alg:3x', 'medium', () => {
        const ans = pick(3, 10);
        return { q: `3x = ${ans * 3}, x = ?`, a: ans };
    }),
    T('alg:x-div', 'medium', () => {
        const y = pick(2, 5), ans = pick(2, 6) * y;
        return { q: `x ÷ ${y} = ${ans / y}, x = ?`, a: ans };
    }),
    T('bodmas:mul-add', 'medium', () => {
        const x = pick(2, 5), y = pick(2, 4), z = pick(1, 6);
        return { q: `${x} × ${y} + ${z} = ?`, a: x * y + z };
    }),
    T('bodmas:mul-sub', 'medium', () => {
        const x = pick(3, 6), y = pick(2, 4), z = pick(1, 6);
        return { q: `${x} × ${y} - ${z} = ?`, a: x * y - z };
    }),
    T('alg:2x-plus', 'medium', () => {
        const ans = pick(2, 10), y = pick(1, 6);
        return { q: `2x + ${y} = ${2 * ans + y}, x = ?`, a: ans };
    }),
    T('bodmas:div-add', 'medium', () => {
        const d = pick(2, 4), x = pick(2, 5) * d, z = pick(1, 8);
        return { q: `${x} ÷ ${d} + ${z} = ?`, a: x / d + z };
    }),

    // hard
    T('alg:3x-plus', 'hard', () => {
        const ans = pick(2, 8), y = pick(1, 5);
        return { q: `3x + ${y} = ${3 * ans + y}, x = ?`, a: ans };
    }),
    T('alg:4x-minus', 'hard', () => {
        const ans = pick(2, 7), y = pick(1, 4);
        return { q: `4x - ${y} = ${4 * ans - y}, x = ?`, a: ans };
    }),
    T('bodmas:bracket', 'hard', () => {
        const x = pick(2, 6), y = pick(2, 6), z = pick(2, 3);
        return { q: `(${x} + ${y}) × ${z} = ?`, a: (x + y) * z };
    }),
    T('bodmas:two-products', 'hard', () => {
        const w = pick(2, 4), x = pick(2, 4), y = pick(2, 3), z = pick(2, 4);
        return { q: `${w} × ${x} + ${y} × ${z} = ?`, a: w * x + y * z };
    }),
    T('alg:both-sides', 'hard', () => {
        const ans = pick(4, 20), n = pick(1, 5);
        return { q: `2x - ${n} = x + ${ans - n}, x = ?`, a: ans };
    }),
    T('alg:bracket-x', 'hard', () => {
        const ans = pick(2, 12), y = pick(1, 5);
        return { q: `(x + ${y}) × 2 = ${(ans + y) * 2}, x = ?`, a: ans };
    }),
    T('bodmas:products-sub', 'hard', () => {
        const w = pick(3, 6), x = pick(3, 5), y = pick(2, 4), z = pick(2, 3);
        return { q: `${w} × ${x} - ${y} × ${z} = ?`, a: w * x - y * z };
    }),
    T('bodmas:div-mul', 'hard', () => {
        const d = pick(2, 4), m = pick(2, 4), base = pick(2, 5);
        return { q: `${base * d} ÷ ${d} × ${m} = ?`, a: base * m };
    }),
];

// ── MONTHS ────────────────────────────────────────────────────
const MONTH_Q: Template[] = [
    T('month:number', 'easy', () => {
        const m = pick(3, 12);
        return { q: `${month(m)} is month number ?`, a: m };
    }),
    T('month:letters', 'easy', () => {
        const name = month(pick(1, 12)).toUpperCase();
        return { q: `How many letters in ${name}?`, a: name.length };
    }),
    T('month:days', 'easy', () => {
        const m = choice([2, 4, 6, 9, 11]);
        return {
            q: `How many days in ${month(m)}${m === 2 ? ' (not a leap year)' : ''}?`,
            a: DAYS_IN_MONTH[m - 1],
        };
    }),
    T('month:add', 'medium', () => {
        const x = pick(1, 12), y = pick(1, 12);
        if (x === y) return null;
        return { q: `${month(x)} + ${month(y)} = ?\n(months as numbers)`, a: x + y };
    }),
    T('month:sub', 'medium', () => {
        const x = pick(4, 12), y = pick(1, x - 3);
        return { q: `${month(x)} - ${month(y)} = ?\n(months as numbers)`, a: x - y };
    }),
    T('month:until', 'medium', () => {
        const from = pick(1, 12), to = pick(1, 12);
        return {
            q: `It's ${month(from)}. How many months until ${month(to)}?`,
            a: (to - from + 12) % 12,
        };
    }),
    T('month:mul', 'hard', () => {
        const m = pick(2, 10), k = pick(2, 5);
        return { q: `${month(m)} × ${k} = ?\n(months as numbers)`, a: m * k };
    }),
    T('month:mix', 'hard', () => {
        const x = pick(1, 12), y = pick(1, 12), z = pick(1, 12);
        if (x === y || y === z || x === z) return null;
        return { q: `${month(x)} + ${month(y)} - ${month(z)} = ?\n(months as numbers)`, a: x + y - z };
    }),
    T('month:after', 'hard', () => {
        const m = pick(6, 12), k = pick(3, 11);
        if (m + k <= 12) return null; // only the ones that wrap into next year
        return { q: `${k} months after ${month(m)} is month number ?`, a: wrap12(m + k) };
    }),
    T('month:before', 'hard', () => {
        const m = pick(1, 6), k = pick(2, 10);
        if (m - k >= 1) return null; // only the ones that wrap into last year
        return { q: `${k} months before ${month(m)} is month number ?`, a: wrap12(m - k) };
    }),
    T('date:cross-month', 'hard', () => {
        const m = choice([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); // skip Feb (leap years)
        const days = DAYS_IN_MONTH[m - 1];
        const start = pick(days - 8, days);
        const ans = pick(3, 12);
        const k = days - start + ans;
        return { q: `What date in ${month(wrap12(m + 1))} is ${k} days after ${start} ${month(m)}?`, a: ans };
    }),
];

// ── DATES & DAYS ──────────────────────────────────────────────
const DATE_Q: Template[] = [
    T('date:weeks-later', 'easy', () => {
        const w = pick(1, 2), d = pick(1, 30 - 7 * w);
        return {
            q: `Today is the ${ordinal(d)}. What's the date ${w === 1 ? 'one week' : 'two weeks'} from today?`,
            a: d + 7 * w,
        };
    }),
    T('date:yesterday', 'hard', () => {
        const d = pick(6, 30);
        return { q: `The day after tomorrow is the ${ordinal(d)}. What was yesterday's date?`, a: d - 3 };
    }),
    T('date:tomorrow', 'hard', () => {
        const d = pick(1, 27);
        return { q: `The day before yesterday was the ${ordinal(d)}. What's tomorrow's date?`, a: d + 3 };
    }),
    T('date:weekday', 'hard', () => {
        const start = pick(1, 7), k = pick(8, 30);
        return {
            q: `Monday = 1 … Sunday = 7.\nWhat's ${k} days after ${WEEKDAYS[start - 1]}?`,
            a: wrap7(start + k),
        };
    }),
];

// ── TIME & CLOCKS ─────────────────────────────────────────────
const TIME_Q: Template[] = [
    T('time:24h', 'easy', () => {
        const h = pick(15, 23);
        return { q: `${h}:00 in 12-hour time is ? o'clock`, a: h - 12 };
    }),
    T('time:quarters', 'easy', () => {
        const kind = choice(['quarter-hours', 'half-hours'] as const);
        const per = kind === 'quarter-hours' ? 4 : 2;
        const h = pick(2, kind === 'quarter-hours' ? 7 : 15);
        return { q: `How many ${kind} in ${h} hours?`, a: h * per };
    }),
    T('time:fraction-minute', 'medium', () => {
        const [label, secs] = choice([
            ['half', 30], ['a quarter', 15], ['a third', 20], ['a fifth', 12], ['a tenth', 6],
        ] as const);
        return { q: `How many seconds in ${label} of a minute?`, a: secs };
    }),
    T('time:minutes-until', 'medium', () => {
        const h = pick(1, 11), start = pick(35, 57), gap = pick(5, 28);
        const end = start + gap;
        if (end < 60) return null; // must cross the hour
        return { q: `It's ${h}:${pad2(start)}. How many minutes until ${h + 1}:${pad2(end - 60)}?`, a: gap };
    }),
    T('time:overnight', 'hard', () => {
        const pm = pick(6, 11), am = pick(1, 9);
        return { q: `How many hours from ${pm} PM to ${am} AM?`, a: 12 - pm + am };
    }),
    T('time:clock-later', 'hard', () => {
        const h = pick(1, 12), k = pick(5, 30);
        if (k % 12 === 0) return null;
        return { q: `A clock shows ${h} o'clock. What will it show ${k} hours later?`, a: wrap12(h + k) };
    }),
];

// ── LETTERS & ROMAN NUMERALS ──────────────────────────────────
const WORDS = ['BAD', 'CAB', 'BED', 'DAD', 'FED', 'BAG', 'ACE', 'FIG', 'HEAD', 'EGG', 'DICE', 'BEE', 'CAFE', 'HIDE', 'FADE', 'BIKE', 'JADE', 'CAGE'];

const LETTER_Q: Template[] = [
    T('alpha:position', 'easy', () => {
        const i = pick(3, 26);
        return { q: `What number is the letter ${ALPHABET[i - 1]} in the alphabet?`, a: i };
    }),
    T('alpha:sum', 'medium', () => {
        const x = pick(1, 20), y = pick(1, 20);
        return { q: `${ALPHABET[x - 1]} + ${ALPHABET[y - 1]} = ?\n(A = 1, B = 2 …)`, a: x + y };
    }),
    T('alpha:word', 'hard', () => {
        const w = choice(WORDS);
        const sum = [...w].reduce((s, ch) => s + letterValue(ch), 0);
        return { q: `Add up the letters of "${w}"\n(A = 1, B = 2 …)`, a: sum };
    }),
    T('roman:read', 'easy', () => {
        const n = pick(3, 20);
        return { q: `Roman numeral ${toRoman(n)} = ?`, a: n };
    }),
    T('roman:read-big', 'medium', () => {
        const n = pick(21, 30);
        return { q: `Roman numeral ${toRoman(n)} = ?`, a: n };
    }),
    T('roman:add', 'medium', () => {
        const x = pick(2, 15), y = pick(2, 15);
        return { q: `${toRoman(x)} + ${toRoman(y)} = ?`, a: x + y };
    }),
    T('roman:sub', 'hard', () => {
        const x = pick(12, 39), y = pick(2, x - 3);
        return { q: `${toRoman(x)} - ${toRoman(y)} = ?`, a: x - y };
    }),
];

// ── EVERYDAY FACTS ────────────────────────────────────────────
const FACTS = [
    { label: 'players in a cricket team', value: 11 },
    { label: 'players in a football team', value: 11 },
    { label: 'balls in a cricket over', value: 6 },
    { label: 'overs in a T20 innings', value: 20 },
    { label: 'colours in a rainbow', value: 7 },
    { label: 'days in a week', value: 7 },
    { label: 'days in a fortnight', value: 14 },
    { label: 'months in a year', value: 12 },
    { label: 'hours in a day', value: 24 },
    { label: 'planets in the solar system', value: 8 },
    { label: 'legs on a spider', value: 8 },
    { label: 'strings on a guitar', value: 6 },
    { label: 'years in a decade', value: 10 },
    { label: 'cards in one suit of a deck', value: 13 },
    { label: 'pawns each side starts with in chess', value: 8 },
    { label: 'minutes in a quarter hour', value: 15 },
    { label: "things in a baker's dozen", value: 13 },
    { label: 'things in a score', value: 20 },
    { label: 'edges on a cube', value: 12 },
    { label: 'faces on a cube', value: 6 },
    { label: 'wheels on a tricycle', value: 3 },
    { label: 'letters in the English alphabet', value: 26 },
    { label: 'sides on a hexagon', value: 6 },
    { label: 'sides on an octagon', value: 8 },
    { label: 'seconds in half a minute', value: 30 },
];

const ANIMALS = [
    { many: 'spiders', legs: 8 },
    { many: 'dogs', legs: 4 },
    { many: 'cows', legs: 4 },
    { many: 'chickens', legs: 2 },
    { many: 'ducks', legs: 2 },
    { many: 'ants', legs: 6 },
] as const;

const SHAPES = [
    { name: 'triangle', sides: 3 },
    { name: 'square', sides: 4 },
    { name: 'pentagon', sides: 5 },
    { name: 'hexagon', sides: 6 },
    { name: 'octagon', sides: 8 },
] as const;

const FACT_Q: Template[] = [
    T('fact:single', 'easy', () => {
        const f = choice(FACTS);
        return { q: `How many ${f.label}?`, a: f.value };
    }),
    T('fact:add', 'medium', () => {
        const f1 = choice(FACTS), f2 = choice(FACTS);
        if (f1 === f2) return null;
        return { q: `${cap(f1.label)} + ${f2.label} = ?`, a: f1.value + f2.value };
    }),
    T('fact:sub', 'medium', () => {
        const f1 = choice(FACTS), f2 = choice(FACTS);
        if (f1 === f2) return null;
        return { q: `${cap(f1.label)} - ${f2.label} = ?`, a: f1.value - f2.value };
    }),
    T('fact:mul', 'hard', () => {
        const f1 = choice(FACTS), f2 = choice(FACTS);
        if (f1 === f2) return null;
        return { q: `${cap(f1.label)} × ${f2.label} = ?`, a: f1.value * f2.value };
    }),
    T('legs:one-kind', 'easy', () => {
        const an = choice(ANIMALS), n = pick(2, 10);
        return { q: `How many legs do ${n} ${an.many} have?`, a: n * an.legs };
    }),
    T('legs:mixed', 'medium', () => {
        const x = choice(ANIMALS), y = choice(ANIMALS);
        if (x === y) return null;
        const n = pick(1, 4), m = pick(1, 4);
        return { q: `Legs on ${n} ${x.many} and ${m} ${y.many} = ?`, a: n * x.legs + m * y.legs };
    }),
    T('shape:many', 'easy', () => {
        const s = choice(SHAPES), n = pick(2, 6);
        return { q: `Total sides on ${n} ${s.name}s?`, a: n * s.sides };
    }),
    T('shape:mixed', 'medium', () => {
        const [s1, s2, s3] = shuffle([...SHAPES]);
        return { q: `Sides on a ${s1.name} + a ${s2.name} + a ${s3.name} = ?`, a: s1.sides + s2.sides + s3.sides };
    }),
];

// ── NUMBER SENSE ──────────────────────────────────────────────
const NUMBER_Q: Template[] = [
    T('num:reverse', 'easy', () => {
        const tens = pick(1, 9), units = pick(1, 2);
        if (tens === units) return null;
        return { q: `Flip the digits of ${tens * 10 + units}. You get ?`, a: units * 10 + tens };
    }),
    T('num:digit-sum', 'medium', () => {
        const x = pick(1, 9), y = pick(0, 9), z = pick(1, 9);
        return { q: `Add the digits of ${x}${y}${z}`, a: x + y + z };
    }),
    T('num:how-many-in', 'medium', () => {
        const d = choice([2, 5, 10, 25, 50]), ans = pick(3, 30);
        if (d * ans > 600) return null;
        return { q: `How many ${d}s make ${d * ans}?`, a: ans };
    }),
    T('num:percent', 'medium', () => {
        const p = choice([10, 20, 25, 50, 75]), ans = pick(3, 30);
        const base = (ans * 100) / p;
        if (!Number.isInteger(base) || base > 200) return null;
        return { q: `${p}% of ${base} = ?`, a: ans };
    }),
    T('num:fraction', 'hard', () => {
        const den = pick(3, 5), num = pick(2, den - 1), unit = pick(2, 10);
        return { q: `${num}/${den} of ${den * unit} = ?`, a: num * unit };
    }),
    T('num:square', 'medium', () => {
        const x = pick(1, 4), y = pick(1, 4);
        return { q: `${x}² + ${y}² = ?`, a: x * x + y * y };
    }),
    T('num:sqrt', 'medium', () => {
        const n = pick(3, 30);
        return { q: `√${n * n} = ?`, a: n };
    }),
    T('num:average', 'medium', () => {
        const ans = pick(4, 25), d1 = pick(1, 3), d2 = pick(1, 4);
        const x = ans - d1, y = ans + d2, z = 3 * ans - x - y;
        if (z <= 0 || new Set([x, y, z]).size < 3) return null;
        return { q: `Average of ${x}, ${y} and ${z} = ?`, a: ans };
    }),
    T('num:odd-count', 'medium', () => {
        const n = pick(3, 15);
        return { q: `How many odd numbers from 1 to ${2 * n}?`, a: n };
    }),
    T('num:divide-by-half', 'hard', () => {
        const n = pick(3, 15);
        return { q: `Divide ${n} by half. Answer = ?`, a: n * 2 };
    }),
    T('num:divide-by-half-plus', 'hard', () => {
        const n = pick(3, 10), k = pick(2, 9);
        return { q: `Divide ${n} by half, then add ${k}`, a: n * 2 + k };
    }),
];

// ── SEQUENCES ─────────────────────────────────────────────────
const SEQ_Q: Template[] = [
    T('seq:up', 'medium', () => {
        const s = pick(1, 10), step = pick(2, 6);
        const t = [0, 1, 2, 3].map((i) => s + i * step);
        return { q: `${t.join(', ')}, ?`, a: s + 4 * step };
    }),
    T('seq:down', 'medium', () => {
        const s = pick(26, 40), step = pick(3, 6);
        const t = [0, 1, 2, 3].map((i) => s - i * step);
        return { q: `${t.join(', ')}, ?`, a: s - 4 * step };
    }),
    T('seq:double', 'medium', () => {
        const s = pick(1, 3);
        return { q: `${s}, ${s * 2}, ${s * 4}, ?`, a: s * 8 };
    }),
    T('seq:growing-gap', 'hard', () => {
        const s = pick(1, 15);
        return { q: `${s}, ${s + 1}, ${s + 3}, ${s + 6}, ?`, a: s + 10 };
    }),
    T('seq:squares', 'hard', () => ({ q: '1, 4, 9, 16, ?', a: 25 })),
    T('seq:fibonacci', 'hard', () => ({ q: '1, 1, 2, 3, 5, 8, ?', a: 13 })),
    T('seq:primes', 'hard', () => ({ q: '2, 3, 5, 7, 11, ?', a: 13 })),
];

// ── WORD PROBLEMS & RIDDLES ───────────────────────────────────
const WORDY_Q: Template[] = [
    T('money:change', 'easy', () => {
        const pay = choice([20, 50, 100]), change = pick(3, 30);
        if (change >= pay) return null;
        return { q: `Something costs ₹${pay - change}. You pay ₹${pay}. Change = ₹?`, a: change };
    }),
    T('money:bat-ball', 'hard', () => {
        const ball = pick(3, 30), diff = choice([10, 20, 50, 100]);
        return {
            q: `A bat and a ball cost ₹${2 * ball + diff}. The bat costs ₹${diff} more than the ball. The ball costs ₹?`,
            a: ball,
        };
    }),
    T('age:future', 'easy', () => {
        const name = choice(NAMES), now = pick(5, 30), k = pick(2, 10);
        return { q: `In ${k} years ${name} will be ${now + k}. How old is ${name} now?`, a: now };
    }),
    T('age:past-future', 'medium', () => {
        const name = choice(NAMES), now = pick(8, 25), back = pick(2, 6), ahead = pick(2, 6);
        return { q: `${back} years ago ${name} was ${now - back}. How old will ${name} be in ${ahead} years?`, a: now + ahead };
    }),
    T('age:half-then', 'hard', () => {
        const a = choice(GIRLS), b = choice(BOYS);
        const then = pick(2, 6) * 2, now = pick(then + 2, 30);
        return {
            q: `When ${a} was ${then}, ${b} was half her age. ${a} is now ${now}. How old is ${b}?`,
            a: now - then / 2,
        };
    }),
    T('riddle:siblings', 'hard', () => {
        const name = choice(GIRLS), bro = pick(2, 8), sis = pick(2, 4);
        return {
            q: `${name} has ${bro} brothers. Each brother has ${sis} sisters. How many children are in the family?`,
            a: bro + sis,
        };
    }),
    T('riddle:sheep', 'medium', () => {
        const n = pick(10, 30), k = pick(3, n - 2);
        return { q: `A farmer has ${n} sheep. All but ${k} run away. How many are left?`, a: k };
    }),
    T('riddle:take-mangoes', 'medium', () => {
        const n = pick(8, 20), k = pick(3, n - 3);
        return { q: `There are ${n} mangoes. You take ${k}. How many do YOU have?`, a: k };
    }),
    T('riddle:overtake', 'medium', () => {
        const k = pick(3, 12);
        return { q: `In a race you overtake the person in ${ordinal(k)} place. What place are you in?`, a: k };
    }),
    T('riddle:fence', 'hard', () => {
        const step = choice([2, 3, 4, 5, 10]), gaps = pick(2, 29);
        return {
            q: `A ${step * gaps} m fence has a post every ${step} m, both ends included. How many posts?`,
            a: gaps + 1,
        };
    }),
    T('riddle:log-cuts', 'hard', () => {
        const pieces = pick(3, 11), t = pick(2, 5);
        return { q: `Each cut through a log takes ${t} min. How many minutes to cut it into ${pieces} pieces?`, a: (pieces - 1) * t };
    }),
    T('riddle:stairs', 'hard', () => {
        const per = pick(2, 4), f = pick(3, 4), target = pick(f + 2, 11);
        return {
            q: `Walking from floor 1 to floor ${f} takes ${(f - 1) * per} minutes. How many minutes to reach floor ${target}?`,
            a: (target - 1) * per,
        };
    }),
    T('riddle:inclusive', 'medium', () => {
        const from = pick(3, 40), count = pick(5, 30), to = from + count - 1;
        return choice([
            { q: `How many whole numbers from ${from} to ${to}, counting both?`, a: count },
            { q: `You read page ${from} to page ${to}, both included. How many pages?`, a: count },
        ]);
    }),
    T('riddle:snail', 'hard', () => {
        const [up, down] = choice([[3, 2], [4, 2], [5, 3], [5, 2], [4, 3]] as const);
        const h = pick(up + 2, 30);
        const days = Math.ceil((h - up) / (up - down)) + 1;
        return {
            q: `A snail climbs ${up} m up a ${h} m wall each day and slips ${down} m each night. On which day does it reach the top?`,
            a: days,
        };
    }),
    T('riddle:lily', 'hard', () => {
        const n = pick(4, 31);
        return { q: `A lily patch doubles every day and covers the pond on day ${n}. On which day was it half covered?`, a: n - 1 };
    }),
    T('riddle:brick', 'hard', () => {
        const k = pick(2, 15);
        return { q: `A brick weighs ${k} kg plus half a brick. How many kg is the brick?`, a: k * 2 };
    }),
    T('riddle:die-bottom', 'medium', () => {
        const top = pick(1, 4), k = pick(0, 10);
        return k === 0
            ? { q: `A die shows ${top} on top. What's on the bottom?`, a: 7 - top }
            : { q: `A die shows ${top} on top. Bottom face + ${k} = ?`, a: 7 - top + k };
    }),
];

// Fixed brain-teasers — each one is its own template so it can't repeat soon.
const FIXED: { id: string; d: Difficulty; q: string; a: number }[] = [
    { id: 'months-28', d: 'medium', q: 'How many months have 28 days?', a: 12 },
    { id: 'months-31st', d: 'medium', q: 'How many months have a 31st day?', a: 7 },
    { id: 'months-exactly-30', d: 'medium', q: 'How many months have exactly 30 days?', a: 4 },
    { id: 'months-j', d: 'easy', q: 'How many months start with the letter J?', a: 3 },
    { id: 'months-j-ber', d: 'hard', q: 'Months starting with J + months ending in "ber" = ?', a: 7 },
    { id: 'leap-feb', d: 'easy', q: 'How many days in February in a leap year?', a: 29 },
    { id: 'ones-1-20', d: 'hard', q: 'Counting from 1 to 20, how many times do you write the digit 1?', a: 12 },
    { id: 'nines-1-100', d: 'hard', q: 'Counting from 1 to 100, how many 9s do you write?', a: 20 },
    { id: 'die-dots', d: 'medium', q: 'Add up all the dots on one die. Total = ?', a: 21 },
    { id: 'die-opposite', d: 'medium', q: 'Opposite faces of a die always add up to ?', a: 7 },
    { id: 'the-alphabet', d: 'hard', q: 'How many letters are in "the alphabet"?', a: 11 },
    { id: 'two-digit-one-digit', d: 'medium', q: 'Smallest 2-digit number + largest 1-digit number = ?', a: 19 },
    { id: 'largest-digit-x3', d: 'easy', q: 'Largest 1-digit number × 3 = ?', a: 27 },
    { id: 'cube-corners', d: 'medium', q: 'How many corners does a cube have?', a: 8 },
    { id: 'chair-legs', d: 'hard', q: 'A spider and a dog sit on a chair. How many legs in total, chair included?', a: 16 },
    { id: 'primes-under-20', d: 'hard', q: 'How many prime numbers are below 20?', a: 8 },
    { id: 'half-hour-minus', d: 'easy', q: 'Half an hour minus 7 minutes = ? minutes', a: 23 },
];

const FIXED_Q: Template[] = FIXED.map((f) => T(`riddle:${f.id}`, f.d, () => ({ q: f.q, a: f.a })));

// ── REGISTRY ──────────────────────────────────────────────────
const ALL: Template[] = [
    ...MATH,
    ...MONTH_Q,
    ...DATE_Q,
    ...TIME_Q,
    ...LETTER_Q,
    ...FACT_Q,
    ...NUMBER_Q,
    ...SEQ_Q,
    ...WORDY_Q,
    ...FIXED_Q,
];

const family = (id: string) => id.split(':')[0];

const isValid = (m: Made): m is { q: string; a: number } =>
    !!m && Number.isInteger(m.a) && m.a >= MIN_ANSWER && m.a <= MAX_ANSWER;

const tryTemplate = (t: Template): Question | null => {
    for (let i = 0; i < 40; i++) {
        const m = t.make();
        if (isValid(m)) return { question: m.q, answer: m.a, difficulty: t.difficulty, templateId: t.id };
    }
    return null;
};

const difficultyForRound = (roundNumber: number): Difficulty => {
    const r = Math.random();
    if (roundNumber <= 2) return r < 0.6 ? 'easy' : r < 0.9 ? 'medium' : 'hard';
    if (roundNumber <= 5) return r < 0.3 ? 'easy' : r < 0.7 ? 'medium' : 'hard';
    return r < 0.1 ? 'easy' : r < 0.4 ? 'medium' : 'hard';
};

// `recentTemplateIds`: ids from previous rounds, oldest first. Avoids
// repeating any of them, and avoids the same family (months, riddles…)
// as the last two rounds — relaxing those rules if nothing is left.
export const generateQuestionForRound = (
    roundNumber: number,
    recentTemplateIds: string[] = []
): Question => {
    const difficulty = difficultyForRound(roundNumber);
    const pool = ALL.filter((t) => t.difficulty === difficulty);
    const recent = new Set(recentTemplateIds);
    const recentFamilies = new Set(recentTemplateIds.slice(-2).map(family));

    const tiers = [
        pool.filter((t) => !recent.has(t.id) && !recentFamilies.has(family(t.id))),
        pool.filter((t) => !recent.has(t.id)),
        pool,
    ];

    for (const tier of tiers) {
        for (const t of shuffle(tier)) {
            const q = tryTemplate(t);
            if (q) return q;
        }
    }
    return { question: '6 + 6 = ?', answer: 12, difficulty: 'easy', templateId: 'math:fallback' };
};

