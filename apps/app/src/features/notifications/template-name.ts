import type { MessageTemplateKey } from '@gym/core';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';

/** A template's name for the screens: "membership ends in 7 days" names its days. */
export function useTemplateName(): (key: MessageTemplateKey) => string {
  const { t } = useTranslation('notifications');
  const format = useFormat();
  return (key) =>
    t(`templates.${key}.name`, {
      days: format.number(key === 'expiring_7' ? 7 : key === 'expiring_3' ? 3 : 1),
    });
}
