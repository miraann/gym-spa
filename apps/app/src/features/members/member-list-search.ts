import {
  GENDERS,
  MEMBERSHIPS,
  MEMBER_STATUSES,
  type Gender,
  type Membership,
  type MemberStatus,
} from '@gym/core';

// The members list's search, filters, sorting and page live in the address (/members?q=…), so the
// list keeps them while a member is open beside it, and Back returns to the same list.

export const STATUS_FILTERS = ['current', ...MEMBER_STATUSES] as const;
/** current: every member except the archived ones (the default). */
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const MEMBER_SORTS = ['name', 'newest', 'number'] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

/** What the address holds; a missing value is the default. */
export interface MemberListSearch {
  readonly q?: string;
  readonly status?: Exclude<StatusFilter, 'current'>;
  readonly gender?: Gender;
  readonly branch?: string;
  readonly tag?: string;
  readonly membership?: Membership;
  readonly sort?: Exclude<MemberSort, 'name'>;
  readonly page?: number;
}

/** The list's state with the defaults filled in. */
export interface MemberListParams {
  readonly q: string;
  readonly status: StatusFilter;
  readonly gender: Gender | null;
  readonly branch: string | null;
  readonly tag: string | null;
  readonly membership: Membership | null;
  readonly sort: MemberSort;
  readonly page: number;
}

function oneOf<T extends string>(values: readonly T[], value: unknown): T | undefined {
  return values.find((each) => each === value);
}

function text(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.trim() !== '' && value.length <= maxLength
    ? value
    : undefined;
}

/** Reads the address leniently: anything unknown or broken is left out (the default). */
export function parseMemberListSearch(search: Record<string, unknown>): MemberListSearch {
  const status = oneOf(MEMBER_STATUSES, search.status);
  const sort = oneOf(MEMBER_SORTS, search.sort);
  const page = Number(search.page);
  return {
    ...(text(search.q, 100) === undefined ? {} : { q: text(search.q, 100) }),
    ...(status === undefined ? {} : { status }),
    ...(oneOf(GENDERS, search.gender) === undefined
      ? {}
      : { gender: oneOf(GENDERS, search.gender) }),
    ...(text(search.branch, 64) === undefined ? {} : { branch: text(search.branch, 64) }),
    ...(text(search.tag, 30) === undefined ? {} : { tag: text(search.tag, 30) }),
    ...(oneOf(MEMBERSHIPS, search.membership) === undefined
      ? {}
      : { membership: oneOf(MEMBERSHIPS, search.membership) }),
    ...(sort === undefined || sort === 'name' ? {} : { sort }),
    ...(Number.isInteger(page) && page > 1 && page <= 100_000 ? { page } : {}),
  };
}

export function memberListParams(search: MemberListSearch): MemberListParams {
  return {
    q: search.q ?? '',
    status: search.status ?? 'current',
    gender: search.gender ?? null,
    branch: search.branch ?? null,
    tag: search.tag ?? null,
    membership: search.membership ?? null,
    sort: search.sort ?? 'name',
    page: search.page ?? 1,
  };
}

/** Whether the list shows everything (no search and no filter), so "nothing found" means empty. */
export function isUnfiltered(params: MemberListParams): boolean {
  return (
    params.q.trim() === '' &&
    params.status === 'current' &&
    params.gender === null &&
    params.branch === null &&
    params.tag === null &&
    params.membership === null
  );
}

export type { MemberStatus };
