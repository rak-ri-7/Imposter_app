export type QuizQuestion = {
    id: string;
    prompt: string; // may contain [PLACEHOLDER] tokens
    correctPool: string[];
    wrongPool: string[];
};

export type QuizOption = {
    text: string;
    correct: boolean;
};

export type QuizInstance = {
    questionId: string;
    prompt: string; // fully resolved — no placeholders left
    options: QuizOption[];
};

// Fisher-Yates — every ordering is equally likely
const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

const pickRandomSample = <T,>(pool: T[], n: number): T[] =>
    shuffle(pool).slice(0, Math.min(n, pool.length));

export const generateSingleCorrectInstance = (question: QuizQuestion): QuizInstance => {
    const { resolvedPrompt, isNegative } = resolvePromptPlaceholders(question.prompt);

    const effectiveCorrectPool = isNegative ? question.wrongPool : question.correctPool;
    const effectiveWrongPool = isNegative ? question.correctPool : question.wrongPool;

    const correct = pickRandomSample(effectiveCorrectPool, 1)[0];
    const wrongPicks = pickRandomSample(effectiveWrongPool, 3);

    const options = shuffle([
        { text: correct, correct: true },
        ...wrongPicks.map((text) => ({ text, correct: false })),
    ]);

    return {
        questionId: question.id,
        prompt: resolvedPrompt,
        options,
    };
};

// ── PROMPT PLACEHOLDERS ─────────────────────────────────────────────
// 1. Flavor tokens (e.g. [PERCENTAGE]) — text substitution only.
// 2. Polarity tokens (e.g. [IS_OR_IS_NOT]) — if a negative value is
//    rolled, correctPool/wrongPool swap for that instance.
//    RULE: any question using a polarity token needs BOTH pools to have
//    >= 3 entries, and every entry must be unambiguously true or false.
export type PromptPlaceholder = {
    token: string;
    values: string[];
    negativeValues?: string[];
};

export const promptPlaceholders: Record<string, PromptPlaceholder> = {
    '[NOT_A]': {
        token: '[NOT_A]',
        values: ['A', 'Not a'],
        negativeValues: ['Not a'],
    },
    '[NOT_AN]': {
        token: '[NOT_AN]',
        values: ['An', 'Not an'],
        negativeValues: ['Not an'],
    },
    '[IS_OR_IS_NOT]': {
        token: '[IS_OR_IS_NOT]',
        values: ['is', 'is not'],
        negativeValues: ['is not'],
    },
    '[NOT_BLANK]': {
        token: '[NOT_BLANK]',
        values: ['', 'not '],
        negativeValues: ['not '],
    },
    '[CAN_CANNOT]': {
        token: '[CAN_CANNOT]',
        values: ['can', 'cannot'],
        negativeValues: ['cannot'],
    },
    '[HAVE_DO_NOT]': {
        token: '[HAVE_DO_NOT]',
        values: ['have', 'do not have'],
        negativeValues: ['do not have'],
    },
    // flavor only — never trigger a pool swap
    '[PERCENTAGE]': {
        token: '[PERCENTAGE]',
        values: ['10%', '20%', '25%', '30%', '40%', '50%', '60%', '75%'],
    },
    '[COLOR]': {
        token: '[COLOR]',
        values: ['red', 'blue', 'green', 'yellow'],
    },
};

const TOKEN_REGEX = /\[[A-Z_]+\]/g;

const resolvePromptPlaceholders = (
    prompt: string
): { resolvedPrompt: string; isNegative: boolean } => {
    let isNegative = false;
    const resolvedPrompt = prompt.replace(TOKEN_REGEX, (token) => {
        const def = promptPlaceholders[token];
        if (!def) return token;
        const value = def.values[Math.floor(Math.random() * def.values.length)];
        if (def.negativeValues?.includes(value)) isNegative = true;
        return value;
    });
    return { resolvedPrompt, isNegative };
};

const CORRECT_COUNT_WEIGHTS = [2, 2, 2, 3, 3, 3, 1];

export const generateQuizInstance = (question: QuizQuestion): QuizInstance => {
    const { resolvedPrompt, isNegative } = resolvePromptPlaceholders(question.prompt);

    const effectiveCorrectPool = isNegative ? question.wrongPool : question.correctPool;
    const effectiveWrongPool = isNegative ? question.correctPool : question.wrongPool;

    let correctCount =
        CORRECT_COUNT_WEIGHTS[Math.floor(Math.random() * CORRECT_COUNT_WEIGHTS.length)];

    correctCount = Math.min(correctCount, effectiveCorrectPool.length, 3);
    correctCount = Math.max(correctCount, 1);

    let wrongCount = 4 - correctCount;
    if (wrongCount > effectiveWrongPool.length) {
        wrongCount = Math.max(1, effectiveWrongPool.length);
        correctCount = Math.min(4 - wrongCount, effectiveCorrectPool.length);
    }

    const correctPicks: QuizOption[] = pickRandomSample(effectiveCorrectPool, correctCount)
        .map((text) => ({ text, correct: true }));
    const wrongPicks: QuizOption[] = pickRandomSample(effectiveWrongPool, wrongCount)
        .map((text) => ({ text, correct: false }));

    return {
        questionId: question.id,
        prompt: resolvedPrompt,
        options: shuffle([...correctPicks, ...wrongPicks]),
    };
};

export const getRandomQuestion = (usedIds: string[]): QuizQuestion => {
    const available = quizQuestions.filter((q) => !usedIds.includes(q.id));
    const pool = available.length > 0 ? available : quizQuestions;
    return pool[Math.floor(Math.random() * pool.length)];
};

