import {
  ROLE_NAME_MAX_LENGTH,
  STAFF_NAME_MAX_LENGTH,
  isCleanText,
  isValidPhone,
  isValidUsername,
  normalizeName,
  normalizePhone,
  normalizeUsername,
} from '@gym/core';
import { z } from 'zod';

// The admin forms' rules, the same as the database's (packages/core keeps them equal). Messages
// are keys of staff:form.errors.

const fullName = z
  .string()
  .transform(normalizeName)
  .refine((value) => isCleanText(value, STAFF_NAME_MAX_LENGTH), 'fullName');

const phone = z
  .string()
  .transform(normalizePhone)
  .refine((value) => value === '' || isValidPhone(value), 'phone');

const accessFields = {
  fullName,
  phone,
  roleId: z.string().min(1, 'role'),
  allBranches: z.boolean(),
  branchIds: z.array(z.string()),
};

/** A staff member works in at least one branch, or in all of them (branches_required). */
function branchesChosen(value: { allBranches: boolean; branchIds: string[] }): boolean {
  return value.allBranches || value.branchIds.length > 0;
}
const BRANCHES_ERROR = { path: ['branchIds'], message: 'branches' };

export const staffAccessSchema = z.object(accessFields).refine(branchesChosen, BRANCHES_ERROR);

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .refine(isValidUsername, 'username');

export const newStaffSchema = z
  .object({ username: usernameSchema, ...accessFields })
  .refine(branchesChosen, BRANCHES_ERROR);

export type StaffAccessInput = z.input<typeof staffAccessSchema>;
export type NewStaffInput = z.input<typeof newStaffSchema>;

/** An optional translated name: empty means none (the Kurdish name is shown instead). */
const optionalRoleName = z
  .string()
  .transform(normalizeName)
  .refine((value) => value === '' || isCleanText(value, ROLE_NAME_MAX_LENGTH), 'roleName');

export const roleNamesSchema = z.object({
  nameCkb: z
    .string()
    .transform(normalizeName)
    .refine((value) => isCleanText(value, ROLE_NAME_MAX_LENGTH), 'roleNameRequired'),
  nameEn: optionalRoleName,
  nameAr: optionalRoleName,
});

export type RoleNamesInput = z.input<typeof roleNamesSchema>;
