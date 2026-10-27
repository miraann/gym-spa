import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/format';
import type { PlanDraft } from './plan-data';

/**
 * A plan in a few words, for lists and the sell flow: how long or how many visits ("3 months",
 * "20 visits in 2 months"), the price, and who and where it is for when it is limited.
 */
export function usePlanSummary() {
  const { t } = useTranslation('plans');
  const format = useFormat();

  const duration = (plan: Pick<PlanDraft, 'durationUnit' | 'durationCount'>): string | null => {
    const count = plan.durationCount;
    if (count === null) return null;
    if (plan.durationUnit === 'day') {
      return count === 1 ? t('summary.oneDay') : t('summary.days', { count: format.number(count) });
    }
    return count === 1
      ? t('summary.oneMonth')
      : t('summary.months', { count: format.number(count) });
  };

  const visits = (count: number | null): string | null => {
    if (count === null) return null;
    return count === 1
      ? t('summary.oneVisit')
      : t('summary.visits', { count: format.number(count) });
  };

  return {
    /** How long, or how many visits, or both. */
    length: (plan: Pick<PlanDraft, 'durationUnit' | 'durationCount' | 'visitCount'>): string => {
      const time = duration(plan);
      const times = visits(plan.visitCount);
      if (time !== null && times !== null) {
        return t('summary.visitsWithin', { visits: times, duration: time });
      }
      return time ?? times ?? t('summary.unlimited');
    },
    price: (plan: Pick<PlanDraft, 'price'>): string =>
      plan.price === 0 ? t('summary.free') : format.money(plan.price),
    /** Who it is for and in how many branches, when it is limited. */
    limits: (plan: Pick<PlanDraft, 'gender' | 'branchIds'>): string[] => [
      ...(plan.gender === 'male' ? [t('summary.forMen')] : []),
      ...(plan.gender === 'female' ? [t('summary.forWomen')] : []),
      ...(plan.branchIds === null
        ? []
        : [t('summary.branchCount', { count: format.number(plan.branchIds.length) })]),
    ],
  };
}
