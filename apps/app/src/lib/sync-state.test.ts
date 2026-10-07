import { describe, expect, it } from 'vitest';
import { syncIndicatorState, type SyncFacts } from './sync-state';

const idle: SyncFacts = {
  online: true,
  signedIn: true,
  connected: true,
  connecting: false,
  uploading: false,
  downloading: false,
  hasError: false,
  pending: 0,
};

describe('syncIndicatorState', () => {
  it('is online when connected with nothing to send', () => {
    expect(syncIndicatorState(idle)).toBe('online');
  });

  it('is offline without a network, whatever else is going on', () => {
    expect(syncIndicatorState({ ...idle, online: false, hasError: true, pending: 3 })).toBe(
      'offline',
    );
  });

  it('is not syncing when nobody is logged in', () => {
    expect(syncIndicatorState({ ...idle, signedIn: false, connected: false, pending: 2 })).toBe(
      'not_syncing',
    );
  });

  it('shows an error before activity', () => {
    expect(syncIndicatorState({ ...idle, hasError: true, uploading: true })).toBe('error');
  });

  it.each([
    ['connecting', { connecting: true, connected: false }],
    ['uploading', { uploading: true }],
    ['downloading', { downloading: true }],
    ['changes waiting', { pending: 1 }],
    ['not connected yet', { connected: false }],
  ])('is syncing when %s', (_name, change) => {
    expect(syncIndicatorState({ ...idle, ...change })).toBe('syncing');
  });
});
