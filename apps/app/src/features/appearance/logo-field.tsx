import {
  LOGO_MAX_BYTES,
  LOGO_MAX_SIDE,
  base64Bytes,
  logoDataUrl,
  type StoredLogo,
} from '@gym/core';
import { useMutation } from '@tanstack/react-query';
import { ImageIcon, ImageUpIcon, TrashIcon, TriangleAlertIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuthController } from '@/features/auth/auth-context';
import { setGymLogo, useGymLogo } from '@/lib/appearance';
import { useConnection } from '@/lib/connection';
import { useFormat } from '@/lib/format';
import { saveErrorKey, type SaveErrorKey } from '@/lib/save-error';
import { prepareLogo, type LogoProblem } from './logo-image';
import { removeLogo, saveLogo } from './save-appearance';

/**
 * The gym's logo (spec §6.1): shown in the top bar, on the login screen and, later, on receipts.
 * Picked, resized and checked here; saved at once after a confirmation (not with the colors).
 */
export function LogoField() {
  const { t } = useTranslation(['settings', 'common']);
  const format = useFormat();
  const controller = useAuthController();
  const online = useConnection().state === 'connected';
  const current = useGymLogo();
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [pending, setPending] = useState<StoredLogo | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [problem, setProblem] = useState<LogoProblem | null>(null);
  const [error, setError] = useState<SaveErrorKey | null>(null);

  const client = () => {
    const active = controller.activeClient;
    if (!active) throw new TypeError('Failed to fetch');
    return active;
  };

  const upload = useMutation({
    mutationFn: async (logo: StoredLogo) => ({ logo, updatedAt: await saveLogo(client(), logo) }),
    onMutate: () => {
      setError(null);
    },
    onSuccess: ({ logo, updatedAt }) => {
      setGymLogo({ ...logo, updatedAt });
      setPending(null);
      toast.success(t('appearance.logo.saved'));
    },
    onError: (failure) => {
      setPending(null);
      setError(saveErrorKey(failure, 'appearance-logo'));
    },
  });

  const remove = useMutation({
    mutationFn: () => removeLogo(client()),
    onMutate: () => {
      setError(null);
    },
    onSuccess: () => {
      setGymLogo(null);
      setConfirmRemove(false);
      toast.success(t('appearance.logo.removed'));
    },
    onError: (failure) => {
      setConfirmRemove(false);
      setError(saveErrorKey(failure, 'appearance-logo'));
    },
  });

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setError(null);
    setPreparing(true);
    try {
      const prepared = await prepareLogo(file);
      if (prepared.ok) setPending(prepared.logo);
      else setProblem(prepared.problem);
    } finally {
      setPreparing(false);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="gym-logo">
      <div>
        <h3 id="gym-logo">{t('appearance.logo.label')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('appearance.logo.hint', {
            side: format.number(LOGO_MAX_SIDE),
            size: format.number(LOGO_MAX_BYTES / 1024),
          })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-white p-2">
          {current ? (
            <img
              src={current}
              alt={t('appearance.logo.current')}
              className="size-full object-contain"
            />
          ) : (
            <ImageIcon aria-hidden className="size-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          {!current && <p className="text-sm text-muted-foreground">{t('appearance.logo.none')}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!online || preparing || upload.isPending}
              onClick={() => input.current?.click()}
            >
              {preparing ? <Spinner /> : <ImageUpIcon aria-hidden />}
              {preparing
                ? t('appearance.logo.preparing')
                : current
                  ? t('appearance.logo.change')
                  : t('appearance.logo.upload')}
            </Button>
            {current && (
              <Button
                variant="ghost"
                disabled={!online || remove.isPending}
                onClick={() => {
                  setConfirmRemove(true);
                }}
              >
                <TrashIcon aria-hidden />
                {t('appearance.logo.remove')}
              </Button>
            )}
          </div>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            // The same file can be picked again after a problem.
            event.target.value = '';
          }}
        />
      </div>

      {problem && (
        <Alert variant="destructive" role="alert">
          <TriangleAlertIcon />
          <AlertDescription>{t(`appearance.logo.errors.${problem}`)}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <TriangleAlertIcon />
          <AlertDescription>{t(`common:saveErrors.${error}`)}</AlertDescription>
        </Alert>
      )}

      <ResponsiveDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={t('appearance.logo.confirmTitle')}
        description={
          pending
            ? t('appearance.logo.confirmDescription', {
                size: format.number(Math.ceil(base64Bytes(pending.data) / 1024)),
              })
            : undefined
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setPending(null);
              }}
            >
              {t('appearance.confirm.back')}
            </Button>
            <Button
              disabled={upload.isPending || !pending}
              onClick={() => {
                if (pending) upload.mutate(pending);
              }}
            >
              {t('appearance.logo.save')}
            </Button>
          </>
        }
      >
        {pending && (
          <div className="flex justify-center">
            <div className="flex size-40 items-center justify-center rounded-2xl border bg-white p-3">
              <img
                src={logoDataUrl(pending)}
                alt={t('appearance.logo.preview')}
                className="size-full object-contain"
              />
            </div>
          </div>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t('appearance.logo.removeTitle')}
        description={t('appearance.logo.removeDescription')}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmRemove(false);
              }}
            >
              {t('appearance.confirm.back')}
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate();
              }}
            >
              {t('appearance.logo.removeConfirm')}
            </Button>
          </>
        }
      />
    </section>
  );
}
