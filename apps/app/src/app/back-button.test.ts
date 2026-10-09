import { afterEach, describe, expect, it } from 'vitest';
import { resolveBackAction } from './back-button';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('resolveBackAction', () => {
  it('goes back a page when there is one', () => {
    expect(resolveBackAction(true)).toBe('go-back');
  });

  it('leaves the app from the first page', () => {
    expect(resolveBackAction(false)).toBe('minimize');
  });

  it('closes an open dialog or menu first', () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
    expect(resolveBackAction(true)).toBe('close-layer');
    expect(resolveBackAction(false)).toBe('close-layer');

    document.body.innerHTML = '<div role="menu" data-state="open"></div>';
    expect(resolveBackAction(false)).toBe('close-layer');
  });

  it('leaves the app from the login and lock screens, whatever page is behind them', () => {
    document.body.innerHTML = '<div data-auth-screen></div>';
    expect(resolveBackAction(true)).toBe('minimize');
  });

  it('ignores closed dialogs', () => {
    document.body.innerHTML = '<div role="dialog" data-state="closed"></div>';
    expect(resolveBackAction(true)).toBe('go-back');
  });
});
