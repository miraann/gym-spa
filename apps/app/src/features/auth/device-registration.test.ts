import { describe, expect, it } from 'vitest';
import { devicePlatform, parseDeviceRegistration, parseServerDevice } from './device-registration';

const ROW = {
  id: 'd0000000-0000-4000-8000-000000000001',
  code: 'D01',
  name: 'کۆمپیوتەری پێشوازی',
  platform: 'windows',
  default_language: 'ar',
  is_active: true,
  branch_id: 'b0000000-0000-4000-8000-000000000001',
  branch_code: 'B1',
  branch_name_ckb: 'لقی یەکەم',
  branch_name_en: null,
  branch_name_ar: 'الفرع الأول',
  branch_is_active: true,
  can_use: true,
};

describe('parseServerDevice', () => {
  it('reads the device, its branch, and whether the caller may use it', () => {
    expect(parseServerDevice(ROW)).toEqual({
      registration: {
        id: ROW.id,
        code: 'D01',
        name: 'کۆمپیوتەری پێشوازی',
        defaultLanguage: 'ar',
        isActive: true,
        branch: {
          id: ROW.branch_id,
          code: 'B1',
          nameCkb: 'لقی یەکەم',
          nameEn: null,
          nameAr: 'الفرع الأول',
          isActive: true,
        },
      },
      canUse: true,
    });
  });

  it('is nothing for no row or a broken one', () => {
    expect(parseServerDevice(null)).toBeNull();
    expect(parseServerDevice({ ...ROW, id: 'nope' })).toBeNull();
    expect(parseServerDevice({ ...ROW, branch_id: null })).toBeNull();
  });

  it('ignores an unknown language and treats missing flags as false', () => {
    const parsed = parseServerDevice({ ...ROW, default_language: 'fr', can_use: undefined });
    expect(parsed?.registration.defaultLanguage).toBeNull();
    expect(parsed?.canUse).toBe(false);
  });
});

describe('parseDeviceRegistration', () => {
  it('reads back what was stored', () => {
    const registration = parseServerDevice(ROW)?.registration;
    expect(parseDeviceRegistration(JSON.stringify(registration))).toEqual(registration);
  });

  it('is nothing for no value or a broken one', () => {
    expect(parseDeviceRegistration(null)).toBeNull();
    expect(parseDeviceRegistration('not json')).toBeNull();
    expect(parseDeviceRegistration('{"id":"x"}')).toBeNull();
  });
});

describe('devicePlatform', () => {
  it('names the platform the way the database does', () => {
    expect(devicePlatform('electron')).toBe('windows');
    expect(devicePlatform('android')).toBe('android');
    expect(devicePlatform('web')).toBe('web');
    expect(devicePlatform('ios')).toBe('web');
  });
});
