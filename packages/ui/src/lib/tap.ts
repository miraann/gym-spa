/**
 * The tap effect of a card that opens something (step D-5e): it grows a little under the mouse and
 * shrinks a little when pressed, only for people who haven't asked for less motion. Buttons keep
 * their own press and never grow: growing text shimmers on the reception PCs and moves buttons in
 * dense tables. Written out whole so Tailwind finds the classes.
 */
export const TAP_CARD =
  'transition-[scale,box-shadow] duration-200 ease-spring motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.97]';

/** TAP_CARD for a grid list's card, which is a card only in the grid (blocks/list-group.tsx). */
export const TAP_GRID_CARD =
  '@2xl/list:transition-[scale,box-shadow] @2xl/list:ease-spring @2xl/list:motion-safe:hover:scale-[1.02] @2xl/list:motion-safe:active:scale-[0.97]';
