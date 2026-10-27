import { canPrint } from '@gym/platform';
import { Button } from '@gym/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gym/ui/components/dropdown-menu';
import { PrinterIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReceiptPrint, type ReceiptSize } from './receipt-print';

/** Printing an invoice's receipt, on an 80mm roll or an A4 page; nothing where the device can't print. */
export function PrintReceiptButton({
  invoiceId,
  size = 'sm',
}: {
  readonly invoiceId: string;
  readonly size?: 'sm' | 'lg';
}) {
  const { t } = useTranslation('payments');
  const [printing, setPrinting] = useState<ReceiptSize | null>(null);
  const done = useCallback(() => {
    setPrinting(null);
  }, []);
  if (!canPrint()) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={size} disabled={printing !== null}>
            <PrinterIcon data-icon="inline-start" />
            {t('receipt.print')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setPrinting('80mm');
            }}
          >
            {t('receipt.size80')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setPrinting('a4');
            }}
          >
            {t('receipt.sizeA4')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {printing && <ReceiptPrint invoiceId={invoiceId} size={printing} onDone={done} />}
    </>
  );
}
