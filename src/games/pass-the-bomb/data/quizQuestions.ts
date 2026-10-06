


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

    // Same inversion logic as generateQuizInstance: if the resolved
    // prompt landed on a negative form ("is NOT", "CANNOT"), the pool
    // that's normally "correct" becomes wrong, and vice versa.
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
// Two kinds of tokens can appear in a prompt:
//  1. Flavor tokens (e.g. [PERCENTAGE]) — pure text substitution, picked
//     randomly, no effect on which pool is "correct".
//  2. Polarity tokens (e.g. [IS_OR_IS_NOT], [CAN_CANNOT]) — text
//     substitution PLUS, if the picked value is a negative form ("is not",
//     "cannot"), the correct/wrong pools get swapped for that instance.
//     This is what lets one question definition serve as two logically
//     opposite questions depending on what gets rolled.
export type PromptPlaceholder = {
    token: string;
    values: string[];
    negativeValues?: string[]; // subset of `values` that flips the pools
};

export const promptPlaceholders: Record<string, PromptPlaceholder> = {
    '[NOT_A]': {
        token: '[NOT_A]',
        values: ['A', 'Not a'],
        negativeValues: ['Not a'],
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
    '[PERCENTAGE]': {
        token: '[PERCENTAGE]',
        values: ['10%', '20%', '25%', '30%', '40%', '50%', '60%', '75%'],
    },

    '[HAVE_DO_NOT]': {
        token: '[HAVE_DO_NOT]',
        values: ['have', 'do not have'],
        negativeValues: ['do not have'],
    },

    '[COLOR]': {
        token: '[COLOR]',
        values: ['red', 'blue', 'green', 'yellow'],
    },
    // flavor only — no negativeValues, never triggers a pool swap

};

// Resolves every [TOKEN] in a prompt to a concrete random value, and
// reports whether any resolved value was a "negative" one — if so, the
// caller should swap correctPool/wrongPool for this generated instance.
const resolvePromptPlaceholders = (
    prompt: string
): { resolvedPrompt: string; isNegative: boolean } => {
    let isNegative = false;
    const resolvedPrompt = prompt.replace(/\[[A-Z_]+\]/g, (token) => {
        const def = promptPlaceholders[token];
        if (!def) return token; // unknown token — leave as-is rather than break
        const value = def.values[Math.floor(Math.random() * def.values.length)];
        if (def.negativeValues?.includes(value)) isNegative = true;
        return value;
    });
    return { resolvedPrompt, isNegative };
};

// Mostly 2 or 3 correct, rarely just 1 — keeps players scanning for the
// wrong one(s) rather than hunting for a single right answer, which is
// the whole "vibe-check, don't overthink it" point of this format.
const CORRECT_COUNT_WEIGHTS = [2, 2, 2, 3, 3, 3, 1];



export const generateQuizInstance = (question: QuizQuestion): QuizInstance => {
    const { resolvedPrompt, isNegative } = resolvePromptPlaceholders(question.prompt);

    // If the prompt resolved to a negative polarity ("is NOT possible",
    // "CANNOT happen"), the question's meaning inverts — so the pool that
    // was previously "correct" (the possible/true statements) is now the
    // WRONG answer, and vice versa.
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

    const options = shuffle([...correctPicks, ...wrongPicks]);

    return {
        questionId: question.id,
        prompt: resolvedPrompt,
        options,
    };
};

export const getRandomQuestion = (usedIds: string[]): QuizQuestion => {
    const available = quizQuestions.filter((q) => !usedIds.includes(q.id));
    const pool = available.length > 0 ? available : quizQuestions;
    return pool[Math.floor(Math.random() * pool.length)];
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
        correctPool: ['Delhi', 'Puducherry', 'Chandigarh', 'Lakshadweep'],
        wrongPool: ['Kerala', 'Goa', 'Sikkim', 'Assam'],
    },

    // ── Riddles / lateral thinking ────────────────────────────
    {
        id: 'q30',
        prompt: "What has hands but can't clap?",
        correctPool: ['A clock', 'A time piece'],
        wrongPool: ['A glove', 'A time machine', 'A stopwatch', 'A robot', 'A puppet'],
    },
    {
        id: 'q31',
        prompt: 'What gets wetter the more it dries?',
        correctPool: ['A towel', 'A cloth'],
        wrongPool: ['A sponge', 'The sun', 'Sand', 'A cloud'],
    },
    {
        id: 'q32',
        prompt: "You overtake 2nd place. What's your new position?",
        correctPool: ['2nd', 'Second', 'Runner-up'],
        wrongPool: ['1st', '3rd', 'Last place', '4th'],
    },
    {
        id: 'q33',
        prompt: 'How many months [HAVE_DO_NOT] 28 days?',
        correctPool: ['12', 'All of them', 'January to December'],
        wrongPool: ['1', '11', '6'],
    },

    // ── Music ─────────────────────────────────────────────────
    {
        id: 'q34',
        prompt: '[NOT_A] musical instrument?',
        correctPool: ['Violin', 'Flute', 'Tabla', 'Sitar', 'Clarinet'],
        wrongPool: ['Easel', 'Chisel', 'Spatula', 'Compass'],
    },
    {
        id: 'q35',
        prompt: '[NOT_A] K-pop group?',
        correctPool: ['BTS', 'BLACKPINK', 'EXO', 'TWICE'],
        wrongPool: ['Coldplay', 'Maroon 5', 'One Direction', 'Imagine Dragons'],
    },

    // ── Geography / world ─────────────────────────────────────
    {
        id: 'q36',
        prompt: '[NOT_A] national capital?',
        correctPool: ['Tokyo', 'Paris', 'Cairo', 'Ottawa', 'Canberra'],
        wrongPool: ['Sydney', 'Mumbai', 'New York', 'Toronto'],
    },
    {
        id: 'q37',
        prompt: '[NOT_A] country in Europe?',
        correctPool: ['France', 'Germany', 'Italy', 'Spain', 'Portugal'],
        wrongPool: ['Egypt', 'Brazil', 'Thailand', 'Kenya'],
    },
    {
        id: 'q38',
        prompt: '[NOT_A] wonder of the ancient world?',
        correctPool: ['Great Pyramid of Giza', 'Hanging Gardens of Babylon', 'Colossus of Rhodes'],
        wrongPool: ['Eiffel Tower', 'Taj Mahal', 'Great Wall of China'],
    },

    // ── TWISTED LOGIC ─────────────────────────────────────────────
    {
        id: 'q39',
        prompt: 'Exactly 50% of a group of 6 people are wearing glasses. This is [NOT]same as',
        correctPool: [
            'Exactly 3 people are wearing glasses',
            'Exactly 3 people are not wearing glasses',
        ],
        wrongPool: [
            'Exactly 2 people are wearing glasses',
            'Exactly 4 people are wearing glasses',
            'Exactly 5 people are wearing glasses',
        ],
    },
    {
        id: 'q40',
        prompt: 'There are 8 people. Which percentage [CAN_CANNOT] represent people wearing [COLOR]?',
        correctPool: ['25%', '50%', '75%'],
        wrongPool: ['30%', '40%', '60%', '70%'],
    },
    {
        id: 'q41',
        prompt: 'A shop gives a [PERCENTAGE] discount. Which statement [CAN_CANNOT] be true about the final price?',
        correctPool: [
            'The customer pays less than the original price',
            'The discount amount is calculated from the original price',
        ],
        wrongPool: [
            'The customer always pays exactly half',
            'The discount increases the final price',
            'The customer pays more than the original price',
        ],
    },
    {
        id: 'q42',
        prompt: 'Which number [IS_OR_IS_NOT] exactly 25% of a group?',
        correctPool: [
            '2, if the group has 8 people',
            '3, if the group has 12 people',
            '5, if the group has 20 people',
        ],
        wrongPool: [
            '2, if the group has 6 people',
            '3, if the group has 10 people',
            '4, if the group has 10 people',
        ],
    },


    // ── PERCENTAGE TRAPS ─────────────────────────────────────────
    {
        id: 'q44',
        prompt: 'A price increases by 20% and then decreases by 20%. Which statement [IS_OR_IS_NOT] true?',
        correctPool: [
            'The final price is lower than the starting price',
            'The two percentage changes do not cancel each other',
        ],
        wrongPool: [
            'The final price is exactly the starting price',
            'The final price is 20% lower than the starting price',
            'The final price is 20% higher than the starting price',
        ],
    },
    {
        id: 'q45',
        prompt: 'A number increases from 50 to 60. Which of these statements [IS_OR_IS_NOT] correct?',
        correctPool: ['The increase is 10', 'The percentage increase is 20%'],
        wrongPool: [
            'The percentage increase is 10%',
            'The increase is 20',
            'The new number is 120% larger than the old number',
        ],
    },

    {
        id: 'q47',
        prompt: 'A ₹1,000 item gets a 10% discount. Which of these amounts [CAN_CANNOT] be the discount?',
        correctPool: ['₹100', '10% of ₹1,000'],
        wrongPool: ['₹10', '₹900', '₹110'],
    },

    // ── "WAIT, THAT'S TRUE?" ──────────────────────────────────────
    {
        id: 'q48',
        prompt: 'Which of these statements [IS_OR_IS_NOT] true?',
        correctPool: [
            'A tomato is botanically a fruit',
            'A banana is botanically a berry',
        ],
        wrongPool: [
            'A strawberry is botanically a true berry',
            'A peanut is a tree nut',
            'A coconut is a true nut',
        ],
    },
    {
        id: 'q49',
        prompt: 'Which of these statements [IS_OR_IS_NOT] possible?',
        correctPool: [
            'Someone can be born on February 29',
            'A year can contain 366 days',
        ],
        wrongPool: [
            'February can have 30 days',
            'A week can contain 8 days',
            'A calendar month must always contain exactly 30 days',
        ],
    },
    {
        id: 'q50',
        prompt: 'Which of these [CAN_CANNOT] be true?',
        correctPool: [
            'A person can be both an uncle and a nephew',
            'A person can be both a parent and a child',
        ],
        wrongPool: [
            'A person can be their own biological parent',
            'A person can be older than their own biological parent',
            'A person can be their own grandparent without any unusual fictional rules',
        ],
    },

    // ── QUICK MATH / TRAPS ────────────────────────────────────────
    {
        id: 'q51',
        prompt: 'You have ₹500 and spend 20%. Which of these amounts [IS_OR_IS_NOT] correct?',
        correctPool: ['You spent ₹100', 'You have ₹400 left'],
        wrongPool: ['You spent ₹20', 'You have ₹450 left', 'You spent ₹120'],
    },
    {
        id: 'q52',
        prompt: 'A number is doubled and then doubled again. Which multiplier [IS_OR_IS_NOT] equivalent to the total change?',
        correctPool: ['4×', '400% of the original amount'],
        wrongPool: ['2×', '3×', '200% increase'],
    },
    {
        id: 'q53',
        prompt: 'Which of these statements [IS_OR_IS_NOT] true about zero?',
        correctPool: [
            'Adding zero leaves a number unchanged',
            'Multiplying a number by zero gives zero',
        ],
        wrongPool: [
            'Dividing every number by zero gives zero',
            'Zero is greater than every negative number',
            'Zero is an odd number',
        ],
    },
    {
        id: 'q54',
        prompt: 'You flip a fair coin twice. Which outcomes [CAN_CANNOT] happen?',
        correctPool: ['Two heads', 'Two tails', 'One head and one tail'],
        wrongPool: ['Three heads', 'Three tails', 'No result at all'],
    },

    // ── EVERYDAY REASONING ────────────────────────────────────────
    {
        id: 'q55',
        prompt: 'Four people are standing in a line. Which position [CAN_CANNOT] be both first and last?',
        correctPool: [
            'First position cannot also be last',
            'A single person cannot occupy both positions',
        ],
        wrongPool: [
            'The first person is automatically the last person',
            'Everyone can occupy both positions simultaneously',
            'The second person must also be last',
        ],
    },
    {
        id: 'q56',
        prompt: 'You arrive before someone who was supposed to arrive at 8:00. Which statement [IS_OR_IS_NOT] necessarily true?',
        correctPool: ['You arrived before that person'],
        wrongPool: [
            'You arrived before 8:00',
            'You arrived exactly at 7:59',
            'The other person arrived late',
        ],
    },
    {
        id: 'q57',
        prompt: 'A room contains 5 people. Everyone shakes hands with everyone else exactly once. Which numbers [CAN_CANNOT] represent the total number of handshakes?',
        correctPool: ['10'],
        wrongPool: ['5', '15', '20'],
    },

    // ── WORD / LANGUAGE TWISTS ───────────────────────────────────
    {
        id: 'q58',
        prompt: 'Which of these words [IS_OR_IS_NOT] correctly used in the sentence: "I have ____ friends than before"?',
        correctPool: ['fewer'],
        wrongPool: ['less', 'fewest', 'least'],
    },
    {
        id: 'q59',
        prompt: 'Which of these words [CAN_CANNOT] describe something that happens every two years?',
        correctPool: ['Biennial'],
        wrongPool: ['Biweekly', 'Bimonthly', 'Semiannual'],
    },

    // ── VISUAL / SOCIAL-GAME STYLE QUESTIONS ─────────────────────
    {
        id: 'q60',
        prompt: 'Six players are sitting in a circle. If you move two places clockwise, which statement [IS_OR_IS_NOT] necessarily true?',
        correctPool: ['You end up two seats clockwise from your original position'],
        wrongPool: [
            'You move two seats counterclockwise',
            'You return to your original seat',
            'You move to the person directly opposite you',
        ],
    },
    {
        id: 'q61',
        prompt: 'Five people each choose either tea or coffee. Which totals [CAN_CANNOT] happen?',
        correctPool: ['5 tea and 0 coffee', '3 tea and 2 coffee', '1 tea and 4 coffee'],
        wrongPool: ['6 tea and 0 coffee', '3 tea and 3 coffee'],
    },

    // ── SOCIAL / PARTY KNOWLEDGE ─────────────────────────────────
    {
        id: 'q62',
        prompt: 'Which of these statements [IS_OR_IS_NOT] mathematically possible for a group of 7 people?',
        correctPool: ['Exactly 50% are wearing glasses', 'Exactly 25% are wearing glasses'],
        wrongPool: [
            'Exactly 2 people are wearing glasses and that is exactly 25%',
            'Exactly 3 people are wearing glasses and that is exactly 50%',
            'Exactly 5 people are wearing glasses and that is exactly 75%',
        ],
    },
    {
        id: 'q63',
        prompt: 'A group has 12 players. Which percentages [CAN_CANNOT] represent an exact whole number of players?',
        correctPool: ['25%', '50%', '75%'],
        wrongPool: ['10%', '30%', '40%'],
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
        correctPool: ['Stingy', 'Miserly', 'Selfish'],
        wrongPool: ['Kind', 'Giving', 'Charitable'],
    },
    {
        id: 'q66',
        prompt: "Same as 'happy'?",
        correctPool: ['Joyful', 'Cheerful', 'Elated', 'Glad'],
        wrongPool: ['Sad', 'Gloomy', 'Miserable'],
    },
    {
        id: 'q67',
        prompt: "Opposite of 'ancient'?",
        correctPool: ['Modern', 'New', 'Contemporary'],
        wrongPool: ['Old', 'Antique', 'Historic'],
    },
    {
        id: 'q68',
        prompt: "Same as 'exhausted'?",
        correctPool: ['Tired', 'Drained', 'Worn out', 'Weary'],
        wrongPool: ['Energetic', 'Lively', 'Fresh'],
    },
    {
        id: 'q69',
        prompt: "Opposite of 'transparent'?",
        correctPool: ['Opaque', 'Cloudy', 'Murky'],
        wrongPool: ['Clear', 'See-through', 'Glassy'],
    },
    {
        id: 'q70',
        prompt: "Same as 'stubborn'?",
        correctPool: ['Headstrong', 'Obstinate', 'Inflexible'],
        wrongPool: ['Flexible', 'Easygoing', 'Agreeable'],
    },
    {
        id: 'q71',
        prompt: "Opposite of 'generous'?",
        correctPool: ['Greedy', 'Selfish', 'Tight-fisted'],
        wrongPool: ['Giving', 'Kind', 'Charitable'],
    },

    // ── Movies & Pop Culture ─────────────────────────────────
    {
        id: 'q72',
        prompt: '[NOT_A] Avenger?',
        correctPool: ['Iron Man', 'Thor', 'Hulk', 'Black Widow', 'Hawkeye'],
        wrongPool: ['Wolverine', 'Deadpool', 'Magneto', 'Professor X'],
    },
    {
        id: 'q73',
        prompt: '[NOT_A] Disney Princess?',
        correctPool: ['Elsa', 'Belle', 'Ariel', 'Jasmine', 'Moana'],
        wrongPool: ['Harley Quinn', 'Wonder Woman', 'Elphaba'],
    },
    {
        id: 'q74',
        prompt: '[NOT_A] Pixar movie?',
        correctPool: ['Up', 'Coco', 'Cars', 'Brave', 'Soul'],
        wrongPool: ['Shrek', 'Minions', 'Madagascar'],
    },
    {
        id: 'q75',
        prompt: '[NOT_A] Harry Potter house?',
        correctPool: ['Gryffindor', 'Slytherin', 'Hufflepuff', 'Ravenclaw'],
        wrongPool: ['Camelot', 'Narnia', 'Hogsmeade'],
    },
    {
        id: 'q76',
        prompt: '[NOT_A] James Bond actor?',
        correctPool: ['Sean Connery', 'Daniel Craig', 'Pierce Brosnan', 'Roger Moore'],
        wrongPool: ['Tom Cruise', 'Hugh Jackman', 'Liam Neeson'],
    },
    {
        id: 'q77',
        prompt: '[NOT_A] Star Wars character?',
        correctPool: ['Yoda', 'Darth Vader', 'Luke Skywalker', 'Chewbacca'],
        wrongPool: ['Gandalf', 'Spock', 'Frodo'],
    },
    {
        id: 'q78',
        prompt: '[NOT_A] Pokemon?',
        correctPool: ['Pikachu', 'Charizard', 'Snorlax', 'Bulbasaur'],
        wrongPool: ['Sonic', 'Kirby', 'Yoshi'],
    },
    {
        id: 'q79',
        prompt: '[NOT_A] Toy Story character?',
        correctPool: ['Woody', 'Buzz Lightyear', 'Jessie', 'Rex'],
        wrongPool: ['Shrek', 'Donkey', 'Po'],
    },

    // ── Music ──────────────────────────────────────────────────
    {
        id: 'q80',
        prompt: '[NOT_A] string instrument?',
        correctPool: ['Violin', 'Guitar', 'Cello', 'Harp'],
        wrongPool: ['Trumpet', 'Flute', 'Drum'],
    },
    {
        id: 'q81',
        prompt: '[NOT_A] percussion instrument?',
        correctPool: ['Drum', 'Tabla', 'Xylophone'],
        wrongPool: ['Violin', 'Flute', 'Saxophone'],
    },
    {
        id: 'q82',
        prompt: '[NOT_A] wind instrument?',
        correctPool: ['Flute', 'Trumpet', 'Saxophone', 'Clarinet'],
        wrongPool: ['Guitar', 'Drum', 'Piano'],
    },

    {
        id: 'q84',
        prompt: '[NOT_A] music genre?',
        correctPool: ['Jazz', 'Reggae', 'Classical', 'Hip-hop'],
        wrongPool: ['Oregano', 'Paprika', 'Cinnamon'],
    },

    // ── Geography / World ──────────────────────────────────────
    {
        id: 'q85',
        prompt: '[NOT_A] continent?',
        correctPool: ['Asia', 'Africa', 'Europe', 'Antarctica'],
        wrongPool: ['Greenland', 'Sahara', 'Amazon'],
    },
    {
        id: 'q86',
        prompt: '[NOT_A] river?',
        correctPool: ['Nile', 'Amazon', 'Ganges', 'Thames'],
        wrongPool: ['Everest', 'Sahara', 'Pacific'],
    },
    {
        id: 'q87',
        prompt: '[NOT_A] ocean?',
        correctPool: ['Pacific', 'Atlantic', 'Indian', 'Arctic'],
        wrongPool: ['Amazon', 'Nile', 'Sahara'],
    },
    {
        id: 'q88',
        prompt: '[NOT_A] desert?',
        correctPool: ['Sahara', 'Gobi', 'Thar', 'Kalahari'],
        wrongPool: ['Amazon', 'Everest', 'Nile'],
    },
    {
        id: 'q89',
        prompt: '[NOT_A] mountain range?',
        correctPool: ['Himalayas', 'Alps', 'Andes', 'Rockies'],
        wrongPool: ['Sahara', 'Amazon', 'Pacific'],
    },
    {
        id: 'q90',
        prompt: '[NOT_A] landlocked country?',
        correctPool: ['Switzerland', 'Nepal', 'Austria', 'Mongolia'],
        wrongPool: ['Japan', 'Australia', 'Sri Lanka'],
    },

    // ── India-related ────────────────────────────────────────
    {
        id: 'q91',
        prompt: '[NOT_A] Indian state?',
        correctPool: ['Kerala', 'Punjab', 'Gujarat', 'Rajasthan'],
        wrongPool: ['Delhi', 'Chandigarh', 'Puducherry'],
    },
    {
        id: 'q92',
        prompt: '[NOT_A] South Indian language?',
        correctPool: ['Tamil', 'Telugu', 'Kannada', 'Malayalam'],
        wrongPool: ['Punjabi', 'Bengali', 'Marathi'],
    },
    {
        id: 'q93',
        prompt: '[NOT_AN] Indian festival?',
        correctPool: ['Diwali', 'Holi', 'Onam', 'Pongal'],
        wrongPool: ['Easter', 'Thanksgiving', 'St Patrick\'s Day'],
    },
    {
        id: 'q94',
        prompt: '[NOT_A] classical Indian dance form?',
        correctPool: ['Bharatanatyam', 'Kathak', 'Odissi', 'Kuchipudi'],
        wrongPool: ['Ballet', 'Salsa', 'Tango'],
    },
    {
        id: 'q95',
        prompt: '[NOT_A] river in India?',
        correctPool: ['Ganga', 'Yamuna', 'Godavari', 'Brahmaputra'],
        wrongPool: ['Nile', 'Amazon', 'Thames'],
    },

    // ── Animals ──────────────────────────────────────────────
    {
        id: 'q96',
        prompt: '[NOT_A] mammal?',
        correctPool: ['Dog', 'Elephant', 'Whale', 'Bat'],
        wrongPool: ['Snake', 'Crocodile', 'Frog'],
    },
    {
        id: 'q97',
        prompt: '[NOT_A] bird?',
        correctPool: ['Eagle', 'Sparrow', 'Ostrich', 'Penguin'],
        wrongPool: ['Bat', 'Butterfly', 'Dragonfly'],
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
        wrongPool: ['Puppy', 'Cub', 'Calf'],
    },
    {
        id: 'q100',
        prompt: '[NOT_A] reptile?',
        correctPool: ['Snake', 'Lizard', 'Crocodile', 'Turtle'],
        wrongPool: ['Frog', 'Salamander', 'Newt'],
    },
    {
        id: 'q101',
        prompt: '[NOT_AN] insect?',
        correctPool: ['Ant', 'Bee', 'Butterfly', 'Mosquito'],
        wrongPool: ['Spider', 'Scorpion', 'Crab'],
    },

    // ── Food ──────────────────────────────────────────────────
    {
        id: 'q102',
        prompt: '[NOT_AN] Italian dish?',
        correctPool: ['Pizza', 'Pasta', 'Risotto', 'Lasagna'],
        wrongPool: ['Sushi', 'Tacos', 'Biryani'],
    },
    {
        id: 'q103',
        prompt: '[NOT_A] spice?',
        correctPool: ['Cumin', 'Turmeric', 'Cardamom', 'Cinnamon'],
        wrongPool: ['Sugar', 'Rice', 'Flour'],
    },
    {
        id: 'q104',
        prompt: '[NOT_A] fruit?',
        correctPool: ['Mango', 'Apple', 'Banana', 'Grape'],
        wrongPool: ['Potato', 'Carrot', 'Onion'],
    },
    {
        id: 'q105',
        prompt: '[NOT_A] dairy product?',
        correctPool: ['Cheese', 'Butter', 'Yogurt', 'Paneer'],
        wrongPool: ['Tofu', 'Almond milk', 'Coconut oil'],
    },
    {
        id: 'q106',
        prompt: '[NOT_A] street food in India?',
        correctPool: ['Pani Puri', 'Vada Pav', 'Samosa', 'Chaat'],
        wrongPool: ['Burrito', 'Hot dog', 'Croissant'],
    },
    {
        id: 'q107',
        prompt: '[NOT_A] breakfast cereal brand?',
        correctPool: ['Cornflakes', 'Cheerios', 'Muesli'],
        wrongPool: ['Nutella', 'Ketchup', 'Mayonnaise'],
    },

    // ── Sports ──────────────────────────────────────────────
    {
        id: 'q108',
        prompt: '[NOT_A] cricket term?',
        correctPool: ['Wicket', 'Over', 'Boundary', 'LBW'],
        wrongPool: ['Touchdown', 'Slam dunk', 'Offside'],
    },
    {
        id: 'q109',
        prompt: '[NOT_AN] Olympic sport?',
        correctPool: ['Swimming', 'Gymnastics', 'Archery', 'Fencing'],
        wrongPool: ['Darts', 'Poker', 'Bowling'],
    },
    {
        id: 'q110',
        prompt: '[NOT_A] football (soccer) term?',
        correctPool: ['Offside', 'Penalty', 'Corner kick', 'Free kick'],
        wrongPool: ['Touchdown', 'Home run', 'Strike'],
    },
    {
        id: 'q111',
        prompt: '[NOT_A] tennis term?',
        correctPool: ['Ace', 'Deuce', 'Love', 'Rally'],
        wrongPool: ['Wicket', 'Birdie', 'Offside'],
    },
    {
        id: 'q112',
        prompt: '[NOT_A] combat sport?',
        correctPool: ['Boxing', 'Wrestling', 'Judo', 'Karate'],
        wrongPool: ['Golf', 'Archery', 'Bowling'],
    },

    // ── Science / Space ──────────────────────────────────────
    {
        id: 'q113',
        prompt: '[NOT_A] planet in our solar system?',
        correctPool: ['Mars', 'Venus', 'Jupiter', 'Saturn'],
        wrongPool: ['Sun', 'Moon', 'Pluto'],
    },
    {
        id: 'q114',
        prompt: '[NOT_A] chemical element?',
        correctPool: ['Oxygen', 'Hydrogen', 'Gold', 'Iron'],
        wrongPool: ['Water', 'Air', 'Rust'],
    },
    {
        id: 'q115',
        prompt: '[NOT_A] state of matter?',
        correctPool: ['Solid', 'Liquid', 'Gas', 'Plasma'],
        wrongPool: ['Energy', 'Mass', 'Volume'],
    },
    {
        id: 'q116',
        prompt: '[NOT_A] part of a plant?',
        correctPool: ['Root', 'Stem', 'Leaf', 'Petal'],
        wrongPool: ['Fur', 'Scale', 'Fin'],
    },
    {
        id: 'q117',
        prompt: '[NOT_A] type of cloud?',
        correctPool: ['Cumulus', 'Cirrus', 'Stratus'],
        wrongPool: ['Tsunami', 'Avalanche', 'Earthquake'],
    },

    // ── Riddles / Lateral Thinking ─────────────────────────────
    {
        id: 'q118',
        prompt: 'What has a neck but no head?',
        correctPool: ['A bottle', 'A shirt'],
        wrongPool: ['A snake', 'A giraffe', 'A turtle'],
    },
    {
        id: 'q119',
        prompt: 'What can travel around the world while staying in a corner?',
        correctPool: ['A stamp'],
        wrongPool: ['A map', 'A plane', 'A ball'],
    },
    {
        id: 'q120',
        prompt: "What has keys but can't open locks?",
        correctPool: ['A piano', 'A keyboard'],
        wrongPool: ['A locksmith', 'A thief', 'A safe'],
    },
    {
        id: 'q121',
        prompt: 'What goes up but never comes down?',
        correctPool: ['Your age', 'Years'],
        wrongPool: ['A balloon', 'A rocket', 'A kite'],
    },
    {
        id: 'q122',
        prompt: 'What has a thumb and four fingers but is not alive?',
        correctPool: ['A glove'],
        wrongPool: ['A robot', 'A puppet', 'A statue'],
    },
    {
        id: 'q123',
        prompt: "What belongs to you, but others use it more than you?",
        correctPool: ['Your name'],
        wrongPool: ['Your phone', 'Your house', 'Your car'],
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
        correctPool: ['Arachnophobia (spiders)', 'Claustrophobia (enclosed spaces)', 'Coulrophobia (clowns)'],
        wrongPool: ['Mondayphobia', 'Pizzaphobia', 'Selfiephobia'],
    },
    {
        id: 'q126',
        prompt: 'Which of these [IS_OR_IS_NOT] an actual superstition somewhere in the world?',
        correctPool: ['Breaking a mirror brings bad luck', 'A black cat crossing your path is bad luck', 'Walking under a ladder is bad luck'],
        wrongPool: ['Sneezing on a Tuesday brings wealth', 'Wearing socks backwards cures hiccups'],
    },
    {
        id: 'q127',
        prompt: 'Which of these [IS_OR_IS_NOT] a real English idiom?',
        correctPool: ['Break the ice', 'Spill the beans', 'Under the weather'],
        wrongPool: ['Paint the ceiling', 'Bite the lamp', 'Swallow the clock'],
    },
    {
        id: 'q128',
        prompt: 'Which of these [IS_OR_IS_NOT] a genuine tongue twister?',
        correctPool: ['She sells seashells by the seashore', 'Peter Piper picked a peck of pickled peppers'],
        wrongPool: ['Tommy types tiny telephones today', 'Gary grabs green glowing grapes'],
    },
    {
        id: 'q129',
        prompt: 'Which of these [IS_OR_IS_NOT] a real world record category?',
        correctPool: ['Fastest time to solve a Rubik\'s Cube', 'Longest fingernails', 'Most push-ups in an hour'],
        wrongPool: ['Loudest whispered secret', 'Fastest to blink 100 times'],
    },

    // ── Twisted Logic / Math ──────────────────────────────────
    {
        id: 'q130',
        prompt: 'A train leaves at the same time it arrives at 0 minutes late. Which statement [IS_OR_IS_NOT] true?',
        correctPool: ['The train was on time', 'There was no delay'],
        wrongPool: ['The train was early', 'The train was cancelled', 'The train was rescheduled'],
    },
    {
        id: 'q131',
        prompt: 'Out of 10 players, 30% are wearing hats. Which number [CAN_CANNOT] be accurate?',
        correctPool: ['3 players are wearing hats'],
        wrongPool: ['2 players are wearing hats', '4 players are wearing hats', '5 players are wearing hats'],
    },
    {
        id: 'q132',
        prompt: 'A square has all four sides equal. Which shape [CAN_CANNOT] also be called a square?',
        correctPool: ['A rectangle with all equal sides', 'A rhombus with right angles'],
        wrongPool: ['Any rectangle', 'Any rhombus', 'A triangle'],
    },
    {
        id: 'q133',
        prompt: 'Which of these [IS_OR_IS_NOT] always true about twins?',
        correctPool: ['Share the same birthday', 'Born in the same delivery'],
        wrongPool: ['Always look identical', 'Always of the same gender'],
    },

    // ── History (light, safe) ────────────────────────────────
    {
        id: 'q134',
        prompt: '[NOT_AN] ancient civilization?',
        correctPool: ['Egyptian', 'Roman', 'Mayan', 'Mesopotamian'],
        wrongPool: ['Wakanda', 'Atlantis', 'Narnia'],
    },
    {
        id: 'q135',
        prompt: 'Who was the first man to walk on the moon?',
        correctPool: ['Neil Armstrong'],
        wrongPool: ['Buzz Aldrin', 'Yuri Gagarin', 'Michael Collins'],
    },
    {
        id: 'q136',
        prompt: 'Which empire built the Taj Mahal?',
        correctPool: ['The Mughal Empire'],
        wrongPool: ['The British Empire', 'The Roman Empire', 'The Ottoman Empire'],
    },
    {
        id: 'q137',
        prompt: 'World War 2 ended in which decade?',
        correctPool: ['The 1940s'],
        wrongPool: ['The 1930s', 'The 1950s', 'The 1960s'],
    },
    {
        id: 'q138',
        prompt: '[NOT_A] wonder of the modern world?',
        correctPool: ['Great Wall of China', 'Taj Mahal', 'Colosseum', 'Christ the Redeemer'],
        wrongPool: ['Eiffel Tower', 'Statue of Liberty', 'Big Ben'],
    },
];