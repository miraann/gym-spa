import { toLatinDigits } from './digits.ts';

// NFC cards (spec §1, decision 6): the card's UID is its identity, stored as uppercase hex without
// separators. The database reads UIDs the same way (app.normalize_card_uid in
// supabase/migrations/…_nfc_cards.sql); a test runs the same cases through both.

/** A stored UID: 4, 7 or 10 bytes (ISO 14443 single, double and triple size) in uppercase hex. */
export const CARD_UID_PATTERN = /^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/;

/**
 * active: the member's card. ended: no longer theirs; anyone may be given it. blocked: nobody may
 * use it or be given it until a manager unblocks it.
 */
export const CARD_STATUSES = ['active', 'ended', 'blocked'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/**
 * Why a card stopped being the member's. blocked: a manager blocked it while the member had it;
 * member_archived: the member was archived.
 */
export const CARD_END_REASONS = [
  'returned',
  'lost',
  'damaged',
  'stolen',
  'blocked',
  'member_archived',
] as const;
export type CardEndReason = (typeof CARD_END_REASONS)[number];

/** Why a card is replaced (replace_card). A stolen card is also blocked (cards.blacklist). */
export const CARD_REPLACE_REASONS = ['lost', 'damaged', 'stolen'] as const;
export type CardReplaceReason = (typeof CARD_REPLACE_REASONS)[number];

/** The longest reason for blocking a card (nfc_cards.block_reason). */
export const CARD_BLOCK_REASON_MAX_LENGTH = 300;

/**
 * The order a reader gives a UID's bytes in: normal (as the card sends them, like the ACR122U's
 * Get UID), or reversed (some keyboard-type readers).
 */
export type CardByteOrder = 'normal' | 'reversed';

/** Spaces and line ends around what a reader typed. */
const SURROUNDING_SPACE = /^[ \t\r\n]+|[ \t\r\n]+$/g;
/** Separators between the bytes: spaces, : or -. */
const SEPARATORS = /[ \t\r\n:-]/g;
const HEX_UID = /^(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{14}|[0-9A-Fa-f]{20})$/;
/** Exactly 10 digits: a 4-byte UID as a decimal number, as some readers type it. */
const DECIMAL_UID = /^[0-9]{10}$/;
/** Only 0 or only F bytes: what some readers give when a read fails. */
const EMPTY_UID = /^(?:0+|F+)$/;

/**
 * A UID as a reader or a person gives it, in the stored form, or null when it isn't one: hex with
 * or without separators (04:a2:3b:c1:5d:6e:80), or exactly 10 digits (a 4-byte decimal number).
 * With a reversed reader the bytes are turned around, so a card has one UID whichever reader read
 * it. Kurdish and Arabic digits count as 0-9.
 */
export function normalizeCardUid(
  input: string,
  byteOrder: CardByteOrder = 'normal',
): string | null {
  const typed = toLatinDigits(input).replace(SURROUNDING_SPACE, '');
  let uid: string;
  if (DECIMAL_UID.test(typed)) {
    const value = Number(typed);
    if (value > 0xffffffff) return null;
    uid = value.toString(16).toUpperCase().padStart(8, '0');
  } else {
    const hex = typed.replace(SEPARATORS, '');
    if (!HEX_UID.test(hex)) return null;
    uid = hex.toUpperCase();
  }
  if (EMPTY_UID.test(uid)) return null;
  return byteOrder === 'reversed' ? (uid.match(/../g) ?? []).reverse().join('') : uid;
}

/** A stored UID as people read it: its bytes apart (04 A2 3B C1 5D 6E 80). Always Latin and LTR. */
export function formatCardUid(uid: string): string {
  return (uid.match(/.{1,2}/g) ?? []).join(' ');
}
