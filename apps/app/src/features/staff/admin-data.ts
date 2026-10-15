import type { Database } from '@gym/db';
import type { LocalizedNames } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthController, useAuthState } from '@/features/auth/auth-context';
import type { AppSupabaseClient } from '@/lib/backend';
import {
  createStaffAccount,
  deactivateStaffAccount,
  reactivateStaffAccount,
  renameStaffAccount,
  resetStaffPassword,
} from './staff-admin-api';

// The admin screens' server calls (staff, roles, branches), each with the acting staff member's
// own session: RLS and the database functions decide what they see and may change. The query keys
// include who is acting, so a PIN switch never shows another staff member's view from the cache.

const STAFF_QUERY = 'staff-directory';
const ROLES_QUERY = 'role-overview';
const BRANCHES_QUERY = 'admin-branches';

type Functions = Database['public']['Functions'];

/** A staff member as the staff list shows them (public.staff_directory()). */
export interface StaffMember {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly roleId: string;
  readonly allBranches: boolean;
  /** Their branches that the viewer can access. */
  readonly branchIds: readonly string[];
  /** Their branches that the viewer can't access (not named). */
  readonly hiddenBranchCount: number;
  readonly isActive: boolean;
  readonly mustChangePassword: boolean;
  readonly hasPin: boolean;
  readonly pinLocked: boolean;
  readonly lastLoginAt: string | null;
  /** Whether the viewer may change them, by the server's own rule. */
  readonly canManage: boolean;
}

/** A role as the roles screen shows it (public.role_overview()). */
export interface RoleInfo extends LocalizedNames {
  readonly id: string;
  /** Built-in roles only (owner, receptionist, ...). */
  readonly key: string | null;
  readonly isSystem: boolean;
  /** Every permission it gives (the Owner: all of them). */
  readonly permissionKeys: readonly string[];
  readonly staffCount: number;
  readonly isOwnRole: boolean;
  readonly canEdit: boolean;
  readonly canEditPermissions: boolean;
  readonly canGrant: boolean;
}

/** A branch of the gym that the acting staff member can access. */
export interface AdminBranch extends LocalizedNames {
  readonly id: string;
  readonly code: string;
  readonly isActive: boolean;
}

type StaffDirectoryRow = Functions['staff_directory']['Returns'][number];
type RoleOverviewRow = Functions['role_overview']['Returns'][number];

/** The generated types call every returned column non-null; these can be null. */
function toStaffMember(row: StaffDirectoryRow): StaffMember {
  const nullable = row as Omit<StaffDirectoryRow, 'phone' | 'last_login_at'> & {
    phone: string | null;
    last_login_at: string | null;
  };
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    phone: nullable.phone,
    roleId: row.role_id,
    allBranches: row.all_branches,
    branchIds: row.branch_ids,
    hiddenBranchCount: row.hidden_branch_count,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    hasPin: row.has_pin,
    pinLocked: row.pin_locked,
    lastLoginAt: nullable.last_login_at,
    canManage: row.can_manage,
  };
}

function toRoleInfo(row: RoleOverviewRow): RoleInfo {
  const nullable = row as Omit<RoleOverviewRow, 'key' | 'name_en' | 'name_ar'> & {
    key: string | null;
    name_en: string | null;
    name_ar: string | null;
  };
  return {
    id: row.id,
    key: nullable.key,
    nameCkb: row.name_ckb,
    nameEn: nullable.name_en,
    nameAr: nullable.name_ar,
    isSystem: row.is_system,
    permissionKeys: row.permission_keys,
    staffCount: row.staff_count,
    isOwnRole: row.is_own_role,
    canEdit: row.can_edit,
    canEditPermissions: row.can_edit_permissions,
    canGrant: row.can_grant,
  };
}

/** Branch codes in number order (B2 before B10). */
function byCode(a: { code: string }, b: { code: string }): number {
  return Number(a.code.slice(1)) - Number(b.code.slice(1));
}

/** The acting staff member's client; undefined while the app is locked. */
function useActingClient(): { client: AppSupabaseClient | undefined; actor: string | null } {
  const controller = useAuthController();
  const { activeId } = useAuthState();
  return { client: activeId ? controller.activeClient : undefined, actor: activeId };
}

function requireClient(client: AppSupabaseClient | undefined): AppSupabaseClient {
  // Locked or signed out: like a lost connection, nothing is sent.
  if (!client) throw new TypeError('Failed to fetch');
  return client;
}

export function useStaffDirectory() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [STAFF_QUERY, actor],
    enabled: client !== undefined,
    queryFn: async () => {
      const { data, error } = await requireClient(client).rpc('staff_directory');
      if (error) throw error;
      return data.map(toStaffMember);
    },
  });
}

export function useRoleOverview() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [ROLES_QUERY, actor],
    enabled: client !== undefined,
    queryFn: async () => {
      const { data, error } = await requireClient(client).rpc('role_overview');
      if (error) throw error;
      return data.map(toRoleInfo);
    },
  });
}

