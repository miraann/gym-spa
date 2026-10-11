import type { Database } from '@gym/db';
import {
  DatabaseError,
  FORWARDED_HEADERS,
  authFailed,
  databaseFailed,
  projectTokenVerifier,
  supabaseAdminPort,
  type StaffAdminConfig,
  type TokenVerifier,
} from '@gym/staff-admin/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminChangePermit,
  RecoveryCodeAnswer,
  SellerAdminPort,
  SellerCallerPort,
} from './ports.ts';

// The ports on top of supabase-js: the same code in the Edge Function (Deno) and the tests (Node).

type Client = SupabaseClient<Database>;

/** An admin port with a client that holds the secret key. */
export function supabaseSellerAdminPort(client: Client): SellerAdminPort {
  return {
    ...supabaseAdminPort(client),
    async createAdminLogin({ email, password }) {
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        // Click Group's own address: confirmed by the platform admin who adds it.
        email_confirm: true,
        // platform_admin_orphan may free the address only for a login made here.
        app_metadata: { platform_admin: true },
      });
      if (error) throw authFailed(error);
      return data.user.id;
    },
    async findAdminOrphan(email) {
      const result = await client.rpc('platform_admin_orphan', { p_email: email });
      if (result.error) throw databaseFailed(result);
      const id: unknown = result.data;
      return typeof id === 'string' ? id : null;
    },
    async removeTwoStep(id) {
      const { data, error } = await client.auth.admin.mfa.listFactors({ userId: id });
      if (error) throw authFailed(error);
      for (const factor of data.factors) {
        const removed = await client.auth.admin.mfa.deleteFactor({ id: factor.id, userId: id });
        if (removed.error) throw authFailed(removed.error);
      }
    },
  };
}

const RECOVERY_ANSWERS: readonly RecoveryCodeAnswer[] = ['ok', 'wrong_code', 'too_many_attempts'];

function recoveryAnswer(data: unknown): RecoveryCodeAnswer {
  const result =
    typeof data === 'object' && data !== null && 'result' in data ? data.result : undefined;
  const answer = RECOVERY_ANSWERS.find((known) => known === result);
  if (answer === undefined) throw new DatabaseError('unexpected_answer', null, null);
  return answer;
}

/** A caller port with a client that sends the platform admin's own token. */
export function supabaseSellerCallerPort(client: Client): SellerCallerPort {
  return {
    async prepareCreateGym(code, ownerUsername) {
      const result = await client.rpc('seller_prepare_create_gym', {
        p_code: code,
        p_owner_username: ownerUsername,
      });
      if (result.error) throw databaseFailed(result);
    },
    async createGym(gym) {
      const result = await client.rpc('seller_create_gym', {
        p_gym_id: gym.gymId,
        p_code: gym.code,
        p_name_ckb: gym.nameCkb,
        p_first_branch_name: gym.firstBranchName,
        p_owner_id: gym.ownerId,
        p_owner_username: gym.ownerUsername,
        p_owner_full_name: gym.ownerFullName,
        ...(gym.paidUntil === null ? {} : { p_paid_until: gym.paidUntil }),
        ...(gym.nameEn === null ? {} : { p_name_en: gym.nameEn }),
        ...(gym.nameAr === null ? {} : { p_name_ar: gym.nameAr }),
        ...(gym.ownerPhone === null ? {} : { p_owner_phone: gym.ownerPhone }),
      });
      if (result.error) throw databaseFailed(result);
    },
    async prepareAddAdmin(email) {
      const result = await client.rpc('seller_prepare_add_admin', { p_email: email });
      if (result.error) throw databaseFailed(result);
    },
    async addAdmin(userId, fullName) {
      const result = await client.rpc('seller_add_admin', {
        p_user_id: userId,
        p_full_name: fullName,
      });
      if (result.error) throw databaseFailed(result);
    },
    async prepareAdminChange(userId, action): Promise<AdminChangePermit> {
      const result = await client
        .rpc('seller_prepare_admin_change', { p_user_id: userId, p_action: action })
        .single();
      if (result.error) throw databaseFailed(result);
      return { email: result.data.email, isActive: result.data.is_active };
    },
    async setAdminActive(userId, active) {
      const result = await client.rpc('seller_set_admin_active', {
        p_user_id: userId,
        p_active: active,
      });
      if (result.error) throw databaseFailed(result);
    },
    async recordAdminChange(userId, action) {
      const result = await client.rpc('seller_record_admin_change', {
        p_user_id: userId,
        p_action: action,
      });
      if (result.error) throw databaseFailed(result);
    },
    async useRecoveryCode(code) {
      const result = await client.rpc('seller_use_recovery_code', { p_code: code });
      if (result.error) throw databaseFailed(result);
      return recoveryAnswer(result.data);
    },
  };
}

/**
 * What the handler needs from the cloud project: its token check (the project's published keys),
 * and the two ports.
 */
export function supabaseSellerAdminPorts(config: StaffAdminConfig): {
  readonly verifyToken: TokenVerifier;
  readonly admin: SellerAdminPort;
  readonly callerFor: (token: string, request: Request) => SellerCallerPort;
} {
  const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const adminClient = createClient<Database>(config.url, config.secretKey, { auth: noSession });

  return {
    verifyToken: projectTokenVerifier(config.url),
    admin: supabaseSellerAdminPort(adminClient),
    callerFor(token, request) {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      // The seller log records the request's address (app.request_ip).
      for (const name of FORWARDED_HEADERS) {
        const value = request.headers.get(name);
        if (value !== null) headers[name] = value;
      }
      return supabaseSellerCallerPort(
        createClient<Database>(config.url, config.publishableKey, {
          auth: noSession,
          global: { headers },
        }),
      );
    },
  };
}
