export type Question = {
    question: string;
    answer: number;
    difficulty: 'easy' | 'medium' | 'hard';
};

// ── NUMBER POOLS ──────────────────────────────────────────────
const pick = (min: number, max: number): number =>
    Math.floor(Math.random() * (max - min + 1)) + min;

// ── QUESTION GENERATORS ───────────────────────────────────────
type QuestionGenerator = () => Question;

const easyGenerators: QuestionGenerator[] = [
    // Simple addition
    () => {
        const a = pick(1, 15);
        const b = pick(1, 15);
        const answer = a + b;
        if (answer > 30) return easyGenerators[0]();
        return { question: `${a} + ${b} = ?`, answer, difficulty: 'easy' };
    },
    // Simple subtraction (always positive result)
    () => {
        const a = pick(10, 28);
        const b = pick(1, a - 1);
        const answer = a - b;
        return { question: `${a} - ${b} = ?`, answer, difficulty: 'easy' };
    },
    // Small multiplication
    () => {
        const a = pick(2, 6);
        const b = pick(2, 5);
        const answer = a * b;
        if (answer > 30) return easyGenerators[2]();
        return { question: `${a} × ${b} = ?`, answer, difficulty: 'easy' };
    },
    // Simple division (always whole number)
    () => {
        const answer = pick(2, 10);
        const b = pick(2, 5);
        const a = answer * b;
        return { question: `${a} ÷ ${b} = ?`, answer, difficulty: 'easy' };
    },
    // Half of something
    () => {
        const answer = pick(2, 15);
        const a = answer * 2;
        return { question: `Half of ${a} = ?`, answer, difficulty: 'easy' };
    },
    // Double something
    () => {
        const answer = pick(2, 14);
        const a = answer;
        if (answer * 2 > 30) return easyGenerators[5]();
        return { question: `Double ${a} = ?`, answer: answer * 2, difficulty: 'easy' };
    },
    // A dozen minus something
    () => {
        const b = pick(1, 11);
        const answer = 12 - b;
        return { question: `A dozen minus ${b} = ?`, answer, difficulty: 'easy' };
    },
    // Triple something small
    () => {
        const a = pick(2, 9);
        const answer = a * 3;
        if (answer > 30) return easyGenerators[7]();
        return { question: `Triple ${a} = ?`, answer, difficulty: 'easy' };
    },
    // Addition with 3 numbers
    () => {
        const a = pick(1, 8);
        const b = pick(1, 8);
        const c = pick(1, 8);
        const answer = a + b + c;
        if (answer > 30) return easyGenerators[8]();
        return { question: `${a} + ${b} + ${c} = ?`, answer, difficulty: 'easy' };
    },
    // Word problem — fingers
    () => {
        const hands = pick(2, 5);
        const answer = hands * 5;
        if (answer > 30) return easyGenerators[9]();
        return {
            question: `How many fingers on ${hands} hands?`,
            answer,
            difficulty: 'easy',
        };
    },
    // Word problem — days in weeks
    () => {
        const weeks = pick(2, 4);
        const answer = weeks * 7;
        if (answer > 30) return easyGenerators[10]();
        return {
            question: `How many days in ${weeks} weeks?`,
            answer,
            difficulty: 'easy',
        };
    },
    // Nearest ten minus number
    () => {
        const tens = pick(2, 3) * 10;
        const b = pick(1, 9);
        const answer = tens - b;
        if (answer > 30) return easyGenerators[11]();
        return { question: `${tens} - ${b} = ?`, answer, difficulty: 'easy' };
    },
];

