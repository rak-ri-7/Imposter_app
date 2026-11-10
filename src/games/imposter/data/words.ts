export type WordEntry = {
    word: string;
    category: string;
    hint?: string;
};


// 🇮🇳 India & Kerala: local food, places, films, festivals and daily life.
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
    { word: 'Dubai', category: 'Places', hint: 'half of Kerala has a cousin working here' },

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
];

// 🌍 Worldwide: everyday things anyone, anywhere would know.
export const worldWordBank: WordEntry[] = [
    // Food
    { word: 'Pizza', category: 'Food', hint: 'the topping debates never end' },
    { word: 'Sushi', category: 'Food', hint: 'some people still won\'t try it raw' },
    { word: 'Tacos', category: 'Food', hint: 'falls apart on the second bite' },
    { word: 'Burger', category: 'Food', hint: 'stacked higher than your mouth opens' },
    { word: 'Pancakes', category: 'Food', hint: 'the first one always comes out wrong' },
    { word: 'Popcorn', category: 'Food', hint: 'the smell gives you away at work' },
    { word: 'Ice Cream', category: 'Food', hint: 'a race against the sun' },
    { word: 'Spaghetti', category: 'Food', hint: 'impossible to eat neatly on a date' },
    { word: 'Chocolate', category: 'Food', hint: 'hidden in drawers for emergencies' },
    { word: 'Fried Chicken', category: 'Food', hint: 'secret recipes are guarded' },
    { word: 'Croissant', category: 'Food', hint: 'leaves a trail of flakes' },
    { word: 'Hot Dog', category: 'Food', hint: 'stadium dinner' },
    { word: 'Salad', category: 'Food', hint: 'ordered with good intentions' },
    { word: 'Birthday Cake', category: 'Food', hint: 'someone always blows too hard' },
    { word: 'Cereal', category: 'Food', hint: 'milk first or second starts fights' },
    { word: 'Dumplings', category: 'Food', hint: 'folding them takes practice' },
    { word: 'Noodles', category: 'Food', hint: 'slurping is allowed in some places' },
    { word: 'French Fries', category: 'Food', hint: 'the ones at the bottom of the bag are the best' },
    { word: 'Watermelon', category: 'Food', hint: 'spitting contests in summer' },
    { word: 'Coffee', category: 'Food', hint: 'nobody talks to some people before this' },
    { word: 'Honey', category: 'Food', hint: 'never really goes bad' },
    { word: 'Pineapple', category: 'Food', hint: 'its place on one dish splits the world' },
    { word: 'Cheese', category: 'Food', hint: 'the smellier, the pricier' },
    { word: 'Lemonade', category: 'Food', hint: 'kids sell it on the street' },

    // Places
    { word: 'Eiffel Tower', category: 'Places', hint: 'locals once hated it' },
    { word: 'Pyramids', category: 'Places', hint: 'nobody agrees how they were built' },
    { word: 'Great Wall', category: 'Places', hint: 'longer than you think, smaller from space than you think' },
    { word: 'Times Square', category: 'Places', hint: 'night looks like day here' },
    { word: 'Statue of Liberty', category: 'Places', hint: 'a gift that turned green' },
    { word: 'Las Vegas', category: 'Places', hint: 'what happens here supposedly stays here' },
    { word: 'Dubai', category: 'Places', hint: 'built fast on borrowed ambition' },
    { word: 'Venice', category: 'Places', hint: 'the streets are wet on purpose' },
    { word: 'Mount Everest', category: 'Places', hint: 'there is a queue at the top' },
    { word: 'Sahara', category: 'Places', hint: 'freezing at night, surprisingly' },
    { word: 'Amazon Rainforest', category: 'Places', hint: 'lungs of the planet' },
    { word: 'Colosseum', category: 'Places', hint: 'crowds once cheered for the worst things here' },
    { word: 'Hollywood', category: 'Places', hint: 'a sign on a hill' },
    { word: 'Antarctica', category: 'Places', hint: 'nobody is born here' },
    { word: 'Niagara Falls', category: 'Places', hint: 'people went over it in barrels' },
    { word: 'Airport', category: 'Places', hint: 'the clocks don\'t matter here' },
    { word: 'Hospital', category: 'Places', hint: 'the best and worst days happen here' },
    { word: 'Library', category: 'Places', hint: 'shushing is part of the job' },
    { word: 'Gym', category: 'Places', hint: 'January is the busiest month' },
    { word: 'Theme Park', category: 'Places', hint: 'the wait is longer than the ride' },
    { word: 'Beach', category: 'Places', hint: 'you find it in your shoes for weeks' },
    { word: 'Supermarket', category: 'Places', hint: 'one wobbly trolley wheel' },
    { word: 'Cinema', category: 'Places', hint: 'someone always checks their phone' },

    // Animals
    { word: 'Penguin', category: 'Animals', hint: 'dressed for a formal dinner' },
    { word: 'Giraffe', category: 'Animals', hint: 'sleeps only a few minutes at a time' },
    { word: 'Octopus', category: 'Animals', hint: 'escapes from aquariums' },
    { word: 'Elephant', category: 'Animals', hint: 'never forgets, supposedly' },
    { word: 'Kangaroo', category: 'Animals', hint: 'can\'t walk backwards' },
    { word: 'Shark', category: 'Animals', hint: 'one film ruined its reputation' },
    { word: 'Panda', category: 'Animals', hint: 'eats all day and is still tired' },
    { word: 'Owl', category: 'Animals', hint: 'the night shift worker' },
    { word: 'Dolphin', category: 'Animals', hint: 'sleeps with half its brain' },
    { word: 'Sloth', category: 'Animals', hint: 'a weekly trip down to the ground' },
    { word: 'Peacock', category: 'Animals', hint: 'all show, no flight' },
    { word: 'Chameleon', category: 'Animals', hint: 'eyes go two different ways' },
    { word: 'Goldfish', category: 'Animals', hint: 'a prize at the fair' },
    { word: 'Parrot', category: 'Animals', hint: 'repeats what it shouldn\'t' },
    { word: 'Bee', category: 'Animals', hint: 'dances to give directions' },
    { word: 'Camel', category: 'Animals', hint: 'packs its own lunch' },
    { word: 'Lion', category: 'Animals', hint: 'the females do the hunting' },
    { word: 'Cat', category: 'Animals', hint: 'knocks things off tables on purpose' },
    { word: 'Dog', category: 'Animals', hint: 'greets you like you were gone for years' },
    { word: 'Spider', category: 'Animals', hint: 'the reason someone screams in the bathroom' },

    // Jobs
    { word: 'Firefighter', category: 'Jobs', hint: 'runs in when everyone runs out' },
    { word: 'Astronaut', category: 'Jobs', hint: 'office with the best view' },
    { word: 'Chef', category: 'Jobs', hint: 'yelling is part of the culture' },
    { word: 'Dentist', category: 'Jobs', hint: 'asks questions when you can\'t answer' },
    { word: 'Pilot', category: 'Jobs', hint: 'talks to you but you never see them' },
    { word: 'Teacher', category: 'Jobs', hint: 'has eyes in the back of their head' },
    { word: 'Magician', category: 'Jobs', hint: 'never reveals the secret' },
    { word: 'Detective', category: 'Jobs', hint: 'notices what you missed' },
    { word: 'Plumber', category: 'Jobs', hint: 'called in a panic on holidays' },
    { word: 'Lifeguard', category: 'Jobs', hint: 'whistle and a tall chair' },
    { word: 'Barber', category: 'Jobs', hint: 'knows all the gossip in town' },
    { word: 'Farmer', category: 'Jobs', hint: 'up before the sun' },
    { word: 'Photographer', category: 'Jobs', hint: 'says "one more" every time' },
    { word: 'Referee', category: 'Jobs', hint: 'both sides are angry at them' },
    { word: 'Clown', category: 'Jobs', hint: 'fun for some, scary for others' },
    { word: 'Postman', category: 'Jobs', hint: 'dogs see them as the enemy' },
    { word: 'Surgeon', category: 'Jobs', hint: 'steady hands matter most' },
    { word: 'DJ', category: 'Jobs', hint: 'gets the same song request ten times' },

    // At Home
    { word: 'Remote Control', category: 'At Home', hint: 'always lost in the sofa' },
    { word: 'Alarm Clock', category: 'At Home', hint: 'the snooze button\'s best friend' },
    { word: 'Toothbrush', category: 'At Home', hint: 'replace it more often than you do' },
    { word: 'Fridge', category: 'At Home', hint: 'opened again, hoping something new appeared' },
    { word: 'Washing Machine', category: 'At Home', hint: 'eats one sock at a time' },
    { word: 'Umbrella', category: 'At Home', hint: 'forgotten on the one day you need it' },
    { word: 'Pillow', category: 'At Home', hint: 'the cold side is the best side' },
    { word: 'Mirror', category: 'At Home', hint: 'talks back only in fairy tales' },
    { word: 'Candle', category: 'At Home', hint: 'smells better than it looks' },
    { word: 'Vacuum Cleaner', category: 'At Home', hint: 'pets hate it' },
    { word: 'Microwave', category: 'At Home', hint: 'stopped at one second left' },
    { word: 'Sofa', category: 'At Home', hint: 'hides coins and crumbs' },
    { word: 'Keys', category: 'At Home', hint: 'in the last pocket you check' },
    { word: 'Toaster', category: 'At Home', hint: 'jumps when it\'s done' },
    { word: 'Wi-Fi Router', category: 'At Home', hint: 'turn it off and on again' },
    { word: 'Bathtub', category: 'At Home', hint: 'where great ideas are born' },
    { word: 'Doorbell', category: 'At Home', hint: 'makes the dog lose its mind' },

    // Sports & Games
    { word: 'Football', category: 'Sports & Games', hint: 'the whole world plays it, named differently in places' },
    { word: 'Basketball', category: 'Sports & Games', hint: 'height helps a lot' },
    { word: 'Tennis', category: 'Sports & Games', hint: 'love means nothing here' },
    { word: 'Chess', category: 'Sports & Games', hint: 'the smallest piece can become the strongest' },
    { word: 'Olympics', category: 'Sports & Games', hint: 'every four years, five rings' },
    { word: 'Golf', category: 'Sports & Games', hint: 'the lower the score the better' },
    { word: 'Boxing', category: 'Sports & Games', hint: 'saved by the bell' },
    { word: 'Skateboard', category: 'Sports & Games', hint: 'scraped knees are a rite of passage' },
    { word: 'Marathon', category: 'Sports & Games', hint: 'started with one messenger' },
    { word: 'Bowling', category: 'Sports & Games', hint: 'rented shoes' },
    { word: 'Hide and Seek', category: 'Sports & Games', hint: 'counting to ten with eyes closed' },
    { word: 'Surfing', category: 'Sports & Games', hint: 'waiting more than riding' },
    { word: 'Swimming', category: 'Sports & Games', hint: 'never right after lunch, says grandma' },
    { word: 'Video Games', category: 'Sports & Games', hint: 'just one more level' },
    { word: 'Karate', category: 'Sports & Games', hint: 'the belt color tells the story' },
    { word: 'Darts', category: 'Sports & Games', hint: 'pub favorite with a bullseye' },

    // Movies & Stories
    { word: 'Superhero', category: 'Movies & Stories', hint: 'wears the underwear on the outside, sometimes' },
    { word: 'Vampire', category: 'Movies & Stories', hint: 'needs an invitation to come in' },
    { word: 'Zombie', category: 'Movies & Stories', hint: 'slow but never stops' },
    { word: 'Pirate', category: 'Movies & Stories', hint: 'X marks the spot' },
    { word: 'Dragon', category: 'Movies & Stories', hint: 'guards a pile of gold' },
    { word: 'Robot', category: 'Movies & Stories', hint: 'films always make it turn on us' },
    { word: 'Alien', category: 'Movies & Stories', hint: 'always lands in America in films' },
    { word: 'Wizard', category: 'Movies & Stories', hint: 'long beard, pointy hat' },
    { word: 'Mermaid', category: 'Movies & Stories', hint: 'half the time on land, half in the sea' },
    { word: 'Ghost', category: 'Movies & Stories', hint: 'walks through walls' },
    { word: 'Cinderella', category: 'Movies & Stories', hint: 'deadline at midnight' },
    { word: 'Time Machine', category: 'Movies & Stories', hint: 'don\'t meet your past self' },
    { word: 'Ninja', category: 'Movies & Stories', hint: 'you never hear them coming' },
    { word: 'Unicorn', category: 'Movies & Stories', hint: 'also what startups dream of becoming' },
    { word: 'Spy', category: 'Movies & Stories', hint: 'shaken, not stirred' },
    { word: 'Dinosaur', category: 'Movies & Stories', hint: 'a theme park with them never ends well' },

    // Celebrations
    { word: 'Wedding', category: 'Celebrations', hint: 'someone always cries' },
    { word: 'New Year\'s Eve', category: 'Celebrations', hint: 'counting down out loud' },
    { word: 'Halloween', category: 'Celebrations', hint: 'strangers give kids sweets' },
    { word: 'Christmas', category: 'Celebrations', hint: 'a tree comes indoors' },
    { word: 'Birthday Party', category: 'Celebrations', hint: 'everyone sings off-key' },
    { word: 'Graduation', category: 'Celebrations', hint: 'hats thrown in the air' },
    { word: 'Valentine\'s Day', category: 'Celebrations', hint: 'flower prices double' },
    { word: 'Baby Shower', category: 'Celebrations', hint: 'guessing games about someone not here yet' },
    { word: 'Fireworks', category: 'Celebrations', hint: 'dogs hide under the bed' },
    { word: 'Surprise Party', category: 'Celebrations', hint: 'hiding behind the sofa in the dark' },
    { word: 'Karaoke', category: 'Celebrations', hint: 'courage comes after midnight' },
    { word: 'Carnival', category: 'Celebrations', hint: 'costumes and street parades' },

    // Nature & Weather
    { word: 'Rainbow', category: 'Nature & Weather', hint: 'nobody has reached the end of it' },
    { word: 'Volcano', category: 'Nature & Weather', hint: 'sleeping, but not dead' },
    { word: 'Thunderstorm', category: 'Nature & Weather', hint: 'count the seconds after the flash' },
    { word: 'Snowman', category: 'Nature & Weather', hint: 'carrot nose' },
    { word: 'Earthquake', category: 'Nature & Weather', hint: 'get under the table' },
    { word: 'Sunset', category: 'Nature & Weather', hint: 'everyone takes the same photo' },
    { word: 'Tornado', category: 'Nature & Weather', hint: 'took a girl and her dog to a strange land' },
    { word: 'Moon', category: 'Nature & Weather', hint: 'always shows the same face' },
    { word: 'Cactus', category: 'Nature & Weather', hint: 'the plant you can\'t kill, almost' },
    { word: 'Waterfall', category: 'Nature & Weather', hint: 'the sound reaches you first' },
    { word: 'Iceberg', category: 'Nature & Weather', hint: 'most of it is hidden' },
    { word: 'Desert Island', category: 'Nature & Weather', hint: 'what three things would you bring' },

    // Travel & Things
    { word: 'Passport', category: 'Travel & Things', hint: 'nobody likes their photo in it' },
    { word: 'Suitcase', category: 'Travel & Things', hint: 'sit on it to close it' },
    { word: 'Rollercoaster', category: 'Travel & Things', hint: 'the click-click-click before the drop' },
    { word: 'Hot Air Balloon', category: 'Travel & Things', hint: 'you can\'t steer, only go up or down' },
    { word: 'Submarine', category: 'Travel & Things', hint: 'windows are the scary part' },
    { word: 'Train', category: 'Travel & Things', hint: 'a window seat and a long story' },
    { word: 'Taxi', category: 'Travel & Things', hint: 'the meter keeps running in traffic' },
    { word: 'Camping', category: 'Travel & Things', hint: 'the tent instructions are never right' },
    { word: 'Selfie', category: 'Travel & Things', hint: 'arm stretched out, best angle' },
    { word: 'Smartphone', category: 'Travel & Things', hint: 'checked before your eyes are fully open' },
    { word: 'Headphones', category: 'Travel & Things', hint: 'the universal "don\'t talk to me" sign' },
    { word: 'Treasure Map', category: 'Travel & Things', hint: 'count the paces from the old tree' },
    { word: 'Bicycle', category: 'Travel & Things', hint: 'you never forget how' },
    { word: 'Jet Lag', category: 'Travel & Things', hint: 'wide awake at 3 a.m.' },
];

