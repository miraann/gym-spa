import type { StockMovementKind, StockRemoveReason } from '@gym/core';
import type { LocalizedNames } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  DEBTS_QUERY,
  INVOICES_QUERY,
  TODAY_PAYMENTS_QUERY,
} from '@/features/payments/payment-data';
import { paymentJson, type PaymentInput } from '@/features/payments/payment-input';
import { requireClient, useActingClient } from '@/features/staff/admin-data';

// The shop's server calls (steps 8c and 8d), with the acting staff member's own session: the
// catalog is the gym's; stock levels come from stock_levels() (pos.sell, inventory.adjust or
// products.manage), the movements need inventory.adjust or products.manage.
// supabase/migrations/20261029100000_shop.sql.

export const SHOP_QUERY = 'shop';

export interface ProductCategory extends LocalizedNames {
  readonly id: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export type ProductCategoryDraft = Omit<ProductCategory, 'id'>;

export function useProductCategories() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SHOP_QUERY, actor, 'categories'],
    enabled: client !== undefined,
    queryFn: async (): Promise<ProductCategory[]> => {
      const { data, error } = await requireClient(client)
        .from('product_categories')
        .select('id, name_ckb, name_en, name_ar, sort_order, is_active')
        .order('sort_order')
        .order('name_ckb');
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        nameCkb: row.name_ckb,
        nameEn: row.name_en,
        nameAr: row.name_ar,
        sortOrder: row.sort_order,
        isActive: row.is_active,
      }));
    },
  });
}

export function useSaveProductCategory() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, category }: { id: string | null; category: ProductCategoryDraft }) => {
      const { error } = await requireClient(client).rpc('save_product_category', {
        p_id: id ?? crypto.randomUUID(),
        p_name_ckb: category.nameCkb,
        p_sort_order: category.sortOrder,
        p_is_active: category.isActive,
        ...(category.nameEn ? { p_name_en: category.nameEn } : {}),
        ...(category.nameAr ? { p_name_ar: category.nameAr } : {}),
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [SHOP_QUERY] }),
  });
}

export interface Product extends LocalizedNames {
  readonly id: string;
  readonly categoryId: string | null;
  readonly price: number;
  readonly barcode: string | null;
  readonly trackStock: boolean;
  readonly lowStockLevel: number | null;
  readonly isActive: boolean;
}

export type ProductDraft = Omit<Product, 'id'>;

export function useProducts() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SHOP_QUERY, actor, 'products'],
    enabled: client !== undefined,
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await requireClient(client)
        .from('products')
        .select(
          'id, category_id, name_ckb, name_en, name_ar, price, barcode, track_stock, low_stock_level, is_active',
        )
        .order('name_ckb');
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        nameCkb: row.name_ckb,
        nameEn: row.name_en,
        nameAr: row.name_ar,
        price: row.price,
        barcode: row.barcode,
        trackStock: row.track_stock,
        lowStockLevel: row.low_stock_level,
        isActive: row.is_active,
      }));
    },
  });
}

export function useSaveProduct() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, product }: { id: string | null; product: ProductDraft }) => {
      const { error } = await requireClient(client).rpc('save_product', {
        p_id: id ?? crypto.randomUUID(),
        p_name_ckb: product.nameCkb,
        p_price: product.price,
        p_track_stock: product.trackStock,
        p_is_active: product.isActive,
        ...(product.nameEn ? { p_name_en: product.nameEn } : {}),
        ...(product.nameAr ? { p_name_ar: product.nameAr } : {}),
        ...(product.categoryId ? { p_category_id: product.categoryId } : {}),
        ...(product.barcode ? { p_barcode: product.barcode } : {}),
        ...(product.lowStockLevel === null ? {} : { p_low_stock_level: product.lowStockLevel }),
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [SHOP_QUERY] }),
  });
}

/** A branch's stock, per counted product (0 when it never had any). */
export function useStockLevels(branchId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SHOP_QUERY, actor, 'stock', branchId],
    enabled: client !== undefined && branchId !== '',
    queryFn: async (): Promise<ReadonlyMap<string, number>> => {
      const { data, error } = await requireClient(client).rpc('stock_levels', {
        p_branch_id: branchId,
      });
      if (error) throw error;
      return new Map(data.map((row) => [row.product_id, row.quantity]));
    },
  });
}

