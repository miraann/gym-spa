import {
  MESSAGE_LIMITS,
  MESSAGE_TEMPLATE_KEYS,
  TEMPLATE_PLACEHOLDERS,
  baghdadDateOf,
  isValidTemplateText,
  unknownPlaceholders,
  type MessageNames,
  type MessageTemplateKey,
  type ReminderDetails,
} from '@gym/core';
import { LANGUAGE_CODES, LANGUAGES, getDirection, type Language } from '@gym/i18n';
import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { ListGroup, ListRow } from '@gym/ui/blocks/list-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@gym/ui/components/field';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Textarea } from '@gym/ui/components/textarea';
import { PencilLineIcon, TriangleAlertIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RequirePermission } from '@/components/no-access';
import { useDeviceGym } from '@/features/auth/auth-context';
import { useAdminWriteState } from '@/features/staff/write-state';
import { usePreferences } from '@/lib/preferences';
import {
  composeMessage,
  defaultTemplateText,
  gymTemplateText,
  templateText,
  type GymTemplate,
} from './message-text';
import { useMessageTemplates, useSaveMessageTemplate } from './notification-data';
import { notificationErrorKey, type NotificationErrorKey } from './notification-errors';
import { useTemplateName } from './template-name';

export function NotificationError({ error }: { readonly error: NotificationErrorKey | null }) {
  const { t } = useTranslation('notifications');
  if (error === null) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
    </Alert>
  );
}

/** /settings/messages (notifications.templates.manage): the gym's wording of the nine messages. */
export function TemplatesPage() {
  return (
    <RequirePermission permission="notifications.templates.manage">
      <Templates />
    </RequirePermission>
  );
}

