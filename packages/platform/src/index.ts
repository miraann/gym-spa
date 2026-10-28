// Platform adapters. The React app reaches Capacitor and Electron only through this package.
export { detectPlatform, platform, type Platform } from './runtime';
export { minimizeApp, onBackButton } from './back-button';
export { applyNativeTheme } from './theme';
export type { CardSignal, ThemeSource } from './desktop-bridge';
export {
  cameraSupported,
  openCamera,
  stopCamera,
  type CameraProblem,
  type CameraResult,
} from './camera';
export { secureStorage, type SecureStorage } from './secure-storage';
export {
  canUsePcscReaders,
  cardReaders,
  watchPcscReaders,
  type CardRead,
  type CardReaderKind,
  type NfcReader,
} from './nfc';
export { CARD_INPUT_ATTRIBUTE } from './keyboard-card-reader';
export { haptic, type HapticKind } from './haptics';
export { saveFile, type FileToSave, type SaveResult } from './save-file';
export { canPrint, canPrintSilently, listPrinters, printPage } from './printer';
