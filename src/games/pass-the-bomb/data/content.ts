import type { BombCrowd, BombGroupProfile, BombSpice, BombTasteId } from '../../../shared/types';



export type BombPersonality = {
    id: string;
    name: string;
    emoji: string;
    description: string;
    effect: string;
};

// ── GROUP FIT ───────────────────────────────────────────────────
// Every instruction says what it assumes about the group, so a game only
// deals instructions that make sense for the people actually playing.
//   spice:  none = fine for anyone · 'cheeky' · 'savage' (No mercy only)
//   needs:  'knows'      players know each other's personalities
//           'close'      private-life facts (birthdays, snoring, 3AM calls)
//           'names'      uses the letters of real names
//           'notCouples' pointless when everyone is a couple
//   tastes: only if the group is into one of these (see TASTES)
//   kind:   drives how often it comes up (see KIND_WEIGHT)
export type InstructionSpice = 'cheeky' | 'savage';
export type InstructionNeed = 'knows' | 'close' | 'names' | 'notCouples';
export type InstructionKind =
    | 'vote'      // the whole room points on 3
    | 'race'      // everyone plays, slowest / first slip-up gets it
    | 'choice'    // Truth or Dare: holder picks one of two
    | 'dare'      // pay to choose: perform while the clock runs
    | 'confess'   // never have I ever
    | 'story'     // shared history (close groups)
    | 'taste'     // built on the group's tastes
    | 'wholesome'
    | 'revenge';  // only once there is history in this game

export type Instruction = {
    id: string;
    text: string;
    category: 'observation' | 'social' | 'judgement' | 'memory' | 'chaos';
    kind?: InstructionKind;
    spice?: InstructionSpice;
    needs?: InstructionNeed[];
    tastes?: TasteId[];
    fallback?: keyof typeof fallbacks;
    fallbackText?: string; // the fallback with its [TOKENS] filled in, set when an instruction is picked
};

// ── GROUP PROFILE (answered before the game; types live in shared/types) ──
export type GroupCrowd = BombCrowd;
export type GroupSpice = BombSpice;
export type TasteId = BombTasteId;
export type GroupProfile = BombGroupProfile;

// label: "a fan of [TOPIC]" · thing: "name a [TOPIC_THING]"
export const TASTES: Record<TasteId, { label: string; thing: string; emoji: string }> = {
    cricket: { label: 'cricket', thing: 'cricketer', emoji: '🏏' },
    football: { label: 'football', thing: 'footballer', emoji: '⚽' },
    bollywood: { label: 'Bollywood', thing: 'Bollywood movie', emoji: '🎬' },
    south: { label: 'South Indian movies', thing: 'South Indian movie', emoji: '🎥' },
    hollywood: { label: 'Hollywood and Netflix', thing: 'Hollywood movie or Netflix show', emoji: '🍿' },
    kpop: { label: 'K-pop and K-dramas', thing: 'K-pop group or K-drama', emoji: '💜' },
    anime: { label: 'anime', thing: 'anime', emoji: '🍥' },
    gaming: { label: 'gaming', thing: 'video game', emoji: '🎮' },
    biggboss: { label: 'Bigg Boss', thing: 'Bigg Boss contestant', emoji: '📺' },
    pets: { label: 'pets', thing: 'dog breed', emoji: '🐶' },
    fitness: { label: 'fitness', thing: 'exercise', emoji: '💪' },
    food: { label: 'food', thing: 'dish', emoji: '🍕' },
    politics: { label: 'politics', thing: 'politician', emoji: '🗳️' },
    festivals: { label: 'festivals and devotion', thing: 'festival', emoji: '🙏' },
    music: { label: 'music', thing: 'singer', emoji: '🎵' },
    horror: { label: 'horror movies', thing: 'horror movie', emoji: '👻' },
};

// Until a group answers the setup questions: broad topics most groups can play.
export const DEFAULT_TASTES: TasteId[] = ['cricket', 'football', 'bollywood', 'hollywood', 'food', 'gaming', 'music', 'horror', 'pets'];

// Used until the setup questions exist (and for groups that skip them).
export const DEFAULT_GROUP_PROFILE: GroupProfile = { crowd: 'friends', spice: 'cheeky', tastes: [] };

// Escalation: spicier instructions unlock as the night warms up.
export const SPICE_FROM_ROUND: Record<InstructionSpice, number> = { cheeky: 2, savage: 3 };
const SPICE_RANK: Record<GroupSpice | InstructionSpice, number> = { wholesome: 0, cheeky: 1, savage: 2 };

// Weighting: the loud, whole-room moments come up more often.
export const KIND_WEIGHT: Record<InstructionKind | 'plain', number> = {
    vote: 3,
    race: 3,
    choice: 2,
    dare: 2,
    confess: 2,
    story: 2,
    taste: 2,
    wholesome: 1,
    revenge: 1,
    plain: 1,
};

const groupTastes = (p: GroupProfile): TasteId[] => (p.tastes.length > 0 ? p.tastes : DEFAULT_TASTES);

// How many instructions this group can ever get (for the setup's
// "N instructions picked for your group").
export const poolSizeFor = (p: GroupProfile): number =>
    instructions.filter((i) => fitsGroup(i, p, 99)).length;

// Does this instruction suit this group, this round?
export const fitsGroup = (i: Instruction, p: GroupProfile, roundNumber: number): boolean => {
    if (i.spice) {
        if (SPICE_RANK[i.spice] > SPICE_RANK[p.spice]) return false;
        if (roundNumber < SPICE_FROM_ROUND[i.spice]) return false;
    }
    for (const need of i.needs ?? []) {
        if (need === 'knows' && p.crowd === 'justmet') return false;
        if (need === 'close' && (p.crowd === 'colleagues' || p.crowd === 'justmet')) return false;
        if (need === 'names' && p.realNames === false) return false;
        if (need === 'notCouples' && p.crowd === 'couples') return false;
    }
    if (i.tastes?.length) {
        const t = groupTastes(p);
        if (!i.tastes.some((x) => t.includes(x))) return false;
    }
    return true;
};

