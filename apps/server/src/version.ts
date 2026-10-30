import appPackage from '../../app/package.json' with { type: 'json' };

/**
 * The version of the whole offline edition: the server and every PC must run the same one (spec
 * §2.5). It is the gym app's version, which the Windows app shows too.
 */
export const SERVER_VERSION: string = appPackage.version;
