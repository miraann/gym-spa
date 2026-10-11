import {
  GYM_CODE_MAX_LENGTH,
  GYM_CODE_MIN_LENGTH,
  GYM_CODE_PATTERN,
  USERNAME_PATTERN,
  isValidAdminEmail,
} from '@gym/core';
import { z } from 'zod';

// What the seller panel sends to the seller-admin function, and what it answers. The server
// validates every request with these schemas again; the database checks everything a third time
// (and answers reserved codes, taken codes and addresses with its own keys).

const id = z.uuid();
/** Like app.is_clean_text(value, max): 1 to max characters, no space at either end. */
const cleanText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^\S(?:[\s\S]*\S)?$/);
/** Send it normalized (normalizeGymCode in @gym/core). */
const gymCode = z
  .string()
  .min(GYM_CODE_MIN_LENGTH)
  .max(GYM_CODE_MAX_LENGTH)
  .regex(GYM_CODE_PATTERN);
/** Send it normalized (normalizeUsername in @gym/core). */
const username = z.string().regex(USERNAME_PATTERN);
/** Same pattern as the staff_users.phone check. */
const phone = z.string().regex(/^\+?[0-9][0-9 ]{3,18}[0-9]$/);
/** Send it normalized (normalizeAdminEmail in @gym/core). */
const adminEmail = z.string().refine(isValidAdminEmail);

/**
 * A new online gym with its first Owner. paidUntil: when its subscription ends (the end of the
 * chosen day in Baghdad), or null for no end, chosen on purpose.
 */
export const createGymRequest = z.strictObject({
  action: z.literal('create_gym'),
  code: gymCode,
  nameCkb: cleanText(100),
  nameEn: cleanText(100).nullable().optional(),
  nameAr: cleanText(100).nullable().optional(),
  firstBranchName: cleanText(100),
  paidUntil: z.iso.datetime({ offset: true }).nullable(),
  owner: z.strictObject({
    username,
    fullName: cleanText(100),
    phone: phone.nullable().optional(),
  }),
});

export const addAdminRequest = z.strictObject({
  action: z.literal('add_admin'),
  email: adminEmail,
  fullName: cleanText(100),
});

export const deactivateAdminRequest = z.strictObject({
  action: z.literal('deactivate_admin'),
  userId: id,
});

export const reactivateAdminRequest = z.strictObject({
  action: z.literal('reactivate_admin'),
  userId: id,
});

/** Removes another admin's two-step device (they lost it); they set up a new one at their next login. */
export const resetAdminTwoStepRequest = z.strictObject({
  action: z.literal('reset_admin_two_step'),
  userId: id,
});

export const resetAdminPasswordRequest = z.strictObject({
  action: z.literal('reset_admin_password'),
  userId: id,
});

/**
 * The signed-in admin uses one of their recovery codes (after the password, before the second
 * step). Any text up to 64 characters goes to the database, so every wrong try counts.
 */
export const useRecoveryCodeRequest = z.strictObject({
  action: z.literal('use_recovery_code'),
  code: z.string().min(1).max(64),
});

export const sellerAdminRequest = z.discriminatedUnion('action', [
  createGymRequest,
  addAdminRequest,
  deactivateAdminRequest,
  reactivateAdminRequest,
  resetAdminTwoStepRequest,
  resetAdminPasswordRequest,
  useRecoveryCodeRequest,
]);

export type CreateGymRequest = z.infer<typeof createGymRequest>;
export type AddAdminRequest = z.infer<typeof addAdminRequest>;
export type DeactivateAdminRequest = z.infer<typeof deactivateAdminRequest>;
export type ReactivateAdminRequest = z.infer<typeof reactivateAdminRequest>;
export type ResetAdminTwoStepRequest = z.infer<typeof resetAdminTwoStepRequest>;
export type ResetAdminPasswordRequest = z.infer<typeof resetAdminPasswordRequest>;
export type UseRecoveryCodeRequest = z.infer<typeof useRecoveryCodeRequest>;
export type SellerAdminRequest = z.infer<typeof sellerAdminRequest>;
export type SellerAdminAction = SellerAdminRequest['action'];

/** The only action a session before the second login step (aal1) may send. */
export const BEFORE_TWO_STEP_ACTIONS: readonly SellerAdminAction[] = ['use_recovery_code'];

/**
 * A new gym. The Owner's temporary password is shown to the platform admin once, never stored or
 * logged; the Owner must replace it at their first login.
 */
export const createGymResult = z.strictObject({
  gymId: id,
  code: gymCode,
  ownerId: id,
  ownerUsername: username,
  temporaryPassword: z.string().min(1),
});

/** A new platform admin, with a temporary password shown once. */
export const addAdminResult = z.strictObject({
  userId: id,
  email: adminEmail,
  temporaryPassword: z.string().min(1),
});

/** Deactivate, reactivate, two-step reset. */
export const adminChangeResult = z.strictObject({
  userId: id,
});

export const resetAdminPasswordResult = z.strictObject({
  userId: id,
  temporaryPassword: z.string().min(1),
});

/** The code worked and the lost two-step device is gone: set up a new one now. */
export const useRecoveryCodeResult = z.strictObject({
  result: z.literal('ok'),
});

export type CreateGymResult = z.infer<typeof createGymResult>;
export type AddAdminResult = z.infer<typeof addAdminResult>;
export type AdminChangeResult = z.infer<typeof adminChangeResult>;
export type ResetAdminPasswordResult = z.infer<typeof resetAdminPasswordResult>;
export type UseRecoveryCodeResult = z.infer<typeof useRecoveryCodeResult>;

/** The answer to each action. */
export interface SellerAdminResults {
  create_gym: CreateGymResult;
  add_admin: AddAdminResult;
  deactivate_admin: AdminChangeResult;
  reactivate_admin: AdminChangeResult;
  reset_admin_two_step: AdminChangeResult;
  reset_admin_password: ResetAdminPasswordResult;
  use_recovery_code: UseRecoveryCodeResult;
}

export const SELLER_ADMIN_RESULTS = {
  create_gym: createGymResult,
  add_admin: addAdminResult,
  deactivate_admin: adminChangeResult,
  reactivate_admin: adminChangeResult,
  reset_admin_two_step: adminChangeResult,
  reset_admin_password: resetAdminPasswordResult,
  use_recovery_code: useRecoveryCodeResult,
} as const satisfies { [A in SellerAdminAction]: z.ZodType<SellerAdminResults[A]> };

/** The body of every failed request. */
export const sellerAdminFailure = z.object({ error: z.string() });
