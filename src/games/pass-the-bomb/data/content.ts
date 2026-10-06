

export type BombPersonality = {
    id: string;
    name: string;
    emoji: string;
    description: string;
    effect: string;
};

export type Instruction = {
    id: string;
    text: string;
    category: 'observation' | 'social' | 'judgement' | 'memory' | 'chaos';
    fallback?: keyof typeof fallbacks;
    fallbackText?: string; // the fallback with its [TOKENS] filled in, set when an instruction is picked
};



// ── ELIGIBILITY CONTEXT ─────────────────────────────────────────
// Declared up top since getRandomInstruction references it below.
export type EligibilityContext = {
    passHistoryLength: number;
    roundNumber: number;
    chainPassed: string[];
    activePlayerIds: string[];
    holderId: string;
    previousRoundWireCutPlayerId?: string;
    lastLifeLostPlayerId?: string;
    everGhosted: string[];
    seatingOrder: string[];
    holdCounts: Record<string, number>; // lifetime, across whole game
    firstHolderEver?: string;
    firstPasserOf?: Record<string, string>;
    lastPassedTo?: Record<string, string>;
    wireCutters: string[];
    passCounts: Record<string, number>;
};

// ── BOMB PERSONALITIES ──────────────────────────────────────────
export const bombPersonalities: BombPersonality[] = [
    {
        id: 'angry',
        name: 'THE ANGRY BOMB',
        emoji: '😡',
        description: 'Gets faster every time it is passed',
        effect: 'angry',
    },
    {
        id: 'calm',
        name: 'THE CALM BOMB',
        emoji: '🧊',
        description: 'Timer randomly pauses and resumes',
        effect: 'calm',
    },
    {
        id: 'liar',
        name: 'THE LIAR',
        emoji: '🎭',
        description: 'Shows false wire colour hints',
        effect: 'liar',
    },
    {
        id: 'boomerang',
        name: 'THE BOOMERANG',
        emoji: '🪃',
        description: 'Receiver can pass back immediately once',
        effect: 'boomerang',
    },
    {
        id: 'cursed',
        name: 'THE CURSED BOMB',
        emoji: '☠️',
        description: 'Passing to someone who passed to you costs 5 seconds',
        effect: 'cursed',
    },
    {
        id: 'ghost',
        name: 'THE GHOST BOMB',
        emoji: '👻',
        description: 'One random player is secretly immune this round',
        effect: 'ghost',
    },
    {
        id: 'chain',
        name: 'THE CHAIN BOMB',
        emoji: '🔗',
        description: 'Cannot pass to someone who already had it this round',
        effect: 'chain',
    },
    {
        id: 'normal',
        name: 'STANDARD BOMB',
        emoji: '💣',
        description: 'No special rules — just survive',
        effect: 'normal',
    },

    {
        id: 'quiz',
        name: 'THE QUIZ BOMB',
        emoji: '🧠',
        description: 'Every pass is decided by a Fastest Finger First question',
        effect: 'quiz',
    },
];


// ── REUSABLE FALLBACKS ──────────────────────────────────────────
//
// Fallbacks are reusable across multiple instructions.
// Each instruction can reference one using:
//     fallback: 'fallbackName'
//
// The UI/game logic can display the fallback when no valid target exists.
//
// Example:
// {
//     id: 'c11',
//     text: 'Pass to someone who is a fan of [GENRE]',
//     category: 'chaos',
//     fallback: 'genreFan'
// }

export const fallbacks = {

    // ── GENERAL ────────────────────────────────────────────────

    anyone: 'If nobody qualifies, pass the bomb to anyone you want.',

    shortPause:
        'If nobody qualifies, hold the bomb for 3 seconds, then pass it to anyone you want.',

    randomPoint:
        'If nobody qualifies, close your eyes and point. [PODIUM] person to the [RL_DIRECTION] of you point at gets the bomb.',

    confused:
        'If nobody qualifies, pass to whoever looks most confused right now.',

    bombDecides:
        'If nobody qualifies, the bomb simply refuses to accept that answer. Choose someone or prepare to defuse.',

    takeMattersIntoYourOwnHands:
        'If nobody qualifies, make them and pass the bomb to that person. Be creative if you can\'t directly.',

    tellALie: 'If you cannot decide, tell a lie and pass to whoever you want',

    cannotDecideForLife: 'If you can\'t make up your mind, pass to the person who has the [QUANTITY] lives left',

    //LaughterMedicine

    laughterMedicine: 'Nobody qualifies? Then, make someone laugh and pass to them. If you fail again, well, laugh out loud and defuse the bomb!',
    // ── OBSERVATION ────────────────────────────────────────────

    closestColour:
        'If nobody qualifies, pass to someone wearing the closest colour.',

    interestingHair:
        'If nobody qualifies, pass to whoever has the most interesting hair.',

    interestingAccessory:
        'If nobody qualifies, pass to whoever you think would look best wearing it.',

    hostDefusal:
        'If nobody qualifies, well, tough luck for you. Take a deep breath and prepare to defuse the bomb. ',

    // ── SOCIAL ────────────────────────────────────────────────

    likelyChangeStatus:
        'If nobody qualifies, pass to whoever you think is most likely to add a new Instagram story or Whatsapp status.',

    // ── INTEREST / OPINION ────────────────────────────────────

    oppositeInterest:
        'If nobody qualifies, pass to the person who likes it the most.',

    genreFan:
        'If nobody is a fan, pass to the person most likely to become one.',

    videoApp:
        'If nobody watched it today, pass to whoever watches it the most.',

    // ── PHONE / NUMBERS ───────────────────────────────────────

    tieChoose:
        'If there is a tie, the tied players decide between themselves.',


    missedCall:
        'If nobody qualifies, pass to whoever you think would call you back fastest.',

    // ── PET / ANIME ───────────────────────────────────────────

    animeTest:
        'If everyone likes anime, be proud of your group. Take one for the team and prepare for bomb defusal.',

    worstPetOwner:
        'If everyone loves pets, pass to whoever would be the worst pet owner.',

    // ── NAME / LETTER ─────────────────────────────────────────

    nameFallback:
        'If nobody qualifies, hold the bomb for 3 seconds and pass it to anyone you want.',

    // ── TIME / ORDER ──────────────────────────────────────────

    orderFallback:
        'If nobody qualifies or if that person is you, uff bad luck, now prepare to defuse the bomb.',

    // ── CHAOS ─────────────────────────────────────────────────

    noReaction:
        'If nobody reacts, shout "BOMB!" The first person to react gets it.',

    confidentGuess:
        'If nobody guesses correctly, pass to whoever looks most confident.',

    cantDecide:
        'If you are struggling to make up your mind, well, suck it up and struggle harder.',

    suspicious: 'If nobody qualifies, pass to whoever you are most suspicious of.',

    hasAPlan: 'If nobody qualifies, pass to whoever you think do not have a plan right now.',

    arrested: 'If nobody qualifies, pass to whoever you think would surrender easily if arrested.',

    canScam: 'If nobody qualifies, pass to someone you think could pull off a good scam.',

    earlyToDecide: 'If it is too early in the game, then pass to whoever you think would be by the end of the game.',



    // ── MEMORY ────────────────────────────────────────────────

    memoryAnyone:
        'If nobody qualifies, pass the bomb to anyone you want.',

    rememberBirthday: 'If no one qualifies, say any player\'s birthday out loud and pass the bomb to them.'

} as const;



