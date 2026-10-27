// Plans and sales added straight in the database for the end-to-end tests (no screens involved),
// as sell_subscription() would leave them: a subscription with its own copy of the plan, its
// invoice and item, and optionally a payment and installments.
import { randomUUID } from 'node:crypto';
import { baghdadDateOf, planEndDate } from '@gym/core';
import { admin, write, type TestData } from './backend';

const DAY = 86_400_000;

/**
 * A date `days` from today in Baghdad (YYYY-MM-DD; negative: in the past), the server's today: a
 * UTC date is a day behind between 21:00 and midnight UTC.
 */
export function dateIn(days: number): string {
  return baghdadDateOf(Date.now() + days * DAY);
}

/** A plan of `months` months, with 10 freeze days. */
export async function addPlan(
  data: TestData,
  nameCkb: string,
  price: number,
  months = 1,
): Promise<string> {
  const gym = await data.gym();
  const id = randomUUID();
  await write(
    admin().from('plans').insert({
      id,
      gym_id: gym.id,
      name_ckb: nameCkb,
      kind: 'time',
      duration_unit: 'month',
      duration_count: months,
      price,
      max_freeze_days: 10,
    }),
  );
  return id;
}

export interface SaleOptions {
  readonly memberId: string;
  readonly branchId: string;
  readonly planId: string;
  readonly nameCkb: string;
  readonly price: number;
  /** The invoice's number; tests use B2-9… so they never meet the branch's own counter. */
  readonly number: string;
  /** Days ago it started (default: today). */
  readonly startedDaysAgo?: number;
  /** Paid in cash at the sale (default: nothing). */
  readonly paid?: number;
  /** Installments (amounts), a month apart from 30 days on. */
  readonly installments?: readonly number[];
}

/** A month of a plan sold to a member; returns the subscription's and invoice's ids. */
export async function addSale(
  data: TestData,
  sale: SaleOptions,
): Promise<{ subscriptionId: string; invoiceId: string }> {
  const gym = await data.gym();
  const subscriptionId = randomUUID();
  const invoiceId = randomUUID();
  const start = dateIn(-(sale.startedDaysAgo ?? 0));
  await write(
    admin()
      .from('subscriptions')
      .insert({
        id: subscriptionId,
        gym_id: gym.id,
        member_id: sale.memberId,
        plan_id: sale.planId,
        branch_id: sale.branchId,
        name_ckb: sale.nameCkb,
        kind: 'time',
        duration_unit: 'month',
        duration_count: 1,
        price: sale.price,
        gender: 'any',
        max_freeze_days: 10,
        start_date: start,
        end_date: planEndDate(start, 'month', 1),
      }),
  );
  await write(
    admin().from('invoices').insert({
      id: invoiceId,
      gym_id: gym.id,
      branch_id: sale.branchId,
      member_id: sale.memberId,
      number: sale.number,
      subtotal: sale.price,
      total: sale.price,
    }),
  );
  await write(
    admin().from('invoice_items').insert({
      gym_id: gym.id,
      invoice_id: invoiceId,
      kind: 'subscription',
      subscription_id: subscriptionId,
      description_ckb: sale.nameCkb,
      unit_price: sale.price,
      total: sale.price,
    }),
  );
  if (sale.paid) {
    await write(
      admin()
        .from('payments')
        .insert({
          id: randomUUID(),
          gym_id: gym.id,
          branch_id: sale.branchId,
          member_id: sale.memberId,
          invoice_id: invoiceId,
          number: sale.number.replace('-', '-R'),
          method: 'cash',
          amount: sale.paid,
        }),
    );
  }
  if (sale.installments?.length) {
    await write(
      admin()
        .from('installments')
        .insert(
          sale.installments.map((amount, index) => ({
            id: randomUUID(),
            gym_id: gym.id,
            invoice_id: invoiceId,
            due_date: dateIn(30 * (index + 1)),
            amount,
          })),
        ),
    );
  }
  return { subscriptionId, invoiceId };
}
