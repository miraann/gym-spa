import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { MasterDetail } from '@gym/ui/blocks/master-detail';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Badge } from '@gym/ui/components/badge';
import { Card } from '@gym/ui/components/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { Skeleton } from '@gym/ui/components/skeleton';
import { cn } from '@gym/ui/lib/utils';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { CircleOffIcon, MonitorSmartphoneIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { useAuthState } from '@/features/auth/auth-context';
import { LimitLine } from '@/features/branches/branches-layout';
import { adminErrorKey } from '@/features/staff/admin-errors';
import { AdminError } from '@/features/staff/admin-error';
import { useFormat } from '@/lib/format';
import { useDeviceOverview, type DeviceInfo } from './device-data';
import { PLATFORM_ICONS, useBranchName } from './device-labels';

const FILTERS = ['active', 'inactive', 'all'] as const;
type Filter = (typeof FILTERS)[number];

/** Devices (devices.manage): the list, and the device open from it. */
export function DevicesLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const detailOpen = pathname.replace(/\/$/, '') !== '/devices';
  return (
    <RequirePermission permission="devices.manage">
      <MasterDetail list={<DeviceList />} detail={<Outlet />} detailOpen={detailOpen} />
    </RequirePermission>
  );
}

function DeviceRow({
  device,
  selected,
}: {
  readonly device: DeviceInfo;
  readonly selected: boolean;
}) {
  const { t } = useTranslation('devices');
  const format = useFormat();
  const branchName = useBranchName();
  const thisDevice = useAuthState().device?.id === device.id;
  const Icon = PLATFORM_ICONS[device.platform];
  return (
    <Link
      to="/devices/$deviceId"
      params={{ deviceId: device.id }}
      aria-current={selected ? 'page' : undefined}
      data-device-row={device.name}
      className={cn(
        'flex items-start gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:bg-muted/50',
        selected && 'ring-2 ring-primary',
      )}
    >
      <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-base">{device.name}</span>
          <span className="flex shrink-0 gap-1">
            {thisDevice && <Badge variant="secondary">{t('list.thisDevice')}</Badge>}
            {!device.isActive && (
              <Badge variant="destructive">
                <CircleOffIcon aria-hidden="true" />
                {t('status.inactive')}
              </Badge>
            )}
          </span>
        </span>
        <span className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
          <span dir="ltr" className="font-mono">
            {device.code}
          </span>
          <span aria-hidden="true">·</span>
          <span>{branchName(device.branchId)}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {device.lastSeenAt
            ? t('list.lastSeen', { time: format.dateTime(device.lastSeenAt) })
            : t('list.neverSeen')}
        </span>
      </span>
    </Link>
  );
}

function DeviceList() {
  const { t } = useTranslation('devices');
  const devices = useDeviceOverview();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [filter, setFilter] = useState<Filter>('active');
  const shown = (devices.data ?? []).filter(
    (device) => filter === 'all' || device.isActive === (filter === 'active'),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('list.title')} description={t('list.description')} />
      <LimitLine kind="devices" />
      <ChipRow label={t('list.filter')}>
        {FILTERS.map((each) => (
          <Chip
            key={each}
            selected={filter === each}
            aria-pressed={filter === each}
            onClick={() => {
              setFilter(each);
            }}
          >
            {t(`list.filters.${each}`)}
          </Chip>
        ))}
      </ChipRow>
      {devices.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : devices.isError ? (
        <AdminError error={adminErrorKey(devices.error, 'devices')} />
      ) : shown.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
          <MonitorSmartphoneIcon className="size-8" aria-hidden="true" />
          {t('list.empty')}
        </Card>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t('list.title')}>
          {shown.map((device) => (
            <li key={device.id}>
              <DeviceRow device={device} selected={pathname === `/devices/${device.id}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Beside the list before a device is chosen. */
export function DevicePlaceholder() {
  const { t } = useTranslation('devices');
  return (
    <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MonitorSmartphoneIcon />
        </EmptyMedia>
        <EmptyDescription>{t('list.choose')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