// ── DYNAMIC PLACEHOLDERS ────────────────────────────────────────
// Placeholders are resolved once, when an instruction is selected.
// This keeps the displayed instruction stable even if React re-renders.
// Add new placeholder values here instead of hard-coding many variants.

// ── DYNAMIC PLACEHOLDERS ───────────────────────────────────────
//
// These are resolved when an instruction is selected.
//
// The same placeholder appearing twice in ONE instruction gets
// the same randomly selected value.
//
// Example:
// "Pass to someone who likes [INTEREST] more than [INTEREST]"
// would use the same INTEREST both times.

export const dynamicOptions: Record<string, string[]> = {

    '[GENRE]': [
        'Rock',
        'Bollywood',
        'K-Pop',
    ],

    '[COLOUR]': [
        'red',
        'blue',
        'green',
        'yellow',
        'black',
        'white',
        'pink',
        'purple',
        'orange',
        'brown',
    ],

    '[NUMBER]': [
        '1',
        '2',
        '3',
        '4',
        '5',
    ],

    '[PODIUM]': [
        'first',
        'second',
        'third',
    ],

    '[NOT]': ['', ' not'],

    '[FIRST_ALPHABET]': [
        'A',
        'B',
        'C',
        'D',
        'E',
        'G',
        'H',
        'J',
        'K',
        'L',
        'M',
        'N',
        'P',
        'R',
        'S',
        'T',
        'V',

    ],

    '[LAST_ALPHABET]': [
        'A',
        'D',
        'E',
        'H',
        'I',
        'K',
        'L',
        'M',
        'N',
        'P',
        'R',
        'S',
        'T',
        'U',

    ],

    '[BASIC_NUMBERS]': [
        '0',
        '1',
        '2',
    ],

    // Singular
    '[LETTER_TYPE]': [
        'vowel',
        'consonant',
    ],

    // Plural
    '[LETTER_TYPES]': [
        'vowels',
        'consonants',
    ],

    '[PARITY]': [
        'odd',
        'even',
    ],

    '[DIRECTION]': [
        'to your left',
        'to your right',
        'directly opposite to you',
    ],

    '[RL_DIRECTION]': [
        'left',
        'right',
    ],

    '[ACCESSORY]': [
        'watch',
        'glasses',
        'slippers',
        'earphones',
        'nose ring',
        'earring',
    ],

    '[ACCESSORY_2]': [
        'rings or jewellery',
        'makeup',
        'lipstick',
        'a bracelet',
        'a necklace',
        'a watch',
    ],

    '[RELATIONSHIP_STATUS]': [
        'married',
        'single',
    ],

    '[INTEREST]': [
        'sports',
        'horror movies',
        'Bigg Boss',
        'cricket',
        'football',
        'romance movies',
        'cooking shows',
        'politics',
    ],

    '[SHORT_VIDEO_APP]': [
        'Instagram Reels',
        'YouTube Shorts',
    ],

    // Used where the grammar is:
    // "fall asleep first"
    // "fall asleep last"
    '[FIRST_LAST]': [
        'first',
        'last',
    ],

    // Used for relative comparisons:
    // "wakes up earliest/latest"
    '[RELATIVE_TIME]': [
        'earliest',
        'latest',
    ],

    '[WAITING_TIME]': [
        'early',
        'late',
    ],

    '[QUALITY]': [
        'best',
        'worst',
    ],

    '[DIFFICULTY]': [
        'easiest',
        'hardest',
    ],

    '[QUANTITY_REL]': [
        'more',
        'fewer',
    ],

    '[QUANTITY]': [
        'most',
        'least',
    ],

    '[DURATION]': [
        'longest',
        'shortest',
    ],

    '[HAIR_LENGTH]': [
        'longest',
        'shortest',
    ],

    '[SPEED]': [
        'slowest',
        'fastest',
    ],

    '[ARM_POSTURE]': [
        'crossed',
        'relaxed',
    ],

    '[ACTIONS]': [
        'laughed',
        'argued',
        'joined the conversation',
        'spoke',
        'stood up',
        'checked their phone',
    ],

    '[PROXIMITY]': [
        'closest to',
        'farthest from',
    ],

    '[PERSONA]': [
        'daydreamer',
        'phone addict',
        'foodie',
        'drama queen',
        'fashionista',
        'bookworm',
        'movie buff',
        'music lover',
        'sports enthusiast',
        'fitness freak',
        'nerd',
        'social butterfly',
    ],

    '[STATE]': [
        'quietest',
        'loudest',
        'most relaxed',
        'most competitive',
    ],

    '[DESCRIPTION]': [
        'smallest',
        'tallest',
        'bravest',
        'youngest',
        'oldest',
        'most dramatic',
        'most chaotic',
        'most suspicious',
        'most devotional',
    ],

    '[LOCATION]': [
        'a door',
        'a window',
        'the kitchen',
        'a bathroom',
        'a bedroom',
        'a TV',
        'a plant'
    ],

    '[OTHER_PLAYERS]': [
        'from other players',
        'among the good people waiting for bomb',
        'without counting yourself',
        'excluding yourself'
    ],
    '[LETTER_COUNT]': ['no vowels', 'exactly 1 vowel', 'exactly 2 vowels', 'no consonants', 'exactly 1 consonant', 'exactly 2 consonants']
};


