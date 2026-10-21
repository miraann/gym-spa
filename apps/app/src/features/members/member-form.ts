import {
  BLOOD_TYPES,
  GENDERS,
  MEMBER_LIMITS,
  REFERRAL_SOURCES,
  isCleanText,
  isValidBirthDate,
  isValidMemberTags,
  normalizeMemberPhone,
  normalizeName,
  type BloodType,
  type Gender,
  type ReferralSource,
} from '@gym/core';
import { LANGUAGE_CODES, type Language } from '@gym/i18n';
import { z } from 'zod';
import type { Member, MemberHealth } from './member-data';

// The member form's rules, the same as the database's (packages/core keeps them equal). Messages
// are keys of members:form.errors.

/** Optional text: empty means none; otherwise clean and at most maxLength characters. */
function optionalText(maxLength: number, multiline = false) {
  return z
    .string()
    .transform((value) => (multiline ? value.trim() : normalizeName(value)))
    .refine((value) => value === '' || isCleanText(value, maxLength), 'text');
}

/** The form's fields. today: Baghdad's date (YYYY-MM-DD), the latest birth date allowed. */
export function memberFormSchema(today: string) {
  return z
    .object({
      fullName: z
        .string()
        .transform(normalizeName)
        .refine((value) => isCleanText(value, MEMBER_LIMITS.fullName), 'fullName'),
      gender: z.enum(GENDERS),
      noOwnPhone: z.boolean(),
      phone: z.string(),
      branchId: z.string().min(1, 'branch'),
      birthDate: z
        .string()
        .refine((value) => value === '' || isValidBirthDate(value, today), 'birthDate'),
      emergencyContactName: optionalText(MEMBER_LIMITS.emergencyContactName),
      emergencyPhone: z.string(),
      preferredLanguage: z.enum(LANGUAGE_CODES),
      address: optionalText(MEMBER_LIMITS.address),
      referralSource: z.union([z.literal(''), z.enum(REFERRAL_SOURCES)]),
      goals: optionalText(MEMBER_LIMITS.goals, true),
      notes: optionalText(MEMBER_LIMITS.notes, true),
      tags: z.array(z.string()).refine(isValidMemberTags, 'tags'),
      bloodType: z.union([z.literal(''), z.enum(BLOOD_TYPES)]),
      medicalNotes: optionalText(MEMBER_LIMITS.medicalNotes, true),
      injuries: optionalText(MEMBER_LIMITS.injuries, true),
    })
    .superRefine((values, context) => {
      if (values.noOwnPhone) {
        if (values.emergencyPhone.trim() === '') {
          context.addIssue({ code: 'custom', path: ['emergencyPhone'], message: 'emergencyPhone' });
        }
      } else if (values.phone.trim() === '') {
        context.addIssue({ code: 'custom', path: ['phone'], message: 'phoneRequired' });
      } else if (normalizeMemberPhone(values.phone) === null) {
        context.addIssue({ code: 'custom', path: ['phone'], message: 'phone' });
      }
      if (
        values.emergencyPhone.trim() !== '' &&
        normalizeMemberPhone(values.emergencyPhone) === null
      ) {
        context.addIssue({ code: 'custom', path: ['emergencyPhone'], message: 'phone' });
      }
    })
    .transform((values): MemberInput => ({
      branchId: values.branchId,
      fullName: values.fullName,
      gender: values.gender,
      phone: values.noOwnPhone ? null : normalizeMemberPhone(values.phone),
      emergencyContactName: values.emergencyContactName || null,
      emergencyPhone: normalizeMemberPhone(values.emergencyPhone),
      birthDate: values.birthDate || null,
      preferredLanguage: values.preferredLanguage,
      address: values.address || null,
      referralSource: values.referralSource || null,
      goals: values.goals || null,
      notes: values.notes || null,
      tags: values.tags,
      bloodType: values.bloodType || null,
      medicalNotes: values.medicalNotes || null,
      injuries: values.injuries || null,
    }));
}

export type MemberFormSchema = ReturnType<typeof memberFormSchema>;
export type MemberFormValues = z.input<MemberFormSchema>;

/** A member as the form saves it (create_member / update_member). */
export interface MemberInput {
  readonly branchId: string;
  readonly fullName: string;
  readonly gender: Gender;
  /** null: no phone of their own. */
  readonly phone: string | null;
  readonly emergencyContactName: string | null;
  readonly emergencyPhone: string | null;
  readonly birthDate: string | null;
  readonly preferredLanguage: Language;
  readonly address: string | null;
  readonly referralSource: ReferralSource | null;
  readonly goals: string | null;
  readonly notes: string | null;
  readonly tags: readonly string[];
  readonly bloodType: BloodType | null;
  readonly medicalNotes: string | null;
  readonly injuries: string | null;
}

/** An empty form; the branch is the device's when the staff member can add members there. */
export function emptyMemberForm(branchId: string): MemberFormValues {
  return {
    fullName: '',
    gender: 'male',
    noOwnPhone: false,
    phone: '',
    branchId,
    birthDate: '',
    emergencyContactName: '',
    emergencyPhone: '',
    preferredLanguage: 'ckb',
    address: '',
    referralSource: '',
    goals: '',
    notes: '',
    tags: [],
    bloodType: '',
    medicalNotes: '',
    injuries: '',
  };
}

/** The form filled with a member (and their health info, when the staff member may see it). */
export function memberFormValues(member: Member, health: MemberHealth | null): MemberFormValues {
  return {
    fullName: member.fullName,
    gender: member.gender,
    noOwnPhone: member.phone === null,
    phone: member.phone ?? '',
    branchId: member.branchId,
    birthDate: member.birthDate ?? '',
    emergencyContactName: member.emergencyContactName ?? '',
    emergencyPhone: member.emergencyPhone ?? '',
    preferredLanguage: member.preferredLanguage,
    address: member.address ?? '',
    referralSource: member.referralSource ?? '',
    goals: member.goals ?? '',
    notes: member.notes ?? '',
    tags: [...member.tags],
    bloodType: health?.bloodType ?? '',
    medicalNotes: health?.medicalNotes ?? '',
    injuries: health?.injuries ?? '',
  };
}

/** Whether any health field is filled in. */
export function hasHealthInput(input: MemberInput): boolean {
  return input.bloodType !== null || input.medicalNotes !== null || input.injuries !== null;
}
