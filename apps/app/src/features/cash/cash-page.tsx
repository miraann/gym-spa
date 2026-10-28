import { parseDecimal, parseWholeNumber } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { canPrint } from '@gym/platform';
import { GroupedList, GroupedListItem, RowChevron } from '@gym/ui/blocks/list-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gym/ui/components/dropdown-menu';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { PrinterIcon } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BranchSelect } from '@/components/branch-select';
import { NoAccess } from '@/components/no-access';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBranchChoice } from '@/lib/use-branch-choice';
import {
  useAddCashMovement,
  useCashReport,
  useCashShifts,
  useCloseCashShift,
  useOpenCashShift,
  type CashReport,
  type CashShift,
} from './cash-data';
import { CashError } from './cash-error';
import { cashErrorKey, type CashErrorKey } from './cash-errors';
import {
  CashReportPrint,
  CashReportView,
  DifferenceBadge,
  type CashReportSize,
} from './cash-report';

/**
 * /cash: a branch's cash register. Opening it, cash in and out, closing it with a blind count
 * (cash_register.operate), and the shifts with their differences (operate or view_all).
 */
export function CashPage() {
  const mayOperate = usePermission('cash_register.operate');
  const mayViewAll = usePermission('cash_register.view_all');
  if (!mayOperate && !mayViewAll) return <NoAccess />;
  return <Cash mayOperate={mayOperate} />;
}

type Dialog =
  | { readonly kind: 'open' }
  | { readonly kind: 'in' | 'out' | 'close'; readonly shiftId: string }
  | { readonly kind: 'report'; readonly shiftId: string };

function Cash({ mayOperate }: { readonly mayOperate: boolean }) {
  const { t } = useTranslation('cash');
  const { language } = usePreferences();
  const format = useFormat();
  const { branchId, setBranchId, active } = useBranchChoice();
  const shifts = useCashShifts(branchId);
  const open = shifts.data?.find((shift) => shift.closedAt === null) ?? null;
  const closed = (shifts.data ?? []).filter((shift) => shift.closedAt !== null).slice(0, 30);
  const report = useCashReport(open?.id ?? null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const branch = active.find((each) => each.id === branchId);
  const branchName = branch ? localizedName(branch, language) : '';
  const close = () => {
    setDialog(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('page.title')} description={t('page.description')} />
      <BranchSelect
        label={t('page.branch')}
        branchId={branchId}
        active={active}
        onChange={setBranchId}
      />

      {shifts.isError ? (
        <CashError error={cashErrorKey(shifts.error, 'load_shifts')} />
      ) : shifts.isPending ? (
        <Skeleton className="h-48 rounded-3xl" />
      ) : open === null ? (
        <Card data-testid="cash-closed">
          <CardHeader>
            <CardTitle>
              <h2>{t('page.closed')}</h2>
            </CardTitle>
            <CardDescription>{t('page.closedHint')}</CardDescription>
          </CardHeader>
          {mayOperate && (
            <CardContent>
              <Button
                size="lg"
                onClick={() => {
                  setDialog({ kind: 'open' });
                }}
              >
                {t('page.open')}
              </Button>
            </CardContent>
          )}
        </Card>
      ) : (
        <Card data-testid="cash-open">
          <CardHeader>
            <CardTitle>
              <h2>{t('page.openTitle')}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {report.isError ? (
              <CashError error={cashErrorKey(report.error, 'load_report')} />
            ) : report.isPending ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : (
              <CashReportView report={report.data} />
            )}
            <div className="flex flex-wrap gap-2">
              {mayOperate && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDialog({ kind: 'in', shiftId: open.id });
                    }}
                  >
                    {t('page.cashIn')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDialog({ kind: 'out', shiftId: open.id });
                    }}
                  >
                    {t('page.cashOut')}
                  </Button>
                  <Button
                    onClick={() => {
                      setDialog({ kind: 'close', shiftId: open.id });
                    }}
                  >
                    {t('page.close')}
                  </Button>
                </>
              )}
              {report.data && <PrintReport report={report.data} branchName={branchName} />}
            </div>
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('page.shifts')}</h2>
        {shifts.isSuccess && closed.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('page.noShifts')}</p>
        ) : (
          <GroupedList aria-label={t('page.shifts')}>
            {closed.map((shift) => (
              <GroupedListItem key={shift.id}>
                <button
                  type="button"
                  className={groupedRowClass()}
                  data-cash-shift={shift.id}
                  onClick={() => {
                    setDialog({ kind: 'report', shiftId: shift.id });
                  }}
                >
                  <span className="flex flex-1 flex-col gap-1">
                    <span>
                      {t('page.shiftDates', {
                        from: format.dateTime(shift.openedAt),
                        until: format.time(shift.closedAt ?? shift.openedAt),
                      })}
                    </span>
                  </span>
                  <ShiftDifference shift={shift} />
                  <RowChevron />
                </button>
              </GroupedListItem>
            ))}
          </GroupedList>
        )}
      </section>

      {dialog?.kind === 'open' && (
        <OpenDialog branchId={branchId} last={closed[0] ?? null} onClose={close} />
      )}
      {(dialog?.kind === 'in' || dialog?.kind === 'out') && (
        <MovementDialog kind={dialog.kind} shiftId={dialog.shiftId} onClose={close} />
      )}
      {dialog?.kind === 'close' && (
        <CloseDialog
          shiftId={dialog.shiftId}
          onClose={close}
          onClosed={(shiftId) => {
            setDialog({ kind: 'report', shiftId });
          }}
        />
      )}
      {dialog?.kind === 'report' && (
        <ReportDialog shiftId={dialog.shiftId} branchName={branchName} onClose={close} />
      )}
    </div>
  );
}

