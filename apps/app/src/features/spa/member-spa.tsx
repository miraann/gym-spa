import { localizedName } from '@gym/i18n';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Field, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Spinner } from '@gym/ui/components/spinner';
import { Link } from '@tanstack/react-router';
import { PackagePlusIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import type { Member } from '@/features/members/member-data';
import { useMoneyBranch } from '@/features/payments/money-branch';
import { PayNow } from '@/features/payments/pay-now';
import { usePayNow } from '@/features/payments/use-pay-now';
import { useAdminBranches } from '@/features/staff/admin-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { BookingList } from './spa-agenda';
import { useMemberSpaBookings, useSellSpaPackage, useSpaBalances } from './spa-calendar-data';
import { useSpaPackages, useSpaServices, type SpaPackage } from './spa-data';
import { SpaError } from './spa-error';
import { spaErrorKey, type SpaErrorKey } from './spa-errors';

/**
 * A member's spa, on their page: the sessions they have left (packages and plans), their bookings
 * (spa.view), and selling them a package (spa.book and payments.create). Nothing when there is
 * nothing to show or do.
 */
export function MemberSpaCard({ member }: { readonly member: Member }) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const mayView = usePermission('spa.view');
  const mayBook = usePermission('spa.book');
  const mayTakeMoney = usePermission('payments.create');
  const maySell = mayBook && mayTakeMoney;
  const balances = useSpaBalances(member.id);
  const bookings = useMemberSpaBookings(member.id, mayView);
  const services = useSpaServices();
  const packages = useSpaPackages();
  const [selling, setSelling] = useState(false);
  const now = new Date().toISOString();
  const upcoming = (bookings.data ?? [])
    .filter((booking) => booking.endsAt >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const recent = (bookings.data ?? []).filter((booking) => booking.endsAt < now);
  const shown = (balances.data ?? []).filter((balance) => balance.active && balance.left > 0);
  const onSale = (packages.data ?? []).filter((pack) => pack.isActive);
  const canSell = maySell && onSale.length > 0 && member.status !== 'archived';
  if (shown.length === 0 && (bookings.data?.length ?? 0) === 0 && !canSell) return null;
  const serviceName = (id: string) => {
    const service = services.data?.find((each) => each.id === id);
    return service ? localizedName(service, language) : '';
  };

  return (
    <Card data-testid="member-spa">
      <CardHeader>
        <CardTitle>
          <h3>{t('memberSpa.title')}</h3>
        </CardTitle>
        {canSell && (
          <CardAction>
            <Button
              variant="outline"
              onClick={() => {
                setSelling(true);
              }}
            >
              <PackagePlusIcon data-icon="inline-start" />
              {t('memberSpa.sell')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {shown.length > 0 && (
          <section className="flex flex-col gap-2" aria-label={t('memberSpa.balances')}>
            <h4 className="text-sm text-muted-foreground">{t('memberSpa.balances')}</h4>
            <ul className="flex flex-col divide-y">
              {shown.map((balance) => (
                <li
                  key={`${balance.source}-${balance.id}-${balance.serviceId}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2"
                  data-spa-balance={balance.names.nameCkb}
                >
                  <span className="flex flex-col">
                    <span>{serviceName(balance.serviceId)}</span>
                    <span className="text-sm text-muted-foreground">
                      {`${t(`paidWith.${balance.source}`)} · ${localizedName(balance.names, language)} · ${
                        balance.endsOn === null
                          ? t('memberSpa.noLimit')
                          : t('memberSpa.until', { date: format.date(balance.endsOn) })
                      }`}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {t('memberSpa.left', {
                      left: format.number(balance.left),
                      total: format.number(balance.total),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {mayView && (
          <>
            {upcoming.length > 0 && (
              <section className="flex flex-col gap-2">
                <h4 className="text-sm text-muted-foreground">{t('memberSpa.upcoming')}</h4>
                <BookingList bookings={upcoming} />
              </section>
            )}
            {recent.length > 0 && (
              <section className="flex flex-col gap-2">
                <h4 className="text-sm text-muted-foreground">{t('memberSpa.recent')}</h4>
                <BookingList bookings={recent} />
              </section>
            )}
            {(bookings.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">{t('memberSpa.none')}</p>
            )}
            <Button asChild variant="link" className="self-start px-0">
              <Link to="/spa">{t('memberSpa.calendar')}</Link>
            </Button>
          </>
        )}
      </CardContent>
      {selling && (
        <SellPackageDialog
          member={member}
          packages={onSale}
          onClose={() => {
            setSelling(false);
          }}
        />
      )}
    </Card>
  );
}

function SellPackageDialog({
  member,
  packages,
  onClose,
}: {
  readonly member: Member;
  readonly packages: readonly SpaPackage[];
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const branches = useAdminBranches();
  const branchId = useMoneyBranch(branches.data);
  const sell = useSellSpaPackage();
  const [ids] = useState(() => ({
    sale: crypto.randomUUID(),
    invoice: crypto.randomUUID(),
    payment: crypto.randomUUID(),
  }));
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<SpaErrorKey | null>(null);
  const chosen = packages.find((each) => each.id === packageId) ?? packages[0];
  const pay = usePayNow(chosen?.price ?? 0);

  const confirm = () => {
    setSent(true);
    if (!chosen || pay.problem || branchId === '') return;
    setError(null);
    sell.mutate(
      {
        memberPackageId: ids.sale,
        invoiceId: ids.invoice,
        packageId: chosen.id,
        memberId: member.id,
        branchId,
        payment: pay.input(ids.payment),
      },
      {
        onSuccess: (invoice) => {
          toast.success(t('memberSpa.sold', { invoice: invoice ?? '' }));
          onClose();
        },
        onError: (thrown) => {
          setError(spaErrorKey(thrown, 'sell_package'));
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
      title={t('memberSpa.sellTitle', { name: member.fullName })}
      footer={
        <>
          <Button
            disabled={!online || readOnly || sell.isPending || branchId === ''}
            onClick={confirm}
          >
            {sell.isPending && <Spinner />}
            {t('memberSpa.confirm')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="spa-sell-package">
        <Field>
          <FieldLabel htmlFor={`${id}-package`}>{t('memberSpa.package')}</FieldLabel>
          <NativeSelect
            id={`${id}-package`}
            value={chosen?.id ?? ''}
            onChange={(event) => {
              setPackageId(event.target.value);
            }}
          >
            {packages.map((pack) => (
              <NativeSelectOption key={pack.id} value={pack.id}>
                {`${localizedName(pack, language)} · ${format.money(pack.price)}`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {chosen && (
          <PayNow
            label={t('memberSpa.payNow')}
            total={chosen.price}
            payNow={pay.payNow}
            onPayNow={pay.setPayNow}
            payment={pay.values}
            onPayment={pay.setPayment}
            showProblems={sent}
          />
        )}
        <SpaError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
