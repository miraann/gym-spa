import { CheckIcon, CopyIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Alert, AlertDescription } from '../components/alert';
import { Button } from '../components/button';

type CopyState = 'idle' | 'copied' | 'failed';

/** How long "Copied" shows before the button reads "Copy" again. */
const COPIED_MS = 2000;

export interface CopyableSecretTexts {
  readonly label: string;
  readonly copy: string;
  readonly copied: string;
  readonly copyFailed: string;
  /** The warning under it, e.g. that it is shown only now. */
  readonly shownOnce: string;
}

/**
 * A secret from the server shown once (a temporary password, recovery codes): it lives only in the
 * parent's state while shown, and is never stored anywhere. Latin and left-to-right in every
 * language, with a copy button and a warning that it won't be shown again. Several lines (recovery
 * codes) keep their line breaks.
 */
export function CopyableSecret({
  value,
  texts,
  actions,
}: {
  readonly value: string;
  readonly texts: CopyableSecretTexts;
  /** More buttons next to Copy (e.g. download). */
  readonly actions?: ReactNode;
}) {
  const labelId = useId();
  const [copy, setCopy] = useState<CopyState>('idle');
  const multiline = value.includes('\n');

  useEffect(() => {
    if (copy !== 'copied') return;
    const timer = setTimeout(() => {
      setCopy('idle');
    }, COPIED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copy]);

  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopy('copied');
    } catch {
      // No clipboard (an old WebView, or permission refused): it can still be read and typed.
      setCopy('failed');
    }
  };

  const copyButton = (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={() => {
        void copyValue();
      }}
    >
      {copy === 'copied' ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <CopyIcon data-icon="inline-start" />
      )}
      {copy === 'copied' ? texts.copied : texts.copy}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p id={labelId} className="text-sm text-muted-foreground">
          {texts.label}
        </p>
        <div
          className={
            multiline
              ? 'flex flex-col gap-3 rounded-2xl bg-muted p-4'
              : 'flex items-center gap-2 rounded-2xl bg-muted p-2 ps-4'
          }
        >
          <output
            aria-labelledby={labelId}
            dir="ltr"
            translate="no"
            className={
              multiline
                ? 'grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-lg tracking-wider whitespace-pre select-all'
                : 'min-w-0 flex-1 font-mono text-2xl tracking-widest break-all select-all'
            }
          >
            {multiline ? value.split('\n').map((line) => <span key={line}>{line}</span>) : value}
          </output>
          {multiline ? (
            <div className="flex flex-wrap gap-2">
              {copyButton}
              {actions}
            </div>
          ) : (
            copyButton
          )}
        </div>
        <p role="status" className="min-h-5 text-sm text-destructive">
          {copy === 'failed' ? texts.copyFailed : null}
        </p>
      </div>
      <Alert variant="warning" role="note">
        <TriangleAlertIcon />
        <AlertDescription>{texts.shownOnce}</AlertDescription>
      </Alert>
    </div>
  );
}
