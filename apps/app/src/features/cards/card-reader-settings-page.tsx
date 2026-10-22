import type { CardByteOrder } from '@gym/core';
import { canUsePcscReaders } from '@gym/platform';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Skeleton } from '@gym/ui/components/skeleton';
import { CircleCheckIcon, CircleHelpIcon, TriangleAlertIcon, UnplugIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import { useCardHolder } from './card-data';
import { CardError } from './card-error';
import { cardErrorKey } from './card-errors';
import { useCardScans, usePcscReaders, type CardScan } from './card-reader';
import { setKeyboardByteOrder, useCardReaderSettings } from './card-reader-settings';
import { BrowserReaderNotice, CardHolderNotice, CardUid, ScanPrompt } from './card-scan';

const BYTE_ORDERS: readonly CardByteOrder[] = ['normal', 'reversed'];

/**
 * This device's card reader (Settings): in the Windows app the PC/SC readers plugged in, a test that
 * shows what the reader reads and whose card it is, and the byte order of a keyboard-type reader.
 * The settings stay on this device.
 */
export function CardReaderSettingsPage() {
  const { t } = useTranslation('cards');
  const settings = useCardReaderSettings();
  const canChange = usePermission('devices.manage');
  const [scan, setScan] = useState<CardScan | null>(null);
  useCardScans((next) => {
    setScan(next);
    // The test shows the signals too: green for a card number, red twice for anything else.
    next.signal(next.uid === null ? 'error' : 'ok');
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('reader.title')} description={t('reader.description')} />
      <BrowserReaderNotice />
      {canUsePcscReaders && <PcscReadersCard />}

      <Card data-testid="reader-test">
        <CardHeader>
          <CardTitle>{t('reader.testTitle')}</CardTitle>
          <CardDescription>{t('reader.testHint')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ScanPrompt />
          {scan !== null && <ScanResult scan={scan} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('reader.byteOrder')}</CardTitle>
          <CardDescription>{t('reader.byteOrderHint')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {canChange ? (
            <ChoiceGroup
              label={t('reader.byteOrder')}
              value={settings.keyboardByteOrder}
              choices={BYTE_ORDERS.map((order) => ({
                value: order,
                label: t(`reader.byteOrders.${order}`),
              }))}
              onChange={setKeyboardByteOrder}
            />
          ) : (
            <>
              <p className="font-medium">{t(`reader.byteOrders.${settings.keyboardByteOrder}`)}</p>
              <p className="text-sm text-muted-foreground">{t('reader.managerOnly')}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** The PC/SC readers plugged into this PC (Windows app). */
function PcscReadersCard() {
  const { t } = useTranslation('cards');
  const readers = usePcscReaders();
  return (
    <Card data-testid="pcsc-readers">
      <CardHeader>
        <CardTitle>{t('reader.pcsc.title')}</CardTitle>
        <CardDescription>{t('reader.pcsc.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {readers === undefined ? (
          <Skeleton className="h-12 rounded-xl" />
        ) : readers.length === 0 ? (
          <Alert>
            <UnplugIcon />
            <AlertDescription className="flex flex-col gap-1">
              <span className="font-medium text-foreground">{t('reader.pcsc.none')}</span>
              <span>{t('reader.pcsc.noneHint')}</span>
            </AlertDescription>
          </Alert>
        ) : (
          <ul className="flex flex-col gap-2">
            {readers.map((name) => (
              <li key={name} className="flex items-center gap-3 rounded-2xl bg-muted p-3">
                <CircleCheckIcon aria-hidden className="size-5 shrink-0 text-success" />
                <span dir="ltr" className="min-w-0 font-medium break-words">
                  {name}
                </span>
                <span className="ms-auto shrink-0 text-sm text-success">
                  {t('reader.pcsc.connected')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted-foreground">{t('reader.pcsc.liftHint')}</p>
      </CardContent>
    </Card>
  );
}

function ScanResult({ scan }: { readonly scan: CardScan }) {
  const { t } = useTranslation('cards');
  const canSeeMembers = usePermission('members.view');
  if (scan.uid === null) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertDescription className="flex flex-col gap-1">
          <span>{t('reader.notACard')}</span>
          <span dir="ltr" className="text-start tabular-nums" data-testid="reader-raw">
            {scan.raw}
          </span>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{t('scan.number')}</span>
        <CardUid uid={scan.uid} className="text-2xl font-semibold" />
      </div>
      {canSeeMembers && <ReaderTestHolder uid={scan.uid} />}
    </div>
  );
}

/** Whose card the test card is: someone's, blocked, or nobody's. */
function ReaderTestHolder({ uid }: { readonly uid: string }) {
  const { t } = useTranslation('cards');
  const holder = useCardHolder(uid);
  if (holder.isPending) return <Skeleton className="h-12 rounded-xl" />;
  if (holder.isError) return <CardError error={cardErrorKey(holder.error, 'reader_test')} />;
  const card = holder.data?.card;
  if (card?.status === 'active' || card?.status === 'blocked')
    return <CardHolderNotice uid={uid} />;
  return (
    <Alert data-testid="card-holder">
      <CircleHelpIcon />
      <AlertDescription>{t('reader.nobody')}</AlertDescription>
    </Alert>
  );
}
