import { canPrintSilently, listPrinters } from '@gym/platform';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Card, CardContent } from '@gym/ui/components/card';
import { Checkbox } from '@gym/ui/components/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Label } from '@gym/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Skeleton } from '@gym/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { PrinterIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { setReceiptPrinter, useReceiptPrinter } from './receipt-printer';

/**
 * This device's receipt printer (Settings, step 8f): in the Windows app, a printer and whether
 * receipts and cash register reports print to it without the dialog. It stays on this device.
 */
export function PrinterSettingsPage() {
  const { t } = useTranslation('settings');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('printer.title')} description={t('printer.description')} />
      {canPrintSilently() ? (
        <PrinterChoice />
      ) : (
        <Alert>
          <PrinterIcon />
          <AlertDescription>{t('printer.onlyWindows')}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function PrinterChoice() {
  const { t } = useTranslation('settings');
  const id = useId();
  const chosen = useReceiptPrinter();
  const printers = useQuery({ queryKey: ['printers'], queryFn: listPrinters });
  // A printer chosen before stays offered even while Windows doesn't list it (unplugged).
  const names = [
    ...new Set([...(printers.data ?? []), ...(chosen.name === null ? [] : [chosen.name])]),
  ];

  return (
    <Card>
      <CardContent>
        {printers.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : (
          <FieldGroup data-testid="printer-settings">
            <Field>
              <FieldLabel htmlFor={`${id}-printer`}>{t('printer.label')}</FieldLabel>
              <NativeSelect
                id={`${id}-printer`}
                value={chosen.name ?? ''}
                onChange={(event) => {
                  const name = event.target.value === '' ? null : event.target.value;
                  setReceiptPrinter({ name, silent: chosen.silent });
                }}
              >
                <NativeSelectOption value="">{t('printer.none')}</NativeSelectOption>
                {names.map((name) => (
                  <NativeSelectOption key={name} value={name}>
                    {name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {names.length === 0 && <FieldDescription>{t('printer.noPrinters')}</FieldDescription>}
            </Field>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Checkbox
                  id={`${id}-silent`}
                  checked={chosen.silent}
                  disabled={chosen.name === null}
                  onCheckedChange={(next) => {
                    setReceiptPrinter({ name: chosen.name, silent: next === true });
                  }}
                />
                <Label htmlFor={`${id}-silent`} className="font-normal">
                  {t('printer.silent')}
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">{t('printer.silentHint')}</p>
            </div>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
