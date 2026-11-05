// 🏛️ Race Before the Roof Falls: the places an expedition can go. Each has
// three doors, a catastrophe for each, and a treasure at the end.
export type RrfScenario = {
    id: string;
    name: string;
    story: string;
    doors: [string, string, string];
    dooms: [string, string, string];        // what happens when that door goes wrong
    treasure: string;
};

export const SCENARIOS: RrfScenario[] = [
    {
        id: 'temple',
        name: 'Temple of the Sleeping Sun',
        story: 'Deep in the jungle, a temple that has slept for 900 years. Three doors stand between you and the Sun King’s treasure. The walls are already shaking.',
        doors: ['The Gate', 'The Crossing', 'The Vault'],
        dooms: ['The ceiling is coming down!', 'The bridge is snapping!', 'The vault is filling with sand!'],
        treasure: 'the Sun King’s treasure',
    },
    {
        id: 'caves',
        name: 'Caves of the Whispering Tide',
        story: 'Sea caves that only open at low tide. Somewhere inside is the pearl crown of a pirate queen, and the water is already coming back.',
        doors: ['The Tide Gate', 'The Rope Bridge', 'The Pearl Vault'],
        dooms: ['The tide is rushing in!', 'The rope bridge is fraying!', 'The cave is flooding!'],
        treasure: 'the pearl crown',
    },
    {
        id: 'tomb',
        name: 'Tomb of the Sand Queen',
        story: 'A tomb under the dunes, sealed by a queen who hated visitors. Her golden mask is still in there, and so is a lot of sand.',
        doors: ['The Sand Door', 'The Scorpion Hall', 'The Queen’s Vault'],
        dooms: ['The roof is caving in!', 'The floor is cracking open!', 'The tomb is collapsing!'],
        treasure: 'the golden mask',
    },
    {
        id: 'stepwell',
        name: 'Stepwell of the Forgotten Prince',
        story: 'An ancient stepwell, a hundred carved steps down into the dark. A prince hid his jewels at the bottom, and the water is rising up the steps to meet you.',
        doors: ['The Water Gate', 'The Hundred Steps', 'The Prince’s Chamber'],
        dooms: ['The stepwell is flooding!', 'The steps are crumbling away!', 'The chamber walls are closing in!'],
        treasure: 'the prince’s jewels',
    },
    {
        id: 'forge',
        name: 'Forge of the Fire Mountain',
        story: 'A forge built inside a sleeping volcano by smiths nobody remembers. Their fire opal still glows in the vault, and the mountain is waking up.',
        doors: ['The Obsidian Gate', 'The Lava Bridge', 'The Forge Vault'],
        dooms: ['Lava is pouring in!', 'The bridge is melting!', 'The forge is erupting!'],
        treasure: 'the fire opal',
    },
];

export const scenarioById = (id: string): RrfScenario => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
