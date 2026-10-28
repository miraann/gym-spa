import {
  addToBasket,
  basketCount,
  basketTotal,
  formatMemberNumber,
  isLowStock,
  normalizeBarcode,
  normalizeSearchText,
  setBasketQuantity,
  type BasketLine,
} from '@gym/core';
import { localizedName } from '@gym/i18n';
import { Chip, ChipRow } from '@gym/ui/blocks/chip-row';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Alert, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@gym/ui/components/radio-group';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { Link } from '@tanstack/react-router';
import {
  CircleCheckIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  TagIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BranchSelect } from '@/components/branch-select';
import { RequirePermission } from '@/components/no-access';
import { usePermission } from '@/features/auth/use-permissions';
import { useMemberSearch, type Member } from '@/features/members/member-data';
import { PayNow } from '@/features/payments/pay-now';
import { PaymentFields } from '@/features/payments/payment-fields';
import { PrintReceiptButton } from '@/features/payments/print-receipt-button';
import { usePayNow } from '@/features/payments/use-pay-now';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBranchChoice } from '@/lib/use-branch-choice';
import {
  useProductCategories,
  useProducts,
  useSellProducts,
  useStockLevels,
  type Product,
  type SaleResult,
} from './shop-data';
import { ShopError } from './shop-error';
import { shopErrorKey, type ShopErrorKey } from './shop-errors';

/** /shop (pos.sell): the till. Products by category, search and barcode, the basket, paying. */
export function TillPage() {
  return (
    <RequirePermission permission="pos.sell">
      <Till />
    </RequirePermission>
  );
}

