// src/shared/config/invite.ts
// Invite links. Everyone gets a normal web link (works in WhatsApp, SMS,
// any camera): it opens the app if it's installed, and otherwise a small
// page on Firebase Hosting with the code and the store buttons.
// The page lives in /hosting (deploy: `firebase deploy --only hosting`).

export const INVITE_HOST = "imposter-game-a588f.web.app";
export const APP_SCHEME = "wgawpt";

export const inviteUrl = (code: string) => `https://${INVITE_HOST}/join/${code.toUpperCase()}`;

export const inviteMessage = (code: string, hostName?: string) =>
    `🎉 ${hostName ? `${hostName} invited you` : "You're invited"} to play party games!\n\n` +
    `Tap to join: ${inviteUrl(code)}\n\n` +
    `Already have the app? Open it and enter code ${code.toUpperCase()}`;
