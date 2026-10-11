import { SellerAdminError } from '@gym/seller-admin';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDLE_LIMIT_MS, useIdleSignOut } from '@/auth/idle';
import { gymState } from '@/gyms/gym-state';
import { PanelError, fromDatabase, panelErrorKey } from '@/lib/errors';
import { PREFERENCES_STORAGE_KEY, parsePreferences } from '@/lib/preferences';

/** Mounts a component that only runs the hook. */
function mountIdle(onIdle: () => void): void {
  function Probe() {
    useIdleSignOut(onIdle);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => {
    root.render(<Probe />);
  });
}

describe('idle sign-out', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('signs out after 30 minutes without activity', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    mountIdle(onIdle);
    act(() => {
      vi.advanceTimersByTime(IDLE_LIMIT_MS - 1000);
    });
    expect(onIdle).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onIdle).toHaveBeenCalledOnce();
    expect(IDLE_LIMIT_MS).toBe(30 * 60 * 1000);
  });

  it('starts counting again at every key press or click', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    mountIdle(onIdle);
    act(() => {
      vi.advanceTimersByTime(IDLE_LIMIT_MS - 1000);
      window.dispatchEvent(new Event('keydown'));
      vi.advanceTimersByTime(IDLE_LIMIT_MS - 1000);
    });
    expect(onIdle).not.toHaveBeenCalled();
  });
});

describe('preferences', () => {
  it("are the panel's own, never the gym app's", () => {
    expect(PREFERENCES_STORAGE_KEY).toBe('seller.preferences');
  });

  it('fall back to Kurdish and the device theme', () => {
    expect(parsePreferences(null)).toEqual({ language: 'ckb', theme: 'system' });
    expect(parsePreferences('{"language":"xx","theme":"pink"}')).toEqual({
      language: 'ckb',
      theme: 'system',
    });
    expect(parsePreferences('{"language":"en","theme":"dark"}')).toEqual({
      language: 'en',
      theme: 'dark',
    });
  });
});

describe('errors', () => {
  it("show the database's stable key", () => {
    expect(fromDatabase({ message: 'reason_required', code: '22023' }).key).toBe('reason_required');
    expect(fromDatabase({ message: 'gym_code_taken', code: '23505' }).key).toBe('gym_code_taken');
  });

  it('treat an ended session and a lost network as such', () => {
    expect(fromDatabase({ message: 'JWT expired', code: 'PGRST301' }).key).toBe('unauthorized');
    expect(fromDatabase({ message: 'TypeError: Failed to fetch' }).key).toBe('network');
    expect(fromDatabase({ message: 'something odd', code: 'XX000' }).key).toBe('unexpected');
  });

  it('never show a key the panel has no text for', () => {
    expect(panelErrorKey(new SellerAdminError('method_not_allowed'))).toBe('unexpected');
    expect(panelErrorKey(new SellerAdminError('wrong_code'))).toBe('wrong_code');
    expect(panelErrorKey(new PanelError('network'))).toBe('network');
    expect(panelErrorKey(new Error('?'))).toBe('unexpected');
  });
});

describe('gym state', () => {
  it('tells a suspended gym from one whose subscription ran out', () => {
    expect(gymState({ access: 'read_only', suspended_at: '2026-10-11T08:00:00Z' })).toBe(
      'suspended',
    );
    expect(gymState({ access: 'read_only', suspended_at: null })).toBe('read_only');
    expect(gymState({ access: 'locked', suspended_at: '2026-10-11T08:00:00Z' })).toBe('locked');
  });
});