// Fills in every [TOKEN] across the given texts using ONE set of random picks,
// so a token shared by an instruction and its fallback gets the same value in
// both, and capitalises the first letter (some tokens open a sentence).
const resolveTexts = (texts: string[]): string[] => {
    const chosen: Record<string, string> = {};

    return texts.map((text) => {
        const resolved = text.replace(/\[[A-Z0-9_]+\]/g, (placeholder) => {
            const options = dynamicOptions[placeholder];
            if (!options || options.length === 0) return placeholder;
            if (!chosen[placeholder]) {
                chosen[placeholder] = options[Math.floor(Math.random() * options.length)];
            }
            return chosen[placeholder];
        });
        return resolved.charAt(0).toUpperCase() + resolved.slice(1);
    });
};



// ── PASS INSTRUCTIONS ──────────────────────────────────────────

// ── INSTRUCTION TYPE ───────────────────────────────────────────
//
// If your existing project already has an Instruction interface,
// add:
//     fallback?: keyof typeof fallbacks
//
// to that interface.
//
// This local type is provided here so this file can work
// independently.

// export type GameInstruction = {
//     id: string;
//     text: string;
//     category:
//     | 'observation'
//     | 'social'
//     | 'memory'
//     | 'judgement'
//     | 'chaos';
//     fallback?: keyof typeof fallbacks;
// };


// ── PASS INSTRUCTIONS ──────────────────────────────────────────

