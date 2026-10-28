import { SPA_LIMITS, parseWholeNumber } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { FieldError } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { PlusIcon, XIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAdminWriteState } from '@/features/staff/write-state';
import { usePreferences } from '@/lib/preferences';
import {
  usePlanSpaSessions,
  useSetPlanSpaSessions,
  useSpaServices,
  type PlanSpaSession,
  type SpaService,
} from './spa-data';
import { SpaError } from './spa-error';
import { spaErrorKey, type SpaErrorKey } from './spa-errors';

/**
 * The spa sessions a plan includes per subscription (plans.manage), saved on their own: what was
 * sold keeps its own copy. Shown on an existing plan once the gym has spa services.
 */
export function PlanSpaSessions({
  planId,
  disabled,
}: {
  readonly planId: string;
  readonly disabled: boolean;
}) {
  const sessions = usePlanSpaSessions(planId);
  const services = useSpaServices();
  if (services.isSuccess && services.data.length === 0) return null;
  if (!sessions.isSuccess || !services.isSuccess) {
    return <Skeleton className="h-32 rounded-3xl" />;
  }
  return (
    <SessionsEditor
      key={planId}
      planId={planId}
      saved={sessions.data}
      services={services.data}
      disabled={disabled}
    />
  );
}

interface Row {
  readonly key: string;
  readonly serviceId: string;
  readonly count: string;
}

function SessionsEditor({
  planId,
  saved,
  services,
  disabled,
}: {
  readonly planId: string;
  readonly saved: readonly PlanSpaSession[];
  readonly services: readonly SpaService[];
  readonly disabled: boolean;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const save = useSetPlanSpaSessions();
  const [rows, setRows] = useState<readonly Row[]>(() =>
    saved.map((each) => ({
      key: crypto.randomUUID(),
      serviceId: each.serviceId,
      count: String(each.count),
    })),
  );
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<SpaErrorKey | null>(null);
  const counts = rows.map((row) => parseWholeNumber(row.count));
  const problem =
    counts.some((count) => count === null || count < 1 || count > SPA_LIMITS.maxSessions) ||
    new Set(rows.map((row) => row.serviceId)).size !== rows.length;
  const nameOf = (serviceId: string) => {
    const service = services.find((each) => each.id === serviceId);
    return service ? localizedName(service, language) : '';
  };
  const unused = services.find(
    (service) => service.isActive && !rows.some((row) => row.serviceId === service.id),
  );

  const change = (key: string, patch: Partial<Row>) => {
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const submit = () => {
    setSent(true);
    if (problem) return;
    setError(null);
    save.mutate(
      {
        planId,
        sessions: rows.map((row) => ({
          serviceId: row.serviceId,
          count: parseWholeNumber(row.count) ?? 1,
        })),
      },
      {
        onSuccess: () => {
          setSent(false);
          toast.success(t('planSessions.saved'));
        },
        onError: (thrown) => {
          setError(spaErrorKey(thrown, 'save_plan_sessions'));
        },
      },
    );
  };

  return (
    <Card data-testid="plan-spa-sessions">
      <CardHeader>
        <CardTitle>{t('planSessions.title')}</CardTitle>
        <CardDescription>{t('planSessions.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('planSessions.none')}</p>
        )}
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label={t('form.service')}
              value={row.serviceId}
              disabled={disabled}
              onChange={(event) => {
                change(row.key, { serviceId: event.target.value });
              }}
            >
              {services
                .filter((service) => service.isActive || service.id === row.serviceId)
                .map((service) => (
                  <NativeSelectOption key={service.id} value={service.id}>
                    {localizedName(service, language)}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
            <Input
              id={`${id}-${row.key}`}
              aria-label={`${nameOf(row.serviceId)} ${t('planSessions.count')}`}
              inputMode="numeric"
              dir="ltr"
              className="w-24 tabular-nums"
              value={row.count}
              disabled={disabled}
              onChange={(event) => {
                change(row.key, { count: event.target.value });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={t('planSessions.remove', { name: nameOf(row.serviceId) })}
              onClick={() => {
                setRows(rows.filter((each) => each.key !== row.key));
              }}
            >
              <XIcon aria-hidden />
            </Button>
          </div>
        ))}
        {sent && problem && <FieldError>{t('planSessions.problem')}</FieldError>}
        <SpaError error={error} />
        <div className="flex flex-wrap gap-2">
          {unused && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setRows([...rows, { key: crypto.randomUUID(), serviceId: unused.id, count: '1' }]);
              }}
            >
              <PlusIcon data-icon="inline-start" />
              {t('planSessions.add')}
            </Button>
          )}
          <Button
            type="button"
            disabled={disabled || !online || readOnly || save.isPending}
            onClick={submit}
          >
            {save.isPending && <Spinner />}
            {t('planSessions.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