// [TOPIC] / [TOPIC_THING] share one pick of the group's tastes.
const fillTopic = (texts: string[], p: GroupProfile): string[] => {
    if (!texts.some((t) => t.includes('[TOPIC'))) return texts;
    const pool = groupTastes(p);
    const t = TASTES[pool[Math.floor(Math.random() * pool.length)]];
    return texts.map((x) => x.split('[TOPIC_THING]').join(t.thing).split('[TOPIC]').join(t.label));
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
    // 🛒🎲🔨❤️ public money moves (all optional: older games have none)
    alleyReceipts?: { playerId: string; price: number; item: string }[];
    settledBets?: { bettorId: string; status: 'won' | 'lost'; settledRound: number; placedAt: number }[];
    lastAuction?: { loserId: string; bids: Record<string, number> };
    lifeBuyers?: string[];
    // 👥 what the group told us before the game (DEFAULT_GROUP_PROFILE if not asked)
    profile?: GroupProfile;
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
        description: 'The clock on your screen is lying — by how much, nobody knows',
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
    {
        id: 'auction',
        name: 'THE AUCTION BOMB',
        emoji: '🔨',
        description: 'No instructions. The holder taps Pass and everyone else gets a few seconds to match or raise the top FP bid. The lowest bid gets the bomb (a tie: the bomb picks). Everyone pays their bid and the holder pockets the pot.',
        effect: 'auction',
    },
];