/** The branches the acting staff member can access, active or not (never removed ones). */
export function useAdminBranches() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [BRANCHES_QUERY, actor],
    enabled: client !== undefined,
    queryFn: async (): Promise<AdminBranch[]> => {
      const { data, error } = await requireClient(client)
        .from('branches')
        .select('id, code, name_ckb, name_en, name_ar, is_active')
        .is('deleted_at', null);
      if (error) throw error;
      return data
        .map((row) => ({
          id: row.id,
          code: row.code,
          nameCkb: row.name_ckb,
          nameEn: row.name_en,
          nameAr: row.name_ar,
          isActive: row.is_active,
        }))
        .sort(byCode);
    },
  });
}

/** After a change, the lists read the server again. */
function useRefreshAdminLists() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [STAFF_QUERY, ROLES_QUERY].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
}

// Staff -----------------------------------------------------------------------------------------

export interface StaffAccess {
  readonly fullName: string;
  /** Empty: no phone. */
  readonly phone: string;
  readonly roleId: string;
  readonly allBranches: boolean;
  readonly branchIds: readonly string[];
}

/** A new staff account (staff module); the answer holds its temporary password, shown once. */
export function useCreateStaff() {
  const { client } = useActingClient();
  const refresh = useRefreshAdminLists();
  return useMutation({
    mutationFn: (account: StaffAccess & { readonly username: string }) =>
      createStaffAccount(requireClient(client), {
        username: account.username,
        fullName: account.fullName,
        phone: account.phone === '' ? null : account.phone,
        roleId: account.roleId,
        allBranches: account.allBranches,
        branchIds: account.allBranches ? [] : [...account.branchIds],
      }),
    onSettled: refresh,
  });
}

/** Name, phone, role and branches, in one all-or-nothing call (save_staff_access). */
export function useSaveStaffAccess() {
  const { client } = useActingClient();
  const refresh = useRefreshAdminLists();
  return useMutation({
    mutationFn: async ({ staffId, access }: { staffId: string; access: StaffAccess }) => {
      const { error } = await requireClient(client).rpc('save_staff_access', {
        p_staff_id: staffId,
        p_full_name: access.fullName,
        p_role_id: access.roleId,
        p_all_branches: access.allBranches,
        p_branch_ids: access.allBranches ? [] : [...access.branchIds],
        ...(access.phone === '' ? {} : { p_phone: access.phone }),
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

/** What the staff detail page can do to a login through the staff module, or to a PIN. */
export type StaffAction = 'reset_password' | 'reset_pin' | 'deactivate' | 'reactivate';

/**
 * One of the actions on a staff member. A password reset answers with the new temporary password
 * (shown once); the others with nothing.
 */
export function useStaffAction() {
  const { client } = useActingClient();
  const refresh = useRefreshAdminLists();
  return useMutation({
    mutationFn: async ({
      staffId,
      action,
    }: {
      staffId: string;
      action: StaffAction;
    }): Promise<string | null> => {
      const acting = requireClient(client);
      switch (action) {
        case 'reset_password':
          return (await resetStaffPassword(acting, staffId)).temporaryPassword;
        case 'reset_pin': {
          const { error } = await acting.rpc('reset_staff_pin', { p_staff_id: staffId });
          if (error) throw error;
          return null;
        }
        case 'deactivate':
          await deactivateStaffAccount(acting, staffId);
          return null;
        case 'reactivate':
          await reactivateStaffAccount(acting, staffId);
          return null;
      }
    },
    onSettled: refresh,
  });
}

/** A new username; the password, PIN and sessions stay. */
export function useRenameStaff() {
  const { client } = useActingClient();
  const refresh = useRefreshAdminLists();
  return useMutation({
    mutationFn: ({ staffId, username }: { staffId: string; username: string }) =>
      renameStaffAccount(requireClient(client), staffId, username),
    onSettled: refresh,
  });
}

// Roles -----------------------------------------------------------------------------------------

export interface RoleDraft extends LocalizedNames {
  /** null keeps the role's permissions (the Owner role always: it has them all). */
  readonly permissionKeys: readonly string[] | null;
}

/** Creates a custom role (id made here) or changes one: names and permissions together. */
export function useSaveRole() {
  const { client } = useActingClient();
  const refresh = useRefreshAdminLists();
  return useMutation({
    mutationFn: async ({ roleId, draft }: { roleId: string; draft: RoleDraft }) => {
      const { error } = await requireClient(client).rpc('save_role', {
        p_role_id: roleId,
        p_name_ckb: draft.nameCkb,
        // Left out means null (the parameters' default): no name in that language.
        ...(draft.nameEn ? { p_name_en: draft.nameEn } : {}),
        ...(draft.nameAr ? { p_name_ar: draft.nameAr } : {}),
        ...(draft.permissionKeys ? { p_permission_keys: [...draft.permissionKeys] } : {}),
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

/** Deletes a custom role nobody has (the guard refuses otherwise: role_in_use). */
export function useDeleteRole() {
  const { client } = useActingClient();
  const refresh = useRefreshAdminLists();
  return useMutation({
    mutationFn: async (roleId: string) => {
      const { data, error } = await requireClient(client)
        .from('roles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', roleId)
        .select('id');
      if (error) throw error;
      // RLS hides a role the caller may not change: nothing was updated.
      if (data.length === 0) throw Object.assign(new Error('permission_denied'), { code: '42501' });
    },
    onSettled: refresh,
  });
}
