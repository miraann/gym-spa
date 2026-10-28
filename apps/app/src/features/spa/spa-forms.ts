import {
  SPA_GENDERS,
  SPA_KINDS,
  SPA_LIMITS,
  isCleanText,
  formatMemberPhone,
  isValidWorkWindows,
  normalizeMemberPhone,
  normalizeName,
  parseDecimal,
  parseWholeNumber,
  type Weekday,
} from '@gym/core';
import { z } from 'zod';
import type {
  SpaPackage,
  SpaPackageDraft,
  SpaRoom,
  SpaRoomDraft,
  SpaService,
  SpaServiceDraft,
  SpaTherapist,
  SpaTherapistDraft,
} from './spa-data';

// The spa setup forms' rules, the same as the database's (packages/core keeps the limits). Messages
// are keys of spa:form.errors; those with limits get them from SPA_LIMITS.

function inRange(value: number | null, min: number, max: number): boolean {
  return value !== null && value >= min && value <= max;
}

const requiredName = (max: number) =>
  z
    .string()
    .transform(normalizeName)
    .refine((value) => isCleanText(value, max), 'nameRequired');

const optionalName = (max: number) =>
  z
    .string()
    .transform(normalizeName)
    .refine((value) => value === '' || isCleanText(value, max), 'name');

const price = z
  .string()
  .refine((value) => inRange(parseWholeNumber(value), 0, SPA_LIMITS.maxPrice), 'price');

export const serviceFormSchema = z
  .object({
    nameCkb: requiredName(SPA_LIMITS.serviceName),
    nameEn: optionalName(SPA_LIMITS.serviceName),
    nameAr: optionalName(SPA_LIMITS.serviceName),
    kind: z.enum(SPA_KINDS),
    duration: z
      .string()
      .refine(
        (value) => inRange(parseWholeNumber(value), SPA_LIMITS.minDuration, SPA_LIMITS.maxDuration),
        'duration',
      ),
    cleanup: z
      .string()
      .refine((value) => inRange(parseWholeNumber(value), 0, SPA_LIMITS.maxCleanup), 'cleanup'),
    price,
    gender: z.enum(SPA_GENDERS),
    needsTherapist: z.boolean(),
    isActive: z.boolean(),
  })
  .transform((values): SpaServiceDraft => ({
    nameCkb: values.nameCkb,
    nameEn: values.nameEn || null,
    nameAr: values.nameAr || null,
    kind: values.kind,
    durationMinutes: parseWholeNumber(values.duration) ?? 0,
    cleanupMinutes: parseWholeNumber(values.cleanup) ?? 0,
    price: parseWholeNumber(values.price) ?? 0,
    gender: values.gender,
    needsTherapist: values.needsTherapist,
    isActive: values.isActive,
  }));

export type ServiceFormValues = z.input<typeof serviceFormSchema>;

/** A service's form, or a new one (a 60-minute massage with a therapist, for everyone). */
export function serviceFormValues(service: SpaService | null): ServiceFormValues {
  return {
    nameCkb: service?.nameCkb ?? '',
    nameEn: service?.nameEn ?? '',
    nameAr: service?.nameAr ?? '',
    kind: service?.kind ?? 'massage',
    duration: String(service?.durationMinutes ?? 60),
    cleanup: String(service?.cleanupMinutes ?? 0),
    price: service ? String(service.price) : '',
    gender: service?.gender ?? 'any',
    needsTherapist: service?.needsTherapist ?? true,
    isActive: service?.isActive ?? true,
  };
}

export function roomFormSchema(branchId: string) {
  return z
    .object({
      nameCkb: requiredName(SPA_LIMITS.roomName),
      nameEn: optionalName(SPA_LIMITS.roomName),
      nameAr: optionalName(SPA_LIMITS.roomName),
      kind: z.enum(SPA_KINDS),
      capacity: z
        .string()
        .refine((value) => inRange(parseWholeNumber(value), 1, SPA_LIMITS.maxCapacity), 'capacity'),
      isActive: z.boolean(),
    })
    .transform((values): SpaRoomDraft => ({
      branchId,
      nameCkb: values.nameCkb,
      nameEn: values.nameEn || null,
      nameAr: values.nameAr || null,
      kind: values.kind,
      capacity: parseWholeNumber(values.capacity) ?? 1,
      isActive: values.isActive,
    }));
}

export type RoomFormValues = z.input<ReturnType<typeof roomFormSchema>>;