function ShiftDifference({ shift }: { readonly shift: CashShift }) {
  if (shift.countedIqd === null || shift.expectedIqd === null) return null;
  const dinars = shift.countedIqd - shift.expectedIqd;
  const dollars = (shift.countedUsd ?? 0) - (shift.expectedUsd ?? 0);
  return (
    <span className="flex flex-wrap gap-1">
      <DifferenceBadge difference={dinars} currency="IQD" />
      {dollars !== 0 && <DifferenceBadge difference={dollars} currency="USD" />}
    </span>
  );
}

function PrintReport({
  report,
  branchName,
}: {
  readonly report: CashReport;
  readonly branchName: string;
}) {
  const { t } = useTranslation('cash');
  const { t: tp } = useTranslation('payments');
  const [printing, setPrinting] = useState<CashReportSize | null>(null);
  const done = useCallback(() => {
    setPrinting(null);
  }, []);
  if (!canPrint()) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={printing !== null}>
            <PrinterIcon data-icon="inline-start" />
            {t('page.print')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setPrinting('80mm');
            }}
          >
            {tp('receipt.size80')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setPrinting('a4');
            }}
          >
            {tp('receipt.sizeA4')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {printing && (
        <CashReportPrint report={report} branchName={branchName} size={printing} onDone={done} />
      )}
    </>
  );
}

