import { App } from '@capacitor/app';
import { platform } from './runtime';

/**
 * Listens to Android's Back button and back gesture. Once a listener exists, Capacitor leaves Back
 * entirely to it (without one, it only steps back through the WebView history and does nothing on
 * the first page). `canGoBack` is false on the first page. Returns a function that stops listening.
 */
export function onBackButton(listener: (canGoBack: boolean) => void): () => void {
  if (platform !== 'android') return () => undefined;
  const handle = App.addListener('backButton', ({ canGoBack }) => {
    listener(canGoBack);
  });
  return () => {
    void handle.then((registered) => registered.remove());
  };
}

/** Sends the app to the background, like Android's own Back on a first screen. */
export async function minimizeApp(): Promise<void> {
  if (platform === 'android') await App.minimizeApp();
}
