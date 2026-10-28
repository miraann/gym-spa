import {
  STOCK_REMOVE_REASONS,
  SHOP_LIMITS,
  isLowStock,
  parseWholeNumber,
  type StockRemoveReason,
} from '@gym/core';
import { localizedName } from '@gym/i18n';
import { GroupedList, GroupedListItem } from '@gym/ui/blocks/list-group';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Badge } from '@gym/ui/components/badge';
import { Button } from '@gym/ui/components/button';
import { Checkbox } from '@gym/ui/components/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { Link } from '@tanstack/react-router';
import { TagIcon, TriangleAlertIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BranchSelect } from '@/components/branch-select';
import { NoAccess } from '@/components/no-access';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { useBranchChoice } from '@/lib/use-branch-choice';
import {
  useChangeStock,
  useProducts,
  useStockLevels,
  useStockMovements,
  type Product,
  type StockChange,
} from './shop-data';
import { ShopError } from './shop-error';
import { shopErrorKey, type ShopErrorKey } from './shop-errors';

type ChangeKind = StockChange['kind'];

/**
 * /shop/stock: a branch's stock per counted product (pos.sell, inventory.adjust or
 * products.manage); receiving, counting and taking out with inventory.adjust.
 */
export function StockPage() {
  const maySell = usePermission('pos.sell');
  const mayAdjust = usePermission('inventory.adjust');
  const mayManage = usePermission('products.manage');
  if (!maySell && !mayAdjust && !mayManage) return <NoAccess />;
  return <Stock mayAdjust={mayAdjust} mayManage={mayManage} />;
}