function DialogButtons({
  pending,
  onSave,
  onClose,
}: {
  readonly pending: boolean;
  readonly onSave: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('cash');
  const { online, readOnly } = useAdminWriteState();
  return (
    <>
      <Button disabled={!online || readOnly || pending} onClick={onSave}>
        {pending && <Spinner />}
        {t('actions.save')}
      </Button>
      <Button variant="outline" onClick={onClose}>
        {t('actions.cancel')}
      </Button>
    </>
  );
}

function AmountField({
  id,
  label,
  value,
  onChange,
  problem,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly problem: string | null;
}) {
  return (
    <Field data-invalid={problem ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        dir="ltr"
        inputMode="decimal"
        className="tabular-nums"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {problem && <FieldError>{problem}</FieldError>}
    </Field>
  );
}

/** Dinars are whole; dollars may have cents. Empty dollars are 0. */
function readAmounts(dinars: string, dollars: string) {
  const iqd = parseWholeNumber(dinars);
  const usd = dollars.trim() === '' ? 0 : parseDecimal(dollars);
  return { iqd, usd };
}

function OpenDialog({
  branchId,
  last,
  onClose,
}: {
  readonly branchId: string;
  readonly last: CashShift | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('cash');
  const format = useFormat();
  const id = useId();
  const openShift = useOpenCashShift();
  const [shiftId] = useState(() => crypto.randomUUID());
  const [dinars, setDinars] = useState('');
  const [dollars, setDollars] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<CashErrorKey | null>(null);
  const { iqd, usd } = readAmounts(dinars, dollars);

  const confirm = () => {
    setSent(true);
    if (iqd === null || usd === null) return;
    setError(null);
    openShift.mutate(
      { id: shiftId, branchId, iqd, usd },
      {
        onSuccess: () => {
          toast.success(t('open.opened'));
          onClose();
        },
        onError: (thrown) => {
          setError(cashErrorKey(thrown, 'open'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('open.title')}
      description={t('open.hint')}
      footer={<DialogButtons pending={openShift.isPending} onSave={confirm} onClose={onClose} />}
    >
      <FieldGroup data-testid="cash-open-form">
        <AmountField
          id={`${id}-iqd`}
          label={t('open.floatIqd')}
          value={dinars}
          onChange={setDinars}
          problem={sent && iqd === null ? t('closeShift.numberProblem') : null}
        />
        <AmountField
          id={`${id}-usd`}
          label={t('open.floatUsd')}
          value={dollars}
          onChange={setDollars}
          problem={sent && usd === null ? t('closeShift.numberProblem') : null}
        />
        {last?.countedIqd != null && (
          <FieldDescription>
            {t('open.lastCount', {
              iqd: format.money(last.countedIqd, 'IQD'),
              usd: format.money(last.countedUsd ?? 0, 'USD'),
            })}
          </FieldDescription>
        )}
        <CashError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

function MovementDialog({
  kind,
  shiftId,
  onClose,
}: {
  readonly kind: 'in' | 'out';
  readonly shiftId: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('cash');
  const id = useId();
  const add = useAddCashMovement();
  const [movementId] = useState(() => crypto.randomUUID());
  const [currency, setCurrency] = useState<'IQD' | 'USD'>('IQD');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<CashErrorKey | null>(null);
  const value = currency === 'IQD' ? parseWholeNumber(amount) : parseDecimal(amount);
  const amountProblem = value === null || value <= 0;
  const reasonProblem = reason.trim() === '';

  const confirm = () => {
    setSent(true);
    if (amountProblem || reasonProblem) return;
    setError(null);
    add.mutate(
      { id: movementId, shiftId, kind, currency, amount: value, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(t('movement.saved'));
          onClose();
        },
        onError: (thrown) => {
          setError(cashErrorKey(thrown, kind));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={kind === 'in' ? t('movement.inTitle') : t('movement.outTitle')}
      footer={<DialogButtons pending={add.isPending} onSave={confirm} onClose={onClose} />}
    >
      <FieldGroup data-testid="cash-movement-form">
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field>
            <FieldLabel htmlFor={`${id}-currency`}>{t('movement.currency')}</FieldLabel>
            <NativeSelect
              id={`${id}-currency`}
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value === 'USD' ? 'USD' : 'IQD');
              }}
            >
              <NativeSelectOption value="IQD">{t('report.iqd')}</NativeSelectOption>
              <NativeSelectOption value="USD">{t('report.usd')}</NativeSelectOption>
            </NativeSelect>
          </Field>
          <AmountField
            id={`${id}-amount`}
            label={t('movement.amount')}
            value={amount}
            onChange={setAmount}
            problem={sent && amountProblem ? t('movement.amountProblem') : null}
          />
        </div>
        <Field data-invalid={sent && reasonProblem ? true : undefined}>
          <FieldLabel htmlFor={`${id}-reason`}>{t('movement.reason')}</FieldLabel>
          <Textarea
            id={`${id}-reason`}
            maxLength={300}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          {sent && reasonProblem && <FieldError>{t('movement.reasonProblem')}</FieldError>}
        </Field>
        <CashError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

function CloseDialog({
  shiftId,
  onClose,
  onClosed,
}: {
  readonly shiftId: string;
  readonly onClose: () => void;
  readonly onClosed: (shiftId: string) => void;
}) {
  const { t } = useTranslation('cash');
  const id = useId();
  const closeShift = useCloseCashShift();
  const [dinars, setDinars] = useState('');
  const [dollars, setDollars] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<CashErrorKey | null>(null);
  const { iqd, usd } = readAmounts(dinars, dollars);

  const confirm = () => {
    setSent(true);
    if (iqd === null || usd === null) return;
    setError(null);
    // The report opens in this dialog's place, so not mutate()'s callbacks.
    void closeShift
      .mutateAsync({ shiftId, iqd, usd, note: note.trim() === '' ? null : note.trim() })
      .then(
        () => {
          toast.success(t('closeShift.closed'));
          onClosed(shiftId);
        },
        (thrown: unknown) => {
          setError(cashErrorKey(thrown, 'close'));
        },
      );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('closeShift.title')}
      description={t('closeShift.hint')}
      footer={<DialogButtons pending={closeShift.isPending} onSave={confirm} onClose={onClose} />}
    >
      <FieldGroup data-testid="cash-close-form">
        <AmountField
          id={`${id}-iqd`}
          label={t('closeShift.countedIqd')}
          value={dinars}
          onChange={setDinars}
          problem={sent && iqd === null ? t('closeShift.numberProblem') : null}
        />
        <AmountField
          id={`${id}-usd`}
          label={t('closeShift.countedUsd')}
          value={dollars}
          onChange={setDollars}
          problem={sent && usd === null ? t('closeShift.numberProblem') : null}
        />
        <Field>
          <FieldLabel htmlFor={`${id}-note`}>{t('closeShift.note')}</FieldLabel>
          <Textarea
            id={`${id}-note`}
            maxLength={500}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
        <CashError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

function ReportDialog({
  shiftId,
  branchName,
  onClose,
}: {
  readonly shiftId: string;
  readonly branchName: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('cash');
  const report = useCashReport(shiftId);
  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('report.title')}
      footer={
        <>
          {report.data && <PrintReport report={report.data} branchName={branchName} />}
          <Button onClick={onClose}>{t('actions.done')}</Button>
        </>
      }
    >
      {report.isError ? (
        <CashError error={cashErrorKey(report.error, 'load_report')} />
      ) : report.isPending ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : (
        <CashReportView report={report.data} />
      )}
    </ResponsiveDialog>
  );
}