function Till() {
  const { t } = useTranslation('shop');
  const { language } = usePreferences();
  const format = useFormat();
  const mayManage = usePermission('products.manage');
  const { branchId, setBranchId, active } = useBranchChoice();
  const categories = useProductCategories();
  const products = useProducts();
  const levels = useStockLevels(branchId);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<readonly BasketLine[]>([]);
  const [paying, setPaying] = useState(false);
  const [sold, setSold] = useState<SaleResult | null>(null);
  const searchId = useId();

  const onSale = (products.data ?? []).filter((each) => each.isActive);
  const productOf = (id: string) => onSale.find((each) => each.id === id);
  // What can be sold: the stock for counted products, no limit (null) for the others.
  const available = (product: Product) =>
    product.trackStock ? (levels.data?.get(product.id) ?? 0) : null;
  const search = normalizeSearchText(query);
  const shown = onSale
    .filter((each) => categoryId === null || each.categoryId === categoryId)
    .filter(
      (each) =>
        search === '' ||
        normalizeSearchText(
          [each.nameCkb, each.nameEn ?? '', each.nameAr ?? '', each.barcode ?? ''].join(' '),
        ).includes(search),
    )
    .sort((a, b) => localizedName(a, language).localeCompare(localizedName(b, language)));
  const shownCategories = (categories.data ?? []).filter(
    (each) => each.isActive && onSale.some((product) => product.categoryId === each.id),
  );

  const add = (product: Product) => {
    const next = addToBasket(lines, product.id, product.price, available(product));
    if (next === lines) {
      toast.warning(t('till.noMore'));
      return;
    }
    setSold(null);
    setLines(next);
  };

  // A barcode scanner types the code and Enter.
  const scan = () => {
    const code = normalizeBarcode(query);
    if (code === '') return;
    const product = onSale.find((each) => each.barcode === code);
    if (product) {
      add(product);
      setQuery('');
    } else if (shown.length === 0) {
      toast.error(t('till.barcodeNotFound', { barcode: code }));
    }
  };

  const total = basketTotal(lines);
  const count = basketCount(lines);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('till.title')}
        description={t('till.description')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/shop/stock">
                <PackageIcon data-icon="inline-start" />
                {t('till.stock')}
              </Link>
            </Button>
            {mayManage && (
              <Button asChild variant="outline">
                <Link to="/shop/products">
                  <TagIcon data-icon="inline-start" />
                  {t('till.products')}
                </Link>
              </Button>
            )}
          </>
        }
      />
      <BranchSelect
        label={t('till.branch')}
        branchId={branchId}
        active={active}
        onChange={(next) => {
          setBranchId(next);
          setLines([]);
        }}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={searchId} className="sr-only">
              {t('till.search')}
            </FieldLabel>
            <Input
              id={searchId}
              type="search"
              placeholder={t('till.search')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  scan();
                }
              }}
            />
          </Field>
          {shownCategories.length > 0 && (
            <ChipRow label={t('products.categories')}>
              <Chip
                selected={categoryId === null}
                aria-pressed={categoryId === null}
                onClick={() => {
                  setCategoryId(null);
                }}
              >
                {t('till.all')}
              </Chip>
              {shownCategories.map((each) => (
                <Chip
                  key={each.id}
                  selected={categoryId === each.id}
                  aria-pressed={categoryId === each.id}
                  onClick={() => {
                    setCategoryId(each.id);
                  }}
                >
                  {localizedName(each, language)}
                </Chip>
              ))}
            </ChipRow>
          )}
          {products.isError || levels.isError ? (
            <ShopError error={shopErrorKey(products.error ?? levels.error, 'load_till')} />
          ) : products.isPending || levels.isPending ? (
            <Skeleton className="h-48 rounded-3xl" />
          ) : onSale.length === 0 ? (
            <p className="text-muted-foreground">{t('till.noProducts')}</p>
          ) : shown.length === 0 ? (
            <p className="text-muted-foreground">{t('till.noMatch')}</p>
          ) : (
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
              data-testid="till-products"
            >
              {shown.map((product) => {
                const left = available(product);
                const out = left !== null && left <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={out}
                    data-till-product={product.nameCkb}
                    className="flex min-h-28 flex-col items-start gap-2 rounded-2xl bg-card p-4 text-start transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 motion-reduce:transition-none"
                    onClick={() => {
                      add(product);
                    }}
                  >
                    <span className="font-medium">{localizedName(product, language)}</span>
                    <span className="text-lg tabular-nums">{format.money(product.price)}</span>
                    {left !== null && (
                      <span className="mt-auto flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {out ? (
                          <Badge variant="destructive">
                            <TriangleAlertIcon aria-hidden="true" />
                            {t('till.outOfStock')}
                          </Badge>
                        ) : (
                          <>
                            {t('till.inStock', { count: format.number(left) })}
                            {isLowStock(left, product.lowStockLevel) && (
                              <Badge variant="warning">
                                <TriangleAlertIcon aria-hidden="true" />
                                {t('till.low')}
                              </Badge>
                            )}
                          </>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <Card data-testid="basket" className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle>
              <h2>{t('basket.title')}</h2>
            </CardTitle>
            {lines.length > 0 && (
              <CardAction>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLines([]);
                  }}
                >
                  {t('basket.clear')}
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {sold && (
              <Alert data-testid="sold">
                <CircleCheckIcon />
                <AlertTitle>{t('sale.soldTitle')}</AlertTitle>
                <AlertDescription className="flex flex-col gap-3">
                  <span dir="ltr" className="tabular-nums">
                    {t('sale.invoice', { invoice: sold.invoice_number })}
                  </span>
                  <PrintReceiptButton invoiceId={sold.invoice_id} />
                </AlertDescription>
              </Alert>
            )}
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('basket.empty')}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {lines.map((line) => {
                  const product = productOf(line.productId);
                  const name = product ? localizedName(product, language) : '';
                  const limit = product ? available(product) : 0;
                  return (
                    <li
                      key={line.productId}
                      className="flex flex-wrap items-center gap-2 py-2"
                      data-basket-line={product?.nameCkb}
                    >
                      <span className="flex flex-1 flex-col">
                        <span>{name}</span>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {t('basket.line', {
                            quantity: format.number(line.quantity),
                            price: format.money(line.price),
                          })}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={t('basket.decrease')}
                          onClick={() => {
                            setLines(
                              setBasketQuantity(lines, line.productId, line.quantity - 1, limit),
                            );
                          }}
                        >
                          <MinusIcon />
                        </Button>
                        <span className="min-w-8 text-center tabular-nums" data-quantity>
                          {format.number(line.quantity)}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={t('basket.increase')}
                          onClick={() => {
                            if (product) add(product);
                          }}
                        >
                          <PlusIcon />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t('basket.remove')}
                          onClick={() => {
                            setLines(setBasketQuantity(lines, line.productId, 0, limit));
                          }}
                        >
                          <Trash2Icon />
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex items-baseline justify-between gap-3 border-t pt-3">
              <span className="text-muted-foreground">
                {t('basket.total')} · {t('basket.count', { count: format.number(count) })}
              </span>
              <span className="text-2xl tabular-nums" data-testid="basket-total">
                {format.money(total)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <StickyActionBar>
        <Button
          size="lg"
          disabled={lines.length === 0 || branchId === ''}
          onClick={() => {
            setPaying(true);
          }}
        >
          {t('basket.pay')}
        </Button>
      </StickyActionBar>

      {paying && (
        <SaleDialog
          branchId={branchId}
          lines={lines}
          products={onSale}
          onPriceChange={setLines}
          onClose={() => {
            setPaying(false);
          }}
          onSold={(result) => {
            setPaying(false);
            setLines([]);
            setSold(result);
          }}
        />
      )}
    </div>
  );
}

function SaleDialog({
  branchId,
  lines,
  products,
  onPriceChange,
  onClose,
  onSold,
}: {
  readonly branchId: string;
  readonly lines: readonly BasketLine[];
  readonly products: readonly Product[];
  readonly onPriceChange: (lines: readonly BasketLine[]) => void;
  readonly onClose: () => void;
  readonly onSold: (result: SaleResult) => void;
}) {
  const { t } = useTranslation('shop');
  const format = useFormat();
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const sell = useSellProducts();
  const [ids] = useState(() => ({ invoice: crypto.randomUUID(), payment: crypto.randomUUID() }));
  const [member, setMember] = useState<Member | null>(null);
  const [toMember, setToMember] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ShopErrorKey | null>(null);
  const total = basketTotal(lines);
  const pay = usePayNow(total);
  const walkIn = !toMember;
  const payNow = pay.payNow;

  const confirm = () => {
    setSent(true);
    if (toMember && member === null) return;
    if (payNow && total > 0 && pay.problem) return;
    // A price changed since it was added (the server refuses it too): show the new prices first.
    const current = lines.map((line) => ({
      ...line,
      price: products.find((each) => each.id === line.productId)?.price ?? line.price,
    }));
    if (current.some((line, index) => line.price !== lines[index]?.price)) {
      onPriceChange(current);
      setError('price_changed');
      return;
    }
    setError(null);
    void sell
      .mutateAsync({
        invoiceId: ids.invoice,
        branchId,
        memberId: walkIn ? null : (member?.id ?? null),
        lines,
        payment: payNow && total > 0 ? pay.input(ids.payment) : null,
      })
      .then(
        (result) => {
          toast.success(t('sale.sold', { invoice: result.invoice_number }));
          onSold(result);
        },
        (thrown: unknown) => {
          setError(shopErrorKey(thrown, 'sell'));
        },
      );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('sale.title')}
      description={`${t('basket.total')}: ${format.money(total)}`}
      footer={
        <>
          <Button
            disabled={!online || readOnly || sell.isPending || (toMember && member === null)}
            onClick={confirm}
          >
            {sell.isPending && <Spinner />}
            {t('sale.confirm')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="shop-sale">
        <Field>
          <FieldLabel>{t('sale.customer')}</FieldLabel>
          <RadioGroup
            aria-label={t('sale.customer')}
            value={toMember ? 'member' : 'walk_in'}
            onValueChange={(value) => {
              setToMember(value === 'member');
              // A walk-in always pays now.
              if (value !== 'member') pay.setPayNow(true);
            }}
            className="grid gap-2 sm:grid-cols-2"
          >
            {(['walk_in', 'member'] as const).map((value) => (
              <Label
                key={value}
                htmlFor={`${id}-${value}`}
                className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 font-normal has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
              >
                <RadioGroupItem id={`${id}-${value}`} value={value} />
                {value === 'walk_in' ? t('sale.walkIn') : t('sale.member')}
              </Label>
            ))}
          </RadioGroup>
        </Field>
        {toMember && <MemberChoice value={member} onChange={setMember} />}
        {walkIn ? (
          total > 0 && (
            <>
              <FieldDescription>{t('sale.walkInPays')}</FieldDescription>
              <PaymentFields
                value={pay.values}
                onChange={pay.setPayment}
                owed={total}
                showProblems={sent}
                wholeAmount
              />
            </>
          )
        ) : (
          <PayNow
            label={t('sale.payNow')}
            total={total}
            payNow={pay.payNow}
            onPayNow={pay.setPayNow}
            payment={pay.values}
            onPayment={pay.setPayment}
            showProblems={sent}
          />
        )}
        <ShopError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

/** Finding the member who buys: any member who isn't archived. */
function MemberChoice({
  value,
  onChange,
}: {
  readonly value: Member | null;
  readonly onChange: (member: Member | null) => void;
}) {
  const { t } = useTranslation('shop');
  const id = useId();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 1;
  const found = useMemberSearch(query, searching);
  const candidates = (found.data?.members ?? []).filter((each) => each.status !== 'archived');

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${id}-search`}>{t('sale.searchMember')}</FieldLabel>
        <Input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </Field>
      {searching && found.isSuccess && candidates.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('sale.noMember')}</p>
      )}
      {candidates.length > 0 && (
        <RadioGroup
          aria-label={t('sale.member')}
          value={value?.id ?? ''}
          onValueChange={(chosen) => {
            onChange(candidates.find((each) => each.id === chosen) ?? null);
          }}
          className="grid gap-2"
        >
          {candidates.map((candidate) => (
            <Label
              key={candidate.id}
              htmlFor={`${id}-${candidate.id}`}
              className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 font-normal has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
            >
              <RadioGroupItem id={`${id}-${candidate.id}`} value={candidate.id} />
              <span className="flex-1">{candidate.fullName}</span>
              <span dir="ltr" className="text-sm text-muted-foreground tabular-nums">
                {formatMemberNumber(candidate.memberNumber)}
              </span>
            </Label>
          ))}
        </RadioGroup>
      )}
    </>
  );
}
