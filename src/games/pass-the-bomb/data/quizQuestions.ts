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
    // q139–q238 — paste these entries inside the quizQuestions array.

    {
        id: 'q139',
        prompt: 'Who founded the Maurya Empire?',
        correctPool: ['Chandragupta Maurya'],
        wrongPool: ['Ashoka', 'Bindusara', 'Samudragupta', 'Harshavardhana'],
    },
    {
        id: 'q140',
        prompt: 'In which year did the Berlin Wall fall?',
        correctPool: ['1989'],
        wrongPool: ['1987', '1991', '1985', '1990'],
    },
    {
        id: 'q141',
        prompt: 'Who led the East India Company to victory at the Battle of Plassey (1757)?',
        correctPool: ['Robert Clive'],
        wrongPool: ['Siraj ud-Daulah', 'Tipu Sultan', 'Warren Hastings', 'Lord Cornwallis'],
    },
    {
        id: 'q142',
        prompt: 'Which treaty formally ended World War I between Germany and the Allies?',
        correctPool: ['Treaty of Versailles'],
        wrongPool: ['Treaty of Utrecht', 'Treaty of Westphalia', 'Treaty of Tordesillas', 'Treaty of Ghent'],
    },
    {
        id: 'q143',
        prompt: 'Who was the first woman to win a Nobel Prize?',
        correctPool: ['Marie Curie'],
        wrongPool: ['Rosalind Franklin', 'Ada Lovelace', 'Dorothy Hodgkin', 'Lise Meitner'],
    },
    {
        id: 'q144',
        prompt: '[NOT_A] major Allied power in World War II?',
        correctPool: ['United Kingdom', 'Soviet Union', 'United States', 'China'],
        wrongPool: ['Germany', 'Japan', 'Hungary'],
    },
    {
        id: 'q145',
        prompt: "Who wrote 'One Hundred Years of Solitude'?",
        correctPool: ['Gabriel García Márquez'],
        wrongPool: ['Jorge Luis Borges', 'Mario Vargas Llosa', 'Pablo Neruda', 'Isabel Allende'],
    },
    {
        id: 'q146',
        prompt: 'In which year was the Magna Carta sealed?',
        correctPool: ['1215'],
        wrongPool: ['1066', '1314', '1295', '1415'],
    },
    {
        id: 'q147',
        prompt: 'Which civilization built Machu Picchu?',
        correctPool: ['Inca'],
        wrongPool: ['Aztec', 'Maya', 'Olmec', 'Toltec'],
    },
    {
        id: 'q148',
        prompt: 'Who invented the World Wide Web?',
        correctPool: ['Tim Berners-Lee'],
        wrongPool: ['Vint Cerf', 'Bill Gates', 'Steve Jobs', 'Alan Turing'],
    },
    {
        id: 'q149',
        prompt: 'Who discovered penicillin?',
        correctPool: ['Alexander Fleming'],
        wrongPool: ['Louis Pasteur', 'Joseph Lister', 'Edward Jenner', 'Robert Koch'],
    },
    {
        id: 'q150',
        prompt: 'Edward Jenner is famous for developing which?',
        correctPool: ['Smallpox vaccine'],
        wrongPool: ['Penicillin', 'Anaesthesia', 'X-ray imaging', 'Insulin'],
    },
    {
        id: 'q151',
        prompt: "Which element has the chemical symbol 'W'?",
        correctPool: ['Tungsten'],
        wrongPool: ['Tin', 'Titanium', 'Vanadium', 'Xenon'],
    },
    {
        id: 'q152',
        prompt: "Which element has the chemical symbol 'Sb'?",
        correctPool: ['Antimony'],
        wrongPool: ['Tin', 'Strontium', 'Selenium', 'Samarium'],
    },
    {
        id: 'q153',
        prompt: 'Who formulated the three laws of planetary motion?',
        correctPool: ['Johannes Kepler'],
        wrongPool: ['Galileo Galilei', 'Nicolaus Copernicus', 'Tycho Brahe', 'Isaac Newton'],
    },
    {
        id: 'q154',
        prompt: 'Who formulated the uncertainty principle?',
        correctPool: ['Werner Heisenberg'],
        wrongPool: ['Niels Bohr', 'Erwin Schrödinger', 'Max Planck', 'Paul Dirac'],
    },
    {
        id: 'q155',
        prompt: 'In which year did humans first land on the Moon?',
        correctPool: ['1969'],
        wrongPool: ['1965', '1967', '1971', '1973'],
    },
    {
        id: 'q156',
        prompt: 'Who was the first human in space?',
        correctPool: ['Yuri Gagarin'],
        wrongPool: ['Neil Armstrong', 'Alan Shepard', 'John Glenn', 'Valentina Tereshkova'],
    },
    {
        id: 'q157',
        prompt: "Who wrote 'The Prince'?",
        correctPool: ['Niccolò Machiavelli'],
        wrongPool: ['Dante Alighieri', 'Thomas More', 'Erasmus', 'Giovanni Boccaccio'],
    },
    {
        id: 'q158',
        prompt: "Who wrote 'Utopia' (1516)?",
        correctPool: ['Thomas More'],
        wrongPool: ['Francis Bacon', 'Thomas Hobbes', 'John Locke', 'Erasmus'],
    },
    {
        id: 'q159',
        prompt: "Who wrote 'The Name of the Rose'?",
        correctPool: ['Umberto Eco'],
        wrongPool: ['Italo Calvino', 'Primo Levi', 'Alberto Moravia', 'Elena Ferrante'],
    },
    {
        id: 'q160',
        prompt: "Who wrote 'Crime and Punishment'?",
        correctPool: ['Fyodor Dostoevsky'],
        wrongPool: ['Leo Tolstoy', 'Anton Chekhov', 'Nikolai Gogol', 'Ivan Turgenev'],
    },
    {
        id: 'q161',
        prompt: '[NOT_A] play by William Shakespeare?',
        correctPool: ['Macbeth', 'Othello', 'The Tempest', 'Coriolanus', 'Twelfth Night'],
        wrongPool: ['Doctor Faustus', 'The Duchess of Malfi', 'Volpone', 'The Spanish Tragedy'],
    },
    {
        id: 'q162',
        prompt: "Who wrote 'Gitanjali'?",
        correctPool: ['Rabindranath Tagore'],
        wrongPool: ['Sarojini Naidu', 'Bankim Chandra Chattopadhyay', 'Munshi Premchand', 'Sri Aurobindo'],
    },
    {
        id: 'q163',
        prompt: "Who wrote the Hindi novel 'Godan'?",
        correctPool: ['Munshi Premchand'],
        wrongPool: ['Rabindranath Tagore', 'R. K. Narayan', 'Harivansh Rai Bachchan', 'Mulk Raj Anand'],
    },
    {
        id: 'q164',
        prompt: "Which novel opens with the line 'Call me Ishmael'?",
        correctPool: ['Moby-Dick'],
        wrongPool: ['Treasure Island', 'The Old Man and the Sea', 'Robinson Crusoe', 'Twenty Thousand Leagues Under the Seas'],
    },
    {
        id: 'q165',
        prompt: "Who painted 'The Persistence of Memory'?",
        correctPool: ['Salvador Dalí'],
        wrongPool: ['René Magritte', 'Pablo Picasso', 'Joan Miró', 'Max Ernst'],
    },
    {
        id: 'q166',
        prompt: "Who painted 'Guernica'?",
        correctPool: ['Pablo Picasso'],
        wrongPool: ['Salvador Dalí', 'Francisco Goya', 'Joan Miró', 'Henri Matisse'],
    },
    {
        id: 'q167',
        prompt: "Who composed 'The Four Seasons'?",
        correctPool: ['Antonio Vivaldi'],
        wrongPool: ['Johann Sebastian Bach', 'George Frideric Handel', 'Wolfgang Amadeus Mozart', 'Joseph Haydn'],
    },
    {
        id: 'q168',
        prompt: 'Who independently proposed evolution by natural selection, presented together in 1858?',
        correctPool: ['Charles Darwin', 'Alfred Russel Wallace'],
        wrongPool: ['Gregor Mendel', 'Jean-Baptiste Lamarck', 'Louis Pasteur', 'Carl Linnaeus'],
    },
    {
        id: 'q169',
        prompt: 'Who is known as the father of genetics?',
        correctPool: ['Gregor Mendel'],
        wrongPool: ['James Watson', 'Charles Darwin', 'Dmitri Mendeleev', 'Thomas Hunt Morgan'],
    },
    {
        id: 'q170',
        prompt: 'Who published the periodic table of elements in 1869?',
        correctPool: ['Dmitri Mendeleev'],
        wrongPool: ['John Dalton', 'Antoine Lavoisier', 'Robert Boyle', 'Amedeo Avogadro'],
    },
    {
        id: 'q171',
        prompt: 'Who discovered the electron?',
        correctPool: ['J. J. Thomson'],
        wrongPool: ['Ernest Rutherford', 'James Chadwick', 'Niels Bohr', 'Michael Faraday'],
    },
    {
        id: 'q172',
        prompt: 'Who discovered the neutron?',
        correctPool: ['James Chadwick'],
        wrongPool: ['Ernest Rutherford', 'J. J. Thomson', 'Enrico Fermi', 'Niels Bohr'],
    },
    {
        id: 'q173',
        prompt: 'Which Indian scientist won the 1930 Nobel Prize in Physics?',
        correctPool: ['C. V. Raman'],
        wrongPool: ['Homi J. Bhabha', 'Satyendra Nath Bose', 'Jagadish Chandra Bose', 'Meghnad Saha'],
    },
    {
        id: 'q174',
        prompt: "Who is called the father of India's nuclear programme?",
        correctPool: ['Homi J. Bhabha'],
        wrongPool: ['Vikram Sarabhai', 'A. P. J. Abdul Kalam', 'C. V. Raman', 'Satish Dhawan'],
    },
    {
        id: 'q175',
        prompt: "What was India's first satellite?",
        correctPool: ['Aryabhata'],
        wrongPool: ['Bhaskara', 'Rohini', 'INSAT-1A', 'Chandrayaan-1'],
    },
    {
        id: 'q176',
        prompt: 'Which ancient treatise on statecraft is attributed to Kautilya?',
        correctPool: ['Arthashastra'],
        wrongPool: ['Manusmriti', 'Kamasutra', 'Natyashastra', 'Panchatantra'],
    },
    {
        id: 'q177',
        prompt: 'Who founded the Mughal Empire in India?',
        correctPool: ['Babur'],
        wrongPool: ['Akbar', 'Humayun', 'Sher Shah Suri', 'Timur'],
    },
    {
        id: 'q178',
        prompt: 'In which year was the First Battle of Panipat fought?',
        correctPool: ['1526'],
        wrongPool: ['1556', '1761', '1192', '1857'],
    },
    {
        id: 'q179',
        prompt: 'Who was Viceroy of India during the Partition of Bengal in 1905?',
        correctPool: ['Lord Curzon'],
        wrongPool: ['Lord Mountbatten', 'Lord Dalhousie', 'Lord Ripon', 'Lord Irwin'],
    },
    {
        id: 'q180',
        prompt: 'In which year did Gandhi begin the Dandi Salt March?',
        correctPool: ['1930'],
        wrongPool: ['1919', '1922', '1942', '1928'],
    },
    {
        id: 'q181',
        prompt: "Who designed the original version of India's national flag?",
        correctPool: ['Pingali Venkayya'],
        wrongPool: ['Rabindranath Tagore', 'Subhas Chandra Bose', 'Sarojini Naidu', 'B. R. Ambedkar'],
    },
    {
        id: 'q182',
        prompt: 'Who chaired the Drafting Committee of the Indian Constitution?',
        correctPool: ['B. R. Ambedkar'],
        wrongPool: ['Rajendra Prasad', 'Jawaharlal Nehru', 'Vallabhbhai Patel', 'Maulana Abul Kalam Azad'],
    },
    {
        id: 'q183',
        prompt: 'Hampi was the capital of which empire?',
        correctPool: ['Vijayanagara Empire'],
        wrongPool: ['Chola Empire', 'Maratha Empire', 'Bahmani Sultanate', 'Chalukya dynasty'],
    },
    {
        id: 'q184',
        prompt: 'Who built the Brihadeeswarar Temple at Thanjavur?',
        correctPool: ['Raja Raja Chola I'],
        wrongPool: ['Rajendra Chola I', 'Krishnadevaraya', 'Narasimhavarman I', 'Pulakeshin II'],
    },
    {
        id: 'q185',
        prompt: 'Which Harappan site in Gujarat is famous for its ancient dockyard?',
        correctPool: ['Lothal'],
        wrongPool: ['Kalibangan', 'Mohenjo-daro', 'Rakhigarhi', 'Harappa'],
    },
    {
        id: 'q186',
        prompt: "Who wrote 'The Discovery of India'?",
        correctPool: ['Jawaharlal Nehru'],
        wrongPool: ['Mahatma Gandhi', 'Rabindranath Tagore', 'B. R. Ambedkar', 'S. Radhakrishnan'],
    },
    {
        id: 'q187',
        prompt: 'Which country gifted the Statue of Liberty to the United States?',
        correctPool: ['France'],
        wrongPool: ['United Kingdom', 'Spain', 'Netherlands', 'Italy'],
    },
    {
        id: 'q188',
        prompt: 'Mansa Musa, famed for his wealth, ruled which empire?',
        correctPool: ['Mali Empire'],
        wrongPool: ['Songhai Empire', 'Ghana Empire', 'Ethiopian Empire', 'Ottoman Empire'],
    },
    {
        id: 'q189',
        prompt: 'Which city was formerly known as Constantinople?',
        correctPool: ['Istanbul'],
        wrongPool: ['Ankara', 'Athens', 'Izmir', 'Thessaloniki'],
    },
    {
        id: 'q190',
        prompt: 'In which year did the Titanic sink?',
        correctPool: ['1912'],
        wrongPool: ['1905', '1915', '1921', '1910'],
    },
    {
        id: 'q191',
        prompt: 'Whose assassination in 1914 triggered World War I?',
        correctPool: ['Archduke Franz Ferdinand'],
        wrongPool: ['Tsar Nicholas II', 'Kaiser Wilhelm II', 'Emperor Franz Joseph', 'Otto von Bismarck'],
    },
    {
        id: 'q192',
        prompt: 'Who led the Bolsheviks to power in the October Revolution of 1917?',
        correctPool: ['Vladimir Lenin'],
        wrongPool: ['Joseph Stalin', 'Nikita Khrushchev', 'Alexander Kerensky', 'Tsar Nicholas II'],
    },
    {
        id: 'q193',
        prompt: 'In which year did the Cuban Missile Crisis take place?',
        correctPool: ['1962'],
        wrongPool: ['1959', '1961', '1965', '1968'],
    },
    {
        id: 'q194',
        prompt: 'On which ship did Charles Darwin make his famous voyage?',
        correctPool: ['HMS Beagle'],
        wrongPool: ['HMS Endeavour', 'HMS Victory', 'Mayflower', 'Santa María'],
    },
    {
        id: 'q195',
        prompt: 'Whose expedition completed the first circumnavigation of the Earth (1519–1522)?',
        correctPool: ['Ferdinand Magellan'],
        wrongPool: ['Christopher Columbus', 'Vasco da Gama', 'Francis Drake', 'James Cook'],
    },
    {
        id: 'q196',
        prompt: 'Who was the first European to reach India by sea?',
        correctPool: ['Vasco da Gama'],
        wrongPool: ['Christopher Columbus', 'Ferdinand Magellan', 'Bartolomeu Dias', 'Amerigo Vespucci'],
    },
    {
        id: 'q197',
        prompt: 'Who introduced movable-type printing to Europe?',
        correctPool: ['Johannes Gutenberg'],
        wrongPool: ['William Caxton', 'Martin Luther', 'Leonardo da Vinci', 'Aldus Manutius'],
    },
    {
        id: 'q198',
        prompt: 'Who received the first patent for the telephone in 1876?',
        correctPool: ['Alexander Graham Bell'],
        wrongPool: ['Thomas Edison', 'Nikola Tesla', 'Guglielmo Marconi', 'Samuel Morse'],
    },
    {
        id: 'q199',
        prompt: 'Who invented the AC induction motor?',
        correctPool: ['Nikola Tesla'],
        wrongPool: ['Thomas Edison', 'George Westinghouse', 'Michael Faraday', 'André-Marie Ampère'],
    },
    {
        id: 'q200',
        prompt: 'Who shared the 1909 Nobel Prize in Physics for wireless telegraphy?',
        correctPool: ['Guglielmo Marconi', 'Karl Ferdinand Braun'],
        wrongPool: ['Nikola Tesla', 'Heinrich Hertz', 'Thomas Edison', 'Alexander Graham Bell'],
    },
    {
        id: 'q201',
        prompt: 'Who made the first powered, controlled aeroplane flight in 1903?',
        correctPool: ['The Wright brothers'],
        wrongPool: ['Louis Blériot', 'Alberto Santos-Dumont', 'Charles Lindbergh', 'Otto Lilienthal'],
    },
    {
        id: 'q202',
        prompt: 'Who made the first solo nonstop flight across the Atlantic?',
        correctPool: ['Charles Lindbergh'],
        wrongPool: ['Amelia Earhart', 'Howard Hughes', 'Chuck Yeager', 'Louis Blériot'],
    },
    {
        id: 'q203',
        prompt: 'Who first broke the sound barrier in level flight, in 1947?',
        correctPool: ['Chuck Yeager'],
        wrongPool: ['Neil Armstrong', 'Charles Lindbergh', 'John Glenn', 'Yuri Gagarin'],
    },
    {
        id: 'q204',
        prompt: 'Who improved the steam engine by adding a separate condenser?',
        correctPool: ['James Watt'],
        wrongPool: ['Thomas Newcomen', 'George Stephenson', 'Richard Trevithick', 'Robert Fulton'],
    },
    {
        id: 'q205',
        prompt: "Who built the 'Rocket' locomotive of 1829?",
        correctPool: ['George Stephenson', 'Robert Stephenson'],
        wrongPool: ['James Watt', 'Richard Trevithick', 'Isambard Kingdom Brunel', 'Robert Fulton'],
    },
    {
        id: 'q206',
        prompt: 'Who proposed the double-helix model of DNA in 1953?',
        correctPool: ['James Watson', 'Francis Crick'],
        wrongPool: ['Linus Pauling', 'Gregor Mendel', 'Frederick Sanger', 'Oswald Avery'],
    },
    {
        id: 'q207',
        prompt: 'Who developed the first widely used injected (inactivated) polio vaccine?',
        correctPool: ['Jonas Salk'],
        wrongPool: ['Edward Jenner', 'Louis Pasteur', 'Robert Koch', 'Alexander Fleming'],
    },
    {
        id: 'q208',
        prompt: 'Who discovered electromagnetic induction in 1831?',
        correctPool: ['Michael Faraday'],
        wrongPool: ['James Clerk Maxwell', 'Georg Ohm', 'Alessandro Volta', 'André-Marie Ampère'],
    },
    {
        id: 'q209',
        prompt: 'The SI unit of electrical resistance is named after whom?',
        correctPool: ['Georg Ohm'],
        wrongPool: ['Alessandro Volta', 'André-Marie Ampère', 'James Watt', 'Heinrich Hertz'],
    },
    {
        id: 'q210',
        prompt: 'Who invented dynamite?',
        correctPool: ['Alfred Nobel'],
        wrongPool: ['Ascanio Sobrero', 'J. Robert Oppenheimer', 'Fritz Haber', 'Antoine Lavoisier'],
    },
    {
        id: 'q211',
        prompt: 'What does the Haber process produce?',
        correctPool: ['Ammonia'],
        wrongPool: ['Sulphuric acid', 'Nitric acid', 'Steel', 'Chlorine'],
    },
    {
        id: 'q212',
        prompt: '[NOT_A] noble gas?',
        correctPool: ['Argon', 'Neon', 'Krypton', 'Xenon', 'Radon'],
        wrongPool: ['Nitrogen', 'Chlorine', 'Hydrogen', 'Fluorine'],
    },
    {
        id: 'q213',
        prompt: 'What is the hardest naturally occurring mineral?',
        correctPool: ['Diamond'],
        wrongPool: ['Corundum', 'Topaz', 'Quartz', 'Feldspar'],
    },
    {
        id: 'q214',
        prompt: 'What is the largest moon in the Solar System?',
        correctPool: ['Ganymede'],
        wrongPool: ['Titan', 'Callisto', 'Io', "Earth's Moon"],
    },
    {
        id: 'q215',
        prompt: "Who set out the Sun-centred model in 'De revolutionibus' (1543)?",
        correctPool: ['Nicolaus Copernicus'],
        wrongPool: ['Galileo Galilei', 'Johannes Kepler', 'Ptolemy', 'Tycho Brahe'],
    },
    {
        id: 'q216',
        prompt: "Who first observed Jupiter's four largest moons, in 1610?",
        correctPool: ['Galileo Galilei'],
        wrongPool: ['Johannes Kepler', 'Christiaan Huygens', 'Giovanni Cassini', 'William Herschel'],
    },
    {
        id: 'q217',
        prompt: 'Who discovered the planet Uranus?',
        correctPool: ['William Herschel'],
        wrongPool: ['Galileo Galilei', 'Urbain Le Verrier', 'Clyde Tombaugh', 'Edmond Halley'],
    },
    {
        id: 'q218',
        prompt: 'Who discovered Pluto?',
        correctPool: ['Clyde Tombaugh'],
        wrongPool: ['William Herschel', 'Johann Galle', 'Edwin Hubble', 'Edmond Halley'],
    },
    {
        id: 'q219',
        prompt: 'In which year was the Hubble Space Telescope launched?',
        correctPool: ['1990'],
        wrongPool: ['1986', '1993', '1999', '2001'],
    },
    {
        id: 'q220',
        prompt: 'What was the first artificial satellite?',
        correctPool: ['Sputnik 1'],
        wrongPool: ['Explorer 1', 'Vostok 1', 'Telstar', 'Vanguard 1'],
    },
    {
        id: 'q221',
        prompt: "Who wrote 'A Brief History of Time'?",
        correctPool: ['Stephen Hawking'],
        wrongPool: ['Carl Sagan', 'Richard Feynman', 'Brian Greene', 'Neil deGrasse Tyson'],
    },
    {
        id: 'q222',
        prompt: "Who wrote 'Silent Spring' (1962), which sparked the environmental movement?",
        correctPool: ['Rachel Carson'],
        wrongPool: ['Jane Goodall', 'Dian Fossey', 'Barbara McClintock', 'Margaret Mead'],
    },
    {
        id: 'q223',
        prompt: "Who wrote 'Brave New World'?",
        correctPool: ['Aldous Huxley'],
        wrongPool: ['George Orwell', 'H. G. Wells', 'Ray Bradbury', 'Kurt Vonnegut'],
    },
    {
        id: 'q224',
        prompt: "Who wrote 'Fahrenheit 451'?",
        correctPool: ['Ray Bradbury'],
        wrongPool: ['Isaac Asimov', 'Philip K. Dick', 'Arthur C. Clarke', 'Aldous Huxley'],
    },
    {
        id: 'q225',
        prompt: "Who wrote the poem 'The Waste Land'?",
        correctPool: ['T. S. Eliot'],
        wrongPool: ['W. B. Yeats', 'Ezra Pound', 'W. H. Auden', 'Robert Frost'],
    },
    {
        id: 'q226',
        prompt: "Who wrote 'Paradise Lost'?",
        correctPool: ['John Milton'],
        wrongPool: ['Geoffrey Chaucer', 'Edmund Spenser', 'John Donne', 'Alexander Pope'],
    },
    {
        id: 'q227',
        prompt: "Who wrote 'The Canterbury Tales'?",
        correctPool: ['Geoffrey Chaucer'],
        wrongPool: ['John Milton', 'Edmund Spenser', 'Thomas Malory', 'William Langland'],
    },
    {
        id: 'q228',
        prompt: "Who wrote 'Don Quixote'?",
        correctPool: ['Miguel de Cervantes'],
        wrongPool: ['Lope de Vega', 'Federico García Lorca', 'Dante Alighieri', 'Pedro Calderón de la Barca'],
    },
    {
        id: 'q229',
        prompt: "Who wrote 'The Divine Comedy'?",
        correctPool: ['Dante Alighieri'],
        wrongPool: ['Petrarch', 'Giovanni Boccaccio', 'Virgil', 'Ludovico Ariosto'],
    },
    {
        id: 'q230',
        prompt: "Who wrote the Persian epic 'Shahnameh'?",
        correctPool: ['Ferdowsi'],
        wrongPool: ['Rumi', 'Hafez', 'Omar Khayyam', 'Saadi'],
    },
    {
        id: 'q231',
        prompt: "Who wrote 'Anna Karenina'?",
        correctPool: ['Leo Tolstoy'],
        wrongPool: ['Fyodor Dostoevsky', 'Anton Chekhov', 'Alexander Pushkin', 'Ivan Turgenev'],
    },
    {
        id: 'q232',
        prompt: '[NOT_A] novel by Charles Dickens?',
        correctPool: ['Bleak House', 'Great Expectations', 'Little Dorrit', 'Hard Times', 'Our Mutual Friend'],
        wrongPool: ['Middlemarch', 'Vanity Fair', 'Wuthering Heights', "Tess of the d'Urbervilles"],
    },
    {
        id: 'q233',
        prompt: '[NOT_A] novel by Jane Austen?',
        correctPool: ['Emma', 'Persuasion', 'Mansfield Park', 'Northanger Abbey', 'Sense and Sensibility'],
        wrongPool: ['Jane Eyre', 'Middlemarch', 'North and South', 'Cranford'],
    },
    {
        id: 'q234',
        prompt: "Who wrote 'Things Fall Apart'?",
        correctPool: ['Chinua Achebe'],
        wrongPool: ['Wole Soyinka', "Ngũgĩ wa Thiong'o", 'Ben Okri', 'Chimamanda Ngozi Adichie'],
    },
    {
        id: 'q235',
        prompt: "Who wrote 'The God of Small Things'?",
        correctPool: ['Arundhati Roy'],
        wrongPool: ['Kiran Desai', 'Anita Desai', 'Jhumpa Lahiri', 'Salman Rushdie'],
    },
    {
        id: 'q236',
        prompt: "Who wrote 'Midnight's Children'?",
        correctPool: ['Salman Rushdie'],
        wrongPool: ['Vikram Seth', 'Amitav Ghosh', 'V. S. Naipaul', 'Rohinton Mistry'],
    },
    {
        id: 'q237',
        prompt: 'Who was the first Indian to win the Nobel Prize in Literature?',
        correctPool: ['Rabindranath Tagore'],
        wrongPool: ['Sarojini Naidu', 'R. K. Narayan', 'Mulk Raj Anand', 'Sri Aurobindo'],
    },
    {
        id: 'q238',
        prompt: '[NOT_A] fundamental force of nature?',
        correctPool: ['Gravity', 'Electromagnetism', 'Strong nuclear force', 'Weak nuclear force'],
        wrongPool: ['Friction', 'Tension', 'Centrifugal force', 'Buoyancy'],
    },
];