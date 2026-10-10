import { USERNAME_PATTERN } from '@gym/core';
import { z } from 'zod';

// What the app sends to the staff-admin function, and what it answers. The server validates every
// request with these schemas again; the database checks everything a third time.

const id = z.uuid();
/** Send it normalized (normalizeUsername in @gym/core). */
const username = z.string().regex(USERNAME_PATTERN);
/** Like app.is_clean_text(full_name, 100): 1 to 100 characters, no space at either end. */
const fullName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^\S(?:[\s\S]*\S)?$/);
/** Same pattern as the staff_users.phone check. */
const phone = z.string().regex(/^\+?[0-9][0-9 ]{3,18}[0-9]$/);

export const createStaffRequest = z.strictObject({
  action: z.literal('create'),
  username,
  fullName,
  phone: phone.nullable().optional(),
  roleId: id,
  /** Access to every branch of the gym, now and later; then branchIds is ignored. */
  allBranches: z.boolean(),
  branchIds: z.array(id).max(200),
});

export const resetPasswordRequest = z.strictObject({
  action: z.literal('reset_password'),
  staffId: id,
});

export const deactivateStaffRequest = z.strictObject({
  action: z.literal('deactivate'),
  staffId: id,
});

export const reactivateStaffRequest = z.strictObject({
  action: z.literal('reactivate'),
  staffId: id,
});

export const renameStaffRequest = z.strictObject({
  action: z.literal('rename'),
  staffId: id,
  username,
});

export const staffAdminRequest = z.discriminatedUnion('action', [
  createStaffRequest,
  resetPasswordRequest,
  deactivateStaffRequest,
  reactivateStaffRequest,
  renameStaffRequest,
]);

export type CreateStaffRequest = z.infer<typeof createStaffRequest>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequest>;
export type DeactivateStaffRequest = z.infer<typeof deactivateStaffRequest>;
export type ReactivateStaffRequest = z.infer<typeof reactivateStaffRequest>;
export type RenameStaffRequest = z.infer<typeof renameStaffRequest>;
export type StaffAdminRequest = z.infer<typeof staffAdminRequest>;
export type StaffAdminAction = StaffAdminRequest['action'];

/**
 * A new account. The temporary password is shown to the manager once and never stored or logged
 * anywhere; the staff member must replace it at their first login.
 */
export const createStaffResult = z.strictObject({
  staffId: id,
  username,
  temporaryPassword: z.string().min(1),
});

/** A reset password: the new temporary one, shown once, like for a new account. */
export const resetPasswordResult = z.strictObject({
  staffId: id,
  temporaryPassword: z.string().min(1),
});

/** Deactivate, reactivate and rename. */
export const staffChangeResult = z.strictObject({
  staffId: id,
});

export type CreateStaffResult = z.infer<typeof createStaffResult>;
export type ResetPasswordResult = z.infer<typeof resetPasswordResult>;
export type StaffChangeResult = z.infer<typeof staffChangeResult>;

/** The answer to each action. */
export interface StaffAdminResults {
  create: CreateStaffResult;
  reset_password: ResetPasswordResult;
  deactivate: StaffChangeResult;
  reactivate: StaffChangeResult;
  rename: StaffChangeResult;
}

export const STAFF_ADMIN_RESULTS = {
  create: createStaffResult,
  reset_password: resetPasswordResult,
  deactivate: staffChangeResult,
  reactivate: staffChangeResult,
  rename: staffChangeResult,
} as const satisfies { [A in StaffAdminAction]: z.ZodType<StaffAdminResults[A]> };

/** The body of every failed request. */
export const staffAdminFailure = z.object({ error: z.string() });
