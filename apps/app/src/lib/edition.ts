// Which edition this build is (CLAUDE.md → Two editions). The offline edition is a separate Windows
// build (`pnpm desktop:exe:offline`, VITE_EDITION=offline) that talks to the gym's own server PC:
// it never asks for a gym code and hides what needs the internet.

export type Edition = 'online' | 'offline';

export function editionOf(value: string | undefined): Edition {
  return value === 'offline' ? 'offline' : 'online';
}

export const EDITION: Edition = editionOf(import.meta.env.VITE_EDITION);

/** The offline edition: no internet, the gym's server PC on the LAN. */
export const isOfflineEdition = EDITION === 'offline';
