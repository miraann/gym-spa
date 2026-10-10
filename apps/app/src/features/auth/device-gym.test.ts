import { describe, expect, it } from 'vitest';
import { parseDeviceGym, type DeviceGym } from './device-gym';

const gym: DeviceGym = {
  id: 'a0000000-0000-4000-8000-000000000001',
  code: 'hawler-fit',
  nameCkb: 'جیمی هەولێر',
  nameEn: 'Hawler Fit',
  nameAr: null,
  access: 'read_only',
};

describe('parseDeviceGym', () => {
  it('reads what was stored', () => {
    expect(parseDeviceGym(JSON.stringify(gym))).toEqual(gym);
  });

  it('is empty before the first login', () => {
    expect(parseDeviceGym(null)).toBeNull();
  });

  it('ignores something it cannot read', () => {
    expect(parseDeviceGym('not json')).toBeNull();
    expect(parseDeviceGym('[]')).toBeNull();
    expect(parseDeviceGym(JSON.stringify({ ...gym, code: 'Not A Code' }))).toBeNull();
    expect(parseDeviceGym(JSON.stringify({ ...gym, nameCkb: undefined }))).toBeNull();
  });

  it('assumes an active gym when the stored state is unknown (the server decides anyway)', () => {
    expect(parseDeviceGym(JSON.stringify({ ...gym, access: 'paused' }))?.access).toBe('active');
  });
});