// Auction rounds: never before this round, and only with this many alive.
export const AUCTION_FROM_ROUND = 3;
export const AUCTION_MIN_PLAYERS = 3;


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

    rememberBirthday: 'If no one qualifies, say any player\'s birthday out loud and pass the bomb to them.',

    // ── PARTY ─────────────────────────────────────────────────

    voteTie: 'If it\'s a tie, the tied players decide between themselves. If it lands on you, pass to the runner-up. If nobody fits, pass to anyone.',

    nobodyConfesses: 'If nobody raises a hand, or everybody does, pass to whoever looks the most guilty.',

    refuseDare: 'Won\'t do it? Then you lose the choice: pass to the person on your right.',

    refuseBoth: 'Won\'t do either? Then the group chooses who gets the bomb.',

    raceFreeze: 'If nobody slips up in 10 seconds, pass to whoever hesitated the longest.',

    sameTime: 'Too close to call? The slowest two decide between themselves.',

    nobodyKnows: 'If nobody names it in 5 seconds, pass to whoever you think secretly knew.',

    storyTime: 'If nobody fits, pass to whoever you have the best memory with.',

    noHistory: 'If nobody fits yet, pass to whoever you trust the least right now.',

    topicNobody: 'If nobody here is into it, pass to whoever would pretend to be the most.',

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
        'earring',
    ],

    '[ACCESSORY_2]': [
        'rings or jewellery',
        'a bracelet',
        'a necklace',
        'a watch',
    ],

    '[RELATIONSHIP_STATUS]': [
        'married',
        'single',
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
        'among everyone else',
        'without counting yourself',
        'excluding yourself'
    ],

    '[TASKS]':
        ['fold their hands',
            'tell their names',
            'cough',

        ],

    // ── PARTY instructions: outcomes and content vary, so repeats can't be dodged ──
    '[LIKELY]': ['most likely', 'least likely'],
    '[VOTE_RESULT]': ['Most fingers gets the bomb.', 'Pass to someone nobody pointed at.', 'Whoever gets the most fingers picks who gets the bomb.'],
    '[HAND_RESULT]': ['Pass to one of them.', 'Pass to anyone who kept their hand down.'],
    '[TRUTH_RESULT]': ['Pass to them.', 'Pass to anyone but them.'],
    '[WHOLESOME_RESULT]': ['then pass to them', 'then pass to anyone except them'],
    '[IMPRESSION_RESULT]': ['Whoever it is gets the bomb.', 'First to guess who it is gets the bomb.', 'First to guess who it is picks who gets the bomb.'],
    '[SLOW_RESULT]': ['Last one to do it gets the bomb.', 'First one to do it picks who gets the bomb.'],
    '[RACE_RESULT]': ['gets the bomb', 'picks who gets the bomb'],
    '[SONG_KIND]': ['Bollywood', 'sad', 'romantic', 'wedding', 'cartoon theme', 'devotional'],
    '[SOUND]': ['villain laugh', 'baby cry', 'crow impression', 'auto-rickshaw horn', 'TV-serial dramatic gasp', 'pressure cooker whistle'],
    '[VOICE]': ['news anchor', 'cricket commentator', 'wedding DJ', 'robot', 'Bollywood villain', 'strict teacher'],
    '[REPS]': ['5', '10'],
    '[EXERCISE]': ['squats', 'jumping jacks', 'spins on the spot'],
    '[DESCRIBES]': ['best', 'least'],
    '[FEW]': ['2', '3'],
    '[GALLERY]': ['last photo', 'last screenshot', '10th most recent photo'],
    '[PHONE_STAT]': ['screen time for today', 'most-used app this week', 'last 3 calls'],
    '[APP_KIND]': ['most embarrassing app', 'most-used app', 'oldest app'],
    '[LAST_MESSAGE]': ['last sent message', 'last message from your mom', 'last message in your family group'],
    '[SEARCH]': ['Google search', 'YouTube search', 'Instagram search'],
    '[SECONDS]': ['3', '5'],
    '[HELP]': ['hide a body', 'fake an alibi', 'get out of jail'],
    '[LEND]': ['money', 'your phone', 'your bike'],
    '[CHAIN_TOPIC]': ['country', 'Indian city', 'fruit', 'car brand', 'animal', 'sweet'],
    '[DIGIT]': ['3', '4', '7'],
    '[BODY_PART]': ['nose', 'left ear', 'head', 'right knee', 'elbow'],
    '[MOVE]': ['move', 'laugh', 'speak', 'blink'],
    '[POSE]': ['stand up', 'raise both hands', 'put a finger on your nose', 'cross your arms'],
    '[RHYME]': ['cat', 'day', 'go', 'ring', 'me'],
    '[MEMORY_KIND]': ['most embarrassing moment', 'funniest moment', 'biggest adventure', 'worst trip'],
    '[OWED]': ['money', 'a favour', 'an apology', 'a treat'],
    '[NEWS]': ['big news', 'bad news', 'juicy gossip'],
    '[STORY_KIND]': ['best', 'most embarrassing', 'funniest'],
    '[WORST]': ['worst', 'most dramatic', 'most broke'],
    '[SECRET]': ['darkest secret', 'most embarrassing secret', 'secret crush'],
    '[JOURNEY]': ['long train journey', 'road trip', 'long flight', 'power cut'],
    '[CONTEST]': ['quiz', 'dance battle', 'game of antakshari', 'treasure hunt'],
    '[FEATURE]': ['laugh', 'smile', 'handwriting', 'voice'],
    '[ROLE]': ['teacher', 'doctor', 'lawyer', 'wedding planner', 'prime minister'],
    '[STEAL]': ['style', 'shoes', 'confidence', 'phone'],
    '[NEED]': ['cheering up', 'advice', 'money', 'a ride at 2AM'],
    '[TRUST_TASK]': ['cook for your wedding', 'pick your outfit', 'plan your birthday', 'look after your pet'],
    '[DEAL]': ['pass it back to you next time', 'never pass it to you again'],
    '[ALLY]': ['target', 'protect'],
    '[LAUGH]': ['loudest', 'longest'],
    '[EVER_NEVER]': ['never', 'most often'],
    '[ARGUE]': ['start an argument about', 'defend to the death'],
    '[WIN_LOSE]': ['win', 'lose'],
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
        needs: ['knows'],
    },

    {
        id: 's4',
        text: '[OTHER_PLAYERS], pass to the person you think is most likely to [FIRST_LAST] go to bed tonight.',
        category: 'social',
        needs: ['knows'],
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
        spice: 'cheeky',
        needs: ['knows'],
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
        needs: ['knows'],
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
        needs: ['knows'],
        fallback: 'cannotDecideForLife'
    },

    {
        id: 's13',
        text: 'Pass to the person you would trust the [QUANTITY] with your phone password.',
        category: 'social',
        needs: ['close'],
        fallback: 'cannotDecideForLife'
    },

    {
        id: 's14',
        text: 'Pass to the person who is the most likely to call you at 3AM in an emergency.',
        category: 'social',
        needs: ['close'],
    },

    {
        id: 's15',
        text: 'Pass to the person you are most likely to call in an emergency.',
        category: 'social',
        needs: ['close'],
    },

    {
        id: 's16',
        text: 'Pass to the person who is [DIFFICULTY] to surprise [OTHER_PLAYERS].',
        category: 'social',
        needs: ['knows'],
    },

    {
        id: 's17',
        text: 'Pass to whoever gives the [QUALITY] advice [OTHER_PLAYERS].',
        category: 'social',
        needs: ['knows'],
    },

    {
        id: 's18',
        text: 'Pass to whoever always arrives [WAITING_TIME] to gatherings [OTHER_PLAYERS].',
        category: 'social',
        needs: ['knows'],
    },

    {
        id: 's19',
        text: '[OTHER_PLAYERS], pass to the person who overthinks things the [QUANTITY] in the group.',
        category: 'social',
        needs: ['knows'],
    },

    {
        id: 's20',
        text: 'Pass to the person who remembers everyone\'s birthday [OTHER_PLAYERS].',
        category: 'social',
        needs: ['close'],
        fallback: 'rememberBirthday'
    },

    {
        id: 's21',
        text: 'Pass to whoever texts back the [SPEED] [OTHER_PLAYERS].',
        category: 'social',
        needs: ['knows'],
    },

    {
        id: 's22',
        text: 'Pass to whoever you would trust to plan a trip.',
        category: 'social',
        needs: ['knows'],
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
        needs: ['knows'],
    },

    {
        id: 's26',
        text: '[OTHER_PLAYERS], pass to the player whose birthday is coming up next.',
        category: 'social',
        needs: ['close'],
    },

    {
        id: 's27',
        text: '[OTHER_PLAYERS], pass to the player whose birthday was most recent.',
        category: 'social',
        needs: ['close'],
    },

    {
        id: 's28',
        text: 'Pass to someone whose birthday is [PROXIMITY] yours.',
        category: 'social',
        needs: ['close'],
    },

    {
        id: 's29',
        text: 'Pass to someone whose birthday was last celebrated [OTHER_PLAYERS].',
        category: 'social',
        needs: ['close'],
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

    // ── Money moves: answers are on the 🧾 Alley receipts, the bet
    // results and the auction cards, if you were paying attention ──
    { id: 'm14', text: '🛒 Pass to whoever has bought something at the Alley.', category: 'memory' },
    { id: 'm15', text: '🛒 Pass to whoever has spent the most FP at the Alley.', category: 'memory' },
    { id: 'm16', text: '🛒 Pass to whoever has never bought anything at the Alley.', category: 'memory' },
    { id: 'm17', text: '🎲 Pass to whoever won a bet most recently.', category: 'memory' },
    { id: 'm18', text: '🎲 Pass to whoever has won a bet this game.', category: 'memory' },
    { id: 'm19', text: '🎲 Pass to whoever lost a bet most recently.', category: 'memory' },
    { id: 'm20', text: "🔨 Pass to whoever got stuck with the bomb at this round's auction.", category: 'memory' },
    { id: 'm21', text: "🔨 Pass to whoever bid the most at this round's auction.", category: 'memory' },
    { id: 'm22', text: '❤️ Pass to whoever has bought a life back.', category: 'memory' },




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
        spice: 'cheeky',
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
        needs: ['knows'],
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
        needs: ['knows'],
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
        spice: 'savage',
    },

    {
        id: 'j21',
        text: 'Pass to whoever you think could talk their way out of getting arrested',
        category: 'judgement',
        spice: 'savage',
        fallback: 'arrested'
    },

    {
        id: 'j22',
        text: 'Pass to whoever you think would be the [DIFFICULTY] person to scam',
        category: 'judgement',
        spice: 'cheeky',
        fallback: 'canScam'
    },

    {
        id: 'j23',
        text: 'Pass to whoever you think would be the [DIFFICULTY] person to read',
        category: 'judgement',
        needs: ['knows'],
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
        needs: ['names'],
        fallback: 'nameFallback',
    },

    {
        id: 'j26',
        text: 'Pass to someone whose first letter in their name is [FIRST_ALPHABET] [OTHER_PLAYERS]',
        category: 'judgement',
        needs: ['names'],
        fallback: 'nameFallback',
    },

    {
        id: 'j27',
        text: 'Pass to someone whose last letter in their name is [LAST_ALPHABET] [OTHER_PLAYERS]',
        category: 'judgement',
        needs: ['names'],
        fallback: 'nameFallback',
    },






    {
        id: 'j31',
        text: 'Starting from you as position 1, pass to someone sitting in an [PARITY]-numbered position',
        category: 'judgement',
        fallback: 'orderFallback',
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
        text: 'Pass to whoever makes eye contact with you first',
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
        needs: ['knows'],
    },

    {
        id: 'c6',
        text: 'Pass to someone who is [RELATIONSHIP_STATUS] [OTHER_PLAYERS]',
        category: 'chaos',
        spice: 'cheeky',
        needs: ['notCouples'],
        fallback: 'likelyChangeStatus',
    },

    {
        id: 'c7',
        text: 'Pass to someone who does not like [TOPIC] [OTHER_PLAYERS]',
        category: 'chaos',
        kind: 'taste',
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
        needs: ['close'],
    },

    {
        id: 'c10',
        text: 'Pass to someone who is a fan of [TOPIC] [OTHER_PLAYERS]',
        category: 'chaos',
        kind: 'taste',
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
        spice: 'cheeky',
        needs: ['close'],
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
        spice: 'cheeky',
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
        tastes: ['anime'],
        fallback: 'animeTest',
    },

    {
        id: 'c39',
        text: 'Pass to someone who does not like pets',
        category: 'chaos',
        tastes: ['pets'],
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
        needs: ['knows'],
        fallback: 'cantDecide',
    },

    {
        id: 'c44',
        text: 'Pass to someone who responds [SPEED] to your missed call',
        category: 'chaos',
        needs: ['knows'],
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
        kind: 'race',
        fallback: 'tieChoose',
    },

    {
        id: 'c47',
        text: 'Say "3, 2, 1". Pass to whoever says "GO" the [FIRST_LAST]',
        category: 'chaos',
        kind: 'race',
        fallback: 'anyone',
    },

    {
        id: 'c48',
        text: 'Think of a random number. Pass to whoever guesses [PROXIMITY] it',
        category: 'chaos',
        kind: 'race',
        fallback: 'confidentGuess',
    },

    {
        id: 'c49',
        text: 'Tell everyone to [TASKS]. [SPEED] to do it, gets the bomb ',
        category: 'chaos',
        kind: 'race',
        fallback: 'confidentGuess',
    },


    // ═══════════════════════════════════════════════════════════
    // PARTY: votes, never have I ever, pay to choose, truth or dare,
    // races, shared history, wholesome, revenge, tastes
    // ═══════════════════════════════════════════════════════════

    {
        id: 'v1',
        text: 'On 3, everyone points at who is [LIKELY] to cry at a wedding. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        fallback: 'voteTie',
    },
    {
        id: 'v2',
        text: 'On 3, everyone points at who is [LIKELY] to get lost even with Google Maps on. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        fallback: 'voteTie',
    },
    {
        id: 'v3',
        text: 'On 3, everyone points at who is [LIKELY] to sleep through the alarm on an important day. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        fallback: 'voteTie',
    },
    {
        id: 'v4',
        text: 'On 3, everyone points at who is [LIKELY] to fight a shopkeeper over ₹10. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        fallback: 'voteTie',
    },
    {
        id: 'v5',
        text: 'On 3, everyone points at who is [LIKELY] to become a YouTuber. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        fallback: 'voteTie',
    },
    {
        id: 'v6',
        text: 'On 3, everyone points at who is [LIKELY] to eat the last piece without asking. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        fallback: 'voteTie',
    },
    {
        id: 'v7',
        text: 'On 3, everyone points at the [QUALITY] cook in the room. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        fallback: 'voteTie',
    },
    {
        id: 'v8',
        text: 'On 3, everyone points at who is [LIKELY] to lie in this game. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        fallback: 'voteTie',
    },
    {
        id: 'v9',
        text: 'On 3, everyone points at who is [LIKELY] to survive a zombie movie. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        fallback: 'voteTie',
    },
    {
        id: 'v10',
        text: 'On 3, everyone points at who is [LIKELY] to get married first. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        needs: ['knows'],
        fallback: 'voteTie',
    },
    {
        id: 'v11',
        text: 'On 3, everyone points at who is [LIKELY] to get scolded at home tonight. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        spice: 'cheeky',
        fallback: 'voteTie',
    },
    {
        id: 'v12',
        text: 'On 3, everyone points at who is [LIKELY] to have a secret second Instagram account. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        spice: 'cheeky',
        fallback: 'voteTie',
    },
    {
        id: 'v13',
        text: 'On 3, everyone points at who is [LIKELY] to send a message they regret tonight. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        spice: 'cheeky',
        fallback: 'voteTie',
    },
    {
        id: 'v14',
        text: 'On 3, everyone points at who is [LIKELY] to flirt their way out of a traffic fine. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        spice: 'cheeky',
        needs: ['knows'],
        fallback: 'voteTie',
    },
    {
        id: 'v15',
        text: 'On 3, everyone points at who is [LIKELY] to text their ex tonight. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        spice: 'savage',
        fallback: 'voteTie',
    },
    {
        id: 'v16',
        text: 'On 3, everyone points at who is [LIKELY] to get caught lying to their partner. [VOTE_RESULT]',
        category: 'judgement',
        kind: 'vote',
        spice: 'savage',
        needs: ['knows'],
        fallback: 'voteTie',
    },
    {
        id: 'n1',
        text: 'Everyone who has ever fallen asleep in a class or meeting, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n2',
        text: 'Everyone who has ever pretended to be on a call to avoid someone, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n3',
        text: 'Everyone who has ever eaten food that fell on the floor, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n4',
        text: 'Everyone who has ever said "5 minutes away" while still at home, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n5',
        text: 'Everyone who has ever laughed at a joke they did not understand, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n6',
        text: 'Everyone who has ever cried during a movie, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n7',
        text: 'Everyone who has ever sent a message to the wrong person, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n8',
        text: 'Everyone who has ever forgotten a close friend\'s birthday, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n9',
        text: 'Everyone who has ever lied to their parents about where they were, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        spice: 'cheeky',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n10',
        text: 'Everyone who has ever bunked class or work and lied about why, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        spice: 'cheeky',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n11',
        text: 'Everyone who has ever read someone else\'s messages without asking, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        spice: 'cheeky',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n12',
        text: 'Everyone who has ever blamed a fart on someone else, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        spice: 'cheeky',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n13',
        text: 'Everyone who has ever ghosted someone, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        spice: 'cheeky',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n14',
        text: 'Everyone who has ever checked an ex\'s Instagram this month, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        spice: 'savage',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n15',
        text: 'Everyone who has ever had a crush on someone in this room, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        spice: 'savage',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'n16',
        text: 'Everyone who has ever been caught in a lie by someone in this room, raise a hand. [HAND_RESULT]',
        category: 'social',
        kind: 'confess',
        spice: 'savage',
        fallback: 'nobodyConfesses',
    },
    {
        id: 'p1',
        text: 'Do a 3-second impression of someone here. [IMPRESSION_RESULT]',
        category: 'chaos',
        kind: 'dare',
        fallback: 'refuseDare',
    },
    {
        id: 'p2',
        text: 'Sing one line of a [SONG_KIND] song, then pass to anyone you like.',
        category: 'chaos',
        kind: 'dare',
        fallback: 'refuseDare',
    },
    {
        id: 'p3',
        text: 'Do your best [SOUND], then pass to anyone you like.',
        category: 'chaos',
        kind: 'dare',
        fallback: 'refuseDare',
    },
    {
        id: 'p4',
        text: 'Talk like a [VOICE] until you pass. Pass to anyone you like.',
        category: 'chaos',
        kind: 'dare',
        fallback: 'refuseDare',
    },
    {
        id: 'p5',
        text: 'Do [REPS] [EXERCISE], then pass to anyone you like.',
        category: 'chaos',
        kind: 'dare',
        fallback: 'refuseDare',
    },
    {
        id: 'p6',
        text: 'Show everyone the last emoji you used. Pass to whoever it describes [DESCRIBES].',
        category: 'chaos',
        kind: 'dare',
        fallback: 'refuseDare',
    },
    {
        id: 'p7',
        text: 'Describe the person on your [RL_DIRECTION] in [FEW] words, then pass to anyone you like.',
        category: 'chaos',
        kind: 'dare',
        fallback: 'refuseDare',
    },
    {
        id: 'p8',
        text: 'Show everyone the [GALLERY] in your gallery, then pass to anyone you like.',
        category: 'chaos',
        kind: 'dare',
        spice: 'cheeky',
        fallback: 'refuseDare',
    },
    {
        id: 'p9',
        text: 'Show everyone your [PHONE_STAT], then pass to anyone you like.',
        category: 'chaos',
        kind: 'dare',
        spice: 'cheeky',
        fallback: 'refuseDare',
    },
    {
        id: 'p10',
        text: 'Show everyone the [APP_KIND] on your phone, then pass to anyone you like.',
        category: 'chaos',
        kind: 'dare',
        spice: 'cheeky',
        fallback: 'refuseDare',
    },
    {
        id: 'p11',
        text: 'Read your [LAST_MESSAGE] out loud, then pass to anyone you like.',
        category: 'chaos',
        kind: 'dare',
        spice: 'savage',
        fallback: 'refuseDare',
    },
    {
        id: 'p12',
        text: 'Show everyone your last [SEARCH], then pass to anyone you like.',
        category: 'chaos',
        kind: 'dare',
        spice: 'savage',
        fallback: 'refuseDare',
    },
    {
        id: 'td1',
        text: 'TRUTH: who here would you swap lives with for a day? [TRUTH_RESULT]\nDARE: sing one line of a [SONG_KIND] song, then pass to anyone.',
        category: 'chaos',
        kind: 'choice',
        fallback: 'refuseBoth',
    },
    {
        id: 'td2',
        text: 'TRUTH: who here did you get the wrong first impression of? [TRUTH_RESULT]\nDARE: dance for [SECONDS] seconds, then pass to anyone.',
        category: 'chaos',
        kind: 'choice',
        needs: ['knows'],
        fallback: 'refuseBoth',
    },
    {
        id: 'td3',
        text: 'TRUTH: who here would you pick as your partner on a reality show? [TRUTH_RESULT]\nDARE: talk like a [VOICE] until you pass, then pass to anyone.',
        category: 'chaos',
        kind: 'choice',
        fallback: 'refuseBoth',
    },
    {
        id: 'td4',
        text: 'TRUTH: who here would you call to help you [HELP]? [TRUTH_RESULT]\nDARE: let the group choose who gets the bomb.',
        category: 'chaos',
        kind: 'choice',
        spice: 'cheeky',
        fallback: 'refuseBoth',
    },
    {
        id: 'td5',
        text: 'TRUTH: who here would you never lend [LEND] to? [TRUTH_RESULT]\nDARE: let the person on your [RL_DIRECTION] choose who you pass to.',
        category: 'chaos',
        kind: 'choice',
        spice: 'cheeky',
        fallback: 'refuseBoth',
    },
    {
        id: 'td6',
        text: 'TRUTH: who here has the most secrets? [TRUTH_RESULT]\nDARE: show everyone the [GALLERY] in your gallery, then pass to anyone.',
        category: 'chaos',
        kind: 'choice',
        spice: 'cheeky',
        fallback: 'refuseBoth',
    },
    {
        id: 'td7',
        text: 'TRUTH: who here annoys you the [QUANTITY]? [TRUTH_RESULT]\nDARE: read your [LAST_MESSAGE] out loud, then pass to anyone.',
        category: 'chaos',
        kind: 'choice',
        spice: 'savage',
        fallback: 'refuseBoth',
    },
    {
        id: 'td8',
        text: 'TRUTH: who here would you date if you had to? [TRUTH_RESULT]\nDARE: let the person on your [RL_DIRECTION] read out the names of your last 3 chats, then pass to anyone.',
        category: 'chaos',
        kind: 'choice',
        spice: 'savage',
        fallback: 'refuseBoth',
    },
    {
        id: 'r1',
        text: 'Going [RL_DIRECTION] from you, everyone names a [CHAIN_TOPIC]. First to freeze or repeat one gets the bomb.',
        category: 'chaos',
        kind: 'race',
        fallback: 'raceFreeze',
    },
    {
        id: 'r2',
        text: 'Going [RL_DIRECTION] from you, everyone names a [TOPIC_THING]. First to freeze or repeat one gets the bomb.',
        category: 'chaos',
        kind: 'race',
        fallback: 'raceFreeze',
    },
    {
        id: 'r3',
        text: 'Going [RL_DIRECTION] from you, count to 20. Say "BOMB" instead of every number with a [DIGIT] in it. First mistake gets the bomb.',
        category: 'chaos',
        kind: 'race',
        fallback: 'raceFreeze',
    },
    {
        id: 'r4',
        text: 'Everyone touch something [COLOUR]! [SLOW_RESULT]',
        category: 'chaos',
        kind: 'race',
        fallback: 'sameTime',
    },
    {
        id: 'r5',
        text: 'Everyone touch your [BODY_PART]! [SLOW_RESULT]',
        category: 'chaos',
        kind: 'race',
        fallback: 'sameTime',
    },
    {
        id: 'r6',
        text: 'Everyone freeze! First person to [MOVE] gets the bomb.',
        category: 'chaos',
        kind: 'race',
        fallback: 'sameTime',
    },
    {
        id: 'r7',
        text: 'Everyone [POSE]! [SLOW_RESULT]',
        category: 'chaos',
        kind: 'race',
        fallback: 'sameTime',
    },
    {
        id: 'r8',
        text: 'Hum a [SONG_KIND] song. First person to name it [RACE_RESULT].',
        category: 'chaos',
        kind: 'race',
        fallback: 'nobodyKnows',
    },
    {
        id: 'r9',
        text: 'Rock, paper, scissors with the person on your [RL_DIRECTION]. If they lose, they get the bomb. If you lose, they choose who gets it.',
        category: 'chaos',
        kind: 'race',
        fallback: 'sameTime',
    },
    {
        id: 'r10',
        text: 'Staring contest with the person on your [RL_DIRECTION]. If they blink first, they get the bomb. If you do, they choose who gets it.',
        category: 'chaos',
        kind: 'race',
        fallback: 'sameTime',
    },
    {
        id: 'r11',
        text: 'Going [RL_DIRECTION] from you, everyone says a word that rhymes with "[RHYME]". First to freeze or repeat one gets the bomb.',
        category: 'chaos',
        kind: 'race',
        fallback: 'raceFreeze',
    },
    {
        id: 'h1',
        text: 'Pass to the person you have had your [MEMORY_KIND] with. Name it in 5 words.',
        category: 'social',
        kind: 'story',
        needs: ['close'],
        fallback: 'storyTime',
    },
    {
        id: 'h2',
        text: 'Pass to whoever owes you [OWED].',
        category: 'social',
        kind: 'story',
        needs: ['close'],
        fallback: 'storyTime',
    },
    {
        id: 'h3',
        text: 'Pass to the person you would call first with [NEWS].',
        category: 'social',
        kind: 'story',
        needs: ['close'],
        fallback: 'storyTime',
    },
    {
        id: 'h4',
        text: 'Pass to the person you have travelled with the [QUANTITY].',
        category: 'social',
        kind: 'story',
        needs: ['close'],
        fallback: 'storyTime',
    },
    {
        id: 'h5',
        text: 'Pass to whoever has the [QUANTITY] photos of you on their phone.',
        category: 'social',
        kind: 'story',
        needs: ['close'],
        fallback: 'storyTime',
    },
    {
        id: 'h6',
        text: 'Pass to whoever has the [STORY_KIND] story about you. They get 5 seconds to tell it.',
        category: 'social',
        kind: 'story',
        spice: 'cheeky',
        needs: ['close'],
        fallback: 'storyTime',
    },
    {
        id: 'h7',
        text: 'Pass to the person who has seen you at your [WORST].',
        category: 'social',
        kind: 'story',
        spice: 'cheeky',
        needs: ['close'],
        fallback: 'storyTime',
    },
    {
        id: 'h8',
        text: 'Pass to the person you have had the biggest fight with. Say what it was about in [FEW] words.',
        category: 'social',
        kind: 'story',
        spice: 'cheeky',
        needs: ['close'],
        fallback: 'storyTime',
    },
    {
        id: 'h9',
        text: 'Pass to the person who knows your [SECRET].',
        category: 'social',
        kind: 'story',
        spice: 'savage',
        needs: ['close'],
        fallback: 'storyTime',
    },
    {
        id: 'w1',
        text: 'Give someone a real compliment, [WHOLESOME_RESULT].',
        category: 'social',
        kind: 'wholesome',
        fallback: 'anyone',
    },
    {
        id: 'w2',
        text: 'Pass to whoever you would want next to you on a [JOURNEY].',
        category: 'social',
        kind: 'wholesome',
        fallback: 'anyone',
    },
    {
        id: 'w3',
        text: 'Pass to the person you would want on your team in a [CONTEST].',
        category: 'social',
        kind: 'wholesome',
        fallback: 'anyone',
    },
    {
        id: 'w4',
        text: 'Thank someone here for something, [WHOLESOME_RESULT].',
        category: 'social',
        kind: 'wholesome',
        fallback: 'anyone',
    },
    {
        id: 'w5',
        text: 'Pass to whoever has the best [FEATURE] in the room.',
        category: 'social',
        kind: 'wholesome',
        fallback: 'anyone',
    },
    {
        id: 'w6',
        text: 'Pass to whoever would make the best [ROLE].',
        category: 'social',
        kind: 'wholesome',
        fallback: 'anyone',
    },
    {
        id: 'w7',
        text: 'Pass to the person whose [STEAL] you would steal.',
        category: 'social',
        kind: 'wholesome',
        fallback: 'anyone',
    },
    {
        id: 'w8',
        text: 'Pass to whoever you would call when you need [NEED].',
        category: 'social',
        kind: 'wholesome',
        needs: ['knows'],
        fallback: 'anyone',
    },
    {
        id: 'w9',
        text: 'Pass to whoever you would trust to [TRUST_TASK].',
        category: 'social',
        kind: 'wholesome',
        fallback: 'anyone',
    },
    {
        id: 'rv1',
        text: 'Pass to whoever has hurt you the [QUANTITY] this game.',
        category: 'judgement',
        kind: 'revenge',
        fallback: 'noHistory',
    },
    {
        id: 'rv2',
        text: 'Make a deal out loud: pass to someone who promises to [DEAL]. Breaking the deal is allowed.',
        category: 'judgement',
        kind: 'revenge',
        fallback: 'noHistory',
    },
    {
        id: 'rv3',
        text: 'Form an alliance: pass to someone and name one player you will both [ALLY].',
        category: 'judgement',
        kind: 'revenge',
        fallback: 'noHistory',
    },
    {
        id: 'rv4',
        text: 'Pass to whoever laughed the [LAUGH] the last time you lost a life.',
        category: 'judgement',
        kind: 'revenge',
        fallback: 'noHistory',
    },
    {
        id: 'rv5',
        text: 'Pass to whoever is doing the [QUALITY] this game.',
        category: 'judgement',
        kind: 'revenge',
        fallback: 'noHistory',
    },
    {
        id: 'rv6',
        text: 'Pass to someone who has [EVER_NEVER] passed the bomb to you. Make it personal.',
        category: 'judgement',
        kind: 'revenge',
        fallback: 'noHistory',
    },
    {
        id: 't1',
        text: 'Pass to whoever knows the [QUANTITY] about [TOPIC].',
        category: 'judgement',
        kind: 'taste',
        fallback: 'topicNobody',
    },
    {
        id: 't2',
        text: 'Pass to whoever would [ARGUE] [TOPIC].',
        category: 'judgement',
        kind: 'taste',
        fallback: 'topicNobody',
    },
    {
        id: 't3',
        text: 'Pass to whoever would [WIN_LOSE] a [TOPIC] quiz.',
        category: 'judgement',
        kind: 'taste',
        fallback: 'topicNobody',
    },
    {
        id: 't4',
        text: 'Pass to whoever cares the [QUANTITY] about [TOPIC].',
        category: 'judgement',
        kind: 'taste',
        fallback: 'topicNobody',
    },
    {
        id: 't5',
        text: 'Name a [TOPIC_THING] in [SECONDS] seconds, then pass to anyone you like. Can\'t? Pass to whoever can.',
        category: 'chaos',
        kind: 'taste',
        fallback: 'refuseDare',
    },

];




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
    | 'alley-buyer'
    | 'alley-top-spender'
    | 'alley-never'
    | 'bet-won-latest'
    | 'bet-won-ever'
    | 'bet-lost-latest'
    | 'auction-stuck'
    | 'auction-top-bid'
    | 'life-buyer'

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
    m14: 'alley-buyer',
    m15: 'alley-top-spender',
    m16: 'alley-never',
    m17: 'bet-won-latest',
    m18: 'bet-won-ever',
    m19: 'bet-lost-latest',
    m20: 'auction-stuck',
    m21: 'auction-top-bid',
    m22: 'life-buyer',

};

