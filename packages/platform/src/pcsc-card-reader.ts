import type { DesktopBridge } from './desktop-bridge';
import type { NfcReader } from './nfc';

// PC/SC card readers such as the ACR122U (spec §1, step 2f): they don't type anything, so only the
// Windows app can read them. Its main process watches the readers (apps/desktop/src/pcsc-watcher.ts)
// and sends the page only the UIDs of cards read while a screen listens, with the reader's name, so
// the page can show the result on that reader.

export function pcscCardReader(bridge: DesktopBridge): NfcReader {
  return {
    kind: 'pcsc',
    listen(onRead) {
      return bridge.listenForCards(({ reader, uid }) => {
        onRead({
          uid,
          reader: 'pcsc',
          signal: (signal) => {
            bridge.signalCard(reader, signal);
          },
        });
      });
    },
  };
}
