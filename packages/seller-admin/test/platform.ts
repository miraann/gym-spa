import type { Database } from '@gym/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Backend } from '../../staff-admin/test/fixture.ts';

// Platform admins in a real Supabase (the local one), for the seller module's integration tests:
// Node (seller-admin.int.test.ts) and Deno (supabase/functions/seller-admin/http.test.ts). No Node
// or Deno APIs here, so both can use it; removing admins needs SQL, which each runtime passes in.

type Client = SupabaseClient<Database>;

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

// TOTP (RFC 6238), as an authenticator app computes it: HMAC-SHA1 over 30-second steps, 6 digits.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** The secret's bytes (an ArrayBuffer: the same type in Node's and Deno's TypeScript). */
function base32Bytes(secret: string): ArrayBuffer {
  let bits = '';
  for (const character of secret.replace(/=+$/, '').toUpperCase()) {
    const value = BASE32.indexOf(character);
    if (value < 0) throw new Error('Not a base32 secret');
    bits += value.toString(2).padStart(5, '0');
  }
  const buffer = new ArrayBuffer(Math.floor(bits.length / 8));
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  }
  return buffer;
}

/** The 6-digit code an authenticator app shows for this secret at this time. */
export async function totpCode(secret: string, at: number = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    base32Bytes(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const counter = new DataView(new ArrayBuffer(8));
  counter.setBigUint64(0, BigInt(Math.floor(at / 1000 / 30)));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter.buffer));
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const value =
    (((mac[offset] ?? 0) & 0x7f) << 24) |
    ((mac[offset + 1] ?? 0) << 16) |
    ((mac[offset + 2] ?? 0) << 8) |
    (mac[offset + 3] ?? 0);
  return String(value % 1_000_000).padStart(6, '0');
}

export interface TwoStepSession {
  readonly client: Client;
  readonly accessToken: string;
  readonly refreshToken: string;
}

/** A supabase-js result that worked. */
type Success<R> = Extract<R, { error: null }>;

/** Throws on an error, returns the data. */
async function must<R extends { data: unknown; error: { message: string; code?: string } | null }>(
  promise: PromiseLike<R>,
): Promise<Success<R>['data']> {
  const result = await promise;
  if (result.error) {
    throw new Error(`${result.error.code ?? ''} ${result.error.message}`.trim());
  }
  return (result as Success<R>).data;
}

/**
 * A Click Group platform admin, made the way `pnpm bootstrap:platform-admin` makes one. With
 * ready(), they have chosen their own password and set up two-step login, like after their first
 * login in the panel.
 */
export class TestPlatformAdmin {
  /** The authenticator app's secret, once two-step login is set up. */
  secret: string | null = null;
  private constructor(
    private readonly backend: Backend,
    readonly id: string,
    readonly email: string,
    public password: string,
  ) {}

  static async create(backend: Backend, label: string): Promise<TestPlatformAdmin> {
    const admin = createClient<Database>(backend.url, backend.secretKey, { auth: NO_SESSION });
    const email = `${label}-${crypto.randomUUID().slice(0, 8)}@clickgroup.example`;
    const password = `Temp-${crypto.randomUUID()}`;
    const created = await must(
      admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { platform_admin: true },
      }),
    );
    await must(
      admin.rpc('platform_script_add_admin', {
        p_user_id: created.user.id,
        p_full_name: `بەڕێوەبەری ${label}`,
      }),
    );
    return new TestPlatformAdmin(backend, created.user.id, email, password);
  }

  /** A platform admin made some other way (e.g. by the seller-admin endpoint). */
  static adopt(backend: Backend, id: string, email: string, password: string): TestPlatformAdmin {
    return new TestPlatformAdmin(backend, id, email, password);
  }

  /** A logged-in client after the password (aal1). */
  async signIn(password: string = this.password): Promise<Client> {
    const client = createClient<Database>(this.backend.url, this.backend.publishableKey, {
      auth: NO_SESSION,
    });
    await must(client.auth.signInWithPassword({ email: this.email, password }));
    return client;
  }

  /** Their own password, then two-step login set up: what the panel makes them do first. */
  async ready(): Promise<TwoStepSession> {
    const client = await this.signIn();
    this.password = `Own-${crypto.randomUUID()}`;
    await must(client.auth.updateUser({ password: this.password }));
    return this.setUpTwoStep(client);
  }

  /** Sets up a new two-step device on a logged-in client and returns the aal2 session. */
  async setUpTwoStep(client: Client): Promise<TwoStepSession> {
    const factor = await must(client.auth.mfa.enroll({ factorType: 'totp' }));
    this.secret = factor.totp.secret;
    return this.verify(client, factor.id);
  }

  /** A full login: password, then the code from the authenticator app (aal2). */
  async signInWithTwoStep(): Promise<TwoStepSession> {
    const client = await this.signIn();
    const factors = await must(client.auth.mfa.listFactors());
    const factor = factors.totp[0];
    if (!factor) throw new Error('No two-step device');
    return this.verify(client, factor.id);
  }

  private async verify(client: Client, factorId: string): Promise<TwoStepSession> {
    if (this.secret === null) throw new Error('No authenticator secret');
    const session = await must(
      client.auth.mfa.challengeAndVerify({ factorId, code: await totpCode(this.secret) }),
    );
    return { client, accessToken: session.access_token, refreshToken: session.refresh_token };
  }
}

/** SQL that removes test platform admins, which no API may delete (accounts are only deactivated). */
export function removePlatformAdminsSql(ids: readonly string[]): string {
  const list = ids.map((id) => `'${id.replace(/[^0-9a-f-]/g, '')}'`).join(', ');
  if (list === '') return '';
  return `
    delete from platform.recovery_codes where admin_id in (${list});
    delete from platform.admins where user_id in (${list});
    delete from auth.users where id in (${list});
  `;
}
