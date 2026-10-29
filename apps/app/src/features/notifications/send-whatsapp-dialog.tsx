import {
  MESSAGE_LIMITS,
  MESSAGE_TEMPLATE_KEYS,
  messagePhone,
  whatsAppLink,
  type MessageNames,
  type MessageTemplateKey,
  type ReminderDetails,
} from '@gym/core';
import { LANGUAGES, getDirection } from '@gym/i18n';
import { openWhatsApp } from '@gym/platform';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Field, FieldDescription, FieldLabel } from '@gym/ui/components/field';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Textarea } from '@gym/ui/components/textarea';
import { MessageCircleIcon, PhoneIcon, TriangleAlertIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useDeviceGym } from '@/features/auth/auth-context';
import { useAdminBranches } from '@/features/staff/admin-data';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { composeMessage, type GymTemplate, type MessageContext } from './message-text';
import {
  useLastMessage,
  useMessageTemplates,
  useRecordMessageOpened,
  type MessageMember,
} from './notification-data';
import { notificationErrorKey } from './notification-errors';
import { useTemplateName } from './template-name';

/** Names of a gym or branch row, as messages use them. */
function namesOf(row: {
  readonly nameCkb: string;
  readonly nameEn: string | null;
  readonly nameAr: string | null;
}): MessageNames {
  return { ckb: row.nameCkb, en: row.nameEn, ar: row.nameAr };
}

/**
 * "Send with WhatsApp": a template filled in for the member in their language, which staff may
 * still change, opened in WhatsApp (wa.me) for them to press Send. Nothing is sent by the app; the
 * opening is written down as "opened". `branchId` is where it counts: the reminder's branch, or
 * the device's.
 */
export function SendWhatsAppDialog({
  member,
  templateKey,
  details,
  branchId,
  reminderId = null,
  onClose,
}: {
  readonly member: MessageMember;
  readonly templateKey: MessageTemplateKey;
  readonly details: ReminderDetails | undefined;
  readonly branchId: string;
  readonly reminderId?: string | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('notifications');
  const templates = useMessageTemplates();
  const branches = useAdminBranches();
  const gym = useDeviceGym();
  const ready = templates.data !== undefined && details !== undefined && branches.isSuccess;
  const branch = branches.data?.find((each) => each.id === branchId);
  const context: MessageContext = {
    memberName: member.fullName,
    memberNumber: member.memberNumber,
    gymNames: gym ? namesOf(gym) : { ckb: '', en: null, ar: null },
    branchNames: branch ? namesOf(branch) : null,
  };

  return ready ? (
    <SendForm
      member={member}
      initialKey={templateKey}
      details={details}
      templates={templates.data}
      context={context}
      branchId={branchId}
      reminderId={reminderId}
      onClose={onClose}
    />
  ) : (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('send.title')}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('send.cancel')}
        </Button>
      }
    >
      <Skeleton className="h-48 w-full" />
    </ResponsiveDialog>
  );
}

function SendForm({
  member,
  initialKey,
  details,
  templates,
  context,
  branchId,
  reminderId,
  onClose,
}: {
  readonly member: MessageMember;
  readonly initialKey: MessageTemplateKey;
  readonly details: ReminderDetails;
  readonly templates: ReadonlyMap<MessageTemplateKey, GymTemplate>;
  readonly context: MessageContext;
  readonly branchId: string;
  readonly reminderId: string | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('notifications');
  const id = useId();
  const format = useFormat();
  const templateName = useTemplateName();
  const { online, readOnly } = useAdminWriteState();
  const record = useRecordMessageOpened();
  const lastMessage = useLastMessage(member.id, true);
  const language = member.preferredLanguage;
  const compose = (key: MessageTemplateKey) =>
    composeMessage(key, language, templates.get(key), context, details);
  const [key, setKey] = useState<MessageTemplateKey>(initialKey);
  const [text, setText] = useState(() => compose(initialKey));
  const [blocked, setBlocked] = useState(false);
  const target = messagePhone(member);
  const link = target ? whatsAppLink(target.phone, text.trim()) : null;
  const empty = text.trim() === '';

  const open = () => {
    if (!target || !link) return;
    setBlocked(false);
    // Straight from the click: a browser blocks a new tab opened after waiting for the server.
    if (!openWhatsApp(link)) {
      setBlocked(true);
      return;
    }
    record.mutate(
      {
        id: crypto.randomUUID(),
        branchId,
        memberId: member.id,
        phone: target.phone,
        language,
        body: text.trim(),
        templateKey: key,
        reminderId,
      },
      {
        onSuccess: () => {
          toast.success(t('send.opened'));
          onClose();
        },
        onError: (thrown) => {
          toast.error(
            t('send.notRecorded', {
              error: t(`errors.${notificationErrorKey(thrown, 'record_message')}`),
            }),
          );
          onClose();
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      wide
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title={t('send.title')}
      description={member.fullName}
      footer={
        <>
          <Button
            disabled={!online || readOnly || !link || empty || record.isPending}
            onClick={open}
            data-testid="open-whatsapp"
          >
            <MessageCircleIcon data-icon="inline-start" />
            {t('send.open')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('send.cancel')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {target ? (
          <p className="flex flex-wrap items-center gap-2">
            <PhoneIcon aria-hidden className="size-4 text-muted-foreground" />
            <span>{t('send.to')}</span>
            <span dir="ltr" className="tabular-nums">
              {target.phone}
            </span>
          </p>
        ) : (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>{t('send.noPhone')}</AlertDescription>
          </Alert>
        )}
        {target?.toEmergencyContact && (
          <Alert>
            <TriangleAlertIcon />
            <AlertDescription>
              {t('send.toEmergency', { name: member.emergencyContactName ?? '' })}
            </AlertDescription>
          </Alert>
        )}
        {target && !link && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>{t('send.badPhone')}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor={`${id}-template`}>{t('send.template')}</FieldLabel>
          <NativeSelect
            id={`${id}-template`}
            value={key}
            onChange={(event) => {
              const next = MESSAGE_TEMPLATE_KEYS.find((each) => each === event.target.value);
              if (!next) return;
              setKey(next);
              setText(compose(next));
            }}
          >
            {MESSAGE_TEMPLATE_KEYS.map((each) => (
              <NativeSelectOption key={each} value={each}>
                {templateName(each)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-text`}>{t('send.text')}</FieldLabel>
          <Textarea
            id={`${id}-text`}
            lang={language}
            dir={getDirection(language)}
            rows={6}
            value={text}
            maxLength={MESSAGE_LIMITS.maxMessageLength}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
          <FieldDescription>
            {t('send.memberLanguage', { language: LANGUAGES[language].nativeName })}
          </FieldDescription>
        </Field>
        <p className="text-sm text-muted-foreground">{t('send.note')}</p>
        {lastMessage.data && (
          <p className="text-sm text-muted-foreground">
            {t('send.lastOpened', { date: format.dateTime(lastMessage.data) })}
          </p>
        )}
        {blocked && (
          <Alert variant="destructive" role="alert">
            <TriangleAlertIcon />
            <AlertDescription>{t('send.blocked')}</AlertDescription>
          </Alert>
        )}
      </div>
    </ResponsiveDialog>
  );
}
