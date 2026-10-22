import { isCleanText, MEMBER_LIMITS } from '@gym/core';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Field, FieldError, FieldLabel } from '@gym/ui/components/field';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { hasTouchScreen } from '@gym/ui/lib/touch';
import { ArchiveIcon, TriangleAlertIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAdminWriteState } from '@/features/staff/write-state';
import {
  undoFailureOf,
  useUndoImport,
  useUndoPreview,
  type UndoFailure,
} from './member-import-data';

/**
 * Taking a wrong import back (members.delete): archives every member it added that isn't archived
 * yet, all or nothing, with a reason. The confirmation says how many, and how many were changed
 * since the import.
 */
export function UndoImportButton({
  importId,
  fileName,
  onDone,
}: {
  readonly importId: string;
  readonly fileName: string;
  readonly onDone?: () => void;
}) {
  const { t } = useTranslation('memberImport');
  const { online, readOnly } = useAdminWriteState();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        disabled={!online || readOnly}
        data-testid="undo-import"
        onClick={() => {
          setOpen(true);
        }}
      >
        <ArchiveIcon data-icon="inline-start" />
        {t('undo.action')}
      </Button>
      {open && (
        <UndoImportDialog
          importId={importId}
          fileName={fileName}
          onClose={() => {
            setOpen(false);
          }}
          onDone={onDone}
        />
      )}
    </>
  );
}

function UndoImportDialog({
  importId,
  fileName,
  onClose,
  onDone,
}: {
  readonly importId: string;
  readonly fileName: string;
  readonly onClose: () => void;
  readonly onDone?: () => void;
}) {
  const { t } = useTranslation('memberImport');
  const id = useId();
  const { online } = useAdminWriteState();
  const preview = useUndoPreview(importId);
  const undo = useUndoImport();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<'reasonRequired' | 'reasonText' | null>(null);
  const [failure, setFailure] = useState<UndoFailure | null>(null);
  const shownFailure = failure ?? (preview.isError ? undoFailureOf(preview.error) : null);

  const confirm = () => {
    const cleaned = reason.trim();
    if (cleaned === '') {
      setReasonError('reasonRequired');
      return;
    }
    if (!isCleanText(cleaned, MEMBER_LIMITS.statusReason)) {
      setReasonError('reasonText');
      return;
    }
    setReasonError(null);
    setFailure(null);
    undo.mutate(
      { importId, reason: cleaned },
      {
        onSuccess: (done) => {
          toast.success(t('undo.done', { count: done.archived }));
          onDone?.();
          onClose();
        },
        onError: (error) => {
          setFailure(undoFailureOf(error));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open && !undo.isPending) onClose();
      }}
      title={t('undo.title')}
      description={t('undo.description')}
      // On touch screens the keyboard would cover the counts before staff have read them.
      focusFirst={!hasTouchScreen()}
      footer={
        <>
          <Button
            variant="destructive"
            disabled={!online || !preview.isSuccess || undo.isPending}
            data-testid="undo-confirm"
            onClick={confirm}
          >
            {undo.isPending && <Spinner data-icon="inline-start" />}
            {t('undo.confirm')}
          </Button>
          <Button variant="outline" disabled={undo.isPending} onClick={onClose}>
            {t('undo.cancel')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="undo-dialog">
        <p className="text-sm text-muted-foreground">
          <bdi>{t('undo.file', { name: fileName })}</bdi>
        </p>
        {preview.isPending ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : (
          preview.data && (
            <div className="flex flex-col gap-1" data-testid="undo-summary">
              <p className="font-medium">{t('undo.summary', { count: preview.data.toArchive })}</p>
              {preview.data.cards > 0 && (
                <p className="text-sm">{t('undo.cards', { count: preview.data.cards })}</p>
              )}
              {preview.data.alreadyArchived > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t('undo.alreadyArchived', { count: preview.data.alreadyArchived })}
                </p>
              )}
            </div>
          )
        )}
        {preview.data && preview.data.changed > 0 && (
          <Alert variant="warning" data-testid="undo-changed">
            <TriangleAlertIcon />
            <AlertDescription>
              {t('undo.changed', { count: preview.data.changed })}
            </AlertDescription>
          </Alert>
        )}
        <Field data-invalid={reasonError !== null}>
          <FieldLabel htmlFor={`${id}-reason`}>{t('undo.reason')}</FieldLabel>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            maxLength={MEMBER_LIMITS.statusReason}
            aria-invalid={reasonError !== null}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          {reasonError !== null && <FieldError>{t(`undo.${reasonError}`)}</FieldError>}
        </Field>
        {shownFailure !== null && (
          <Alert variant="destructive" role="alert">
            <TriangleAlertIcon />
            <AlertDescription>{t(`undo.failures.${shownFailure}`)}</AlertDescription>
          </Alert>
        )}
      </div>
    </ResponsiveDialog>
  );
}
