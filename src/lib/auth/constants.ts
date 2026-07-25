/**
 * Konstanten, die Server und Browser gemeinsam brauchen.
 *
 * Bewusst in einer eigenen Datei ohne node:crypto-Import: password.ts laesst
 * sich in Client-Komponenten nicht einbinden, diese Werte schon.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
