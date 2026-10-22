import { formatMemberNumber } from '@gym/core';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import { hasUnsavedChanges } from '@/lib/unsaved-changes';
import { findCardHolder } from './card-data';
import { cardErrorKey } from './card-errors';
import { useUnclaimedCardScans, type CardScan } from './card-reader';

/**
 * A card held to a reader on a screen that doesn't wait for one opens its member (step 2h), for
 * staff who may see members. With unsaved changes on the page it asks first instead. A card
 * that is blocked or nobody's says so; anything that isn't a card number (a barcode, say) is left
 * alone. `onOpen` runs before the member opens (it closes the search).
 */
export function useOpenMemberOnScan(onOpen: () => void): void {
  const { t } = useTranslation('cards');
  const navigate = useNavigate();
  const { client } = useActingClient();
  const canSeeMembers = usePermission('members.view');

  const open = (memberId: string) => {
    onOpen();
    void navigate({ to: '/members/$memberId', params: { memberId } });
  };

  const onScan = async (scan: CardScan) => {
    if (scan.uid === null || client === undefined) {
      scan.signal('error');
      return;
    }
    try {
      const holder = await findCardHolder(requireClient(client), scan.uid);
      const card = holder?.card;
      const member = holder?.member;
      if (card?.status === 'active' && member) {
        scan.signal('ok');
        if (!hasUnsavedChanges()) {
          open(member.id);
          return;
        }
        toast(
          t('holder.member', {
            name: member.fullName,
            number: formatMemberNumber(member.memberNumber),
          }),
          {
            description: t('anywhere.unsaved'),
            action: {
              label: t('holder.open'),
              onClick: () => {
                open(member.id);
              },
            },
          },
        );
        return;
      }
      scan.signal('error');
      if (card?.status === 'blocked') {
        toast.error(t(card.endReason === 'stolen' ? 'holder.stolen' : 'holder.blocked'));
      } else {
        toast.error(t('reader.nobody'));
      }
    } catch (error) {
      scan.signal('error');
      toast.error(t(`errors.${cardErrorKey(error, 'open_member')}`));
    }
  };

  useUnclaimedCardScans((scan) => {
    void onScan(scan);
  }, canSeeMembers);
}