// Which set of words the host picked. Older games have none saved = India.
export type WordSet = 'india' | 'world';
export const WORD_SETS: { id: WordSet; emoji: string; label: string; blurb: string }[] = [
    { id: 'india', emoji: '🇮🇳', label: 'India & Kerala', blurb: 'Local food, films, festivals and places' },
    { id: 'world', emoji: '🌍', label: 'Worldwide', blurb: 'Everyday things anyone would know' },
];
const bankFor = (set: WordSet = 'india'): WordEntry[] => (set === 'world' ? worldWordBank : wordBank);

export const pickRandomWordEntry = (usedWords: string[], set: WordSet = 'india'): WordEntry => {
    const bank = bankFor(set);
    const available = bank.filter((w) => !usedWords.includes(w.word));
    const pool = available.length > 0 ? available : bank;
    return pool[Math.floor(Math.random() * pool.length)];
};

// Looks in the game's own set first (a word like "Christmas" is in both,
// with different hints), then the other one.
export const findWordEntry = (word: string, set: WordSet = 'india'): WordEntry | undefined => {
    const same = (w: WordEntry) => w.word.toLowerCase() === word.toLowerCase();
    return bankFor(set).find(same) ?? bankFor(set === 'world' ? 'india' : 'world').find(same);
};

// Meaningful pieces of the word ("Gulf Return" -> gulf, return).
const wordParts = (word: string): string[] =>
    word
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length > 2 && !['the', 'and', 'for'].includes(p));

// True if the text would give away the word or any part of it.
const leaksWord = (text: string, word: string): boolean => {
    const t = text.toLowerCase();
    return t.includes(word.toLowerCase()) || wordParts(word).some((p) => t.includes(p));
};

export const getHint = (entry: WordEntry): string => {
    const category = `Category: ${entry.category}`;
    const firstLetter = `First letter: "${entry.word.charAt(0).toUpperCase()}"`;

    // Only offer hints that don't contain the word itself.
    const options = [firstLetter];
    if (!leaksWord(entry.category, entry.word)) options.push(category);
    if (entry.hint && !leaksWord(entry.hint, entry.word)) options.push(entry.hint);

    return options[Math.floor(Math.random() * options.length)];
};