import { describe, expect, it } from 'vitest';
import {
  CHECKIN_TAB,
  CHECKIN_TAB_INDEX,
  FALLBACK_NAV_TABS,
  NAV_ITEM_KEYS,
  NAV_TAB_COUNT,
  ROLE_NAV_TABS,
  arrangeNavTabs,
  defaultNavTabs,
  parseNavTabs,
  resolveNavTabs,
  type NavItemKey,
} from './nav-tabs.ts';
import { latestFunctionBody } from './sql-functions.test-helper.ts';

const everything = () => true;

describe('default tabs', () => {
  it('gives every built-in role 4 different known pages, check-in in the middle', () => {
    for (const tabs of [...Object.values(ROLE_NAV_TABS), FALLBACK_NAV_TABS]) {
      expect(parseNavTabs(tabs)).toEqual(tabs);
      expect(arrangeNavTabs(tabs)).toEqual(tabs);
    }
  });

  it('uses the role, and the fallback for custom roles', () => {
    expect(defaultNavTabs('receptionist')).toEqual(['home', 'members', 'checkin', 'cashRegister']);
    expect(defaultNavTabs('branch_manager')).toEqual(['home', 'members', 'reports', 'staff']);
    expect(defaultNavTabs(null)).toBe(FALLBACK_NAV_TABS);
    expect(defaultNavTabs('toString')).toBe(FALLBACK_NAV_TABS);
  });
});

describe('parseNavTabs', () => {
  it('accepts exactly 4 different known pages', () => {
    expect(parseNavTabs(['home', 'spa', 'lockers', 'members'])).toEqual([
      'home',
      'spa',
      'lockers',
      'members',
    ]);
  });

  it('refuses anything else, like the database', () => {
    for (const value of [
      null,
      'home',
      ['home', 'spa', 'lockers'],
      ['home', 'spa', 'lockers', 'members', 'staff'],
      ['home', 'home', 'lockers', 'members'],
      ['home', 'spa', 'lockers', 'nowhere'],
      ['home', 'spa', 'lockers', 4],
    ]) {
      expect(parseNavTabs(value)).toBeNull();
    }
  });
});

describe('arrangeNavTabs', () => {
  it('moves check-in to the middle slot and keeps the others in order', () => {
    expect(arrangeNavTabs(['checkin', 'home', 'members', 'spa'])).toEqual([
      'home',
      'members',
      'checkin',
      'spa',
    ]);
    expect(arrangeNavTabs(['home', 'members', 'spa', 'checkin'])).toEqual([
      'home',
      'members',
      'checkin',
      'spa',
    ]);
    expect(arrangeNavTabs(['home', 'members', 'spa', 'staff'])).toEqual([
      'home',
      'members',
      'spa',
      'staff',
    ]);
  });
});

describe('resolveNavTabs', () => {
  it("shows the staff member's own choice", () => {
    const saved: NavItemKey[] = ['home', 'spa', 'lockers', 'members'];
    expect(resolveNavTabs(saved, 'receptionist', everything)).toEqual(saved);
  });

  it("falls back to the role's tabs", () => {
    expect(resolveNavTabs(null, 'receptionist', everything)).toEqual(ROLE_NAV_TABS.receptionist);
  });

  it('leaves out pages they may not open and fills the slot in menu order', () => {
    const noReports = (key: NavItemKey) => key !== 'reports';
    expect(resolveNavTabs(null, 'branch_manager', noReports)).toEqual([
      'home',
      'members',
      'checkin',
      'staff',
    ]);
  });

  it('keeps check-in in the middle when it fills a slot', () => {
    const tabs = resolveNavTabs(['home', 'staff', 'reports', 'roles'], 'owner', (key) =>
      ['home', 'checkin', 'staff', 'reports'].includes(key),
    );
    expect(tabs[CHECKIN_TAB_INDEX]).toBe(CHECKIN_TAB);
    expect(tabs).toEqual(['home', 'staff', 'checkin', 'reports']);
  });

  it('shows fewer tabs when there are fewer pages to open', () => {
    expect(resolveNavTabs(null, 'trainer', (key) => key === 'home' || key === 'settings')).toEqual([
      'home',
      'settings',
    ]);
  });

  it('never shows more than 4', () => {
    expect(resolveNavTabs(null, null, everything)).toHaveLength(NAV_TAB_COUNT);
  });
});

describe('the same rules as the database', () => {
  it('knows exactly the pages app.is_valid_nav_tabs() accepts', () => {
    const body = latestFunctionBody('app.is_valid_nav_tabs');
    const list = /array\[([^\]]+)\]/.exec(body)?.[1] ?? '';
    const databaseKeys = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);

    expect(databaseKeys).toEqual([...NAV_ITEM_KEYS]);
    expect(/cardinality\(tabs\) = (\d+)/.exec(body)?.[1]).toBe(String(NAV_TAB_COUNT));
  });
});
