import { Checkbox } from '@gym/ui/components/checkbox';
import { Label } from '@gym/ui/components/label';
import { useId } from 'react';
import type { PaymentFieldValues } from './payment-draft';
import { PaymentFields } from './payment-fields';

/** Payment now, or none (the member owes it): lockers, the spa, anything charged on one invoice. */
export function PayNow({
  label,
  total,
  payNow,
  onPayNow,
  payment,
  onPayment,
  showProblems,
}: {
  /** What the checkbox says ("pays now"). */
  readonly label: string;
  readonly total: number;
  readonly payNow: boolean;
  readonly onPayNow: (payNow: boolean) => void;
  readonly payment: PaymentFieldValues;
  readonly onPayment: (payment: PaymentFieldValues) => void;
  readonly showProblems: boolean;
}) {
  const id = useId();
  return (
    <>
      <div className="flex items-center gap-3">
        <Checkbox
          id={`${id}-pay-now`}
          checked={payNow}
          onCheckedChange={(checked) => {
            onPayNow(checked === true);
          }}
        />
        <Label htmlFor={`${id}-pay-now`} className="font-normal">
          {label}
        </Label>
      </div>
      {payNow && total > 0 && (
        <PaymentFields
          value={payment}
          onChange={onPayment}
          owed={total}
          showProblems={showProblems}
          wholeAmount
        />
      )}
    </>
  );
}