const mediumGenerators: QuestionGenerator[] = [
    // Simple equation x + n = m
    () => {
        const answer = pick(3, 20);
        const b = pick(2, 10);
        const m = answer + b;
        return {
            question: `x + ${b} = ${m}, x = ?`,
            answer,
            difficulty: 'medium',
        };
    },
    // Simple equation 2x = n
    () => {
        const answer = pick(3, 14);
        const m = answer * 2;
        if (m > 30) return mediumGenerators[1]();
        return { question: `2x = ${m}, x = ?`, answer, difficulty: 'medium' };
    },
    // Simple equation x - n = m
    () => {
        const answer = pick(5, 25);
        const b = pick(2, 8);
        const m = answer - b;
        if (m < 0) return mediumGenerators[2]();
        return {
            question: `x - ${b} = ${m}, x = ?`,
            answer,
            difficulty: 'medium',
        };
    },
    // Simple equation 3x = n
    () => {
        const answer = pick(2, 9);
        const m = answer * 3;
        if (m > 30) return mediumGenerators[3]();
        return { question: `3x = ${m}, x = ?`, answer, difficulty: 'medium' };
    },
    // Simple equation x ÷ n = m
    () => {
        const b = pick(2, 5);
        const answer = pick(2, 6) * b;
        if (answer > 30) return mediumGenerators[4]();
        return {
            question: `x ÷ ${b} = ${answer / b}, x = ?`,
            answer,
            difficulty: 'medium',
        };
    },
    // BODMAS — multiply then add
    () => {
        const a = pick(2, 5);
        const b = pick(2, 4);
        const c = pick(1, 6);
        const answer = a * b + c;
        if (answer > 30) return mediumGenerators[5]();
        return {
            question: `${a} × ${b} + ${c} = ?`,
            answer,
            difficulty: 'medium',
        };
    },
    // BODMAS — multiply then subtract
    () => {
        const a = pick(3, 6);
        const b = pick(2, 4);
        const c = pick(1, 6);
        const answer = a * b - c;
        if (answer <= 0 || answer > 30) return mediumGenerators[6]();
        return {
            question: `${a} × ${b} - ${c} = ?`,
            answer,
            difficulty: 'medium',
        };
    },
    // x + x = n (double x)
    () => {
        const answer = pick(3, 14);
        const m = answer * 2;
        if (m > 30) return mediumGenerators[7]();
        return {
            question: `x + x = ${m}, x = ?`,
            answer,
            difficulty: 'medium',
        };
    },
    // 2x + n = m
    () => {
        const answer = pick(2, 10);
        const b = pick(1, 6);
        const m = 2 * answer + b;
        if (m > 30) return mediumGenerators[8]();
        return {
            question: `2x + ${b} = ${m}, x = ?`,
            answer,
            difficulty: 'medium',
        };
    },
    // Word problem — eggs in cartons
    () => {
        const cartons = pick(2, 4);
        const answer = cartons * 6;
        if (answer > 30) return mediumGenerators[9]();
        return {
            question: `${cartons} half-dozens of eggs = ? eggs`,
            answer,
            difficulty: 'medium',
        };
    },
    // Divide then add
    () => {
        const divisor = pick(2, 4);
        const dividend = pick(2, 5) * divisor;
        const c = pick(1, 8);
        const answer = dividend / divisor + c;
        if (answer > 30) return mediumGenerators[10]();
        return {
            question: `${dividend} ÷ ${divisor} + ${c} = ?`,
            answer,
            difficulty: 'medium',
        };
    },
];

