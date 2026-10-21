import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { platform } from './runtime';

// Haptic feedback on key actions (step D-3), in the Android app (and iOS later). The web app and
// the Windows app have none: browsers' vibration is a buzz, not a tap. Never awaited by callers
// and never throws: a missing vibration motor must not break an action.

/** The kinds of feedback, like a native app's. */
export type HapticKind =
  /** A tab, chip or choice was picked. */
  | 'selection'
  /** A light tap, e.g. a PIN digit or a pull that is far enough. */
  | 'light'
  /** Something was saved. */
  | 'success'
  /** Something needs attention (a warning). */
  | 'warning'
  /** Something failed or was refused (e.g. a wrong PIN). */
  | 'error';

function native(): boolean {
  return platform === 'android' || platform === 'ios';
}

export function haptic(kind: HapticKind): void {
  if (!native()) return;
  const run = (): Promise<void> => {
    switch (kind) {
      case 'selection':
        return Haptics.selectionChanged();
      case 'light':
        return Haptics.impact({ style: ImpactStyle.Light });
      case 'success':
        return Haptics.notification({ type: NotificationType.Success });
      case 'warning':
        return Haptics.notification({ type: NotificationType.Warning });
      case 'error':
        return Haptics.notification({ type: NotificationType.Error });
    }
  };
  run().catch(() => undefined);
}