export interface StockMovement {
  readonly id: string;
  readonly productId: string;
  readonly kind: StockMovementKind;
  readonly quantity: number;
  readonly reason: StockRemoveReason | null;
  readonly note: string | null;
  readonly createdAt: string;
}

const movementSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  kind: z.enum(['receive', 'sale', 'sale_void', 'count', 'adjust']),
  quantity: z.number(),
  reason: z.enum(['damaged', 'expired', 'lost', 'gym_use', 'other']).nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
});

/** A branch's latest stock movements (inventory.adjust or products.manage). */
export function useStockMovements(branchId: string, enabled: boolean) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [SHOP_QUERY, actor, 'movements', branchId],
    enabled: client !== undefined && enabled && branchId !== '',
    queryFn: async (): Promise<StockMovement[]> => {
      const { data, error } = await requireClient(client)
        .from('stock_movements')
        .select('id, product_id, kind, quantity, reason, note, created_at')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data.map((row) => {
        const parsed = movementSchema.parse(row);
        return {
          id: parsed.id,
          productId: parsed.product_id,
          kind: parsed.kind,
          quantity: parsed.quantity,
          reason: parsed.reason,
          note: parsed.note,
          createdAt: parsed.created_at,
        };
      });
    },
  });
}

const stockSchema = z.object({ stock: z.number() });

export type StockChange =
  | { readonly kind: 'receive'; readonly quantity: number; readonly unitCost: number | null }
  | { readonly kind: 'count'; readonly counted: number }
  | { readonly kind: 'remove'; readonly quantity: number; readonly reason: StockRemoveReason };

/** Receiving, counting or taking out (inventory.adjust); returns the stock after it. */
export function useChangeStock() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      branchId: string;
      productId: string;
      note: string | null;
      change: StockChange;
    }) => {
      const acting = requireClient(client);
      const common = {
        p_id: input.id,
        p_branch_id: input.branchId,
        p_product_id: input.productId,
        ...(input.note ? { p_note: input.note } : {}),
      };
      const { change } = input;
      const { data, error } =
        change.kind === 'receive'
          ? await acting.rpc('receive_stock', {
              ...common,
              p_quantity: change.quantity,
              ...(change.unitCost === null ? {} : { p_unit_cost: change.unitCost }),
            })
          : change.kind === 'count'
            ? await acting.rpc('count_stock', { ...common, p_counted: change.counted })
            : await acting.rpc('remove_stock', {
                ...common,
                p_quantity: change.quantity,
                p_reason: change.reason,
              });
      if (error) throw error;
      return stockSchema.parse(data).stock;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [SHOP_QUERY] }),
  });
}

const saleSchema = z.object({
  invoice_id: z.string(),
  invoice_number: z.string(),
  total: z.number(),
  paid: z.number(),
  change_given: z.number(),
});

export type SaleResult = z.infer<typeof saleSchema>;

/** A sale (pos.sell and payments.create): to a member, or to the walk-in customer (null). */
export function useSellProducts() {
  const { client } = useActingClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sale: {
      invoiceId: string;
      branchId: string;
      memberId: string | null;
      lines: readonly { productId: string; quantity: number; price: number }[];
      payment: PaymentInput | null;
    }): Promise<SaleResult> => {
      const { data, error } = await requireClient(client).rpc('sell_products', {
        p_invoice_id: sale.invoiceId,
        p_branch_id: sale.branchId,
        // None: the walk-in customer.
        ...(sale.memberId === null ? {} : { p_member_id: sale.memberId }),
        p_items: sale.lines.map((line) => ({
          product_id: line.productId,
          quantity: line.quantity,
          price: line.price,
        })),
        ...(sale.payment ? { p_payment: paymentJson(sale.payment) } : {}),
      });
      if (error) throw error;
      return saleSchema.parse(data);
    },
    onSettled: () =>
      Promise.all(
        [SHOP_QUERY, INVOICES_QUERY, DEBTS_QUERY, TODAY_PAYMENTS_QUERY].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}
