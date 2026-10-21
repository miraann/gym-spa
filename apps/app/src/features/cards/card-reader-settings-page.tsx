import type { CardByteOrder } from '@gym/core';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Skeleton } from '@gym/ui/components/skeleton';
import { CircleHelpIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import { useCardHolder } from './card-data';
import { CardError } from './card-error';
import { cardErrorKey } from './card-errors';
import { useCardScans, type CardScan } from './card-reader';
import { setKeyboardByteOrder, useCardReaderSettings } from './card-reader-settings';
import { BrowserReaderNotice, CardHolderNotice, CardUid, ScanPrompt } from './card-scan';

const BYTE_ORDERS: readonly CardByteOrder[] = ['normal', 'reversed'];

/**
 * This device's card reader (Settings): a test that shows what the reader reads and whose card it
 * is, and the byte order of a keyboard-type reader. The settings stay on this device.
 */
export function CardReaderSettingsPage() {
  const { t } = useTranslation('cards');
  const settings = useCardReaderSettings();
  const canChange = usePermission('devices.manage');
  const [scan, setScan] = useState<CardScan | null>(null);
  useCardScans(setScan);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('reader.title')} description={t('reader.description')} />
      <BrowserReaderNotice />

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