// ── DEV VALIDATION ─────────────────────────────────────────────────
// Call once in dev / a unit test. Returns a list of problems (empty = OK).
export const validateQuestionBank = (questions: QuizQuestion[] = quizQuestions): string[] => {
    const problems: string[] = [];
    const seenIds = new Set<string>();
    const seenPrompts = new Set<string>();

    for (const q of questions) {
        if (seenIds.has(q.id)) problems.push(`${q.id}: duplicate id`);
        seenIds.add(q.id);
        if (seenPrompts.has(q.prompt)) problems.push(`${q.id}: duplicate prompt "${q.prompt}"`);
        seenPrompts.add(q.prompt);

        const tokens = q.prompt.match(TOKEN_REGEX) ?? [];
        const unknown = tokens.filter((t) => !promptPlaceholders[t]);
        if (unknown.length) problems.push(`${q.id}: unknown token(s) ${unknown.join(', ')}`);

        const hasPolarity = tokens.some((t) => promptPlaceholders[t]?.negativeValues?.length);
        if (hasPolarity && q.correctPool.length < 3)
            problems.push(`${q.id}: polarity question needs >= 3 in correctPool (has ${q.correctPool.length})`);
        if (q.wrongPool.length < 3)
            problems.push(`${q.id}: wrongPool needs >= 3 (has ${q.wrongPool.length})`);

        const overlap = q.correctPool.filter((c) => q.wrongPool.includes(c));
        if (overlap.length) problems.push(`${q.id}: in both pools: ${overlap.join(', ')}`);
    }
    return problems;
};

