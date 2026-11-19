import {
  LICENSE_MAX_LIMIT,
  addMonthsToDate,
  baghdadDateOf,
  formatMachineCode,
  isTestLicenseKid,
  licenseDateProblem,
  licenseState,
  licenseUpdates,
  normalizeMachineCode,
  type LicenseType,
} from '@gym/core';
import type { SellerTexts } from '@gym/i18n';
import { AddTile } from '@gym/ui/blocks/add-tile';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import {
  BadgeCheckIcon,
  BanIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  ClockAlertIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileKeyIcon,
  FlaskConicalIcon,
  InfinityIcon,
  MonitorIcon,
  PowerOffIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  useActivations,
  useIssueActivation,
  useIssueLicense,
  useLicenseRecord,
  useLicenses,
  type ActivationRow,
  type LicenseRow,
} from '@/lib/api';
import { panelErrorKey, type PanelErrorKey } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { FormError } from '@/shell/form-error';

// An offline gym's licenses and server PC (spec §2.6, step MT-5). The codes are signed by the
// seller-admin function; the panel shows them, lets them be copied or saved as a text file (the
// offline server reads one), and records revoking and deactivating with a reason.

type LicenseTexts = SellerTexts['license'];
type DateProblemKey = keyof LicenseTexts['dateProblems'];

/** The license a gym works with: its newest one that isn't revoked. */
export function currentLicense(licenses: readonly LicenseRow[], gymId: string): LicenseRow | null {
  return (
    licenses.find((license) => license.gym_id === gymId && license.revoked_at === null) ?? null
  );
}

function typed(license: LicenseRow): { type: LicenseType; expiresOn: string | null } {
  return {
    type: license.type === 'yearly' ? 'yearly' : 'perpetual',
    expiresOn: license.expires_on,
  };
}

/** A license's state with its status color, an icon and words (never color alone). */
export function LicenseStateBadge({ license }: { readonly license: LicenseRow | null }) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  if (license === null) {
    return (
      <Badge variant="warning" data-license-state="none">
        <TriangleAlertIcon aria-hidden="true" />
        {t('license.state.none')}
      </Badge>
    );
  }
  if (license.revoked_at !== null) {
    return (
      <Badge variant="destructive" data-license-state="revoked">
        <BanIcon aria-hidden="true" />
        {t('license.state.revoked')}
      </Badge>
    );
  }
  const state = licenseState(typed(license));
  if (state.kind === 'expired') {
    return (
      <Badge variant="destructive" data-license-state="expired">
        <EyeIcon aria-hidden="true" />
        {t('license.state.expired')}
      </Badge>
    );
  }
  if (state.kind === 'grace') {
    return (
      <Badge variant="warning" data-license-state="grace">
        <ClockAlertIcon aria-hidden="true" />
        {t('license.state.grace', { days: format.number(state.daysLeft) })}
      </Badge>
    );
  }
  if (state.stage !== null && state.daysLeft !== null) {
    return (
      <Badge variant="warning" data-license-state="ending">
        <CalendarClockIcon aria-hidden="true" />
        {t('license.state.ending', { days: format.number(state.daysLeft) })}
      </Badge>
    );
  }
  return (
    <Badge variant="success" data-license-state="active">
      <CircleCheckIcon aria-hidden="true" />
      {t('license.state.active')}
    </Badge>
  );
}

/** What a license allows until, in one line: "yearly, until …" or "perpetual, updates until …". */
export function LicenseTerm({ license }: { readonly license: LicenseRow }) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  return license.type === 'yearly' ? (
    <span>{t('license.yearlyUntil', { date: format.date(license.expires_on ?? '') })}</span>
  ) : (
    <span>{t('license.perpetualUntil', { date: format.date(license.updates_until ?? '') })}</span>
  );
}

// A code: shown, copied, saved ------------------------------------------------------------------