export function roomFormValues(room: SpaRoom | null): RoomFormValues {
  return {
    nameCkb: room?.nameCkb ?? '',
    nameEn: room?.nameEn ?? '',
    nameAr: room?.nameAr ?? '',
    kind: room?.kind ?? 'massage',
    capacity: String(room?.capacity ?? 1),
    isActive: room?.isActive ?? true,
  };
}

const workWindow = z.object({
  weekday: z.number().int().min(1).max(7),
  from: z.string(),
  until: z.string(),
});

export function therapistFormSchema(branchId: string) {
  return z
    .object({
      fullName: requiredName(SPA_LIMITS.therapistName),
      gender: z.enum(['male', 'female']),
      phone: z
        .string()
        .refine((value) => value.trim() === '' || normalizeMemberPhone(value) !== null, 'phone'),
      staffUserId: z.string(),
      commission: z
        .string()
        .refine((value) => inRange(parseDecimal(value), 0, SPA_LIMITS.maxCommission), 'commission'),
      serviceIds: z.array(z.string()),
      hours: z.array(workWindow),
      isActive: z.boolean(),
    })
    .superRefine((values, context) => {
      if (
        !isValidWorkWindows(
          values.hours.map((window) => ({ ...window, weekday: window.weekday as Weekday })),
        )
      ) {
        context.addIssue({ code: 'custom', path: ['hours'], message: 'hours' });
      }
    })
    .transform((values): SpaTherapistDraft => ({
      branchId,
      fullName: values.fullName,
      gender: values.gender,
      phone: values.phone.trim() === '' ? null : normalizeMemberPhone(values.phone),
      staffUserId: values.staffUserId === '' ? null : values.staffUserId,
      commissionPercent: parseDecimal(values.commission) ?? 0,
      serviceIds: values.serviceIds,
      hours: values.hours.map((window) => ({ ...window, weekday: window.weekday as Weekday })),
      isActive: values.isActive,
    }));
}

export type TherapistFormValues = z.input<ReturnType<typeof therapistFormSchema>>;

export function therapistFormValues(therapist: SpaTherapist | null): TherapistFormValues {
  return {
    fullName: therapist?.fullName ?? '',
    gender: therapist?.gender ?? 'female',
    phone: therapist?.phone ? formatMemberPhone(therapist.phone) : '',
    staffUserId: therapist?.staffUserId ?? '',
    commission: String(therapist?.commissionPercent ?? 0),
    serviceIds: therapist ? [...therapist.serviceIds] : [],
    hours: therapist ? therapist.hours.map((window) => ({ ...window })) : [],
    isActive: therapist?.isActive ?? true,
  };
}

export const packageFormSchema = z
  .object({
    nameCkb: requiredName(SPA_LIMITS.serviceName),
    nameEn: optionalName(SPA_LIMITS.serviceName),
    nameAr: optionalName(SPA_LIMITS.serviceName),
    serviceId: z.string().min(1, 'service'),
    sessions: z
      .string()
      .refine((value) => inRange(parseWholeNumber(value), 1, SPA_LIMITS.maxSessions), 'sessions'),
    price,
    validDays: z
      .string()
      .refine(
        (value) =>
          value.trim() === '' || inRange(parseWholeNumber(value), 1, SPA_LIMITS.maxValidDays),
        'validDays',
      ),
    isActive: z.boolean(),
  })
  .transform((values): SpaPackageDraft => ({
    nameCkb: values.nameCkb,
    nameEn: values.nameEn || null,
    nameAr: values.nameAr || null,
    serviceId: values.serviceId,
    sessionCount: parseWholeNumber(values.sessions) ?? 1,
    price: parseWholeNumber(values.price) ?? 0,
    validDays: values.validDays.trim() === '' ? null : parseWholeNumber(values.validDays),
    isActive: values.isActive,
  }));

export type PackageFormValues = z.input<typeof packageFormSchema>;

export function packageFormValues(
  pack: SpaPackage | null,
  firstServiceId: string,
): PackageFormValues {
  return {
    nameCkb: pack?.nameCkb ?? '',
    nameEn: pack?.nameEn ?? '',
    nameAr: pack?.nameAr ?? '',
    serviceId: pack?.serviceId ?? firstServiceId,
    sessions: String(pack?.sessionCount ?? 5),
    price: pack ? String(pack.price) : '',
    validDays: pack?.validDays == null ? '' : String(pack.validDays),
    isActive: pack?.isActive ?? true,
  };
}
