import {
  CARD_BLOCK_REASON_MAX_LENGTH,
  CARD_REPLACE_REASONS,
  isCleanText,
  type CardEndReason,
  type CardReplaceReason,
} from '@gym/core';
import { haptic } from '@gym/platform';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Field, FieldError, FieldLabel } from '@gym/ui/components/field';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import {
  ArchiveIcon,
  BanIcon,
  CircleCheckIcon,
  LockOpenIcon,
  NfcIcon,
  RefreshCwIcon,
  SearchXIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
  Undo2Icon,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import type { Member } from '@/features/members/member-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { WriteStateNotice } from '@/features/staff/write-state-notice';
import { useFormat } from '@/lib/format';
import {
  useAssignCard,
  useBlockCard,
  useEndCard,
  useMemberCards,
  useReplaceCard,
  useUnblockCard,
  type MemberCard,
} from './card-data';
import { CardError } from './card-error';
import { cardErrorKey, type CardErrorKey } from './card-errors';
import {
  BrowserReaderNotice,
  CardHolderNotice,
  CardNumberField,
  CardUid,
  ScanPrompt,
} from './card-scan';
import { useCardNumber } from './use-card-number';

type CardDialog =
  | { readonly kind: 'give' }
  | { readonly kind: 'replace' | 'return' | 'block' | 'unblock'; readonly card: MemberCard };

const REASON_BADGES: Readonly<
  Record<CardEndReason, { variant: 'secondary' | 'warning' | 'destructive'; icon: LucideIcon }>
> = {
  returned: { variant: 'secondary', icon: Undo2Icon },
  lost: { variant: 'warning', icon: SearchXIcon },
  damaged: { variant: 'warning', icon: TriangleAlertIcon },
  stolen: { variant: 'destructive', icon: ShieldAlertIcon },
  // Only shown once the block was lifted; a card blocked now has the blocked badge instead.
  blocked: { variant: 'secondary', icon: BanIcon },
  member_archived: { variant: 'secondary', icon: ArchiveIcon },
};

/** What a card is now: always an icon and words, never color alone. */
function CardStateBadges({ card }: { readonly card: MemberCard }) {
  const { t } = useTranslation('cards');
  if (card.status === 'active') {
    return (
      <Badge variant="success" data-card-state="active">
        <CircleCheckIcon aria-hidden />
        {t('state.active')}
      </Badge>
    );
  }
  // A card blocked while it worked says so once; one that stopped first says why, then blocked.
  const reason =
    card.endReason !== null && !(card.endReason === 'blocked' && card.status === 'blocked')
      ? card.endReason
      : null;
  const reasonBadge = reason && REASON_BADGES[reason];
  return (
    <>
      {reason && reasonBadge && (
        <Badge variant={reasonBadge.variant} data-card-reason={reason}>
          <reasonBadge.icon aria-hidden />
          {t(`reasons.${reason}`)}
        </Badge>
      )}
      {card.status === 'blocked' && (
        <Badge variant="destructive" data-card-state="blocked">
          <BanIcon aria-hidden />
          {t('state.blocked')}
        </Badge>
      )}
    </>
  );
}

/**
 * The member's card on their page (spec §1, step 2e): the card that works now and the cards they
 * had. Staff with cards.manage give, replace and take back cards; cards.blacklist blocks and
 * unblocks them, and reports cards stolen.
 */
export function MemberCardsCard({ member }: { readonly member: Member }) {
  const { t } = useTranslation('cards');
  const format = useFormat();
  const cards = useMemberCards(member.id);
  const canManage = usePermission('cards.manage') && member.status !== 'archived';
  const canBlock = usePermission('cards.blacklist');
  const { online, readOnly } = useAdminWriteState();
  const writable = online && !readOnly;
  const [dialog, setDialog] = useState<CardDialog | null>(null);
  const close = () => {
    setDialog(null);
  };

  const active = cards.data?.find((card) => card.status === 'active') ?? null;
  const history = cards.data?.filter((card) => card !== active) ?? [];

  return (
    <Card data-testid="member-cards">
      <CardHeader>
        <CardTitle>
          <h3>{t('card.title')}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {cards.isPending ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : cards.isError ? (
          <CardError error={cardErrorKey(cards.error, 'load')} />
        ) : (
          <>
            {active ? (
              <div className="flex flex-wrap items-center gap-3" data-testid="member-card">
                <NfcIcon aria-hidden className="size-6 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <CardUid uid={active.uid} className="text-lg font-semibold" />
                  <span className="text-sm text-muted-foreground">
                    {t('card.since', { date: format.date(active.createdAt) })}
                  </span>
                </div>
                <CardStateBadges card={active} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('card.none')}</p>
            )}

            {(canManage || canBlock) && <WriteStateNotice area="members" />}
            {(canManage || (canBlock && active)) && (
              <div className="flex flex-wrap gap-2">
                {canManage && !active && (
                  <Button
                    disabled={!writable}
                    onClick={() => {
                      setDialog({ kind: 'give' });
                    }}
                  >
                    <NfcIcon aria-hidden />
                    {t('actions.give')}
                  </Button>
                )}
                {canManage && active && (
                  <>
                    <Button
                      variant="outline"
                      disabled={!writable}
                      onClick={() => {
                        setDialog({ kind: 'replace', card: active });
                      }}
                    >
                      <RefreshCwIcon aria-hidden />
                      {t('actions.replace')}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!writable}
                      onClick={() => {
                        setDialog({ kind: 'return', card: active });
                      }}
                    >
                      <Undo2Icon aria-hidden />
                      {t('actions.return')}
                    </Button>
                  </>
                )}
                {canBlock && active && (
                  <Button
                    variant="destructive"
                    disabled={!writable}
                    onClick={() => {
                      setDialog({ kind: 'block', card: active });
                    }}
                  >
                    <BanIcon aria-hidden />
                    {t('actions.block')}
                  </Button>
                )}
              </div>
            )}

            {history.length > 0 && (
              <section className="flex flex-col gap-1" aria-labelledby={`${member.id}-cards`}>
                <h4 id={`${member.id}-cards`} className="text-sm text-muted-foreground">
                  {t('history.title')}
                </h4>
                <ul className="divide-y" data-testid="card-history">
                  {history.map((card) => (
                    <li
                      key={card.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3"
                      data-card={card.uid}
                    >
                      <CardUid uid={card.uid} className="font-medium" />
                      <CardStateBadges card={card} />
                      <span className="text-sm text-muted-foreground">
                        {t('history.period', {
                          from: format.date(card.createdAt),
                          to: format.date(card.endedAt ?? card.createdAt),
                        })}
                      </span>
                      {canBlock && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ms-auto"
                          disabled={!writable}
                          onClick={() => {
                            setDialog({
                              kind: card.status === 'blocked' ? 'unblock' : 'block',
                              card,
                            });
                          }}
                        >
                          {card.status === 'blocked' ? (
                            <LockOpenIcon aria-hidden />
                          ) : (
                            <BanIcon aria-hidden />
                          )}
                          {t(card.status === 'blocked' ? 'actions.unblock' : 'actions.block')}
                        </Button>
                      )}
                      {card.blockedAt !== null && card.blockReason !== null && (
                        <p className="w-full text-sm">
                          {t('history.blockReason', { reason: card.blockReason })}
                        </p>
                      )}
                      {card.unblockedAt !== null && (
                        <p className="w-full text-sm text-muted-foreground">
                          {t('history.unblocked', { date: format.date(card.unblockedAt) })}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>

      {dialog?.kind === 'give' && <GiveCardDialog member={member} onClose={close} />}
      {dialog?.kind === 'replace' && (
        <ReplaceCardDialog member={member} card={dialog.card} canBlock={canBlock} onClose={close} />
      )}
      {dialog?.kind === 'return' && (
        <ReturnCardDialog member={member} card={dialog.card} onClose={close} />
      )}
      {dialog?.kind === 'block' && <BlockCardDialog card={dialog.card} onClose={close} />}
      {dialog?.kind === 'unblock' && <UnblockCardDialog card={dialog.card} onClose={close} />}
    </Card>
  );
}

/** A refusal, and whose card it was when the card is someone else's or blocked. */
function RefusalNotice({
  error,
  uid,
}: {
  readonly error: CardErrorKey | null;
  readonly uid: string | null;
}) {
  return (
    <>
      <CardError error={error} />
      {uid !== null && (error === 'card_in_use' || error === 'card_blocked') && (
        <CardHolderNotice uid={uid} />
      )}
    </>
  );
}

function GiveCardDialog({
  member,
  onClose,
}: {
  readonly member: Member;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('cards');
  const formId = useId();
  const { online } = useAdminWriteState();
  const [id] = useState(() => crypto.randomUUID());
  const assign = useAssignCard();
  const [error, setError] = useState<CardErrorKey | null>(null);
  const [refusedUid, setRefusedUid] = useState<string | null>(null);

  const give = (uid: string) => {
    if (assign.isPending) return;
    setError(null);
    setRefusedUid(null);
    assign.mutate(
      { id, memberId: member.id, uid },
      {
        onSuccess: () => {
          haptic('success');
          toast.success(t('done.given', { name: member.fullName }));
          onClose();
        },
        onError: (thrown) => {
          haptic('error');
          setError(cardErrorKey(thrown, 'give'));
          setRefusedUid(uid);
        },
      },
    );
  };
  const number = useCardNumber(give);

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('give.title', { name: member.fullName })}
      description={t('give.description')}
      footer={
        <>
          <Button type="submit" form={formId} disabled={!online || assign.isPending}>
            {assign.isPending && <Spinner />}
            {t('actions.give')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const uid = number.readTyped();
          if (uid !== null) give(uid);
        }}
      >
        <ScanPrompt />
        <CardNumberField id={`${formId}-number`} label={t('scan.number')} number={number} />
        <BrowserReaderNotice />
        <RefusalNotice error={error} uid={refusedUid} />
      </form>
    </ResponsiveDialog>
  );
}

function ReplaceCardDialog({
  member,
  card,
  canBlock,
  onClose,
}: {
  readonly member: Member;
  readonly card: MemberCard;
  readonly canBlock: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('cards');
  const formId = useId();
  const { online } = useAdminWriteState();
  const [id] = useState(() => crypto.randomUUID());
  const replace = useReplaceCard();
  const [reason, setReason] = useState<CardReplaceReason | null>(null);
  const [reasonMissing, setReasonMissing] = useState(false);
  const [error, setError] = useState<CardErrorKey | null>(null);
  const [refusedUid, setRefusedUid] = useState<string | null>(null);
  // Reporting a card stolen blocks it: only for staff with cards.blacklist.
  const reasons = CARD_REPLACE_REASONS.filter((each) => each !== 'stolen' || canBlock);

  const send = (newUid: string | null) => {
    if (replace.isPending) return;
    if (reason === null) {
      setReasonMissing(true);
      return;
    }
    setError(null);
    setRefusedUid(null);
    replace.mutate(
      { cardId: card.id, reason, newCard: newUid === null ? null : { id, uid: newUid } },
      {
        onSuccess: () => {
          haptic('success');
          toast.success(
            t(newUid === null ? 'done.stopped' : 'done.replaced', { name: member.fullName }),
          );
          onClose();
        },
        onError: (thrown) => {
          haptic('error');
          setError(cardErrorKey(thrown, 'replace'));
          setRefusedUid(newUid);
        },
      },
    );
  };
  const number = useCardNumber(send);

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('replace.title', { name: member.fullName })}
      description={t('replace.description')}
      footer={
        <>
          <Button type="submit" form={formId} disabled={!online || replace.isPending}>
            {replace.isPending && <Spinner />}
            {t('actions.replace')}
          </Button>
          <Button
            variant="outline"
            disabled={!online || replace.isPending}
            onClick={() => {
              send(null);
            }}
          >
            {t('replace.withoutNew')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const uid = number.readTyped();
          if (uid !== null) send(uid);
        }}
      >
        <p className="text-sm">
          <span className="text-muted-foreground">{t('replace.old')} </span>
          <CardUid uid={card.uid} className="font-medium" />
        </p>
        <Field data-invalid={reasonMissing}>
          <FieldLabel>{t('replace.reason')}</FieldLabel>
          <ChoiceGroup
            label={t('replace.reason')}
            value={reason ?? ''}
            choices={reasons.map((each) => ({ value: each, label: t(`reasons.${each}`) }))}
            onChange={(next) => {
              if (next === '') return;
              setReason(next);
              setReasonMissing(false);
            }}
          />
          {reasonMissing && <FieldError>{t('replace.reasonMissing')}</FieldError>}
          {reason === 'stolen' && (
            <p className="text-sm text-muted-foreground">{t('replace.stolenHint')}</p>
          )}
        </Field>
        <ScanPrompt />
        <CardNumberField id={`${formId}-number`} label={t('replace.newNumber')} number={number} />
        <BrowserReaderNotice />
        <RefusalNotice error={error} uid={refusedUid} />
      </form>
    </ResponsiveDialog>
  );
}

function ReturnCardDialog({
  member,
  card,
  onClose,
}: {
  readonly member: Member;
  readonly card: MemberCard;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('cards');
  const { online } = useAdminWriteState();
  const end = useEndCard();
  const [error, setError] = useState<CardErrorKey | null>(null);

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('return.title', { name: member.fullName })}
      description={t('return.description')}
      footer={
        <>
          <Button
            disabled={!online || end.isPending}
            onClick={() => {
              setError(null);
              end.mutate(card.id, {
                onSuccess: () => {
                  haptic('success');
                  toast.success(t('done.returned'));
                  onClose();
                },
                onError: (thrown) => {
                  setError(cardErrorKey(thrown, 'return'));
                },
              });
            }}
          >
            {end.isPending && <Spinner />}
            {t('actions.return')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <CardUid uid={card.uid} className="font-medium" />
        </p>
        <CardError error={error} />
      </div>
    </ResponsiveDialog>
  );
}

function BlockCardDialog({
  card,
  onClose,
}: {
  readonly card: MemberCard;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('cards');
  const reasonId = useId();
  const { online } = useAdminWriteState();
  const block = useBlockCard();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<'required' | 'text' | null>(null);
  const [error, setError] = useState<CardErrorKey | null>(null);

  const confirm = () => {
    const cleaned = reason.trim();
    if (cleaned === '') {
      setReasonError('required');
      return;
    }
    if (!isCleanText(cleaned, CARD_BLOCK_REASON_MAX_LENGTH)) {
      setReasonError('text');
      return;
    }
    setReasonError(null);
    setError(null);
    block.mutate(
      { cardId: card.id, reason: cleaned },
      {
        onSuccess: () => {
          haptic('success');
          toast.success(t('done.blocked'));
          onClose();
        },
        onError: (thrown) => {
          setError(cardErrorKey(thrown, 'block'));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('block.title')}
      description={t(card.status === 'active' ? 'block.descriptionActive' : 'block.description')}
      footer={
        <>
          <Button variant="destructive" disabled={!online || block.isPending} onClick={confirm}>
            {block.isPending && <Spinner />}
            {t('actions.block')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <CardUid uid={card.uid} className="font-medium" />
        </p>
        <Field data-invalid={reasonError !== null}>
          <FieldLabel htmlFor={reasonId}>{t('block.reason')}</FieldLabel>
          <Textarea
            id={reasonId}
            value={reason}
            maxLength={CARD_BLOCK_REASON_MAX_LENGTH}
            aria-invalid={reasonError !== null}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          {reasonError !== null && (
            <FieldError>
              {t(reasonError === 'required' ? 'block.reasonRequired' : 'block.reasonText')}
            </FieldError>
          )}
        </Field>
        <CardError error={error} />
      </div>
    </ResponsiveDialog>
  );
}

function UnblockCardDialog({
  card,
  onClose,
}: {
  readonly card: MemberCard;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('cards');
  const { online } = useAdminWriteState();
  const unblock = useUnblockCard();
  const [error, setError] = useState<CardErrorKey | null>(null);

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('unblock.title')}
      description={t('unblock.description')}
      footer={
        <>
          <Button
            disabled={!online || unblock.isPending}
            onClick={() => {
              setError(null);
              unblock.mutate(card.id, {
                onSuccess: () => {
                  haptic('success');
                  toast.success(t('done.unblocked'));
                  onClose();
                },
                onError: (thrown) => {
                  setError(cardErrorKey(thrown, 'unblock'));
                },
              });
            }}
          >
            {unblock.isPending && <Spinner />}
            {t('actions.unblock')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <CardUid uid={card.uid} className="font-medium" />
        </p>
        {card.blockReason !== null && (
          <p className="text-sm">{t('history.blockReason', { reason: card.blockReason })}</p>
        )}
        <CardError error={error} />
      </div>
    </ResponsiveDialog>
  );
}
