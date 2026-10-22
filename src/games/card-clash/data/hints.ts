// 🔍 Hint lifeline: what the caller learns about each opponent's top card.
// Countries → continent. Animals → a broad group. Loose on purpose: a few
// animals sit in the nearest group (spiders, scorpions, worms and snails
// under Insect; the poison dart frog under Reptile; whales, dolphins, seals
// and sea otters under Sea creature; the penguin under Bird).
import type { ClashCard } from './types';

type Hint = { emoji: string; label: string };

const CONTINENTS = {
    africa: { emoji: '🌍', label: 'Africa' },
    asia: { emoji: '🌏', label: 'Asia' },
    europe: { emoji: '🏰', label: 'Europe' },
    northAmerica: { emoji: '🌎', label: 'North America' },
    southAmerica: { emoji: '🌎', label: 'South America' },
    oceania: { emoji: '🏝️', label: 'Oceania' },
} as const;

const GROUPS = {
    bird: { emoji: '🐦', label: 'Bird' },
    sea: { emoji: '🌊', label: 'Sea creature' },
    insect: { emoji: '🐜', label: 'Insect' },
    mammal: { emoji: '🐾', label: 'Mammal' },
    reptile: { emoji: '🐍', label: 'Reptile' },
} as const;

const C = (cont: keyof typeof CONTINENTS, codes: string) =>
    Object.fromEntries(codes.split(' ').map((c) => [`c-${c}`, cont]));
const COUNTRY_CONTINENT: Record<string, keyof typeof CONTINENTS> = {
    ...C('africa', 'dz cd eg et ga ke ly mg mu ma na ng rw sc za tz ug'),
    ...C('asia', 'af bh bd bt bn cn ge in id ir il jp kz kw la my mv mn mm np pk ph qa sa sg kr lk th tr ae uz vn'),
    ...C('europe', 'at be hr cz dk ee fi fr de gr hu is ie it lu mt nl no pl pt ro ru si es se ch ua gb'),
    ...C('northAmerica', 'bs ca cr cu do jm mx pa us'),
    ...C('southAmerica', 'ar bo br cl co ec gy pe sr ve'),
    ...C('oceania', 'au fj nz pg'),
};

const A = (group: keyof typeof GROUPS, ids: string) =>
    Object.fromEntries(ids.split(' ').map((id) => [`a-${id}`, group]));
const ANIMAL_GROUP: Record<string, keyof typeof GROUPS> = {
    ...A('bird', 'bluebird chicken crow eagle emperor-penguin flamingo greylag-goose mallard-duck mute-swan parrot peacock pigeon snowy-owl wild-turkey'),
    ...A('sea', 'blue-whale bottlenose-dolphin box-jellyfish clownfish giant-pacific-octopus giant-squid great-white-shark harbour-seal humpback-whale lobster oyster pufferfish red-king-crab sailfish sea-otter shrimp'),
    ...A('insect', 'cockroach cricket earthworm garden-snail honeybee housefly ladybird leafcutter-ant monarch-butterfly mosquito rhinoceros-beetle scorpion tarantula'),
    ...A('reptile', 'gal-pagos-tortoise king-cobra komodo-dragon poison-dart-frog saltwater-crocodile'),
    ...A('mammal', 'african-elephant bactrian-camel beaver bison brown-bear brown-rat cat cheetah chimpanzee cow dog donkey dromedary-camel giant-panda giraffe goat gorilla grey-wolf hamster hedgehog hippo honey-badger horse house-mouse koala lion llama moose orangutan pig polar-bear rabbit raccoon red-deer red-fox red-kangaroo red-squirrel sheep skunk sloth tiger vampire-bat water-buffalo white-rhino wild-boar zebra'),
};

export const hintFor = (card: ClashCard | undefined): Hint | undefined => {
    if (!card) return undefined;
    const cont = COUNTRY_CONTINENT[card.id];
    if (cont) return CONTINENTS[cont];
    const group = ANIMAL_GROUP[card.id];
    return group ? GROUPS[group] : undefined;
};

export const HINT_KIND: Record<'countries' | 'animals', string> = {
    countries: 'continent',
    animals: 'animal group',
};
