import type { IncomingHttpHeaders } from 'node:http';
import { projectTokenVerifier } from '@gym/staff-admin/server';
import { queryAsync, type Database } from './database.ts';

// Who on the server PC may use the server's own settings (/server/v1/admin/*; the gateway already
// refused every other PC). The app on the server PC reaches them through the same loopback address
// as an administrator's command line, so the request itself has to say who it is:
//   - the server's secret key: gym-server-admin, run by someone who can read the data folder
//     (only the server's account and Administrators can);
//   - nobody yet, while the gym has no staff: the first setup (license, first Owner);
//   - otherwise a staff session (bearer token) with server.manage (restoring a backup:
//     backups.restore), checked in the database.

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export const SERVER_MANAGE = 'server.manage';

/** The permission each of the server's settings needs. */
export function permissionFor(name: string): string {
  return name === 'backups-restore' ? 'backups.restore' : SERVER_MANAGE;
}

export function adminAccess(
  db: Database,
  url: string,
): (headers: IncomingHttpHeaders, name: string) => Promise<boolean> {
  const verify = projectTokenVerifier(url);
  return async (headers, name) => {
    const apikey = header(headers, 'apikey');
    const bearer = /^Bearer\s+(\S+)$/i.exec(header(headers, 'authorization') ?? '')?.[1];
    if (apikey === db.secrets.secretKey || bearer === db.secrets.secretKey) return true;
    const staff = await queryAsync(db, 'select count(*) from public.staff_users');
    if (staff[0] === '0') return true;
    if (bearer === undefined) return false;
    const check = await verify(bearer);
    if (!check.ok) return false;
    const rows = await queryAsync(
      db,
      `begin;
       select set_config('request.jwt.claims',
         json_build_object('sub', :'user_id', 'role', 'authenticated')::text, true) is null;
       select app.has_permission(:'permission');
       commit;`,
      { variables: { user_id: check.userId, permission: permissionFor(name) } },
    );
    return rows.at(-1) === 't';
  };
}
