// The deal phase's messages. Every player sees the same list, whatever
// their role, so the screen never gives anyone away: a Citizen can bluff
// "I'll get you off" just as well as the Advocate can mean it.
//
// offer: 'hush'   = the sender pays (recipient: take it now / on acquittal / refuse)
//        'demand' = the recipient pays (pay / refuse)
//        'reveal' = the sender pays ₹500; if accepted they learn who the recipient is
import type { CotOfferKind } from '../../../shared/types';

export type CotTemplate = {
    id: string;
    group: 'offer' | 'tip' | 'talk';
    text: string;                      // {amount} and {player} are filled in
    amount?: 'pick' | 'fixed';
    about?: boolean;                   // names a player
    offer?: CotOfferKind;
    suggest?: number;                  // starting amount in the picker
};

export const TEMPLATES: CotTemplate[] = [
    // 💰 offers
    { id: 'hush', group: 'offer', text: 'Stay quiet and get ₹{amount}.', amount: 'pick', offer: 'hush', suggest: 800 },
    { id: 'getoff', group: 'offer', text: "I'll get you off for ₹{amount}.", amount: 'pick', offer: 'demand', suggest: 1000 },
    { id: 'reveal', group: 'offer', text: "I'll pay ₹500 to know who you are.", amount: 'fixed', offer: 'reveal' },
    { id: 'sawpay', group: 'offer', text: 'I saw you. Pay me ₹{amount} or I talk.', amount: 'pick', offer: 'demand', suggest: 1000 },
    { id: 'drop', group: 'offer', text: "I'll drop the case for ₹{amount}.", amount: 'pick', offer: 'demand', suggest: 1500 },
    { id: 'acquit', group: 'offer', text: 'Acquit me and get ₹{amount}.', amount: 'pick', offer: 'hush', suggest: 1500 },
    { id: 'sell', group: 'offer', text: "I'll sell what I know for ₹{amount}.", amount: 'pick', offer: 'demand', suggest: 800 },
    { id: 'gift', group: 'offer', text: "Here's ₹{amount}. Keep this between us.", amount: 'pick', offer: 'hush', suggest: 500 },
    // 🔎 tips
    { id: 'sawnear', group: 'tip', text: 'I saw {player} near a purse.', about: true },
    { id: 'watch', group: 'tip', text: 'Watch {player}.', about: true },
    { id: 'innocent', group: 'tip', text: '{player} is innocent.', about: true },
    { id: 'itwas', group: 'tip', text: 'It was {player}. I saw the glove.', about: true },
    { id: 'framed', group: 'tip', text: 'I was framed. Money appeared in my bag.' },
    // 💬 talk
    { id: 'know', group: 'talk', text: 'I know who you are.' },
    { id: 'witnessme', group: 'talk', text: "I'm the one who saw you." },
    { id: 'where', group: 'talk', text: 'Where were you during the outage?' },
    { id: 'reason', group: 'talk', text: 'Give me a reason to believe you.' },
    { id: 'talk', group: 'talk', text: "Let's talk." },
    { id: 'in', group: 'talk', text: "Deal. I'm in." },
    { id: 'nodeal', group: 'talk', text: 'No deal.' },
    { id: 'distrust', group: 'talk', text: "I don't trust you." },
];

export const templateById = (id: string): CotTemplate | undefined => TEMPLATES.find((t) => t.id === id);

export const fillTemplate = (id: string, amount?: number, playerName?: string): string => {
    const t = templateById(id);
    if (!t) return '…';
    return t.text
        .replace('{amount}', (amount ?? 0).toLocaleString('en-IN'))
        .replace('{player}', playerName ?? 'someone');
};