// Instructions that need SOME history to make sense, but stay honor-system
// (no answer validation — just excluded from the pool too early).
export const instructionEligibilityGates: Record<string, 'requires-pass' | 'requires-multi-round'> = {
    rv1: 'requires-multi-round',
    rv2: 'requires-multi-round',
    rv3: 'requires-multi-round',
    rv4: 'requires-multi-round',
    rv5: 'requires-multi-round',
    rv6: 'requires-multi-round',
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
    if (gate === 'requires-multi-round' && ctx.roundNumber < 2) return false;

    // Group fit + escalation (spicier ones unlock in later rounds).
    if (!fitsGroup(instruction, ctx.profile ?? DEFAULT_GROUP_PROFILE, ctx.roundNumber)) return false;

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

        // ── money moves: only players still in count as answers ──
        case 'alley-buyer':
        case 'alley-top-spender':
        case 'alley-never': {
            const others = ctx.activePlayerIds.filter((id) => id !== ctx.holderId);
            const receipts = ctx.alleyReceipts ?? [];
            const bought = new Set(receipts.map((r) => r.playerId));
            if (answerType === 'alley-buyer') return orNull(others.filter((id) => bought.has(id)));
            if (answerType === 'alley-never') {
                // Only once someone has shopped (otherwise it's just "anyone").
                return receipts.length > 0 ? orNull(others.filter((id) => !bought.has(id))) : null;
            }
            const spent: Record<string, number> = {};
            for (const r of receipts) spent[r.playerId] = (spent[r.playerId] ?? 0) + r.price;
            const top = Math.max(0, ...others.map((id) => spent[id] ?? 0));
            return top > 0 ? orNull(others.filter((id) => (spent[id] ?? 0) === top)) : null;
        }

        case 'bet-won-latest':
        case 'bet-lost-latest':
        case 'bet-won-ever': {
            const want = answerType === 'bet-lost-latest' ? 'lost' : 'won';
            const bets = (ctx.settledBets ?? []).filter(
                (b) => b.status === want && ctx.activePlayerIds.includes(b.bettorId) && b.bettorId !== ctx.holderId
            );
            if (bets.length === 0) return null;
            if (answerType === 'bet-won-ever') return orNull([...new Set(bets.map((b) => b.bettorId))]);
            // Most recent = the latest round any of them settled in.
            const latest = Math.max(...bets.map((b) => b.settledRound));
            return orNull([...new Set(bets.filter((b) => b.settledRound === latest).map((b) => b.bettorId))]);
        }

        case 'auction-stuck': {
            const a = ctx.lastAuction;
            return a && ctx.activePlayerIds.includes(a.loserId) ? [a.loserId] : null;
        }

        case 'auction-top-bid': {
            const a = ctx.lastAuction;
            if (!a) return null;
            const bids = Object.entries(a.bids).filter(([id]) => ctx.activePlayerIds.includes(id));
            const top = Math.max(0, ...bids.map(([, v]) => v));
            return top > 0 ? orNull(bids.filter(([, v]) => v === top).map(([id]) => id)) : null;
        }

        case 'life-buyer':
            return orNull((ctx.lifeBuyers ?? []).filter((id) => ctx.activePlayerIds.includes(id)));

        default:
            return null;
    }
};

