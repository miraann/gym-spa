// The parts of the offline server, pinned (spec §8, step 1f). Postgres, PostgREST and Supabase Auth
// match what the cloud project runs (`supabase/.temp/*-version`, written by `supabase link`; a test
// compares them when the files exist), so the app and the migrations behave the same on both
// editions. Every download is checked against its SHA-256 before it is used.

export interface PinnedDownload {
  readonly version: string;
  readonly url: string;
  readonly sha256: string;
}

/** Postgres for Windows, the EDB binaries (the same release the cloud runs: 17.11). */
export const POSTGRES: PinnedDownload = {
  version: '17.11-2',
  url: 'https://get.enterprisedb.com/postgresql/postgresql-17.11-2-windows-x64-binaries.zip',
  sha256: '2f868d77832f5cbc62182a0ca57f02df14d33d85ce0d0bbaaeb0de3a7029bd2b',
};

/** PostgREST's official Windows build (GitHub's digest of the release file). */
export const POSTGREST: PinnedDownload = {
  version: 'v14.18',
  url: 'https://github.com/PostgREST/postgrest/releases/download/v14.18/postgrest-v14.18-windows-x86-64.zip',
  sha256: 'f24ca175b34d1ec0f3fc6d4c778f279f70577f6b3784b19aaa321e22bc3959b9',
};

/**
 * Supabase Auth, built from source: upstream publishes Linux and macOS builds only, and v2.197.0
 * needs `auth/auth-windows.patch` to compile for Windows (SO_REUSEPORT is Linux-only).
 */
export const AUTH = {
  version: 'v2.197.0',
  repository: 'https://github.com/supabase/auth.git',
  /** The tag's commit: a moved tag is refused. */
  commit: '4eee58f296d9698a1c2c0ae14d7a0b379c7622d3',
} as const;

/** Go, only to build Auth (go.dev's published SHA-256). */
export const GO: PinnedDownload = {
  version: '1.27.2',
  url: 'https://go.dev/dl/go1.27.2.windows-amd64.zip',
  sha256: '1314008898bd40df77af4b014f777f08873dbdfbcd3d92308728ee03304fe04f',
};

/**
 * pgTAP for `pnpm test:offline` only (never shipped): the files the local Supabase image has, so
 * the tests run on exactly the same pgTAP as `pnpm db:test`.
 */
export const PGTAP = {
  version: '1.3.3',
  files: {
    'pgtap--1.3.3.sql': '39271af1e7720279d92d311979f0c2080bc33bb7f0eb9c5d087dc04df180f772',
    'pgtap.control': '5f48bd23600a9a57bc90fb701b99265643aab1a2247ad4c888d05cc049efd681',
  },
} as const;

/** The versions the cloud reports, as `supabase link` writes them (`supabase/.temp`). */
export const CLOUD_VERSION_FILES = {
  postgres: 'postgres-version',
  postgrest: 'rest-version',
  auth: 'gotrue-version',
} as const;

/** Node.js, official and signed by the OpenJS Foundation: runs gym-server on the server PC. */
export const NODE: PinnedDownload = {
  version: 'v24.20.0',
  url: 'https://nodejs.org/dist/v24.20.0/node-v24.20.0-win-x64.zip',
  sha256: '6cac9ffbca8f6a47091e4b5c772e0606049c3871cb67d900c0cedde630e545ba',
};

/**
 * WinSW, which runs gym-server as the Windows service GymSpaServer (MIT; the self-contained x64
 * build, which needs no .NET). GitHub gives no digest for this release: the SHA-256 is that of the
 * file downloaded on 2026-10-30, whose size matches the release (18,243,033 bytes). Not signed.
 */
export const WINSW: PinnedDownload = {
  version: 'v2.12.0',
  url: 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe',
  sha256: '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da',
};