// ── QUESTION BANK ─────────────────────────────────────────────────
export const quizQuestions: QuizQuestion[] = [
    // ── Language ─────────────────────────────────────────────
    {
        id: 'q1',
        prompt: "Same as 'however'?",
        correctPool: ['Nevertheless', 'Nonetheless', 'Yet', 'Still', 'Even so'],
        wrongPool: ['Therefore', 'Because', 'Moreover', 'Meanwhile', 'Instead'],
    },
    {
        id: 'q3',
        prompt: "Opposite of 'brave'?",
        correctPool: ['Cowardly', 'Timid', 'Fearful', 'Spineless'],
        wrongPool: ['Bold', 'Fearless', 'Daring', 'Heroic', 'Valiant'],
    },

    // ── Marvel ─────────────────────────────────────────────────
    {
        id: 'q10',
        prompt: '[NOT_A] Marvel superhero?',
        correctPool: ['Spider-Man', 'Iron Man', 'Thor', 'Black Panther', 'Hulk'],
        wrongPool: ['Batman', 'Superman', 'Wonder Woman', 'Flash', 'Aquaman'],
    },

    // ── India-related ────────────────────────────────────────
    {
        id: 'q16',
        prompt: '[NOT_A] Union Territory of India?',
        correctPool: ['Delhi', 'Puducherry', 'Chandigarh', 'Lakshadweep', 'Ladakh'],
        wrongPool: ['Kerala', 'Goa', 'Sikkim', 'Assam', 'Tamil Nadu'],
    },

    // ── Riddles / lateral thinking ────────────────────────────
    {
        id: 'q30',
        prompt: "What has hands but can't clap?",
        correctPool: ['A clock', 'A timepiece', 'A watch'],
        wrongPool: ['A glove', 'A time machine', 'A robot', 'A puppet'],
    },
    {
        id: 'q31',
        prompt: 'What gets wetter the more it dries?',
        correctPool: ['A towel', 'A cloth', 'A napkin'],
        wrongPool: ['A hairdryer', 'The sun', 'Sand', 'A cloud'],
    },
    {
        id: 'q32',
        prompt: "You overtake 2nd place. What's your new position?",
        correctPool: ['2nd', 'Second', 'Runner-up'],
        wrongPool: ['1st', '3rd', 'Last place', '4th'],
    },
    {
        // No polarity token: "do NOT have 28 days" has answer 0, which the
        // pool swap can't express.
        id: 'q33',
        prompt: 'How many months have 28 days?',
        correctPool: ['12', 'All of them', 'January to December', 'Every single one'],
        wrongPool: ['1', '11', '6', 'Only February', '2'],
    },

    // ── Music ─────────────────────────────────────────────────
    {
        id: 'q34',
        prompt: '[NOT_A] musical instrument?',
        correctPool: ['Violin', 'Flute', 'Tabla', 'Sitar', 'Clarinet'],
        wrongPool: ['Easel', 'Chisel', 'Spatula', 'Compass', 'Stapler'],
    },
    {
        id: 'q35',
        prompt: '[NOT_A] K-pop group?',
        correctPool: ['BTS', 'BLACKPINK', 'EXO', 'TWICE', 'Stray Kids'],
        wrongPool: ['Coldplay', 'Maroon 5', 'One Direction', 'Imagine Dragons', 'Westlife'],
    },

    // ── Geography / world ─────────────────────────────────────
    {
        id: 'q36',
        prompt: '[NOT_A] national capital?',
        correctPool: ['Tokyo', 'Paris', 'Cairo', 'Ottawa', 'Canberra'],
        wrongPool: ['Sydney', 'Mumbai', 'New York', 'Toronto', 'Istanbul'],
    },
    {
        id: 'q37',
        prompt: '[NOT_A] country in Europe?',
        correctPool: ['France', 'Germany', 'Italy', 'Spain', 'Portugal'],
        wrongPool: ['Egypt', 'Brazil', 'Thailand', 'Kenya', 'Peru'],
    },
    {
        id: 'q38',
        prompt: '[NOT_A] wonder of the ancient world?',
        correctPool: [
            'Great Pyramid of Giza',
            'Hanging Gardens of Babylon',
            'Colossus of Rhodes',
            'Lighthouse of Alexandria',
            'Temple of Artemis',
        ],
        wrongPool: ['Eiffel Tower', 'Taj Mahal', 'Great Wall of China', 'Stonehenge', 'Machu Picchu'],
    },

    // ── TWISTED LOGIC ─────────────────────────────────────────────
    {
        id: 'q39',
        prompt: 'Exactly 50% of a group of 6 people are wearing glasses. This is [NOT_BLANK]the same as:',
        correctPool: [
            'Exactly 3 people are wearing glasses',
            'Exactly 3 people are not wearing glasses',
            'Half the group is wearing glasses',
        ],
        wrongPool: [
            'Exactly 2 people are wearing glasses',
            'Exactly 4 people are wearing glasses',
            'Exactly 5 people are wearing glasses',
            'Nobody is wearing glasses',
        ],
    },
    {
        id: 'q40',
        prompt: 'There are 8 people. Which percentage [CAN_CANNOT] represent people wearing [COLOR]?',
        correctPool: ['25%', '50%', '75%', '12.5%'],
        wrongPool: ['30%', '40%', '60%', '70%', '20%'],
    },
    {
        id: 'q41',
        prompt: 'A shop gives a [PERCENTAGE] discount. Which statement [CAN_CANNOT] be true about the final price?',
        correctPool: [
            'The customer pays less than the original price',
            'The discount amount is calculated from the original price',
            'The customer saves some money',
            'The final price is still more than zero',
        ],
        wrongPool: [
            'The discount increases the final price',
            'The customer pays more than the original price',
            'The item becomes completely free',
            'The customer pays the full original price',
        ],
    },
    {
        id: 'q42',
        prompt: 'Which number [IS_OR_IS_NOT] exactly 25% of a group?',
        correctPool: [
            '2, if the group has 8 people',
            '3, if the group has 12 people',
            '5, if the group has 20 people',
            '1, if the group has 4 people',
            '10, if the group has 40 people',
        ],
        wrongPool: [
            '2, if the group has 6 people',
            '3, if the group has 10 people',
            '4, if the group has 10 people',
            '1, if the group has 5 people',
        ],
    },

    // ── PERCENTAGE TRAPS ─────────────────────────────────────────
    {
        id: 'q44',
        prompt: 'A price increases by 20% and then decreases by 20%. Which statement [IS_OR_IS_NOT] true?',
        correctPool: [
            'The final price is lower than the starting price',
            'The two percentage changes do not cancel each other',
            'The final price is 4% lower than the starting price',
            'The final price is 96% of the starting price',
        ],
        wrongPool: [
            'The final price is exactly the starting price',
            'The final price is 20% lower than the starting price',
            'The final price is 20% higher than the starting price',
            'The final price is higher than the starting price',
        ],
    },
    {
        id: 'q45',
        prompt: 'A number increases from 50 to 60. Which of these statements [IS_OR_IS_NOT] correct?',
        correctPool: [
            'The increase is 10',
            'The percentage increase is 20%',
            'The new number is 120% of the old number',
            'The new number is 20% larger than the old number',
        ],
        wrongPool: [
            'The percentage increase is 10%',
            'The increase is 20',
            'The new number is 120% larger than the old number',
            'The old number is 20% smaller than the new number',
        ],
    },
    {
        id: 'q47',
        prompt: 'A ₹1,000 item gets a 10% discount. Which of these amounts [CAN_CANNOT] be the discount?',
        correctPool: ['₹100', '10% of ₹1,000', 'One-tenth of ₹1,000', 'Half of ₹200'],
        wrongPool: ['₹10', '₹900', '₹110', '₹90'],
    },

    // ── "WAIT, THAT'S TRUE?" ──────────────────────────────────────
    {
        id: 'q48',
        prompt: 'Which of these statements [IS_OR_IS_NOT] true?',
        correctPool: [
            'A tomato is botanically a fruit',
            'A banana is botanically a berry',
            'An avocado is botanically a berry',
            'A pumpkin is botanically a fruit',
        ],
        wrongPool: [
            'A strawberry is botanically a true berry',
            'A peanut is a tree nut',
            'A coconut is a true nut',
            'A raspberry is botanically a true berry',
        ],
    },
    {
        id: 'q49',
        prompt: 'Which of these statements [IS_OR_IS_NOT] possible?',
        correctPool: [
            'Someone can be born on February 29',
            'A year can contain 366 days',
            'February can have 29 days',
            'A month can have 31 days',
        ],
        wrongPool: [
            'February can have 30 days',
            'A week can contain 8 days',
            'A calendar month must always contain exactly 30 days',
            'A leap year can have 365 days',
        ],
    },
    {
        id: 'q50',
        prompt: 'Which of these [CAN_CANNOT] be true?',
        correctPool: [
            'A person can be both an uncle and a nephew',
            'A person can be both a parent and a child',
            'A person can be younger than their own nephew',
            'A person can be both a brother and an uncle',
        ],
        wrongPool: [
            'A person can be their own biological parent',
            'A person can be older than their own biological parent',
            'A person can be their own grandparent without any unusual fictional rules',
            'A person can be their own sibling',
        ],
    },

    // ── QUICK MATH / TRAPS ────────────────────────────────────────
    {
        id: 'q51',
        prompt: 'You have ₹500 and spend 20%. Which of these amounts [IS_OR_IS_NOT] correct?',
        correctPool: [
            'You spent ₹100',
            'You have ₹400 left',
            'You have 80% of your money left',
            'You spent one-fifth of your money',
        ],
        wrongPool: ['You spent ₹20', 'You have ₹450 left', 'You spent ₹120', 'You have ₹480 left'],
    },
    {
        id: 'q52',
        prompt: 'A number is doubled and then doubled again. Which multiplier [IS_OR_IS_NOT] equivalent to the total change?',
        correctPool: ['4×', '400% of the original amount', '300% increase', 'Multiplying by 2 twice'],
        wrongPool: ['2×', '3×', '200% increase', '400% increase'],
    },
    {
        id: 'q53',
        prompt: 'Which of these statements [IS_OR_IS_NOT] true about zero?',
        correctPool: [
            'Adding zero leaves a number unchanged',
            'Multiplying a number by zero gives zero',
            'Zero is greater than every negative number',
            'Zero is an even number',
        ],
        wrongPool: [
            'Dividing every number by zero gives zero',
            'Zero is an odd number',
            'Zero is a positive number',
            'Zero is a negative number',
        ],
    },
    {
        id: 'q54',
        prompt: 'You flip a fair coin twice. Which outcomes [CAN_CANNOT] happen?',
        correctPool: ['Two heads', 'Two tails', 'One head and one tail', 'Heads first, then tails'],
        wrongPool: ['Three heads', 'Three tails', 'Two heads and one tail', 'Zero heads and zero tails'],
    },

    // ── EVERYDAY REASONING ────────────────────────────────────────
    {
        id: 'q55',
        prompt: 'Four people are standing in a line. Which statement [IS_OR_IS_NOT] true?',
        correctPool: [
            'The first person cannot also be the last',
            'There are exactly 2 people between first and last',
            'There are 3 people behind the first person',
            'Both middle people have someone on each side',
        ],
        wrongPool: [
            'The first person is automatically the last person',
            'Everyone can be first at the same time',
            'The second person is also the last',
            'There are 3 people between first and last',
        ],
    },
    {
        id: 'q56',
        prompt: 'You arrive before someone who was supposed to arrive at 8:00. Which statement [IS_OR_IS_NOT] necessarily true?',
        correctPool: [
            'You arrived before that person',
            'That person arrived after you',
            'You were not the later of the two to arrive',
        ],
        wrongPool: [
            'You arrived before 8:00',
            'You arrived exactly at 7:59',
            'The other person arrived late',
            'You were early',
        ],
    },
    {
        id: 'q57',
        prompt: 'A room contains 5 people. Everyone shakes hands with everyone else exactly once. Which numbers [CAN_CANNOT] represent the total number of handshakes?',
        correctPool: ['10', 'Ten', '4 + 3 + 2 + 1', '5 × 4 ÷ 2'],
        wrongPool: ['5', '15', '20', '25'],
    },

    // ── WORD / LANGUAGE TWISTS ───────────────────────────────────
    {
        id: 'q58',
        prompt: 'Which of these words [IS_OR_IS_NOT] correctly used in the sentence: "I have ____ friends than before"?',
        correctPool: ['fewer', 'more', 'far fewer', 'a few more'],
        wrongPool: ['less', 'fewest', 'least', 'lesser'],
    },
    {
        id: 'q59',
        prompt: 'Which of these [CAN_CANNOT] describe something that happens every two years?',
        correctPool: ['Biennial', 'Every other year', 'Once in two years'],
        wrongPool: ['Biweekly', 'Bimonthly', 'Semiannual', 'Annual', 'Perennial'],
    },

    // ── VISUAL / SOCIAL-GAME STYLE QUESTIONS ─────────────────────
    {
        id: 'q60',
        prompt: 'Six players are sitting in a circle. If you move two places clockwise, which statement [IS_OR_IS_NOT] necessarily true?',
        correctPool: [
            'You end up two seats clockwise from your original position',
            'You end up four seats counterclockwise from your original position',
            'You are not directly opposite your original seat',
        ],
        wrongPool: [
            'You move two seats counterclockwise',
            'You return to your original seat',
            'You move to the seat directly opposite you',
            'You end up three seats away',
        ],
    },
    {
        id: 'q61',
        prompt: 'Five people each choose either tea or coffee. Which totals [CAN_CANNOT] happen?',
        correctPool: [
            '5 tea and 0 coffee',
            '3 tea and 2 coffee',
            '1 tea and 4 coffee',
            '0 tea and 5 coffee',
        ],
        wrongPool: ['6 tea and 0 coffee', '3 tea and 3 coffee', '2 tea and 2 coffee', '4 tea and 2 coffee'],
    },

    // ── SOCIAL / PARTY KNOWLEDGE ─────────────────────────────────
    {
        id: 'q62',
        prompt: 'Which of these statements [IS_OR_IS_NOT] mathematically possible for a group of 7 people?',
        correctPool: [
            'Exactly 3 people are wearing glasses',
            'Exactly 100% are wearing glasses',
            'More than half are wearing glasses',
            'Nobody is wearing glasses',
        ],
        wrongPool: [
            'Exactly 50% are wearing glasses',
            'Exactly 25% are wearing glasses',
            'Exactly 75% are wearing glasses',
            'Exactly 8 people are wearing glasses',
        ],
    },
    {
        id: 'q63',
        prompt: 'A group has 12 players. Which percentages [CAN_CANNOT] represent an exact whole number of players?',
        correctPool: ['25%', '50%', '75%', '100%'],
        wrongPool: ['10%', '30%', '40%', '20%', '60%'],
    },

    // ── Language ─────────────────────────────────────────────
    {
        id: 'q64',
        prompt: "Same as 'huge'?",
        correctPool: ['Enormous', 'Massive', 'Gigantic', 'Colossal'],
        wrongPool: ['Tiny', 'Small', 'Petite', 'Minuscule'],
    },
    {
        id: 'q65',
        prompt: "Opposite of 'generous'?",
        correctPool: ['Stingy', 'Miserly', 'Selfish', 'Greedy', 'Tight-fisted'],
        wrongPool: ['Kind', 'Giving', 'Charitable', 'Big-hearted'],
    },
    {
        id: 'q66',
        prompt: "Same as 'happy'?",
        correctPool: ['Joyful', 'Cheerful', 'Elated', 'Glad'],
        wrongPool: ['Sad', 'Gloomy', 'Miserable', 'Upset'],
    },
    {
        id: 'q67',
        prompt: "Opposite of 'ancient'?",
        correctPool: ['Modern', 'New', 'Contemporary'],
        wrongPool: ['Old', 'Antique', 'Historic', 'Vintage'],
    },
    {
        id: 'q68',
        prompt: "Same as 'exhausted'?",
        correctPool: ['Tired', 'Drained', 'Worn out', 'Weary'],
        wrongPool: ['Energetic', 'Lively', 'Fresh', 'Rested'],
    },
    {
        id: 'q69',
        prompt: "Opposite of 'transparent'?",
        correctPool: ['Opaque', 'Cloudy', 'Murky'],
        wrongPool: ['Clear', 'See-through', 'Glassy', 'Crystal-clear'],
    },
    {
        id: 'q70',
        prompt: "Same as 'stubborn'?",
        correctPool: ['Headstrong', 'Obstinate', 'Inflexible'],
        wrongPool: ['Flexible', 'Easygoing', 'Agreeable', 'Open-minded'],
    },
    {
        // was a duplicate of q65
        id: 'q71',
        prompt: "Opposite of 'humble'?",
        correctPool: ['Arrogant', 'Boastful', 'Conceited', 'Vain'],
        wrongPool: ['Modest', 'Meek', 'Unassuming', 'Down-to-earth'],
    },

    // ── Movies & Pop Culture ─────────────────────────────────
    {
        // "original MCU" because Wolverine/Deadpool have been Avengers in comics
        id: 'q72',
        prompt: '[NOT_AN] original MCU Avenger?',
        correctPool: ['Iron Man', 'Thor', 'Hulk', 'Black Widow', 'Hawkeye', 'Captain America'],
        wrongPool: ['Wolverine', 'Deadpool', 'Magneto', 'Professor X', 'Batman'],
    },
    {
        // Elsa isn't in the official Disney Princess lineup
        id: 'q73',
        prompt: '[NOT_A] Disney Princess?',
        correctPool: ['Belle', 'Ariel', 'Jasmine', 'Moana', 'Rapunzel', 'Mulan'],
        wrongPool: ['Harley Quinn', 'Wonder Woman', 'Elphaba', 'Princess Peach', 'Princess Fiona'],
    },
    {
        id: 'q74',
        prompt: '[NOT_A] Pixar movie?',
        correctPool: ['Up', 'Coco', 'Cars', 'Brave', 'Soul'],
        wrongPool: ['Shrek', 'Minions', 'Madagascar', 'Kung Fu Panda'],
    },
    {
        id: 'q75',
        prompt: '[NOT_A] Harry Potter house?',
        correctPool: ['Gryffindor', 'Slytherin', 'Hufflepuff', 'Ravenclaw'],
        wrongPool: ['Camelot', 'Narnia', 'Hogsmeade', 'Durmstrang'],
    },
    {
        id: 'q76',
        prompt: '[NOT_A] James Bond actor?',
        correctPool: ['Sean Connery', 'Daniel Craig', 'Pierce Brosnan', 'Roger Moore', 'Timothy Dalton'],
        wrongPool: ['Tom Cruise', 'Hugh Jackman', 'Liam Neeson', 'Matt Damon'],
    },
    {
        id: 'q77',
        prompt: '[NOT_A] Star Wars character?',
        correctPool: ['Yoda', 'Darth Vader', 'Luke Skywalker', 'Chewbacca', 'Han Solo'],
        wrongPool: ['Gandalf', 'Spock', 'Frodo', 'Captain Kirk'],
    },
    {
        id: 'q78',
        prompt: '[NOT_A] Pokemon?',
        correctPool: ['Pikachu', 'Charizard', 'Snorlax', 'Bulbasaur'],
        wrongPool: ['Sonic', 'Kirby', 'Yoshi', 'Mario'],
    },
    {
        id: 'q79',
        prompt: '[NOT_A] Toy Story character?',
        correctPool: ['Woody', 'Buzz Lightyear', 'Jessie', 'Rex', 'Mr. Potato Head'],
        wrongPool: ['Shrek', 'Donkey', 'Po', 'Nemo'],
    },

    // ── Music ──────────────────────────────────────────────────
    {
        id: 'q80',
        prompt: '[NOT_A] string instrument?',
        correctPool: ['Violin', 'Guitar', 'Cello', 'Harp', 'Sitar'],
        wrongPool: ['Trumpet', 'Flute', 'Drum', 'Clarinet'],
    },
    {
        id: 'q81',
        prompt: '[NOT_A] percussion instrument?',
        correctPool: ['Drum', 'Tabla', 'Xylophone', 'Cymbals'],
        wrongPool: ['Violin', 'Flute', 'Saxophone', 'Guitar'],
    },
    {
        id: 'q82',
        prompt: '[NOT_A] wind instrument?',
        correctPool: ['Flute', 'Trumpet', 'Saxophone', 'Clarinet'],
        wrongPool: ['Guitar', 'Drum', 'Piano', 'Violin'],
    },
    {
        id: 'q84',
        prompt: '[NOT_A] music genre?',
        correctPool: ['Jazz', 'Reggae', 'Classical', 'Hip-hop', 'Blues'],
        wrongPool: ['Oregano', 'Paprika', 'Cinnamon', 'Saffron'],
    },

    // ── Geography / World ──────────────────────────────────────
    {
        id: 'q85',
        prompt: '[NOT_A] continent?',
        correctPool: ['Asia', 'Africa', 'Europe', 'Antarctica', 'North America'],
        wrongPool: ['Greenland', 'Sahara', 'Amazon', 'Arctic'],
    },
    {
        id: 'q86',
        prompt: '[NOT_A] river?',
        correctPool: ['Nile', 'Amazon', 'Ganges', 'Thames', 'Yangtze'],
        wrongPool: ['Everest', 'Sahara', 'Pacific', 'Kilimanjaro'],
    },
    {
        id: 'q87',
        prompt: '[NOT_AN] ocean?',
        correctPool: ['Pacific', 'Atlantic', 'Indian', 'Arctic', 'Southern'],
        wrongPool: ['Amazon', 'Nile', 'Sahara', 'Mediterranean'],
    },
    {
        id: 'q88',
        prompt: '[NOT_A] desert?',
        correctPool: ['Sahara', 'Gobi', 'Thar', 'Kalahari', 'Atacama'],
        wrongPool: ['Amazon', 'Everest', 'Nile', 'Alps'],
    },
    {
        id: 'q89',
        prompt: '[NOT_A] mountain range?',
        correctPool: ['Himalayas', 'Alps', 'Andes', 'Rockies', 'Urals'],
        wrongPool: ['Sahara', 'Amazon', 'Pacific', 'Gobi'],
    },
    {
        id: 'q90',
        prompt: '[NOT_A] landlocked country?',
        correctPool: ['Switzerland', 'Nepal', 'Austria', 'Mongolia', 'Bhutan'],
        wrongPool: ['Japan', 'Australia', 'Sri Lanka', 'Italy', 'India'],
    },

    // ── India-related ────────────────────────────────────────
    {
        id: 'q91',
        prompt: '[NOT_AN] Indian state?',
        correctPool: ['Kerala', 'Punjab', 'Gujarat', 'Rajasthan', 'Assam'],
        wrongPool: ['Delhi', 'Chandigarh', 'Puducherry', 'Lakshadweep', 'Ladakh'],
    },
    {
        id: 'q92',
        prompt: '[NOT_A] South Indian language?',
        correctPool: ['Tamil', 'Telugu', 'Kannada', 'Malayalam'],
        wrongPool: ['Punjabi', 'Bengali', 'Marathi', 'Gujarati'],
    },
    {
        id: 'q93',
        prompt: '[NOT_AN] Indian festival?',
        correctPool: ['Diwali', 'Holi', 'Onam', 'Pongal', 'Navratri'],
        wrongPool: ['Easter', 'Thanksgiving', "St Patrick's Day", 'Halloween'],
    },
    {
        id: 'q94',
        prompt: '[NOT_A] classical Indian dance form?',
        correctPool: ['Bharatanatyam', 'Kathak', 'Odissi', 'Kuchipudi', 'Kathakali', 'Mohiniyattam'],
        wrongPool: ['Ballet', 'Salsa', 'Tango', 'Flamenco'],
    },
    {
        id: 'q95',
        prompt: '[NOT_A] river in India?',
        correctPool: ['Ganga', 'Yamuna', 'Godavari', 'Brahmaputra', 'Narmada', 'Periyar'],
        wrongPool: ['Nile', 'Amazon', 'Thames', 'Danube'],
    },

    // ── Animals ──────────────────────────────────────────────
    {
        id: 'q96',
        prompt: '[NOT_A] mammal?',
        correctPool: ['Dog', 'Elephant', 'Whale', 'Bat', 'Dolphin'],
        wrongPool: ['Snake', 'Crocodile', 'Frog', 'Shark', 'Penguin'],
    },
    {
        id: 'q97',
        prompt: '[NOT_A] bird?',
        correctPool: ['Eagle', 'Sparrow', 'Ostrich', 'Penguin', 'Peacock'],
        wrongPool: ['Bat', 'Butterfly', 'Dragonfly', 'Flying squirrel'],
    },
    {
        id: 'q98',
        prompt: 'A baby dog is called a?',
        correctPool: ['Puppy'],
        wrongPool: ['Kitten', 'Cub', 'Calf', 'Foal'],
    },
    {
        id: 'q99',
        prompt: 'A baby kangaroo is called a?',
        correctPool: ['Joey'],
        wrongPool: ['Puppy', 'Cub', 'Calf', 'Kitten', 'Chick'],
    },
    {
        id: 'q100',
        prompt: '[NOT_A] reptile?',
        correctPool: ['Snake', 'Lizard', 'Crocodile', 'Turtle', 'Chameleon'],
        wrongPool: ['Frog', 'Salamander', 'Newt', 'Toad'],
    },
    {
        id: 'q101',
        prompt: '[NOT_AN] insect?',
        correctPool: ['Ant', 'Bee', 'Butterfly', 'Mosquito', 'Grasshopper'],
        wrongPool: ['Spider', 'Scorpion', 'Crab', 'Centipede', 'Tick'],
    },

    // ── Food ──────────────────────────────────────────────────
    {
        id: 'q102',
        prompt: '[NOT_AN] Italian dish?',
        correctPool: ['Pizza', 'Pasta', 'Risotto', 'Lasagna', 'Tiramisu'],
        wrongPool: ['Sushi', 'Tacos', 'Biryani', 'Paella', 'Croissant'],
    },
    {
        id: 'q103',
        prompt: '[NOT_A] spice?',
        correctPool: ['Cumin', 'Turmeric', 'Cardamom', 'Cinnamon', 'Clove', 'Black pepper'],
        wrongPool: ['Sugar', 'Rice', 'Flour', 'Salt', 'Baking soda'],
    },
    {
        id: 'q104',
        prompt: '[NOT_A] fruit?',
        correctPool: ['Mango', 'Apple', 'Banana', 'Grape', 'Pineapple'],
        wrongPool: ['Potato', 'Carrot', 'Onion', 'Spinach', 'Garlic'],
    },
    {
        id: 'q105',
        prompt: '[NOT_A] dairy product?',
        correctPool: ['Cheese', 'Butter', 'Yogurt', 'Paneer', 'Ghee'],
        wrongPool: ['Tofu', 'Almond milk', 'Coconut oil', 'Soy milk', 'Eggs'],
    },
    {
        id: 'q106',
        prompt: '[NOT_A] street food in India?',
        correctPool: ['Pani Puri', 'Vada Pav', 'Samosa', 'Chaat', 'Pav Bhaji', 'Bhel Puri'],
        wrongPool: ['Burrito', 'Hot dog', 'Croissant', 'Pretzel'],
    },
    {
        id: 'q107',
        prompt: '[NOT_A] breakfast cereal?',
        correctPool: ['Cornflakes', 'Cheerios', 'Muesli', 'Granola'],
        wrongPool: ['Nutella', 'Ketchup', 'Mayonnaise', 'Peanut butter'],
    },

    // ── Sports ──────────────────────────────────────────────
    {
        id: 'q108',
        prompt: '[NOT_A] cricket term?',
        correctPool: ['Wicket', 'Over', 'Boundary', 'LBW', 'Googly'],
        wrongPool: ['Touchdown', 'Slam dunk', 'Offside', 'Home run'],
    },
    {
        id: 'q109',
        prompt: '[NOT_AN] Olympic sport?',
        correctPool: ['Swimming', 'Gymnastics', 'Archery', 'Fencing', 'Badminton'],
        wrongPool: ['Darts', 'Poker', 'Bowling', 'Chess'],
    },
    {
        id: 'q110',
        prompt: '[NOT_A] football (soccer) term?',
        correctPool: ['Offside', 'Penalty', 'Corner kick', 'Free kick', 'Throw-in'],
        wrongPool: ['Touchdown', 'Home run', 'Strike', 'Slam dunk', 'LBW'],
    },
    {
        id: 'q111',
        prompt: '[NOT_A] tennis term?',
        correctPool: ['Ace', 'Deuce', 'Love', 'Rally', 'Tie-break'],
        wrongPool: ['Wicket', 'Birdie', 'Offside', 'Touchdown'],
    },
    {
        id: 'q112',
        prompt: '[NOT_A] combat sport?',
        correctPool: ['Boxing', 'Wrestling', 'Judo', 'Karate', 'Taekwondo'],
        wrongPool: ['Golf', 'Archery', 'Bowling', 'Cycling'],
    },

    // ── Science / Space ──────────────────────────────────────
    {
        id: 'q113',
        prompt: '[NOT_A] planet in our solar system?',
        correctPool: ['Mars', 'Venus', 'Jupiter', 'Saturn', 'Mercury', 'Neptune'],
        wrongPool: ['Sun', 'Moon', 'Pluto', 'Titan', 'Ceres'],
    },
    {
        id: 'q114',
        prompt: '[NOT_A] chemical element?',
        correctPool: ['Oxygen', 'Hydrogen', 'Gold', 'Iron', 'Carbon'],
        wrongPool: ['Water', 'Air', 'Rust', 'Steel', 'Salt'],
    },
    {
        id: 'q115',
        prompt: '[NOT_A] state of matter?',
        correctPool: ['Solid', 'Liquid', 'Gas', 'Plasma'],
        wrongPool: ['Energy', 'Mass', 'Volume', 'Weight'],
    },
    {
        id: 'q116',
        prompt: '[NOT_A] part of a plant?',
        correctPool: ['Root', 'Stem', 'Leaf', 'Petal', 'Seed'],
        wrongPool: ['Fur', 'Scale', 'Fin', 'Feather'],
    },
    {
        id: 'q117',
        prompt: '[NOT_A] type of cloud?',
        correctPool: ['Cumulus', 'Cirrus', 'Stratus', 'Cumulonimbus'],
        wrongPool: ['Tsunami', 'Avalanche', 'Earthquake', 'Hurricane'],
    },

    // ── Riddles / Lateral Thinking ─────────────────────────────
    {
        id: 'q118',
        prompt: 'What has a neck but no head?',
        correctPool: ['A bottle', 'A shirt', 'A vase'],
        wrongPool: ['A snake', 'A giraffe', 'A turtle', 'A swan'],
    },
    {
        id: 'q119',
        prompt: 'What can travel around the world while staying in a corner?',
        correctPool: ['A stamp', 'A postage stamp'],
        wrongPool: ['A map', 'A plane', 'A ball', 'A suitcase'],
    },
    {
        id: 'q120',
        prompt: "What has keys but can't open locks?",
        correctPool: ['A piano', 'A keyboard', 'A typewriter'],
        wrongPool: ['A locksmith', 'A thief', 'A safe', 'A door'],
    },
    {
        id: 'q121',
        prompt: 'What goes up but never comes down?',
        correctPool: ['Your age', 'Years'],
        wrongPool: ['A balloon', 'A rocket', 'A kite', 'An elevator'],
    },
    {
        id: 'q122',
        prompt: 'What has a thumb and four fingers but is not alive?',
        correctPool: ['A glove'],
        wrongPool: ['A robot', 'A puppet', 'A statue', 'A mitten'],
    },
    {
        id: 'q123',
        prompt: 'What belongs to you, but others use it more than you?',
        correctPool: ['Your name'],
        wrongPool: ['Your phone', 'Your house', 'Your car', 'Your money'],
    },

    // ── Funny / Quirky ("Is this even real?") ─────────────────
    {
        id: 'q124',
        prompt: 'Which of these [IS_OR_IS_NOT] a real word?',
        correctPool: ['Discombobulated', 'Kerfuffle', 'Nincompoop', 'Flabbergasted'],
        wrongPool: ['Blorptastic', 'Fizzwiggle', 'Snurfle', 'Wobblesnoot'],
    },
    {
        id: 'q125',
        prompt: 'Which of these [IS_OR_IS_NOT] a real documented phobia?',
        correctPool: [
            'Arachnophobia (spiders)',
            'Claustrophobia (enclosed spaces)',
            'Coulrophobia (clowns)',
            'Acrophobia (heights)',
        ],
        wrongPool: ['Mondayphobia', 'Pizzaphobia', 'Selfiephobia', 'Homeworkphobia'],
    },
    {
        id: 'q126',
        prompt: 'Which of these [IS_OR_IS_NOT] an actual superstition somewhere in the world?',
        correctPool: [
            'Breaking a mirror brings bad luck',
            'A black cat crossing your path is bad luck',
            'Walking under a ladder is bad luck',
        ],
        wrongPool: [
            'Sneezing on a Tuesday brings wealth',
            'Wearing socks backwards cures hiccups',
            'Eating a carrot on Fridays makes you invisible',
        ],
    },
    {
        id: 'q127',
        prompt: 'Which of these [IS_OR_IS_NOT] a real English idiom?',
        correctPool: ['Break the ice', 'Spill the beans', 'Under the weather', 'Piece of cake'],
        wrongPool: ['Paint the ceiling', 'Bite the lamp', 'Swallow the clock', 'Fold the river'],
    },
    {
        id: 'q128',
        prompt: 'Which of these [IS_OR_IS_NOT] a genuine tongue twister?',
        correctPool: [
            'She sells seashells by the seashore',
            'Peter Piper picked a peck of pickled peppers',
            'How much wood would a woodchuck chuck',
            'Red lorry, yellow lorry',
        ],
        wrongPool: [
            'Tommy types tiny telephones today',
            'Gary grabs green glowing grapes',
            'Penny packs purple pencils in pockets',
        ],
    },
    {
        id: 'q129',
        prompt: 'Which of these [IS_OR_IS_NOT] a real world record category?',
        correctPool: [
            "Fastest time to solve a Rubik's Cube",
            'Longest fingernails',
            'Most push-ups in an hour',
        ],
        wrongPool: [
            'Loudest whispered secret',
            'Fastest to blink 100 times',
            'Longest time spent thinking about nothing',
        ],
    },

    // ── Twisted Logic / Math ──────────────────────────────────
    {
        id: 'q130',
        prompt: 'A train arrives 0 minutes late. Which statement [IS_OR_IS_NOT] true?',
        correctPool: ['The train was on time', 'There was no delay', 'It arrived at its scheduled time'],
        wrongPool: ['The train was early', 'The train was cancelled', 'The train was rescheduled', 'The train arrived late'],
    },
    {
        id: 'q131',
        prompt: 'Out of 10 players, 30% are wearing hats. Which statement [CAN_CANNOT] be accurate?',
        correctPool: [
            '3 players are wearing hats',
            '7 players are not wearing hats',
            'Fewer than half are wearing hats',
        ],
        wrongPool: [
            '2 players are wearing hats',
            '4 players are wearing hats',
            '5 players are wearing hats',
            '30 players are wearing hats',
        ],
    },
    {
        id: 'q132',
        prompt: 'A square has four equal sides and four right angles. Which shape [CAN_CANNOT] also be called a square?',
        correctPool: [
            'A rectangle with all equal sides',
            'A rhombus with right angles',
            'A quadrilateral with four equal sides and four right angles',
        ],
        wrongPool: ['Any rectangle', 'Any rhombus', 'A triangle', 'A pentagon with equal sides'],
    },
    {
        // Twins born either side of midnight have different birthdays
        id: 'q133',
        prompt: 'Which of these [IS_OR_IS_NOT] always true about twins?',
        correctPool: [
            'Born from the same pregnancy',
            'Share the same birth mother',
            'Are siblings',
        ],
        wrongPool: [
            'Always look identical',
            'Always of the same gender',
            'Always share the same birthday',
            'Always have identical fingerprints',
        ],
    },

    // ── History (light, safe) ────────────────────────────────
    {
        id: 'q134',
        prompt: '[NOT_AN] ancient civilization?',
        correctPool: ['Egyptian', 'Roman', 'Mayan', 'Mesopotamian', 'Indus Valley'],
        wrongPool: ['Wakanda', 'Atlantis', 'Narnia', 'El Dorado'],
    },
    {
        id: 'q135',
        prompt: 'Who was the first man to walk on the moon?',
        correctPool: ['Neil Armstrong'],
        wrongPool: ['Buzz Aldrin', 'Yuri Gagarin', 'Michael Collins', 'John Glenn'],
    },
    {
        id: 'q136',
        prompt: 'Which empire built the Taj Mahal?',
        correctPool: ['The Mughal Empire'],
        wrongPool: ['The British Empire', 'The Roman Empire', 'The Ottoman Empire', 'The Maurya Empire'],
    },
    {
        id: 'q137',
        prompt: 'World War 2 ended in which decade?',
        correctPool: ['The 1940s'],
        wrongPool: ['The 1930s', 'The 1950s', 'The 1960s', 'The 1920s'],
    },
    {
        id: 'q138',
        prompt: '[NOT_A] wonder of the modern world?',
        correctPool: [
            'Great Wall of China',
            'Taj Mahal',
            'Colosseum',
            'Christ the Redeemer',
            'Machu Picchu',
            'Petra',
            'Chichen Itza',
        ],
        wrongPool: ['Eiffel Tower', 'Statue of Liberty', 'Big Ben', 'Stonehenge', 'Sydney Opera House'],
    },
];