const orNull = (ids: string[]): string[] | null => (ids.length > 0 ? ids : null);

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
    const chosen = pickWeighted(finalPool);
    const profile = ctx?.profile ?? DEFAULT_GROUP_PROFILE;

    // Resolve any [PLACEHOLDER] tokens once, here, so every downstream
    // consumer (game.ts) just uses `.text` as-is and gets the final,
    // human-readable instruction — id/category stay untouched so
    // eligibility and answer-type lookups (which key off `.id`) are
    // unaffected.
    const [text, fallbackText] = resolveTexts(
        fillTopic([chosen.text, chosen.fallback ? fallbacks[chosen.fallback] : ''], profile)
    );
    return { ...chosen, text, fallbackText };
};

// Votes and races come up more often than quiet solo decisions.
const pickWeighted = (pool: Instruction[]): Instruction => {
    const w = pool.map((i) => KIND_WEIGHT[i.kind ?? 'plain']);
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < pool.length; k++) {
        r -= w[k];
        if (r < 0) return pool[k];
    }
    return pool[pool.length - 1];
};

export const getRandomPersonality = (
    usedIds: string[],
    playerCount: number = 6,
    timerMode: 'on' | 'off' | 'mixed' = 'on',
    roundNumber: number = 1
): BombPersonality => {
    const MIN_PLAYERS_FOR_CHAIN = 6;

    // The Liar only lies about a clock people can see, so it is never dealt
    // when the host has hidden the timer.
    const allowed = (p: BombPersonality) => {
        if (p.id === 'chain' && playerCount < MIN_PLAYERS_FOR_CHAIN) return false;
        if (p.id === 'liar' && timerMode === 'off') return false;
        if (p.id === 'auction' && (roundNumber < AUCTION_FROM_ROUND || playerCount < AUCTION_MIN_PLAYERS)) return false;
        return true;
    };

    const available = bombPersonalities.filter((p) => !usedIds.includes(p.id) && allowed(p));
    const pool = available.length > 0 ? available : bombPersonalities.filter(allowed);

    return pool[Math.floor(Math.random() * pool.length)];
};



// End-of-game-only checks — never-pass-to-player and the "finish with at
// least N lives" variant of survive-on-one-life. Called once, from
// endBombGame, against the FINAL state of everyone still standing.
