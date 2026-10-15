import type { QuizQuestion } from '../types';

// nature — plants, weather, rocks, the Earth itself. Animals live in animals.ts.
export const natureQuestions: QuizQuestion[] = [
    {
        id: 'q116',
        difficulty: 'easy',
        category: 'nature',
        prompt: '[NOT_A] part of a plant?',
        correctPool: ['Root', 'Stem', 'Leaf', 'Petal', 'Seed'],
        wrongPool: ['Fur', 'Scale', 'Fin', 'Feather'],
    },
    {
        id: 'q117',
        difficulty: 'medium',
        category: 'nature',
        prompt: '[NOT_A] type of cloud?',
        correctPool: ['Cumulus', 'Cirrus', 'Stratus', 'Cumulonimbus'],
        wrongPool: ['Tsunami', 'Avalanche', 'Earthquake', 'Hurricane'],
    },
    {
        id: 'q287',
        difficulty: 'hard',
        category: 'nature',
        prompt: 'The tallest plants in the grass family are?',
        correctPool: ['Bamboo'],
        wrongPool: ['Sugarcane', 'Elephant grass', 'Maize', 'Pampas grass'],
    },
    {
        id: 'q291',
        difficulty: 'medium',
        category: 'nature',
        prompt: 'Which tree produces acorns?',
        correctPool: ['Oak'],
        wrongPool: ['Maple', 'Beech', 'Chestnut', 'Elm'],
    },
    {
        id: 'q495',
        difficulty: 'easy',
        category: 'nature',
        prompt: '[NOT_A] type of tree?',
        correctPool: ['Oak', 'Pine', 'Maple', 'Banyan', 'Neem', 'Teak'],
        wrongPool: ['Moss', 'Tulip', 'Rose', 'Lotus', 'Sunflower'],
    },
    {
        id: 'q496',
        difficulty: 'easy',
        category: 'nature',
        prompt: '[NOT_A] natural disaster?',
        correctPool: ['Earthquake', 'Tsunami', 'Volcanic eruption', 'Cyclone', 'Landslide', 'Flood'],
        wrongPool: ['Eclipse', 'Rainbow', 'Aurora', 'Tide', 'Sunset'],
    },
    {
        id: 'q497',
        difficulty: 'medium',
        category: 'nature',
        prompt: '[NOT_A] rock?',
        correctPool: ['Granite', 'Basalt', 'Marble', 'Limestone', 'Sandstone', 'Slate'],
        wrongPool: ['Amber', 'Pearl', 'Ivory', 'Bronze', 'Steel'],
    },
    {
        id: 'q498',
        difficulty: 'medium',
        category: 'nature',
        prompt: '[NOT_A] layer of Earth\'s atmosphere?',
        correctPool: ['Troposphere', 'Stratosphere', 'Mesosphere', 'Thermosphere', 'Exosphere'],
        wrongPool: ['Lithosphere', 'Hydrosphere', 'Biosphere', 'Asthenosphere', 'Mantle'],
    },
];