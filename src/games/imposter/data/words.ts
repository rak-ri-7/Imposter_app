export type WordEntry = {
    word: string;
    category: string;
    hint?: string;
};


export const wordBank: WordEntry[] = [
    // Food
    { word: 'Dosa', category: 'Food', hint: 'takes skill to get the edges right' },
    { word: 'Biryani', category: 'Food', hint: 'arguments start over whose version is better' },
    { word: 'Pani Puri', category: 'Food', hint: 'gone in one bite' },
    { word: 'Butter Chicken', category: 'Food', hint: 'foreigners always order this first' },
    { word: 'Samosa', category: 'Food', hint: 'tea time essential' },
    { word: 'Idli', category: 'Food', hint: 'bland on its own but nobody complains' },
    { word: 'Vada Pav', category: 'Food', hint: 'workers swear by it' },
    { word: 'Chole Bhature', category: 'Food', hint: 'dangerous to eat before a long drive' },
    { word: 'Masala Chai', category: 'Food', hint: 'every Indian home has a slightly different recipe' },
    { word: 'Gulab Jamun', category: 'Food', hint: 'always swimming in something' },
    { word: 'Rasgulla', category: 'Food', hint: 'Bengal and Odisha still fight over it' },
    { word: 'Pav Bhaji', category: 'Food', hint: 'butter is not optional' },
    { word: 'Dhokla', category: 'Food', hint: 'looks simple but isnt' },
    { word: 'Lassi', category: 'Food', hint: 'sweet or salty — a life decision' },
    { word: 'Parotta', category: 'Food', hint: 'best after midnight' },
    { word: 'Uttapam', category: 'Food', hint: 'lazy cousin of another dish' },
    { word: 'Appam', category: 'Food', hint: 'lacy around the edges' },
    { word: 'Poha', category: 'Food', hint: 'morning rush favorite' },
    { word: 'Jalebi', category: 'Food', hint: 'requires patience to make, none to eat' },
    { word: 'Khichdi', category: 'Food', hint: 'what mothers make when you are sick' },
    { word: 'Puttu', category: 'Food', hint: 'comes out in cylinders' },
    { word: 'Kadala Curry', category: 'Food', hint: 'Sunday mornings in Kerala' },
    { word: 'Fish Curry', category: 'Food', hint: 'smell lingers longer than the meal' },
    { word: 'Beef Fry', category: 'Food', hint: 'political in some states' },
    { word: 'Sadya', category: 'Food', hint: 'sit on the floor for this one' },
    { word: 'Avial', category: 'Food', hint: 'everything goes in' },
    { word: 'Payasam', category: 'Food', hint: 'never just one bowl' },
    { word: 'Banana Chips', category: 'Food', hint: 'yellow and addictive' },
    { word: 'Unniyappam', category: 'Food', hint: 'temple offering made at home' },
    { word: 'Pazham Pori', category: 'Food', hint: 'evening rain and this go together' },
    { word: 'Idiyappam', category: 'Food', hint: 'looks like noodles but isnt' },
    { word: 'Pathiri', category: 'Food', hint: 'Malabar dinner staple' },
    { word: 'Thalassery Biryani', category: 'Food', hint: 'locals are very particular about authenticity' },
    { word: 'Karimeen Fry', category: 'Food', hint: 'backwater specialty' },
    { word: 'Kappa Biriyani', category: 'Food', hint: 'unusual combination that works' },

    // Places
    { word: 'Kovalam Beach', category: 'Places', hint: 'foreigners outnumber locals in season' },
    { word: 'Munnar', category: 'Places', hint: 'clouds are at eye level here' },
    { word: 'Alleppey Backwaters', category: 'Places', hint: 'you sleep on water here' },
    { word: 'Wayanad', category: 'Places', hint: 'you need a sweater even in summer' },
    { word: 'Thekkady', category: 'Places', hint: 'you might spot stripes if lucky' },
    { word: 'Fort Kochi', category: 'Places', hint: 'history written in the architecture' },
    { word: 'Varkala Beach', category: 'Places', hint: 'you look down to see the sea' },
    { word: 'Sabarimala', category: 'Places', hint: 'the journey matters more than arrival' },
    { word: 'Guruvayur Temple', category: 'Places', hint: 'elephants are part of the experience' },
    { word: 'Taj Mahal', category: 'Places', hint: 'built out of grief' },
    { word: 'Gateway of India', category: 'Places', hint: 'named for arrivals that changed everything' },
    { word: 'Marina Beach', category: 'Places', hint: 'morning walkers and evening vendors' },
    { word: 'Lal Qila', category: 'Places', hint: 'flags go up here on a special day' },
    { word: 'Varanasi Ghats', category: 'Places', hint: 'life and death share the same steps' },
    { word: 'Mysore Palace', category: 'Places', hint: 'glitters most on Sunday nights' },
    { word: 'Padmanabhaswamy Temple', category: 'Places', hint: 'vaults inside are legendary' },
    { word: 'Athirapally Falls', category: 'Places', hint: 'Bollywood found it before tourists did' },
    { word: 'Vembanad Lake', category: 'Places', hint: 'divides two districts' },
    { word: 'Cherai Beach', category: 'Places', hint: 'dolphins if you are lucky' },
    { word: 'Bekal Fort', category: 'Places', hint: 'circular and dramatic' },

    // Festivals
    { word: 'Onam', category: 'Festivals', hint: 'a king is remembered every year' },
    { word: 'Vishu', category: 'Festivals', hint: 'first sight of the morning matters most' },
    { word: 'Thrissur Pooram', category: 'Festivals', hint: 'sound alone can tell you its happening' },
    { word: 'Diwali', category: 'Festivals', hint: 'neighbors compete without speaking' },
    { word: 'Holi', category: 'Festivals', hint: 'wear clothes you dont mind losing' },
    { word: 'Eid', category: 'Festivals', hint: 'mornings start earlier than usual' },
    { word: 'Navratri', category: 'Festivals', hint: 'nine nights of movement' },
    { word: 'Durga Puja', category: 'Festivals', hint: 'entire neighborhoods transform' },
    { word: 'Ganesh Chaturthi', category: 'Festivals', hint: 'ends with a procession to water' },
    { word: 'Baisakhi', category: 'Festivals', hint: 'harvest and history combined' },
    { word: 'Pongal', category: 'Festivals', hint: 'boiling over is the good part' },
    { word: 'Attukal Pongala', category: 'Festivals', hint: 'city roads disappear under it' },
    { word: 'Christmas', category: 'Festivals', hint: 'Kerala celebrates it louder than most' },
    { word: 'Bakrid', category: 'Festivals', hint: 'meat is shared with those who have none' },
    { word: 'Makaravilakku', category: 'Festivals', hint: 'millions watch one moment in the sky' },

    // Cricket
    { word: 'Sachin Tendulkar', category: 'Cricket', hint: 'nation stopped when he batted' },
    { word: 'Virat Kohli', category: 'Cricket', hint: 'celebrations are as famous as the runs' },
    { word: 'MS Dhoni', category: 'Cricket', hint: 'never seems to panic' },
    { word: 'Sanju Samson', category: 'Cricket', hint: 'Kerala roots, national stage' },
    { word: 'Cover Drive', category: 'Cricket', hint: 'purists consider this the most elegant' },
    { word: 'Yorker', category: 'Cricket', hint: 'death over weapon' },
    { word: 'IPL', category: 'Cricket', hint: 'city loyalties change overnight' },
    { word: 'LBW', category: 'Cricket', hint: 'finger goes up and arguments start' },
    { word: 'Googly', category: 'Cricket', hint: 'looks like one thing, does another' },
    { word: 'Chennai Super Kings', category: 'Cricket', hint: 'yellow army never loses faith' },
    { word: 'Wankhede Stadium', category: 'Cricket', hint: 'night matches here are electric' },
    { word: 'Duckworth Lewis', category: 'Cricket', hint: 'nobody fully understands it' },
    { word: 'Reverse Swing', category: 'Cricket', hint: 'late movement nobody expects' },
    { word: 'No Ball', category: 'Cricket', hint: 'free hit follows' },

    // Mollywood & Bollywood
    { word: 'Mohanlal', category: 'Mollywood', hint: 'doesnt need to shout to command the screen' },
    { word: 'Mammootty', category: 'Mollywood', hint: 'courtroom scenes are his territory' },
    { word: 'Dulquer Salmaan', category: 'Mollywood', hint: 'chose his own path despite the surname' },
    { word: 'Fahadh Faasil', category: 'Mollywood', hint: 'silence is his best dialogue' },
    { word: 'Drishyam', category: 'Mollywood', hint: 'made people question what they saw' },
    { word: 'Premam', category: 'Mollywood', hint: 'every generation has one in it' },
    { word: 'Kumbalangi Nights', category: 'Mollywood', hint: 'brothers and broken things' },
    { word: 'Minnal Murali', category: 'Mollywood', hint: 'lightning changed everything' },
    { word: 'Sholay', category: 'Bollywood', hint: 'dialogues memorized by people who werent born then' },
    { word: 'Shah Rukh Khan', category: 'Bollywood', hint: 'arms outstretched is his signature' },
    { word: 'Amitabh Bachchan', category: 'Bollywood', hint: 'voice recognizable before face' },
    { word: 'Item Number', category: 'Bollywood', hint: 'plot stops for this' },
    { word: 'Playback Singer', category: 'Bollywood', hint: 'famous voice, unknown face' },

    // Daily Life
    { word: 'KSRTC', category: 'Daily Life', hint: 'smells like diesel and memories' },
    { word: 'Autorickshaw', category: 'Daily Life', hint: 'meter may or may not be used' },
    { word: 'Hartal', category: 'Daily Life', hint: 'announced the night before' },
    { word: 'Mundu', category: 'Daily Life', hint: 'folded up means working, folded down means formal' },
    { word: 'Kasavu Saree', category: 'Daily Life', hint: 'worn once a year by most' },
    { word: 'Nalukettu', category: 'Daily Life', hint: 'center is open to the sky' },
    { word: 'Coconut Tree', category: 'Daily Life', hint: 'every part has a use' },
    { word: 'Rubber Tree', category: 'Daily Life', hint: 'dawn alarm clock for farmers' },
    { word: 'Kathakali', category: 'Daily Life', hint: 'makeup takes longer than the performance' },
    { word: 'Kalaripayattu', category: 'Daily Life', hint: 'older than most martial arts' },
    { word: 'Theyyam', category: 'Daily Life', hint: 'god walks among people' },
    { word: 'Vallam Kali', category: 'Daily Life', hint: 'synchronized effort for speed' },
    { word: 'Chenda', category: 'Daily Life', hint: 'heard before seen at festivals' },
    { word: 'Panchayat', category: 'Daily Life', hint: 'decisions made close to home' },
    { word: 'Kudumbasree', category: 'Daily Life', hint: 'small savings, big changes' },

    // Gulf
    { word: 'Dubai', category: 'Gulf', hint: 'built fast on borrowed ambition' },
    { word: 'Gulf Return', category: 'Gulf', hint: 'homecoming with mixed feelings' },
    { word: 'Air India Express', category: 'Gulf', hint: 'packed flights every Friday' },
    { word: 'Iqama', category: 'Gulf', hint: 'without it you cannot move' },
    { word: 'Remittance', category: 'Gulf', hint: 'keeps many households running' },
    { word: 'Pravasi', category: 'Gulf', hint: 'away but never fully gone' },
    { word: 'Calicut Airport', category: 'Gulf', hint: 'emotional reunions daily' },
    { word: 'Muscat', category: 'Gulf', hint: 'quieter than its neighbors' },
    { word: 'Kuwait', category: 'Gulf', hint: 'small country, large Kerala population' },
    { word: 'Kafala', category: 'Gulf', hint: 'ties a worker to one employer' },
];

export const pickRandomWordEntry = (usedWords: string[]): WordEntry => {
    const available = wordBank.filter((w) => !usedWords.includes(w.word));
    const pool = available.length > 0 ? available : wordBank;
    return pool[Math.floor(Math.random() * pool.length)];
};

export const getHint = (entry: WordEntry): string => {
    const hintTypes = ['category', 'firstLetter', 'clue'];
    const type = hintTypes[Math.floor(Math.random() * hintTypes.length)];

    if (type === 'category') {
        return `Category: ${entry.category}`;
    } else if (type === 'firstLetter') {
        return `First letter: "${entry.word.charAt(0).toUpperCase()}"`;
    } else {
        return entry.hint ?? `Category: ${entry.category}`;
    }
};