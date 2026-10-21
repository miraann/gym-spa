import { formatCardUid, formatMemberNumber } from '@gym/core';
import { platform } from '@gym/platform';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Skeleton } from '@gym/ui/components/skeleton';
import { useLayout } from '@gym/ui/hooks/use-layout';
import { cn } from '@gym/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { BanIcon, InfoIcon, NfcIcon, UserRoundIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCardHolder } from './card-data';
import { CardError } from './card-error';
import { cardErrorKey } from './card-errors';
import type { CardNumber } from './use-card-number';

/** The card number shown as an example of what to type (a 7-byte NTAG UID). */
const EXAMPLE_UID = '04A23BC15D6E80';

/**
 * A UID as people read it: Latin, left to right, its bytes apart. In a column it stays at the
 * reading start instead of stretching across (where its left-to-right text would sit at the end).
 */
export function CardUid({ uid, className }: { readonly uid: string; readonly className?: string }) {
  return (
    <span
      dir="ltr"
      className={cn('self-start tracking-wide tabular-nums', className)}
      data-card-uid={uid}
    >
      {formatCardUid(uid)}
    </span>
  );
}

/** "Hold the card to the reader", while the screen waits for a card. */
export function ScanPrompt() {
  const { t } = useTranslation('cards');
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted p-4">
      <NfcIcon aria-hidden className="size-8 shrink-0 text-primary motion-safe:animate-pulse" />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">{t('scan.hold')}</p>
        <p className="text-sm text-muted-foreground">{t('scan.waiting')}</p>
      </div>
    </div>
  );
}

/** In the browser: which readers work there (spec §1, decision 6). Nothing in the apps. */
export function BrowserReaderNotice() {
  const { t } = useTranslation('cards');
  if (platform !== 'web') return null;
  return (
    <Alert>
      <InfoIcon />
      <AlertDescription>{t('scan.browser')}</AlertDescription>
    </Alert>
  );
}

/** The card number field of a dialog (useCardNumber). */
export function CardNumberField({
  id,
  label,
  number,
}: {
  readonly id: string;
  readonly label: string;
  readonly number: CardNumber;
}) {
  const { t } = useTranslation('cards');
  // On phones the soft keyboard would cover the dialog; the card is held to the phone instead.
  const autoFocus = useLayout() !== 'phone';
  return (
    <Field data-invalid={number.problem !== null}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        dir="ltr"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        className="tabular-nums"
        value={number.typed}
        aria-invalid={number.problem !== null}
        // CARD_INPUT_ATTRIBUTE: a keyboard-type reader typing here is still a scan.
        data-card-input=""
        onChange={(event) => {
          number.setTyped(event.target.value);
          number.setProblem(null);
        }}
      />
      <FieldDescription>
        {t('scan.typeHint')} <span dir="ltr">{formatCardUid(EXAMPLE_UID)}</span>
      </FieldDescription>
      {number.problem !== null && <FieldError>{t(`scan.problems.${number.problem}`)}</FieldError>}
    </Field>
  );
}

/** Whose card a UID is, after a refusal that names the card as someone's (or blocked). */
export function CardHolderNotice({ uid }: { readonly uid: string }) {
  const { t } = useTranslation('cards');
  const holder = useCardHolder(uid);
  if (holder.isPending) return <Skeleton className="h-12 rounded-xl" />;
  if (holder.isError) return <CardError error={cardErrorKey(holder.error, 'holder')} />;
  if (holder.data === null) return null;
  const { card, member } = holder.data;
  if (card.status === 'blocked') {
    return (
      <Alert variant="destructive" data-testid="card-holder">
        <BanIcon />
        <AlertDescription className="flex flex-col gap-1">
          <span>{t(card.endReason === 'stolen' ? 'holder.stolen' : 'holder.blocked')}</span>
          {card.blockReason !== null && (
            <span>{t('holder.blockReason', { reason: card.blockReason })}</span>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  if (card.status !== 'active' || member === null) return null;
  return (
    <Alert data-testid="card-holder">
      <UserRoundIcon />
      <AlertDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          {t('holder.member', {
            name: member.fullName,
            number: formatMemberNumber(member.memberNumber),
          })}
        </span>
        <Button asChild variant="link" size="sm" className="h-auto p-0">
          <Link to="/members/$memberId" params={{ memberId: member.id }}>
            {t('holder.open')}
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