function download(fileName: string, code: string): void {
  const url = URL.createObjectURL(new Blob([`${code}\r\n`], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** A signed code: not secret (it only works for its gym), so it stays here to copy again. */
function CodeBox({
  code,
  fileName,
  testId,
}: {
  readonly code: string;
  readonly fileName: string;
  readonly testId: string;
}) {
  const { t } = useTranslation('seller');
  return (
    <div className="flex flex-col gap-2">
      <code
        dir="ltr"
        data-testid={testId}
        className="max-h-32 overflow-y-auto rounded-xl bg-muted px-3 py-2 text-xs break-all select-all"
      >
        {code}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(code).then(
              () => toast.success(t('license.copied')),
              () => toast.error(t('license.copyFailed')),
            );
          }}
        >
          <CopyIcon data-icon="inline-start" />
          {t('license.copy')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            download(fileName, code);
          }}
        >
          <DownloadIcon data-icon="inline-start" />
          {t('license.download')}
        </Button>
      </div>
    </div>
  );
}

function fileName(kind: 'license' | 'activation', gymCode: string, date: string): string {
  return `gym-spa-${kind}-${gymCode}-${date}.txt`;
}

function Line({ children }: { readonly children: ReactNode }) {
  return <span className="text-sm text-muted-foreground">{children}</span>;
}

// Revoke and deactivate: records with a reason ----------------------------------------------------

type RecordKind = 'revoke_license' | 'deactivate_activation';