function Stock({
  mayAdjust,
  mayManage,
}: {
  readonly mayAdjust: boolean;
  readonly mayManage: boolean;
}) {
  const { t } = useTranslation('shop');
  const { language } = usePreferences();
  const format = useFormat();
  const { branchId, setBranchId, active } = useBranchChoice();
  const products = useProducts();
  const levels = useStockLevels(branchId);
  const movements = useStockMovements(branchId, mayAdjust || mayManage);
  const [onlyLow, setOnlyLow] = useState(false);
  const [changing, setChanging] = useState<{ product: Product; kind: ChangeKind } | null>(null);
  const stockOf = (id: string) => levels.data?.get(id) ?? 0;
  const counted = (products.data ?? [])
    .filter((each) => each.trackStock && (each.isActive || stockOf(each.id) !== 0))
    .filter((each) => !onlyLow || isLowStock(stockOf(each.id), each.lowStockLevel))
    .sort((a, b) => localizedName(a, language).localeCompare(localizedName(b, language)));
  const productName = (id: string) => {
    const found = products.data?.find((each) => each.id === id);
    return found ? localizedName(found, language) : '';
  };
  const lowId = useId();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('stock.title')}
        description={t('stock.description')}
        actions={
          mayManage && (
            <Button asChild variant="outline">
              <Link to="/shop/products">
                <TagIcon data-icon="inline-start" />
                {t('till.products')}
              </Link>
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-end gap-4">
        <BranchSelect
          label={t('stock.branch')}
          branchId={branchId}
          active={active}
          onChange={setBranchId}
        />
        <div className="flex items-center gap-3 pb-2">
          <Checkbox
            id={lowId}
            checked={onlyLow}
            onCheckedChange={(next) => {
              setOnlyLow(next === true);
            }}
          />
          <Label htmlFor={lowId} className="font-normal">
            {t('stock.onlyLow')}
          </Label>
        </div>
      </div>

      {products.isError || levels.isError ? (
        <ShopError error={shopErrorKey(products.error ?? levels.error, 'load_stock')} />
      ) : products.isPending || levels.isPending ? (
        <Skeleton className="h-32 rounded-3xl" />
      ) : counted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('stock.noProducts')}</p>
      ) : (
        <GroupedList aria-label={t('stock.title')}>
          {counted.map((product) => {
            const stock = stockOf(product.id);
            const low = isLowStock(stock, product.lowStockLevel);
            return (
              <GroupedListItem key={product.id}>
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                  data-stock={product.nameCkb}
                >
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="font-medium">{localizedName(product, language)}</span>
                    {low && (
                      <Badge variant="warning" className="w-fit">
                        <TriangleAlertIcon aria-hidden="true" />
                        {t('till.low')}
                      </Badge>
                    )}
                  </span>
                  <span className="text-lg tabular-nums" data-stock-count>
                    {format.number(stock)}
                  </span>
                  {mayAdjust && (
                    <span className="flex flex-wrap gap-2">
                      {(['receive', 'count', 'remove'] as const).map((kind) => (
                        <Button
                          key={kind}
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setChanging({ product, kind });
                          }}
                        >
                          {t(`stock.${kind}`)}
                        </Button>
                      ))}
                    </span>
                  )}
                </div>
              </GroupedListItem>
            );
          })}
        </GroupedList>
      )}

      {(mayAdjust || mayManage) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg">{t('stock.history')}</h2>
          {movements.isError ? (
            <ShopError error={shopErrorKey(movements.error, 'load_movements')} />
          ) : movements.isPending ? (
            <Skeleton className="h-24 rounded-3xl" />
          ) : movements.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('stock.noHistory')}</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-3xl bg-card" data-testid="stock-history">
              {movements.data.map((movement) => (
                <li
                  key={movement.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
                >
                  <span className="flex flex-1 flex-col">
                    <span>{productName(movement.productId)}</span>
                    <span className="text-sm text-muted-foreground">
                      {[
                        t(`stock.kinds.${movement.kind}`),
                        movement.reason ? t(`stock.reasons.${movement.reason}`) : null,
                        movement.note,
                        format.dateTime(movement.createdAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="tabular-nums" dir="ltr">
                    {movement.quantity > 0
                      ? `+${format.number(movement.quantity)}`
                      : format.number(movement.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {changing && (
        <StockDialog
          product={changing.product}
          kind={changing.kind}
          branchId={branchId}
          stock={stockOf(changing.product.id)}
          onClose={() => {
            setChanging(null);
          }}
        />
      )}
    </div>
  );
}

function StockDialog({
  product,
  kind,
  branchId,
  stock,
  onClose,
}: {
  readonly product: Product;
  readonly kind: ChangeKind;
  readonly branchId: string;
  readonly stock: number;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('shop');
  const { language } = usePreferences();
  const format = useFormat();
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const change = useChangeStock();
  const [movementId] = useState(() => crypto.randomUUID());
  const [quantity, setQuantity] = useState(kind === 'count' ? String(stock) : '');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState<StockRemoveReason>('damaged');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ShopErrorKey | null>(null);
  const name = localizedName(product, language);
  const value = parseWholeNumber(quantity);
  const cost = unitCost.trim() === '' ? null : parseWholeNumber(unitCost);
  const quantityProblem =
    value === null ||
    value > SHOP_LIMITS.maxStockChange ||
    (kind !== 'count' && value < 1) ||
    (kind === 'remove' && value > stock);
  const costProblem = unitCost.trim() !== '' && cost === null;
  const noteProblem = kind === 'remove' && reason === 'other' && note.trim() === '';
  const title =
    kind === 'receive'
      ? t('movement.receiveTitle', { name })
      : kind === 'count'
        ? t('movement.countTitle', { name })
        : t('movement.removeTitle', { name });

  const confirm = () => {
    setSent(true);
    if (quantityProblem || costProblem || noteProblem) return;
    setError(null);
    change.mutate(
      {
        id: movementId,
        branchId,
        productId: product.id,
        note: note.trim() === '' ? null : note.trim(),
        change:
          kind === 'receive'
            ? { kind, quantity: value, unitCost: cost }
            : kind === 'count'
              ? { kind, counted: value }
              : { kind, quantity: value, reason },
      },
      {
        onSuccess: (left) => {
          toast.success(t('movement.saved', { count: left }));
          onClose();
        },
        onError: (thrown) => {
          setError(shopErrorKey(thrown, kind));
        },
      },
    );
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      footer={
        <>
          <Button disabled={!online || readOnly || change.isPending} onClick={confirm}>
            {change.isPending && <Spinner />}
            {t('actions.save')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="stock-form">
        <Field data-invalid={sent && quantityProblem ? true : undefined}>
          <FieldLabel htmlFor={`${id}-quantity`}>
            {kind === 'count' ? t('movement.counted') : t('movement.quantity')}
          </FieldLabel>
          <Input
            id={`${id}-quantity`}
            dir="ltr"
            inputMode="numeric"
            className="tabular-nums"
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
            }}
          />
          {kind !== 'receive' && (
            <FieldDescription>
              {t('movement.countHint', { count: format.number(stock) })}
            </FieldDescription>
          )}
          {sent && quantityProblem && <FieldError>{t('movement.quantityProblem')}</FieldError>}
        </Field>
        {kind === 'receive' && (
          <Field data-invalid={sent && costProblem ? true : undefined}>
            <FieldLabel htmlFor={`${id}-cost`}>{t('movement.unitCost')}</FieldLabel>
            <Input
              id={`${id}-cost`}
              dir="ltr"
              inputMode="numeric"
              className="tabular-nums"
              value={unitCost}
              onChange={(event) => {
                setUnitCost(event.target.value);
              }}
            />
            {sent && costProblem && <FieldError>{t('movement.quantityProblem')}</FieldError>}
          </Field>
        )}
        {kind === 'remove' && (
          <Field>
            <FieldLabel htmlFor={`${id}-reason`}>{t('movement.reason')}</FieldLabel>
            <NativeSelect
              id={`${id}-reason`}
              value={reason}
              onChange={(event) => {
                const next = STOCK_REMOVE_REASONS.find((each) => each === event.target.value);
                if (next) setReason(next);
              }}
            >
              {STOCK_REMOVE_REASONS.map((each) => (
                <NativeSelectOption key={each} value={each}>
                  {t(`stock.reasons.${each}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field data-invalid={sent && noteProblem ? true : undefined}>
          <FieldLabel htmlFor={`${id}-note`}>
            {kind === 'remove' && reason === 'other'
              ? t('movement.noteRequired')
              : t('movement.note')}
          </FieldLabel>
          <Textarea
            id={`${id}-note`}
            maxLength={300}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
          {sent && noteProblem && <FieldError>{t('movement.noteProblem')}</FieldError>}
        </Field>
        <ShopError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
