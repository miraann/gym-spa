import { Button } from '@gym/ui/components/button';
import { MessageCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import type { Member } from '@/features/members/member-data';
import { useBranchChoice } from '@/lib/use-branch-choice';
import { suggestedTemplate } from './message-text';
import { useMemberMessageDetails } from './notification-data';
import { SendWhatsAppDialog } from './send-whatsapp-dialog';

/** "Send with WhatsApp" on a member's page (notifications.send). */
export function MemberWhatsAppButton({ member }: { readonly member: Member }) {
  const { t } = useTranslation('notifications');
  const maySend = usePermission('notifications.send');
  const [open, setOpen] = useState(false);
  const details = useMemberMessageDetails(member.id, open);
  const { branchId } = useBranchChoice();
  if (!maySend || member.status === 'archived') return null;

  return (
    <>
      <Button
        size="lg"
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <MessageCircleIcon data-icon="inline-start" />
        {t('send.button')}
      </Button>
      {open && (
        <SendWhatsAppDialog
          member={{
            id: member.id,
            fullName: member.fullName,
            memberNumber: member.memberNumber,
            phone: member.phone,
            emergencyPhone: member.emergencyPhone,
            emergencyContactName: member.emergencyContactName,
            preferredLanguage: member.preferredLanguage,
            branchId: member.branchId,
          }}
          templateKey={details.data ? suggestedTemplate(details.data) : 'welcome'}
          details={details.data}
          branchId={branchId || member.branchId}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