function Templates() {
  const { t } = useTranslation('notifications');
  const { language } = usePreferences();
  const templateName = useTemplateName();
  const templates = useMessageTemplates();
  const [editing, setEditing] = useState<MessageTemplateKey | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('templatesPage.title')} description={t('templatesPage.description')} />
      {templates.isPending ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : templates.isError ? (
        <NotificationError error={notificationErrorKey(templates.error, 'load_templates')} />
      ) : (
        <ListGroup>
          {MESSAGE_TEMPLATE_KEYS.map((key) => {
            const own = templates.data.get(key);
            const changed = LANGUAGE_CODES.some((each) => gymTemplateText(own, each) !== null);
            return (
              <ListRow
                key={key}
                asChild
                title={templateName(key)}
                description={templateText(key, language, own)}
                trailing={
                  changed && <Badge variant="secondary">{t('templatesPage.changed')}</Badge>
                }
                data-template={key}
              >
                <button
                  type="button"
                  onClick={() => {
                    setEditing(key);
                  }}
                />
              </ListRow>
            );
          })}
        </ListGroup>
      )}
      {editing && templates.data && (
        <TemplateDialog
          templateKey={editing}
          own={templates.data.get(editing)}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** A day `days` after today, for the sample. */
function sampleDay(days: number): string {
  return baghdadDateOf(Date.now() + days * 86_400_000);
}

function TemplateDialog({
  templateKey,
  own,
  onClose,
}: {
  readonly templateKey: MessageTemplateKey;
  readonly own: GymTemplate | undefined;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('notifications');
  const { language: uiLanguage } = usePreferences();
  const id = useId();
  const gym = useDeviceGym();
  const templateName = useTemplateName();
  const { online, readOnly } = useAdminWriteState();
  const save = useSaveMessageTemplate();
  const textArea = useRef<HTMLTextAreaElement>(null);
  const [language, setLanguage] = useState<Language>(uiLanguage);
  const [texts, setTexts] = useState<Record<Language, string>>(() => ({
    ckb: templateText(templateKey, 'ckb', own),
    en: templateText(templateKey, 'en', own),
    ar: templateText(templateKey, 'ar', own),
  }));
  const [error, setError] = useState<NotificationErrorKey | null>(null);
  const text = texts[language];
  const invalid = LANGUAGE_CODES.filter((each) => !isValidTemplateText(texts[each].trim()));
  const unknown = unknownPlaceholders(text);
  const changed =
    own !== undefined && LANGUAGE_CODES.some((each) => gymTemplateText(own, each) !== null);

  const gymNames: MessageNames = gym
    ? { ckb: gym.nameCkb, en: gym.nameEn, ar: gym.nameAr }
    : { ckb: '', en: null, ar: null };
  const sampleDays = templateKey === 'expiring_7' ? 7 : templateKey === 'expiring_3' ? 3 : 1;
  const sample: ReminderDetails = {
    plan: { ckb: t('sample.plan', { lng: language }), en: null, ar: null },
    endDate: sampleDay(templateKey === 'expired' ? -1 : sampleDays),
    days: sampleDays,
    amount: 25_000,
    dueDate: sampleDay(3),
    service: { ckb: t('sample.service', { lng: language }), en: null, ar: null },
    startsAt: `${sampleDay(1)}T14:00:00Z`,
  };
  const preview = composeMessage(
    templateKey,
    language,
    { key: templateKey, bodyCkb: texts.ckb, bodyEn: texts.en, bodyAr: texts.ar },
    {
      memberName: t('sample.name', { lng: language }),
      memberNumber: 1042,
      gymNames,
      branchNames: { ckb: t('sample.branch', { lng: language }), en: null, ar: null },
    },
    sample,
  );

  const submit = (reset: boolean) => {
    setError(null);
    // A text that is the default is kept as "the default", so a better default later reaches it.
    const bodyOf = (each: Language): string | null => {
      const value = texts[each].trim();
      return reset || value === defaultTemplateText(templateKey, each) ? null : value;
    };
    save.mutate(
      { key: templateKey, bodyCkb: bodyOf('ckb'), bodyEn: bodyOf('en'), bodyAr: bodyOf('ar') },
      {
        onSuccess: () => {
          toast.success(reset ? t('editor.resetDone') : t('editor.saved'));
          onClose();
        },
        onError: (thrown) => {
          setError(notificationErrorKey(thrown, 'save_template'));
        },
      },
    );
  };

  const insert = (placeholder: string) => {
    const element = textArea.current;
    const token = `{${placeholder}}`;
    const start = element?.selectionStart ?? text.length;
    const end = element?.selectionEnd ?? text.length;
    setTexts((current) => ({
      ...current,
      [language]: current[language].slice(0, start) + token + current[language].slice(end),
    }));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <ResponsiveDialog
      open
      wide
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={templateName(templateKey)}
      footer={
        <>
          <Button
            disabled={!online || readOnly || invalid.length > 0 || save.isPending}
            onClick={() => {
              submit(false);
            }}
          >
            {t('editor.save')}
          </Button>
          {changed && (
            <Button
              variant="outline"
              disabled={!online || readOnly || save.isPending}
              onClick={() => {
                submit(true);
              }}
            >
              {t('editor.reset')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('editor.cancel')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ChipRow label={t('editor.language')}>
          {LANGUAGE_CODES.map((each) => (
            <Chip
              key={each}
              type="button"
              selected={language === each}
              aria-pressed={language === each}
              onClick={() => {
                setLanguage(each);
              }}
            >
              <span lang={each}>{LANGUAGES[each].nativeName}</span>
            </Chip>
          ))}
        </ChipRow>
        <Field data-invalid={invalid.includes(language) || undefined}>
          <FieldLabel htmlFor={`${id}-text`}>{t('editor.text')}</FieldLabel>
          <Textarea
            ref={textArea}
            id={`${id}-text`}
            lang={language}
            dir={getDirection(language)}
            rows={6}
            value={text}
            maxLength={MESSAGE_LIMITS.maxTemplateLength}
            aria-invalid={invalid.includes(language) || undefined}
            onChange={(event) => {
              setTexts((current) => ({ ...current, [language]: event.target.value }));
            }}
          />
          {invalid.includes(language) && (
            <FieldError>
              {t('editor.invalid', { min: 1, max: MESSAGE_LIMITS.maxTemplateLength })}
            </FieldError>
          )}
          {unknown.length > 0 && (
            <FieldDescription>
              {t('editor.unknown', { names: unknown.map((name) => `{${name}}`).join('، ') })}
            </FieldDescription>
          )}
        </Field>
        <ChipRow label={t('editor.insert')}>
          {TEMPLATE_PLACEHOLDERS[templateKey].map((placeholder) => (
            <Chip
              key={placeholder}
              type="button"
              selected={false}
              onClick={() => {
                insert(placeholder);
              }}
            >
              <PencilLineIcon aria-hidden className="size-3.5" />
              {t(`placeholders.${placeholder}`)}
            </Chip>
          ))}
        </ChipRow>
        <section className="flex flex-col gap-1.5" aria-label={t('editor.preview')}>
          <h3 className="text-sm font-semibold text-muted-foreground">{t('editor.preview')}</h3>
          <p
            lang={language}
            dir={getDirection(language)}
            className="rounded-2xl bg-muted p-4 whitespace-pre-line"
            data-testid="template-preview"
          >
            {preview}
          </p>
          <p className="text-sm text-muted-foreground">{t('editor.previewNote')}</p>
        </section>
        <NotificationError error={error} />
      </div>
    </ResponsiveDialog>
  );
}