export const instructions: Instruction[] = [

    // ═══════════════════════════════════════════════════════════
    // OBSERVATION
    // ═══════════════════════════════════════════════════════════

    {
        id: 'i1',
        text: 'Pass to someone who is not looking at you right now',
        category: 'observation',
    },

    {
        id: 'i2',
        text: 'Pass to someone[NOT] wearing [COLOUR] [OTHER_PLAYERS]',
        category: 'observation',
        fallback: 'closestColour',
    },

    {
        id: 'i3',
        text: 'Pass to someone with the [HAIR_LENGTH] hair [OTHER_PLAYERS]',
        category: 'observation',
        fallback: 'interestingHair',
    },

    {
        id: 'i4',
        text: 'Pass to the person who most recently [ACTIONS] in the group',
        category: 'observation',
        fallback: 'takeMattersIntoYourOwnHands',
    },

    {
        id: 'i5',
        text: 'Pass to someone who has their arms [ARM_POSTURE]',
        category: 'observation',
        fallback: 'takeMattersIntoYourOwnHands',
    },



    {
        id: 'i6',
        text: 'Pass to someone wearing [ACCESSORY]',
        category: 'observation',
        fallback: 'hostDefusal',
    },

    {
        id: 'i7',
        text: 'Pass to someone wearing or carrying [ACCESSORY_2]',
        category: 'observation',
        fallback: 'interestingAccessory',
    },






    // ═══════════════════════════════════════════════════════════
    // SOCIAL
    // ═══════════════════════════════════════════════════════════

    {
        id: 's1',
        text: 'Pass to the person who has spoken the [QUANTITY] in the last 2 minutes.',
        category: 'social',
        fallback: 'bombDecides'
    },

    {
        id: 's2',
        text: 'Pass to whoever made you laugh last.',
        category: 'social',
        fallback: 'laughterMedicine'
    },

    {
        id: 's3',
        text: 'Pass to the person you have known the longest.',
        category: 'social',
    },

    {
        id: 's4',
        text: '[OTHER_PLAYERS], pass to the person you think is most likely to [FIRST_LAST] go to bed tonight.',
        category: 'social',
    },

    {
        id: 's5',
        text: 'Pass to whoever spoke last before you got the bomb.',
        category: 'social',
    },

    {
        id: 's6',
        text: 'Pass to whoever you think is the [QUALITY] liar in the group.',
        category: 'social',
        fallback: 'tellALie'
    },

    {
        id: 's7',
        text: 'Pass to whoever has been the [STATE] this game.',
        category: 'social',
        fallback: 'cantDecide'
    },

    {
        id: 's8',
        text: 'Pass to whoever you think will panic the [QUANTITY] during the game [OTHER_PLAYERS].',
        category: 'social',
    },

    {
        id: 's9',
        text: 'Pass to whoever you think has the [QUANTITY] number of unread messages on their phone [OTHER_PLAYERS].',
        category: 'social',
    },

    {
        id: 's10',
        text: 'Pass to whoever you think would last the [DURATION] on a deserted island [OTHER_PLAYERS].',
        category: 'social',
    },

    {
        id: 's11',
        text: 'Pass to the person most likely to become famous [OTHER_PLAYERS].',
        category: 'social',
    },

    {
        id: 's12',
        text: 'Pass to whoever you think is the [QUALITY] at keeping secrets [OTHER_PLAYERS].',
        category: 'social',
        fallback: 'cannotDecideForLife'
    },

    {
        id: 's13',
        text: 'Pass to the person you would trust the [QUANTITY] with your phone password.',
        category: 'social',
        fallback: 'cannotDecideForLife'
    },

    {
        id: 's14',
        text: 'Pass to the person who is the most likely to call you at 3AM in an emergency.',
        category: 'social',
    },

    {
        id: 's15',
        text: 'Pass to the person you are most likely to call in an emergency.',
        category: 'social',
    },

    {
        id: 's16',
        text: 'Pass to the person who is [DIFFICULTY] to surprise [OTHER_PLAYERS].',
        category: 'social',
    },

    {
        id: 's17',
        text: 'Pass to whoever gives the [QUALITY] advice [OTHER_PLAYERS].',
        category: 'social',
    },

    {
        id: 's18',
        text: 'Pass to whoever always arrives [WAITING_TIME] to gatherings [OTHER_PLAYERS].',
        category: 'social',
    },

    {
        id: 's19',
        text: '[OTHER_PLAYERS], pass to the person who overthinks things the [QUANTITY] in the group.',
        category: 'social',
    },

    {
        id: 's20',
        text: 'Pass to the person who remembers everyone\'s birthday [OTHER_PLAYERS].',
        category: 'social',
        fallback: 'rememberBirthday'
    },

    {
        id: 's21',
        text: 'Pass to whoever texts back the [SPEED] [OTHER_PLAYERS].',
        category: 'social',
    },

    {
        id: 's22',
        text: 'Pass to whoever you would trust to plan a trip.',
        category: 'social',
    },

    {
        id: 's23',
        text: 'Pass to whoever has the [QUANTITY] chaotic energy today.',
        category: 'social',
    },

    {
        id: 's24',
        text: 'Pass to whoever gives the [QUANTITY] dramatic reactions.',
        category: 'social',
    },

    {
        id: 's25',
        text: 'Pass to whoever gives the [QUALITY] compliments.',
        category: 'social',
    },

    {
        id: 's26',
        text: '[OTHER_PLAYERS], pass to the player whose birthday is coming up next.',
        category: 'social',
    },

    {
        id: 's27',
        text: '[OTHER_PLAYERS], pass to the player whose birthday was most recent.',
        category: 'social',
    },

    {
        id: 's28',
        text: 'Pass to someone whose birthday is [PROXIMITY] yours.',
        category: 'social',
    },

    {
        id: 's29',
        text: 'Pass to someone whose birthday was last celebrated [OTHER_PLAYERS].',
        category: 'social',
        fallback: 'rememberBirthday'
    },



    // ═══════════════════════════════════════════════════════════
    // MEMORY
    // ═══════════════════════════════════════════════════════════

    {
        id: 'm1',
        text: 'Pass to whoever had the bomb most recently before you.',
        category: 'memory'
    },

    {
        id: 'm2',
        text: 'Pass to whoever has had the bomb the most times this round.',
        category: 'memory'
    },

    {
        id: 'm3',
        text: 'Pass to whoever has NOT had the bomb yet this round.',
        category: 'memory'
    },

    {
        id: 'm4',
        text: 'Pass to whoever passed the bomb to you originally.',
        category: 'memory'
    },

    {
        id: 'm5',
        text: 'Pass to the person who has had the bomb the fewest times overall.',
        category: 'memory'
    },

    {
        id: 'm6',
        text: 'Pass to whoever cut a wire in the last round.',
        category: 'memory'
    },

    {
        id: 'm7',
        text: 'Pass to whoever lost a life most recently.',
        category: 'memory'
    },

    {
        id: 'm8',
        text: 'Pass to whoever has been a ghost player before.',
        category: 'memory'
    },

    {
        id: 'm9',
        text: 'Pass to whoever received the bomb right after you last time.',
        category: 'memory'
    },


    {
        id: 'm11',
        text: 'Pass to whoever has never cut a wire.',
        category: 'memory'
    },

    {
        id: 'm12',
        text: 'Pass to whoever was the very first bomb holder this game.',
        category: 'memory'
    },

    {
        id: 'm13',
        text: 'Pass to whoever has passed the bomb the most times overall.',
        category: 'memory'
    },




    // ═══════════════════════════════════════════════════════════
    // JUDGEMENT
    // ═══════════════════════════════════════════════════════════

    {
        id: 'j1',
        text: 'Pass to the person you trust the [QUANTITY] to make right choices in the game [OTHER_PLAYERS].',
        category: 'judgement',
        fallback: 'cantDecide'
    },

    {
        id: 'j2',
        text: 'Pass to whoever you think is the [QUANTITY] likely to lie about their age [OTHER_PLAYERS].',
        category: 'judgement',
    },

    {
        id: 'j3',
        text: 'Pass to the person who deserves the bomb the [QUANTITY]',
        category: 'judgement',
        fallback: 'cantDecide'
    },

    {
        id: 'j4',
        text: '[OTHER_PLAYERS], pass to whoever you think has been the [QUANTITY] strategic this game',
        category: 'judgement',
        fallback: 'cantDecide'
    },

    {
        id: 'j5',
        text: 'Pass to the person who you think secretly wants the bomb',
        category: 'judgement',
    },

    {
        id: 'j6',
        text: 'Pass to whoever you think is [QUANTITY] likely to cut the wrong wire',
        category: 'judgement',
    },

    {
        id: 'j7',
        text: 'Pass to the person you think has the [QUALITY] luck',
        category: 'judgement',
    },

    {
        id: 'j8',
        text: 'Pass to whoever you think will be [QUANTITY] dramatic when they lose a life',
        category: 'judgement',
    },

    {
        id: 'j10',
        text: 'Pass to whoever you think would win an argument even when they are completely wrong',
        category: 'judgement',
        fallback: 'cantDecide'
    },

    {
        id: 'j11',
        text: 'Pass to whoever you want to lose a life',
        category: 'judgement',
    },

    {
        id: 'j12',
        text: 'Pass to whoever you think would last the [DURATION] in a horror movie',
        category: 'judgement',
    },

    {
        id: 'j13',
        text: 'Pass to the person you think overreacts the [QUANTITY]',
        category: 'judgement',
    },

    {
        id: 'j14',
        text: 'Pass to whoever you think is secretly competitive',
        category: 'judgement',
    },

    {
        id: 'j15',
        text: 'Pass to whoever you think is most likely to switch sides mid-game',
        category: 'judgement',
    },

    {
        id: 'j16',
        text: 'Pass to the person you think is enjoying the game the most right now',
        category: 'judgement',
    },

    {
        id: 'j17',
        text: 'Pass to the person you think is most suspicious of everyone else',
        category: 'judgement',
        fallback: 'suspicious'
    },

    {
        id: 'j18',
        text: 'Pass to whoever you think would forget they are even holding the bomb',
        category: 'judgement',
    },

    {
        id: 'j19',
        text: 'Pass to the person you think has a plan right now',
        category: 'judgement',
        fallback: 'hasAPlan'
    },

    {
        id: 'j20',
        text: 'Pass to whoever you think would betray you for ₹500',
        category: 'judgement',
    },

    {
        id: 'j21',
        text: 'Pass to whoever you think could talk their way out of getting arrested',
        category: 'judgement',
        fallback: 'arrested'
    },

    {
        id: 'j22',
        text: 'Pass to whoever you think would be the [DIFFICULTY] person to scam',
        category: 'judgement',
        fallback: 'canScam'
    },

    {
        id: 'j23',
        text: 'Pass to whoever you think would be the [DIFFICULTY] person to read',
        category: 'judgement',
        fallback: 'nameFallback'
    },

    {
        id: 'j24',
        text: 'Starting from you as position 1, pass to person number [NUMBER] to your [RL_DIRECTION]',
        category: 'judgement',
        fallback: 'orderFallback',
    },

    {
        id: 'j25',
        text: 'Pass to someone whose [FIRST_LAST] letter in their name is a [LETTER_TYPE] [OTHER_PLAYERS]',
        category: 'judgement',
        fallback: 'nameFallback',
    },

    {
        id: 'j26',
        text: 'Pass to someone whose first letter in their name is [FIRST_ALPHABET] [OTHER_PLAYERS]',
        category: 'judgement',
        fallback: 'nameFallback',
    },

    {
        id: 'j27',
        text: 'Pass to someone whose last letter in their name is [LAST_ALPHABET] [OTHER_PLAYERS]',
        category: 'judgement',
        fallback: 'nameFallback',
    },



    {
        id: 'j28',
        text: 'Pass to someone whose name has an [PARITY] number of letters [OTHER_PLAYERS]',
        category: 'judgement',
        fallback: 'nameFallback',
    },

    {
        id: 'j29',
        text: 'Pass to someone whose name contains an [PARITY] number of [LETTER_TYPES] [OTHER_PLAYERS]',
        category: 'judgement',
        fallback: 'nameFallback',
    },

    {
        id: 'j30',
        text: 'Pass to someone whose name has [QUANTITY_REL] vowels than consonants [OTHER_PLAYERS]',
        category: 'judgement',
        fallback: 'hostDefusal',
    },

    {
        id: 'j31',
        text: 'Starting from you as position 1, pass to someone sitting in an [PARITY]-numbered position',
        category: 'judgement',
        fallback: 'orderFallback',
    },

    {
        id: 'j32',
        text: 'Pass to someone whose name contains [LETTER_COUNT] [OTHER_PLAYERS]',
        category: 'judgement',
        fallback: 'nameFallback',
    },

    {
        id: 'j33',
        text: 'Pass to the person who you consider your biggest threat to winning the game',
        category: 'judgement',
        fallback: 'cantDecide',
    },


    // ═══════════════════════════════════════════════════════════
    // CHAOS
    // ═══════════════════════════════════════════════════════════

    {
        id: 'c1',
        text: 'Pass to whoever is smiling right now',
        category: 'chaos',
        fallback: 'anyone',
    },

    {
        id: 'c2',
        text: 'Pass to whoever you make eye contact with first',
        category: 'chaos',
    },

    {
        id: 'c3',
        text: 'Pass to whoever says your name first in the next 2 seconds',
        category: 'chaos',
        fallback: 'anyone',
    },

    {
        id: 'c4',
        text: 'Pass to whoever got the last phone call',
        category: 'chaos',
        fallback: 'anyone',
    },

    {
        id: 'c5',
        text: 'Pass to the biggest [PERSONA] in the group [OTHER_PLAYERS]',
        category: 'chaos',
    },

    {
        id: 'c6',
        text: 'Pass to someone who is [RELATIONSHIP_STATUS] [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'likelyChangeStatus',
    },

    {
        id: 'c7',
        text: 'Pass to someone who does not like [INTEREST] [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'oppositeInterest',
    },

    {
        id: 'c8',
        text: 'Pass to the [DESCRIPTION] person in the group [OTHER_PLAYERS]',
        category: 'chaos',
    },

    {
        id: 'c9',
        text: 'Pass to whoever wakes up [RELATIVE_TIME] [OTHER_PLAYERS]',
        category: 'chaos',
    },

    {
        id: 'c10',
        text: 'Pass to someone who is a fan of [GENRE] [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'genreFan',
    },

    {
        id: 'c11',
        text: 'Pass to someone who watched [SHORT_VIDEO_APP] today',
        category: 'chaos',
        fallback: 'videoApp',
    },

    {
        id: 'c12',
        text: 'Pass to someone in the group who snores in their sleep [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'anyone',
    },

    {
        id: 'c13',
        text: 'Pass to someone who repeats what you are about to say',
        category: 'chaos',
        fallback: 'confused',
    },

    {
        id: 'c14',
        text: 'Pass to the person who most recently [ACTIONS] [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'anyone',
    },

    {
        id: 'c15',
        text: 'Pass to the last person who used the toilet [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'anyone',
    },



    {
        id: 'c17',
        text: 'Pass to whoever looks away from you first',
        category: 'chaos',
    },

    {
        id: 'c18',
        text: 'Close your eyes, spin around, open eyes and pass to the first person you see',
        category: 'chaos',
    },

    {
        id: 'c19',
        text: 'Pass to whoever says the word "bomb" next',
        category: 'chaos',
        fallback: 'noReaction',
    },



    {
        id: 'c21',
        text: 'Pass to whoever has been the quietest for the last 30 seconds [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'anyone',

    },

    {
        id: 'c22',
        text: 'Pass to whoever has been on their phone the most of late [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'anyone',
    },

    {
        id: 'c23',
        text: 'Pass to whoever checks their phone next [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'anyone',
    },

    {
        id: 'c24',
        text: 'Pass to whoever laughs first at the next joke someone makes [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'anyone',
    },

    {
        id: 'c25',
        text: 'Pass to whoever coughed, sneezed or yawned most recently [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'shortPause',
    },

    {
        id: 'c26',
        text: 'Pass to whoever says "okay" next',
        category: 'chaos',
        fallback: 'takeMattersIntoYourOwnHands',
    },

    {
        id: 'c27',
        text: 'Pass to whoever checks the time next.',
        category: 'chaos',
        fallback: 'takeMattersIntoYourOwnHands',
    },

    {
        id: 'c28',
        text: 'Pass to whoever repeats something someone already said',
        category: 'chaos',
        fallback: 'takeMattersIntoYourOwnHands',
    },

    {
        id: 'c29',
        text: 'Pass to whoever interrupts someone next',
        category: 'chaos',
        fallback: 'shortPause',
    },

    {
        id: 'c30',
        text: 'Pass to someone you saw or think got a phone notification most recently.',
        category: 'chaos',
        fallback: 'shortPause',
    },

    {
        id: 'c31',
        text: 'Pass to whoever stands up next',
        category: 'chaos',
        fallback: 'takeMattersIntoYourOwnHands',
    },

    {
        id: 'c32',
        text: 'Pass to whoever says "wait, what?" next or their equivalent phrases',
        category: 'chaos',
        fallback: 'takeMattersIntoYourOwnHands',
    },

    {
        id: 'c33',
        text: 'Pass to whoever scrolls their phone next',
        category: 'chaos',
        fallback: 'takeMattersIntoYourOwnHands',
    },

    {
        id: 'c34',
        text: 'Pass to whoever changes their sitting position next',
        category: 'chaos',
        fallback: 'takeMattersIntoYourOwnHands',
    },

    {
        id: 'c35',
        text: 'Pass to whoever the person on your right points at',
        category: 'chaos',
        fallback: 'takeMattersIntoYourOwnHands',
    },

    {
        id: 'c36',
        text: 'Pass to whoever says a number out loud next',
        category: 'chaos',
        fallback: 'noReaction',
    },

    {
        id: 'c37',
        text: 'Pass to whoever clears their throat next',
        category: 'chaos',
        fallback: 'confused',
    },

    {
        id: 'c38',
        text: 'Pass to someone who likes anime least',
        category: 'chaos',
        fallback: 'animeTest',
    },

    {
        id: 'c39',
        text: 'Pass to someone who does not like pets',
        category: 'chaos',
        fallback: 'worstPetOwner',
    },

    {
        id: 'c40',
        text: 'Find someone who is not a phone addict. Tell them, "You are awesome," then pass the bomb to them.',
        category: 'chaos',
        fallback: 'confused',
    },

    {
        id: 'c41',
        text: 'Pass to who you think has the [QUANTITY] tabs open on their phone browser right now [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'cantDecide',
    },

    {
        id: 'c42',
        text: 'Pass to whoever has the [QUANTITY] unread notifications [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'cantDecide',
    },

    {
        id: 'c43',
        text: 'Pass to whoever you have felt replies to your messages the [SPEED]',
        category: 'chaos',
        fallback: 'cantDecide',
    },

    {
        id: 'c44',
        text: 'Pass to someone who responds [SPEED] to your missed call',
        category: 'chaos',
        fallback: 'missedCall',
    },

    {
        id: 'c45',
        text: 'Pass to whoever is sitting [PROXIMITY] [LOCATION] [OTHER_PLAYERS]',
        category: 'chaos',
        fallback: 'tieChoose',
    },

    {
        id: 'c46',
        text: 'Everyone raise a hand. Pass to the person who raises theirs [FIRST_LAST]',
        category: 'chaos',
        fallback: 'tieChoose',
    },

    {
        id: 'c47',
        text: 'Say "3, 2, 1". Pass to whoever says "GO" the [FIRST_LAST]',
        category: 'chaos',
        fallback: 'anyone',
    },

    {
        id: 'c48',
        text: 'Think of a random number. Pass to whoever guesses [PROXIMITY] it',
        category: 'chaos',
        fallback: 'confidentGuess',
    },

];




