// ⚖️ Court of Thieves look: a blackout at a party. Night purple when the
// lights are out, night-vision green on the Thief's phone, warm lamp-light
// when they come back on. Each seat has its own colour (gloves, footprints).
export const CT = {
    bg: '#16122B',
    bgDeep: '#0B0A18',
    panel: '#241D45',
    panelHi: '#2E2657',
    line: '#3A3168',
    text: '#F2EFFF',
    textMuted: '#B7B2D6',
    textDim: '#8C86AE',
    gold: '#FFD66B',
    goldDeep: '#C9A23A',
    ink: '#1A1733',
    good: '#46D17F',
    bad: '#FF6B6B',
    // the Thief's night vision
    nv: '#0F2A26',
    nvPanel: '#1C4A42',
    nvLine: '#2E6B60',
    nvRug: '#16413A',
    nvText: '#EAF7F2',
    nvMuted: '#9CC9BD',
    // lights on
    lit: '#FFF6E3',
    litRug: '#F4E2C2',
    litRugLine: '#E2C795',
    litText: '#2A2440',
    litMuted: '#5F587A',
    litCard: '#FFFFFF',
    litLine: '#EFDDB8',
    litBad: '#B23A24',
    litGood: '#1F7A52',
    // the dark room
    darkRug: '#2A2850',
    darkLine: '#4A4680',
    // bags
    bag: '#C9925A',
    bagLine: '#A9733F',
    bagHandle: '#E9C38A',
};

// One colour per seat, in seating order.
export const SEAT_COLORS = ['#FF7A6B', '#3CC8B4', '#A98BFF', '#FFB547', '#5AB0FF', '#7BD66B', '#FF8BD1', '#E9E3A0', '#C7A27C', '#9AD7FF'];
export const seatColor = (seats: string[], id: string): string => SEAT_COLORS[Math.max(0, seats.indexOf(id)) % SEAT_COLORS.length];

export const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;