function RecordDialog({
  kind,
  id,
  onClose,
}: {
  readonly kind: RecordKind;
  readonly id: string | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('seller');
  const record = useLicenseRecord();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<PanelErrorKey | null>(null);
  const texts = kind === 'revoke_license' ? 'license.revoke' : 'server.deactivate';

  const close = () => {
    setReason('');
    setError(null);
    onClose();
  };
  const confirm = () => {
    const value = reason.trim();
    if (id === null) return;
    if (value === '') {
      setError('reason_required');
      return;
    }
    record.mutate(
      { kind, id, reason: value },
      {
        onSuccess: () => {
          toast.success(t(`${texts}.done`));
          close();
        },
        onError: (thrown) => {
          setError(panelErrorKey(thrown));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={t(`${texts}.title`)}
      description={t(`${texts}.description`)}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" disabled={record.isPending} onClick={confirm}>
            {record.isPending && <Spinner />}
            {t(`${texts}.confirm`)}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="record-reason">{t('license.reason')}</FieldLabel>
          <Textarea
            id="record-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </Field>
        <FormError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

// Issuing a license --------------------------------------------------------------------------------

/** A limit field: a whole number from 1, or empty for none. */
function parseLimit(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const number = Number(trimmed);
  return number >= 1 && number <= LICENSE_MAX_LIMIT ? number : 'invalid';
}

const QUICK_MONTHS: Readonly<Record<LicenseType, readonly number[]>> = {
  yearly: [12, 24],
  perpetual: [12, 24, 36],
};

function IssueLicenseDialog({
  gymId,
  gymCode,
  open,
  onOpenChange,
}: {
  readonly gymId: string;
  readonly gymCode: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  const issue = useIssueLicense();
  const today = baghdadDateOf(Date.now());
  const [type, setType] = useState<LicenseType>('yearly');
  const [validUntil, setValidUntil] = useState(() => addMonthsToDate(today, 12));
  const [branches, setBranches] = useState('1');
  const [devices, setDevices] = useState('');
  const [error, setError] = useState<PanelErrorKey | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  const dateProblem = licenseDateProblem(type, today, validUntil);
  const problemKey: DateProblemKey | null =
    dateProblem === null
      ? null
      : dateProblem === 'too_far'
        ? type === 'yearly'
          ? 'tooFarYearly'
          : 'tooFarPerpetual'
        : dateProblem === 'too_soon'
          ? 'tooSoon'
          : 'invalid';

  const submit = () => {
    const maxBranches = parseLimit(branches);
    const maxDevices = parseLimit(devices);
    if (maxBranches === 'invalid' || maxDevices === 'invalid') {
      setError('invalid_limit');
      return;
    }
    if (dateProblem !== null) {
      setError('invalid_license_date');
      return;
    }
    setError(null);
    issue.mutate(
      { action: 'issue_license', gymId, type, maxBranches, maxDevices, validUntil },
      {
        onSuccess: (result) => {
          setIssued(result.code);
        },
        onError: (thrown) => {
          setError(panelErrorKey(thrown));
        },
      },
    );
  };

  if (issued !== null) {
    return (
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t('license.issue.doneTitle')}
        description={t('license.issue.doneDescription')}
        footer={
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('license.issue.close')}
          </Button>
        }
      >
        <CodeBox
          code={issued}
          fileName={fileName('license', gymCode, today)}
          testId="issued-license"
        />
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('license.issue.title')}
      description={t('license.issue.description')}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button disabled={issue.isPending} onClick={submit}>
            {issue.isPending && <Spinner />}
            {t('license.issue.confirm')}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <ChoiceGroup
          label={t('license.issue.type')}
          value={type}
          onChange={(value) => {
            setType(value);
            setValidUntil(addMonthsToDate(today, 12));
          }}
          choices={[
            { value: 'yearly', label: t('license.yearly'), icon: CalendarClockIcon },
            { value: 'perpetual', label: t('license.perpetual'), icon: InfinityIcon },
          ]}
        />
        <Field data-invalid={problemKey !== null}>
          <FieldLabel htmlFor="license-until">
            {type === 'yearly' ? t('license.issue.lastDay') : t('license.issue.updatesUntil')}
          </FieldLabel>
          <Input
            id="license-until"
            type="date"
            dir="ltr"
            value={validUntil}
            aria-invalid={problemKey !== null}
            onChange={(event) => {
              setValidUntil(event.target.value);
            }}
          />
          {problemKey === null ? (
            <FieldDescription>
              {type === 'yearly'
                ? t('license.issue.yearlyHint', { date: format.date(validUntil) })
                : t('license.issue.perpetualHint', { date: format.date(validUntil) })}
            </FieldDescription>
          ) : (
            <FieldError>{t(`license.dateProblems.${problemKey}`)}</FieldError>
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          {QUICK_MONTHS[type].map((months) => (
            <Button
              key={months}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setValidUntil(addMonthsToDate(today, months));
              }}
            >
              {t('subscription.addMonths', { months: format.number(months) })}
            </Button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="license-branches">{t('gym.maxBranches')}</FieldLabel>
            <Input
              id="license-branches"
              dir="ltr"
              inputMode="numeric"
              value={branches}
              placeholder={t('gym.noLimit')}
              onChange={(event) => {
                setBranches(event.target.value);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="license-devices">{t('gym.maxDevices')}</FieldLabel>
            <Input
              id="license-devices"
              dir="ltr"
              inputMode="numeric"
              value={devices}
              placeholder={t('gym.noLimit')}
              onChange={(event) => {
                setDevices(event.target.value);
              }}
            />
          </Field>
        </div>
        <FormError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

// The licenses card --------------------------------------------------------------------------------

function LicenseItem({
  license,
  current,
  onRevoke,
}: {
  readonly license: LicenseRow;
  readonly current: boolean;
  readonly onRevoke: () => void;
}) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  const updates = licenseUpdates({
    type: license.type === 'perpetual' ? 'perpetual' : 'yearly',
    updatesUntil: license.updates_until,
  });
  const limit = (value: number | null) =>
    value === null ? t('gym.noLimit') : format.number(value);
  return (
    <li
      className="flex flex-col gap-2 border-b py-3 last:border-0"
      data-testid="license"
      data-license-id={license.id}
    >
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          {license.type === 'yearly' ? t('license.yearly') : t('license.perpetual')}
          {current && (
            <Badge variant="secondary">
              <BadgeCheckIcon aria-hidden="true" />
              {t('license.current')}
            </Badge>
          )}
        </span>
        {(current || license.revoked_at !== null) && <LicenseStateBadge license={license} />}
      </span>
      <LicenseTerm license={license} />
      {updates.kind !== 'none' && license.revoked_at === null && (
        <Line>
          {updates.kind === 'ended'
            ? t('license.updatesEnded')
            : t('license.updatesEnding', { days: format.number(updates.daysLeft) })}
        </Line>
      )}
      <Line>
        {t('license.limits', {
          branches: limit(license.max_branches),
          devices: limit(license.max_devices),
        })}
      </Line>
      <Line>
        {t('license.issuedBy', {
          date: format.date(license.issued_on),
          email: license.created_by_email ?? t('log.byScript'),
        })}
      </Line>
      <Line>
        {t('license.key')}{' '}
        <span dir="ltr" className="font-mono">
          {license.kid}
        </span>
      </Line>
      {isTestLicenseKid(license.kid) && (
        <Alert variant="warning">
          <FlaskConicalIcon />
          <AlertDescription>{t('license.testKey')}</AlertDescription>
        </Alert>
      )}
      {license.revoked_at !== null ? (
        <Line>
          {t('license.revokedLine', {
            date: format.date(license.revoked_at),
            reason: license.revoke_reason ?? '',
          })}
        </Line>
      ) : (
        <div className="flex flex-col gap-2">
          <CodeBox
            code={license.code}
            fileName={fileName('license', license.gym_code, license.issued_on)}
            testId="license-code"
          />
          <Button variant="ghost" size="sm" className="self-start" onClick={onRevoke}>
            <BanIcon data-icon="inline-start" />
            {t('license.revoke.confirm')}
          </Button>
        </div>
      )}
    </li>
  );
}

export function LicensesCard({
  gymId,
  gymCode,
}: {
  readonly gymId: string;
  readonly gymCode: string;
}) {
  const { t } = useTranslation('seller');
  const licenses = useLicenses(gymId);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const current = currentLicense(licenses.data ?? [], gymId);

  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <FileKeyIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          {t('license.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <AddTile
          label={t('license.issue.title')}
          onClick={() => {
            setIssuing(true);
          }}
        />
        {licenses.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : licenses.isError ? (
          <FormError error={panelErrorKey(licenses.error)} />
        ) : licenses.data.length === 0 ? (
          <p className="text-muted-foreground">{t('license.empty')}</p>
        ) : (
          <ul className="flex flex-col">
            {licenses.data.map((license) => (
              <LicenseItem
                key={license.id}
                license={license}
                current={license.id === current?.id}
                onRevoke={() => {
                  setRevoking(license.id);
                }}
              />
            ))}
          </ul>
        )}
      </CardContent>
      {issuing && (
        <IssueLicenseDialog gymId={gymId} gymCode={gymCode} open onOpenChange={setIssuing} />
      )}
      <RecordDialog
        kind="revoke_license"
        id={revoking}
        onClose={() => {
          setRevoking(null);
        }}
      />
    </Card>
  );
}

// The server PC -------------------------------------------------------------------------------------

function ActivateDialog({
  gymId,
  gymCode,
  open,
  onOpenChange,
}: {
  readonly gymId: string;
  readonly gymCode: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('seller');
  const activate = useIssueActivation();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<PanelErrorKey | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  const normalized = normalizeMachineCode(typed);
  // Judged once the whole code is there (20 characters, dashes and spaces aside).
  const complete = typed.replace(/[\s-]/g, '').length >= 20;

  const submit = () => {
    if (normalized === null) {
      setError('invalid_machine_code');
      return;
    }
    setError(null);
    activate.mutate(
      { action: 'issue_activation', gymId, machineCode: normalized },
      {
        onSuccess: (result) => {
          setIssued(result.code);
        },
        onError: (thrown) => {
          setError(panelErrorKey(thrown));
        },
      },
    );
  };

  if (issued !== null) {
    return (
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t('server.activate.doneTitle')}
        description={t('server.activate.doneDescription')}
        footer={
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('license.issue.close')}
          </Button>
        }
      >
        <CodeBox
          code={issued}
          fileName={fileName('activation', gymCode, baghdadDateOf(Date.now()))}
          testId="issued-activation"
        />
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('server.activate.title')}
      description={t('server.activate.description')}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button disabled={activate.isPending} onClick={submit}>
            {activate.isPending && <Spinner />}
            {t('server.activate.confirm')}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field data-invalid={complete && normalized === null}>
          <FieldLabel htmlFor="machine-code">{t('server.machineCode')}</FieldLabel>
          <Input
            id="machine-code"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase"
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
            value={typed}
            aria-invalid={complete && normalized === null}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
          {complete && normalized === null ? (
            <FieldError>{t('errors.invalid_machine_code')}</FieldError>
          ) : normalized !== null ? (
            <FieldDescription className="flex items-center gap-1 text-success">
              <CircleCheckIcon className="size-4" aria-hidden="true" />
              {t('server.machineCodeOk')}{' '}
              <span dir="ltr" className="font-mono">
                {formatMachineCode(normalized)}
              </span>
            </FieldDescription>
          ) : (
            <FieldDescription>{t('server.machineCodeHint')}</FieldDescription>
          )}
        </Field>
        <FormError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

function ActivationItem({ activation }: { readonly activation: ActivationRow }) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  return (
    <li className="flex flex-col gap-1 border-b py-2 last:border-0" data-testid="past-activation">
      <span dir="ltr" className="self-start font-mono text-sm">
        {formatMachineCode(activation.machine_code)}
      </span>
      <Line>
        {t('server.deactivatedLine', {
          date: format.date(activation.deactivated_at ?? ''),
          reason: activation.deactivate_reason ?? '',
        })}
      </Line>
    </li>
  );
}

export function ServerPcCard({
  gymId,
  gymCode,
}: {
  readonly gymId: string;
  readonly gymCode: string;
}) {
  const { t } = useTranslation('seller');
  const format = useFormat();
  const activations = useActivations(gymId);
  const licenses = useLicenses(gymId);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const active = activations.data?.find((activation) => activation.deactivated_at === null) ?? null;
  const past = activations.data?.filter((activation) => activation.deactivated_at !== null) ?? [];
  const hasLicense = currentLicense(licenses.data ?? [], gymId) !== null;

  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <MonitorIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          {t('server.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {active === null && (
          <AddTile
            label={t('server.activate.title')}
            disabled={!hasLicense}
            onClick={() => {
              setActivating(true);
            }}
          />
        )}
        {activations.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : activations.isError ? (
          <FormError error={panelErrorKey(activations.error)} />
        ) : active === null ? (
          <p className="text-muted-foreground">
            {hasLicense ? t('server.none') : t('server.needsLicense')}
          </p>
        ) : (
          <div className="flex flex-col gap-2" data-testid="active-activation">
            <span className="flex flex-wrap items-center gap-2">
              <span dir="ltr" className="font-mono text-lg">
                {formatMachineCode(active.machine_code)}
              </span>
              <Badge variant="success">
                <CircleCheckIcon aria-hidden="true" />
                {t('server.active')}
              </Badge>
            </span>
            <Line>
              {t('server.activeSince', {
                date: format.date(active.issued_on),
                email: active.created_by_email ?? t('log.byScript'),
              })}
            </Line>
            <span className="text-sm">{t('server.activationCode')}</span>
            <CodeBox
              code={active.code}
              fileName={fileName('activation', gymCode, active.issued_on)}
              testId="activation-code"
            />
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => {
                setDeactivating(active.id);
              }}
            >
              <PowerOffIcon data-icon="inline-start" />
              {t('server.deactivate.confirm')}
            </Button>
          </div>
        )}
        {past.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-sm text-muted-foreground">{t('server.history')}</h3>
            <ul className="flex flex-col">
              {past.map((activation) => (
                <ActivationItem key={activation.id} activation={activation} />
              ))}
            </ul>
          </section>
        )}
      </CardContent>
      {activating && (
        <ActivateDialog gymId={gymId} gymCode={gymCode} open onOpenChange={setActivating} />
      )}
      <RecordDialog
        kind="deactivate_activation"
        id={deactivating}
        onClose={() => {
          setDeactivating(null);
        }}
      />
    </Card>
  );
}
