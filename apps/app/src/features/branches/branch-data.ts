import {
  BRANCH_ADDRESS_MAX_LENGTH,
  BRANCH_NAME_MAX_LENGTH,
  isCleanText,
  isValidPhone,
  normalizeName,
  normalizePhone,
} from '@gym/core';
import type { LocalizedNames } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  BRANCHES_QUERY,
  LIMITS_QUERY,
  byCode,
  requireClient,
  useActingClient,
} from '@/features/staff/admin-data';

// The branches screen's server calls (branches.manage and all branches for changes): every branch
// of the gym the acting staff member can see, adding one (create_branch gives its code), changing
// it, and deactivating or reactivating it. The database refuses the last active branch
// (last_active_branch) and goes over no limit (gym_branch_limit).

const BRANCH_DETAILS_QUERY = 'branch-details';

export interface BranchDetails extends LocalizedNames {
  readonly id: string;
  readonly code: string;
  readonly phone: string | null;
  readonly address: string | null;
  readonly isActive: boolean;
}

export function useBranchDetails() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [BRANCH_DETAILS_QUERY, actor],
    enabled: client !== undefined,
    queryFn: async (): Promise<BranchDetails[]> => {
      const { data, error } = await requireClient(client)
        .from('branches')
        .select('id, code, name_ckb, name_en, name_ar, phone, address, is_active')
        .is('deleted_at', null);
      if (error) throw error;
      return data
        .map((row) => ({
          id: row.id,
          code: row.code,
          nameCkb: row.name_ckb,
          nameEn: row.name_en,
          nameAr: row.name_ar,
          phone: row.phone,
          address: row.address,
          isActive: row.is_active,
        }))
        .sort(byCode);
    },
  });
}

/** After a change: the branch lists everywhere, and the counts against the gym's limits. */
function useRefreshBranches() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [BRANCH_DETAILS_QUERY, BRANCHES_QUERY, LIMITS_QUERY].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

// Messages are keys of branches:form.errors.
const optionalName = z
  .string()
  .transform(normalizeName)
  .refine((value) => value === '' || isCleanText(value, BRANCH_NAME_MAX_LENGTH), 'name');

export const branchSchema = z.object({
  nameCkb: z
    .string()
    .transform(normalizeName)
    .refine((value) => isCleanText(value, BRANCH_NAME_MAX_LENGTH), 'nameRequired'),
  nameEn: optionalName,
  nameAr: optionalName,
  phone: z
    .string()
    .transform(normalizePhone)
    .refine((value) => value === '' || isValidPhone(value), 'phone'),
  address: z
    .string()
    .transform(normalizeName)
    .refine((value) => value === '' || isCleanText(value, BRANCH_ADDRESS_MAX_LENGTH), 'address'),
});

export type BranchInput = z.input<typeof branchSchema>;
export type BranchValues = z.output<typeof branchSchema>;

/** Empty text is stored as no value. */
const orNull = (value: string) => (value === '' ? null : value);

/** Adds a branch (its id made here; the server gives the code) or changes one. */
export function useSaveBranch() {
  const { client } = useActingClient();
  const refresh = useRefreshBranches();
  return useMutation({
    mutationFn: async ({ branchId, values }: { branchId: string | null; values: BranchValues }) => {
      const acting = requireClient(client);
      if (branchId === null) {
        const id = crypto.randomUUID();
        const { error } = await acting.rpc('create_branch', {
          p_id: id,
          p_name_ckb: values.nameCkb,
          ...(values.nameEn ? { p_name_en: values.nameEn } : {}),
          ...(values.nameAr ? { p_name_ar: values.nameAr } : {}),
          ...(values.phone ? { p_phone: values.phone } : {}),
          ...(values.address ? { p_address: values.address } : {}),
        });
        if (error) throw error;
        return id;
      }
      const { data, error } = await acting
        .from('branches')
        .update({
          name_ckb: values.nameCkb,
          name_en: orNull(values.nameEn),
          name_ar: orNull(values.nameAr),
          phone: orNull(values.phone),
          address: orNull(values.address),
        })
        .eq('id', branchId)
        .select('id');
      if (error) throw error;
      // RLS hides a branch the caller may not change: nothing was updated.
      if (data.length === 0) throw Object.assign(new Error('permission_denied'), { code: '42501' });
      return branchId;
    },
    onSettled: refresh,
  });
}

/** Deactivates a branch (its data stays; devices there stop working) or reactivates it. */
export function useSetBranchActive() {
  const { client } = useActingClient();
  const refresh = useRefreshBranches();
  return useMutation({
    mutationFn: async ({ branchId, active }: { branchId: string; active: boolean }) => {
      const { data, error } = await requireClient(client)
        .from('branches')
        .update({ is_active: active })
        .eq('id', branchId)
        .select('id');
      if (error) throw error;
      if (data.length === 0) throw Object.assign(new Error('permission_denied'), { code: '42501' });
    },
    onSettled: refresh,
  });
}
