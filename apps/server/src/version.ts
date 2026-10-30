import appPackage from '../../app/package.json' with { type: 'json' };

/**
 * The version of the whole offline edition: the server and every PC must run the same one (spec
 * §2.5). It is the gym app's version, which the Windows app shows too.
 */
export const SERVER_VERSION: string = appPackage.version;

/**
 * The day this build was made (YYYY-MM-DD), written into the bundle by `pnpm server:bundle`; null
 * when run from source. A perpetual license's "updates until" is compared with it (spec §2.6).
 */
export const SERVER_BUILD_DATE: string | null = process.env.GYM_SERVER_BUILD_DATE ?? null;