const hardGenerators: QuestionGenerator[] = [
    // 3x + n = m
    () => {
        const answer = pick(2, 8);
        const b = pick(1, 5);
        const m = 3 * answer + b;
        if (m > 30) return hardGenerators[0]();
        return {
            question: `3x + ${b} = ${m}, x = ?`,
            answer,
            difficulty: 'hard',
        };
    },
    // 4x - n = m
    () => {
        const answer = pick(2, 6);
        const b = pick(1, 4);
        const m = 4 * answer - b;
        if (m > 30 || m <= 0) return hardGenerators[1]();
        return {
            question: `4x - ${b} = ${m}, x = ?`,
            answer,
            difficulty: 'hard',
        };
    },
    // (a + b) × c
    () => {
        const a = pick(2, 6);
        const b = pick(2, 6);
        const c = pick(2, 3);
        const answer = (a + b) * c;
        if (answer > 30) return hardGenerators[2]();
        return {
            question: `(${a} + ${b}) × ${c} = ?`,
            answer,
            difficulty: 'hard',
        };
    },
    // 2x + 2x = n
    () => {
        const answer = pick(2, 7);
        const m = 4 * answer;
        if (m > 30) return hardGenerators[3]();
        return {
            question: `2x + 2x = ${m}, x = ?`,
            answer,
            difficulty: 'hard',
        };
    },
    // a × b + c × d
    () => {
        const a = pick(2, 4);
        const b = pick(2, 4);
        const c = pick(2, 3);
        const d = pick(2, 3);
        const answer = a * b + c * d;
        if (answer > 30) return hardGenerators[4]();
        return {
            question: `${a} × ${b} + ${c} × ${d} = ?`,
            answer,
            difficulty: 'hard',
        };
    },
    // 2x - n = x + m
    () => {
        const answer = pick(3, 15);
        const n = pick(1, 5);
        const m = answer - n;
        if (m <= 0 || answer > 30) return hardGenerators[5]();
        return {
            question: `2x - ${n} = x + ${m}, x = ?`,
            answer,
            difficulty: 'hard',
        };
    },
    // (x + n) × 2 = m
    () => {
        const answer = pick(2, 12);
        const b = pick(1, 5);
        const m = (answer + b) * 2;
        if (m > 30) return hardGenerators[6]();
        return {
            question: `(x + ${b}) × 2 = ${m}, x = ?`,
            answer,
            difficulty: 'hard',
        };
    },
    // a × b - c × d
    () => {
        const a = pick(3, 6);
        const b = pick(3, 5);
        const c = pick(2, 4);
        const d = pick(2, 3);
        const answer = a * b - c * d;
        if (answer <= 0 || answer > 30) return hardGenerators[7]();
        return {
            question: `${a} × ${b} - ${c} × ${d} = ?`,
            answer,
            difficulty: 'hard',
        };
    },
    // 3x + x = n
    () => {
        const answer = pick(2, 7);
        const m = 4 * answer;
        if (m > 30) return hardGenerators[8]();
        return {
            question: `3x + x = ${m}, x = ?`,
            answer,
            difficulty: 'hard',
        };
    },
    // a ÷ b × c
    () => {
        const b = pick(2, 4);
        const c = pick(2, 4);
        const base = pick(2, 5);
        const a = base * b;
        const answer = base * c;
        if (answer > 30) return hardGenerators[9]();
        return {
            question: `${a} ÷ ${b} × ${c} = ?`,
            answer,
            difficulty: 'hard',
        };
    },
];

// ── WEIGHTED DIFFICULTY PICKER ─────────────────────────────────
// Easy: 40%, Medium: 40%, Hard: 20%
const pickDifficulty = (): 'easy' | 'medium' | 'hard' => {
    const r = Math.random();
    if (r < 0.4) return 'easy';
    if (r < 0.8) return 'medium';
    return 'hard';
};

const generatorMap = {
    easy: easyGenerators,
    medium: mediumGenerators,
    hard: hardGenerators,
};

export const generateQuestion = (): Question => {
    const difficulty = pickDifficulty();
    const generators = generatorMap[difficulty];
    const generator = generators[Math.floor(Math.random() * generators.length)];
    return generator();
};

// ── ROUND-AWARE DIFFICULTY ─────────────────────────────────────
// Gets harder as rounds progress
export const generateQuestionForRound = (roundNumber: number): Question => {
    const r = Math.random();
    let difficulty: 'easy' | 'medium' | 'hard';

    if (roundNumber <= 2) {
        // Early rounds — mostly easy
        difficulty = r < 0.6 ? 'easy' : r < 0.9 ? 'medium' : 'hard';
    } else if (roundNumber <= 5) {
        // Mid rounds — balanced
        difficulty = r < 0.3 ? 'easy' : r < 0.7 ? 'medium' : 'hard';
    } else {
        // Late rounds — mostly hard
        difficulty = r < 0.1 ? 'easy' : r < 0.4 ? 'medium' : 'hard';
    }

    const generators = generatorMap[difficulty];
    const generator = generators[Math.floor(Math.random() * generators.length)];
    return generator();
};