// ── MISSIONS ──────────────────────────────────────────────────


// ── ANSWER TYPES ─────────────────────────────────────────────────
export type InstructionAnswerType =
    | 'seat-left'
    | 'seat-right'
    | 'seat-opposite'
    | 'last-passer'
    | 'not-held-yet'
    | 'wire-cut-last-round'
    | 'recent-life-loss'
    | 'ever-ghosted'
    | 'most-this-round'
    | 'fewest-overall'
    | 'first-holder-ever'
    | 'first-passer-of-holder'
    | 'received-from-holder-last'
    | 'never-cut-wire'
    | 'most-passes-overall'

// Instructions with an objectively deducible correct target.
// Wrong pass here → clingy penalty.
export const instructionAnswerTypes: Record<string, InstructionAnswerType> = {
    i9: 'seat-left',
    i10: 'seat-right',
    i13: 'seat-opposite',
    m1: 'last-passer',
    m3: 'not-held-yet',
    m6: 'wire-cut-last-round',
    m7: 'recent-life-loss',
    m8: 'ever-ghosted',
    m2: 'most-this-round',
    m5: 'fewest-overall',
    m12: 'first-holder-ever',
    m4: 'first-passer-of-holder',
    m9: 'received-from-holder-last',
    m11: 'never-cut-wire',
    m13: 'most-passes-overall',

};

