/**
 * The section tones (theme.css, step D-4): each part of the app has its own fixed color on the
 * dashboard's tiles and the icon tiles. Never the brand, never a status hue. The classes are
 * written out whole so Tailwind finds them.
 */
export type Tone = 'blue' | 'pink' | 'indigo' | 'cyan' | 'violet';

export const TONE_CLASSES: Readonly<
  Record<Tone, { readonly soft: string; readonly fill: string; readonly text: string }>
> = {
  blue: { soft: 'bg-tone-blue/8 ring-tone-blue/20', fill: 'bg-tone-blue', text: 'text-tone-blue' },
  pink: { soft: 'bg-tone-pink/8 ring-tone-pink/20', fill: 'bg-tone-pink', text: 'text-tone-pink' },
  indigo: {
    soft: 'bg-tone-indigo/8 ring-tone-indigo/20',
    fill: 'bg-tone-indigo',
    text: 'text-tone-indigo',
  },
  cyan: { soft: 'bg-tone-cyan/8 ring-tone-cyan/20', fill: 'bg-tone-cyan', text: 'text-tone-cyan' },
  violet: {
    soft: 'bg-tone-violet/8 ring-tone-violet/20',
    fill: 'bg-tone-violet',
    text: 'text-tone-violet',
  },
};
