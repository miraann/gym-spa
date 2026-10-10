import { NAV_ITEM_KEYS } from '@gym/core';
import { describe, expect, it } from 'vitest';
import ckbNav from '../../../../packages/i18n/src/locales/ckb/nav.json';
import { NAV_GROUPS, isNavItemActive, navItem, navTabItems } from './navigation';

describe('the menu', () => {
  it('lists exactly the pages the database knows, in the same order', () => {
    expect(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.key))).toEqual([
      ...NAV_ITEM_KEYS,
    ]);
  });

  it('has a name and a short name for every page', () => {
    expect(Object.keys(ckbNav.items)).toEqual([...NAV_ITEM_KEYS]);
    expect(Object.keys(ckbNav.short)).toEqual([...NAV_ITEM_KEYS]);
  });
});

describe('isNavItemActive', () => {
  it('matches the page and its sub-pages, home only exactly', () => {
    expect(isNavItemActive(navItem('home'), '/')).toBe(true);
    expect(isNavItemActive(navItem('home'), '/settings/display')).toBe(false);
    expect(isNavItemActive(navItem('settings'), '/settings/display')).toBe(true);
    expect(isNavItemActive(navItem('members'), '/')).toBe(false);
  });
});

describe('navTabItems', () => {
  it("gives a receptionist their role's tabs", () => {
    const permissions = new Set(['checkin.perform', 'members.view', 'cash_register.operate']);
    expect(navTabItems(null, 'receptionist', permissions).map((item) => item.key)).toEqual([
      'home',
      'members',
      'checkin',
      'cashRegister',
    ]);
  });

  it('leaves out pages the staff member may not see', () => {
    const tabs = navTabItems(['home', 'staff', 'reports', 'roles'], 'owner', new Set());
    expect(tabs.map((item) => item.key)).toEqual(['home', 'settings']);
  });
});