// Instructions that need SOME history to make sense, but stay honor-system
// (no answer validation — just excluded from the pool too early).
export const instructionEligibilityGates: Record<string, 'requires-pass' | 'requires-multi-round'> = {
    j4: 'requires-pass',
    m2: 'requires-pass',
    m5: 'requires-pass',
};

// Returns true if this instruction is allowed to appear right now.
export const isInstructionEligible = (
    instruction: Instruction,
    ctx: EligibilityContext
): boolean => {
    // Blanket rule: no memory-category instruction can ever be the game's
    // first-round instruction. Round 1 has no prior round and no meaningful
    // pass history yet, so questions like "cut a wire last round" or
    // "received it most times" are nonsensical this early.
    if (instruction.category === 'memory' && ctx.roundNumber === 1) {
        return false;
    }

    const gate = instructionEligibilityGates[instruction.id];
    if (gate === 'requires-pass' && ctx.passHistoryLength === 0) return false;

    const answerType = instructionAnswerTypes[instruction.id];
    if (!answerType) return true; // no gate, no answer type → always eligible

    // For answer-typed instructions, only eligible if a valid answer set exists.
    const targets = resolveInstructionTargets(instruction.id, ctx);
    return targets !== null && targets.length > 0;
};

// Resolves the raw correct target set for an answer-typed instruction,
// BEFORE filtering out the holder themselves. Returns null if the
// instruction's underlying data isn't available yet.
const resolveRawTargets = (
    answerType: InstructionAnswerType,
    ctx: EligibilityContext
): string[] | null => {
    switch (answerType) {
        case 'seat-left':
        case 'seat-right':
        case 'seat-opposite': {
            const order = ctx.seatingOrder;
            const idx = order.indexOf(ctx.holderId);
            if (idx === -1 || order.length < 2) return null;
            const n = order.length;
            if (answerType === 'seat-left') return [order[(idx + 1) % n]];
            if (answerType === 'seat-right') return [order[(idx - 1 + n) % n]];
            // opposite — works cleanly for even counts; for odd, take the
            // nearer of the two "opposite-ish" seats
            const oppIdx = Math.floor(idx + n / 2) % n;
            return [order[oppIdx]];
        }

        case 'last-passer': {
            if (ctx.passHistoryLength === 0) return null;
            const idx = ctx.chainPassed.length - 1;
            if (idx < 1) return null;
            return [ctx.chainPassed[idx - 1]];
        }

        case 'not-held-yet': {
            const notHeld = ctx.activePlayerIds.filter(
                (id) => id !== ctx.holderId && !ctx.chainPassed.includes(id)
            );
            return notHeld.length > 0 ? notHeld : null;
        }

        case 'wire-cut-last-round':
            return ctx.previousRoundWireCutPlayerId
                ? [ctx.previousRoundWireCutPlayerId]
                : null;

        case 'recent-life-loss':
            return ctx.lastLifeLostPlayerId ? [ctx.lastLifeLostPlayerId] : null;

        case 'ever-ghosted':
            return ctx.everGhosted.length > 0 ? [...ctx.everGhosted] : null;

        case 'most-this-round': {
            const counts: Record<string, number> = {};
            for (const id of ctx.chainPassed) {
                if (id === ctx.holderId) continue;
                if (!ctx.activePlayerIds.includes(id)) continue;
                counts[id] = (counts[id] ?? 0) + 1;
            }
            const entries = Object.entries(counts);
            if (entries.length === 0) return null;
            const maxCount = Math.max(...entries.map(([, c]) => c));
            const winners = entries.filter(([, c]) => c === maxCount).map(([id]) => id);
            return winners.length > 0 ? winners : null;
        }

        case 'fewest-overall': {
            const candidates = ctx.activePlayerIds.filter((id) => id !== ctx.holderId);
            if (candidates.length === 0) return null;
            const counts = candidates.map((id) => ctx.holdCounts[id] ?? 0);
            const minCount = Math.min(...counts);
            const winners = candidates.filter(
                (id) => (ctx.holdCounts[id] ?? 0) === minCount
            );
            return winners.length > 0 ? winners : null;
        }
        case 'first-holder-ever':
            return ctx.firstHolderEver ? [ctx.firstHolderEver] : null;

        case 'first-passer-of-holder': {
            const passer = ctx.firstPasserOf?.[ctx.holderId];
            return passer ? [passer] : null; // null in round 1 before holder has ever received it from someone
        }

        case 'received-from-holder-last': {
            const receiver = ctx.lastPassedTo?.[ctx.holderId];
            return receiver ? [receiver] : null; // null until holder has actually made a pass
        }

        case 'never-cut-wire': {
            const neverCut = ctx.activePlayerIds.filter(
                (id) => id !== ctx.holderId && !ctx.wireCutters.includes(id)
            );
            return neverCut.length > 0 ? neverCut : null;
        }

        case 'most-passes-overall': {
            const candidates = ctx.activePlayerIds.filter((id) => id !== ctx.holderId);
            if (candidates.length === 0) return null;
            const counts = candidates.map((id) => ctx.passCounts[id] ?? 0);
            const maxCount = Math.max(...counts);
            if (maxCount === 0) return null; // nobody's passed yet — not answerable
            const winners = candidates.filter((id) => (ctx.passCounts[id] ?? 0) === maxCount);
            return winners.length > 0 ? winners : null;
        }

        default:
            return null;
    }
};

