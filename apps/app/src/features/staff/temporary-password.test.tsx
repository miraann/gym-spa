import { createI18n } from '@gym/i18n';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemporaryPasswordPanel } from './temporary-password';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const PASSWORD = 'k7m2p9x4w3h8r6';
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

function render(): void {
  const i18n = createI18n('ckb', [initReactI18next]);
  act(() => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <TemporaryPasswordPanel password={PASSWORD} />
      </I18nextProvider>,
    );
  });
}

function copyButton(): HTMLButtonElement {
  const button = container.querySelector('button');
  if (!button) throw new Error('no copy button');
  return button;
}

function mockClipboard(writeText: (text: string) => Promise<void>) {
  const spy = vi.fn(writeText);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: spy }, configurable: true });
  return spy;
}

describe('TemporaryPasswordPanel', () => {
  it('shows the password in Latin LTR, with a note that it is shown only once', () => {
    render();
    const output = container.querySelector('output');
    expect(output?.textContent).toBe(PASSWORD);
    expect(output?.getAttribute('dir')).toBe('ltr');
    expect(container.querySelector('[role="note"]')?.textContent).toContain(
      'تەنها ئێستا پیشان دەدرێت',
    );
  });

  it('copies the password', async () => {
    const writeText = mockClipboard(() => Promise.resolve());
    render();
    await act(async () => {
      copyButton().click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(PASSWORD);
    expect(copyButton().textContent).toBe('کۆپی کرا');
  });

  it('says so when copying is not possible', async () => {
    mockClipboard(() => Promise.reject(new Error('denied')));
    render();
    await act(async () => {
      copyButton().click();
      await Promise.resolve();
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'کۆپی نەکرا. وشە نهێنییەکە بە دەست بنووسەوە.',
    );
  });
});
