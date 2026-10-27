import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  DEBTS_QUERY,
  INVOICES_QUERY,
  TODAY_PAYMENTS_QUERY,
} from '@/features/payments/payment-data';
import { paymentJson, type PaymentInput } from '@/features/payments/payment-input';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import { BALANCES_QUERY, SUBSCRIPTIONS_QUERY } from './subscription-data';

// Changing a subscription (step 3f): what the screens show first (subscription_change_preview),
// and freezing, unfreezing, changing the plan, transferring and cancelling. The amounts all come
// from the database (app.unused_value), never worked out here.

const PREVIEW_QUERY = 'subscription-preview';

const previewSchema = z.object({
  worth: z.number(),
  forgiven: z.number(),
  left_over: z.number(),
  unlimited: z.boolean(),
  freeze_days_used: z.number(),
  freeze_days_allowed: z.number(),
  freeze: z.object({ id: z.string(), start_date: z.string(), end_date: z.string() }).nullable(),
});

export type ChangePreview = z.infer<typeof previewSchema>;

export function useChangePreview(subscriptionId: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [PREVIEW_QUERY, actor, subscriptionId],
    enabled: enabled && client !== undefined,
    queryFn: async (): Promise<ChangePreview> => {
      const { data, error } = await requireClient(client).rpc('subscription_change_preview', {
        p_subscription_id: subscriptionId,
      });
      if (error) throw error;
      return previewSchema.parse(data);
    },
  });
}

/** After a change: the subscriptions, the previews and every list of money. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [
        SUBSCRIPTIONS_QUERY,
        PREVIEW_QUERY,
        BALANCES_QUERY,
        INVOICES_QUERY,
        DEBTS_QUERY,
        TODAY_PAYMENTS_QUERY,
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
}

const endSchema = z.object({ end_date: z.string() });

export function useFreeze() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: {
      freezeId: string;
      subscriptionId: string;
      startDate: string;
      days: number;
      reason: string | null;
    }) => {
      const { data, error } = await requireClient(client).rpc('freeze_subscription', {
        p_freeze_id: input.freezeId,
        p_subscription_id: input.subscriptionId,
        p_start_date: input.startDate,
        p_days: input.days,
        ...(input.reason ? { p_reason: input.reason } : {}),
      });
      if (error) throw error;
      return endSchema.parse(data);
    },
    onSettled: refresh,
  });
}

export function useUnfreeze() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (freezeId: string) => {
      const { data, error } = await requireClient(client).rpc('unfreeze_subscription', {
        p_freeze_id: freezeId,
      });
      if (error) throw error;
      return endSchema.parse(data);
    },
    onSettled: refresh,
  });
}

export function useChangePlan() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: {
      subscriptionId: string;
      newSubscriptionId: string;
      invoiceId: string;
      planId: string;
      branchId: string;
      price: number;
      payment: PaymentInput | null;
    }) => {
      const { data, error } = await requireClient(client).rpc('change_plan', {
        p_subscription_id: input.subscriptionId,
        p_new_subscription_id: input.newSubscriptionId,
        p_invoice_id: input.invoiceId,
        p_plan_id: input.planId,
        p_branch_id: input.branchId,
        p_price: input.price,
        ...(input.payment ? { p_payment: paymentJson(input.payment) } : {}),
      });
      if (error) throw error;
      return z.object({ invoice_number: z.string() }).parse(data);
    },
    onSettled: refresh,
  });
}

export function useTransfer() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: {
      subscriptionId: string;
      newSubscriptionId: string;
      memberId: string;
      reason: string;
    }) => {
      const { error } = await requireClient(client).rpc('transfer_subscription', {
        p_subscription_id: input.subscriptionId,
        p_new_subscription_id: input.newSubscriptionId,
        p_member_id: input.memberId,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

export function useCancelSubscription() {
  const { client } = useActingClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: {
      subscriptionId: string;
      reason: string;
      refund: { id: string; amount: number; method: string; branchId: string } | null;
    }) => {
      const { data, error } = await requireClient(client).rpc('cancel_subscription', {
        p_subscription_id: input.subscriptionId,
        p_reason: input.reason,
        ...(input.refund
          ? {
              p_refund: {
                id: input.refund.id,
                amount: input.refund.amount,
                method: input.refund.method,
              },
              p_branch_id: input.refund.branchId,
            }
          : {}),
      });
      if (error) throw error;
      return z.object({ refunded: z.number(), receipt_number: z.string().nullable() }).parse(data);
    },
    onSettled: refresh,
  });
}