// Resolves the correct target set for an answer-typed instruction, with
// the holder ALWAYS excluded — a holder can never legally pass to
// themselves, so if the raw answer set collapses to just them, this
// returns null (question treated as unanswerable right now) instead of
// leaving an impossible target that would clingy-lock every single pass.
export const resolveInstructionTargets = (
    instructionId: string,
    ctx: EligibilityContext
): string[] | null => {
    const answerType = instructionAnswerTypes[instructionId];
    if (!answerType) return null;

    const raw = resolveRawTargets(answerType, ctx);
    if (raw === null) return null;

    const filtered = raw.filter((id) => id !== ctx.holderId);
    return filtered.length > 0 ? filtered : null;
};

// ── RANDOM PICKERS ────────────────────────────────────────────────
export const getRandomInstruction = (
    usedIds: string[],
    ctx?: EligibilityContext
): Instruction => {
    let available = instructions.filter((i) => !usedIds.includes(i.id));
    if (ctx) {
        available = available.filter((i) => isInstructionEligible(i, ctx));
    }
    const pool = available.length > 0 ? available : instructions.filter((i) => !ctx || isInstructionEligible(i, ctx));
    const finalPool = pool.length > 0 ? pool : instructions;
    const chosen = finalPool[Math.floor(Math.random() * finalPool.length)];

    // Resolve any [PLACEHOLDER] tokens once, here, so every downstream
    // consumer (game.ts) just uses `.text` as-is and gets the final,
    // human-readable instruction — id/category stay untouched so
    // eligibility and answer-type lookups (which key off `.id`) are
    // unaffected.
    const [text, fallbackText] = resolveTexts([
        chosen.text,
        chosen.fallback ? fallbacks[chosen.fallback] : '',
    ]);
    return { ...chosen, text, fallbackText };
};

export const getRandomPersonality = (
    usedIds: string[],
    playerCount: number = 6
): BombPersonality => {
    const MIN_PLAYERS_FOR_CHAIN = 6;

    const available = bombPersonalities.filter((p) => {
        if (usedIds.includes(p.id)) return false;
        if (p.id === 'chain' && playerCount < MIN_PLAYERS_FOR_CHAIN) return false;
        return true;
    });

    const pool = available.length > 0 ? available : bombPersonalities.filter((p) => {
        if (p.id === 'chain' && playerCount < MIN_PLAYERS_FOR_CHAIN) return false;
        return true;
    });

    return pool[Math.floor(Math.random() * pool.length)];
};



// End-of-game-only checks — never-pass-to-player and the "finish with at
// least N lives" variant of survive-on-one-life. Called once, from
// endBombGame, against the FINAL state of everyone still standing.
