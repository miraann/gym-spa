import {
  isCleanText,
  isValidBarcode,
  normalizeBarcode,
  normalizeName,
  parseWholeNumber,
} from '@gym/core';
import { localizedName } from '@gym/i18n';
import { AddTile } from '@gym/ui/blocks/add-tile';
import { GroupedList, GroupedListItem, RowChevron } from '@gym/ui/blocks/list-group';
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
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { Link } from '@tanstack/react-router';
import { PackageIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RequirePermission } from '@/components/no-access';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import {
  useProductCategories,
  useProducts,
  useSaveProduct,
  useSaveProductCategory,
  type Product,
  type ProductCategory,
} from './shop-data';
import { ShopError } from './shop-error';
import { shopErrorKey, type ShopErrorKey } from './shop-errors';

/** /shop/products (products.manage): the shop's categories and products. */
export function ProductsPage() {
  return (
    <RequirePermission permission="products.manage">
      <Products />
    </RequirePermission>
  );
}

function Products() {
  const { t } = useTranslation('shop');
  const { language } = usePreferences();
  const format = useFormat();
  const categories = useProductCategories();
  const products = useProducts();
  const [category, setCategory] = useState<ProductCategory | 'new' | null>(null);
  const [product, setProduct] = useState<Product | 'new' | null>(null);
  const categoryName = (id: string | null) => {
    const found = categories.data?.find((each) => each.id === id);
    return found ? localizedName(found, language) : t('products.noCategory');
  };
  const sorted = [...(products.data ?? [])].sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      categoryName(a.categoryId).localeCompare(categoryName(b.categoryId)) ||
      localizedName(a, language).localeCompare(localizedName(b, language)),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('products.title')}
        description={t('products.description')}
        actions={
          <Button asChild variant="outline">
            <Link to="/shop/stock">
              <PackageIcon data-icon="inline-start" />
              {t('till.stock')}
            </Link>
          </Button>
        }
      />

      <section className="flex flex-col gap-3">
        <SectionHeader
          title={t('products.categories')}
          action={t('products.addCategory')}
          onAdd={() => {
            setCategory('new');
          }}
        />
        {categories.isPending ? (
          <Skeleton className="h-16 rounded-3xl" />
        ) : categories.isError ? (
          <ShopError error={shopErrorKey(categories.error, 'load_categories')} />
        ) : categories.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('products.noCategories')}</p>
        ) : (
          <div className="flex flex-wrap gap-2" data-testid="product-categories">
            {categories.data.map((each) => (
              <Button
                key={each.id}
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setCategory(each);
                }}
              >
                {localizedName(each, language)}
                {!each.isActive && <Badge variant="secondary">{t('products.inactive')}</Badge>}
              </Button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title={t('products.list')}
          action={t('products.addProduct')}
          onAdd={() => {
            setProduct('new');
          }}
        />
        {products.isPending ? (
          <Skeleton className="h-24 rounded-3xl" />
        ) : products.isError ? (
          <ShopError error={shopErrorKey(products.error, 'load_products')} />
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('products.noProducts')}</p>
        ) : (
          <GroupedList aria-label={t('products.list')}>
            {sorted.map((each) => (
              <GroupedListItem key={each.id}>
                <button
                  type="button"
                  className={groupedRowClass()}
                  data-product={each.nameCkb}
                  onClick={() => {
                    setProduct(each);
                  }}
                >
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="font-medium">{localizedName(each, language)}</span>
                    <span className="text-sm text-muted-foreground">
                      {[
                        categoryName(each.categoryId),
                        each.trackStock
                          ? each.lowStockLevel === null
                            ? null
                            : t('products.lowLevel', { count: each.lowStockLevel })
                          : t('products.notCounted'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {each.barcode && (
                      <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                        {each.barcode}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{format.money(each.price)}</span>
                  {!each.isActive && <Badge variant="secondary">{t('products.inactive')}</Badge>}
                  <RowChevron />
                </button>
              </GroupedListItem>
            ))}
          </GroupedList>
        )}
      </section>

      {category && (
        <CategoryDialog
          category={category === 'new' ? null : category}
          onClose={() => {
            setCategory(null);
          }}
        />
      )}
      {product && (
        <ProductDialog
          product={product === 'new' ? null : product}
          categories={categories.data ?? []}
          onClose={() => {
            setProduct(null);
          }}
        />
      )}
    </div>
  );
}

function SectionHeader({
  title,
  action,
  onAdd,
}: {
  readonly title: string;
  readonly action: string;
  readonly onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg">{title}</h2>
      <AddTile label={action} onClick={onAdd} />
    </div>
  );
}

/** A text field of the dialogs below. */
function TextField({
  id,
  label,
  value,
  onChange,
  problem,
  hint,
  dir,
  numeric,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly problem?: string | null;
  readonly hint?: ReactNode;
  readonly dir?: 'ltr' | 'rtl';
  readonly numeric?: boolean;
}) {
  return (
    <Field data-invalid={problem ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        dir={dir}
        inputMode={numeric ? 'numeric' : undefined}
        className={numeric ? 'tabular-nums' : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {problem && <FieldError>{problem}</FieldError>}
    </Field>
  );
}

function ActiveBox({
  id,
  checked,
  onChange,
  label,
}: {
  readonly id: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => {
          onChange(next === true);
        }}
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

function DialogFooter({
  pending,
  onSave,
  onClose,
}: {
  readonly pending: boolean;
  readonly onSave: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('shop');
  const { online, readOnly } = useAdminWriteState();
  return (
    <>
      <Button disabled={!online || readOnly || pending} onClick={onSave}>
        {pending && <Spinner />}
        {t('actions.save')}
      </Button>
      <Button variant="outline" onClick={onClose}>
        {t('actions.cancel')}
      </Button>
    </>
  );
}

function CategoryDialog({
  category,
  onClose,
}: {
  readonly category: ProductCategory | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('shop');
  const id = useId();
  const save = useSaveProductCategory();
  const [nameCkb, setNameCkb] = useState(category?.nameCkb ?? '');
  const [nameEn, setNameEn] = useState(category?.nameEn ?? '');
  const [nameAr, setNameAr] = useState(category?.nameAr ?? '');
  const [order, setOrder] = useState(String(category?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ShopErrorKey | null>(null);
  const name = normalizeName(nameCkb);
  const orderValue = parseWholeNumber(order);
  const nameProblem = !isCleanText(name, 60);
  const orderProblem = orderValue === null || orderValue > 1000;

  const confirm = () => {
    setSent(true);
    if (nameProblem || orderProblem) return;
    setError(null);
    save.mutate(
      {
        id: category?.id ?? null,
        category: {
          nameCkb: name,
          nameEn: normalizeName(nameEn) || null,
          nameAr: normalizeName(nameAr) || null,
          sortOrder: orderValue,
          isActive,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('category.saved'));
          onClose();
        },
        onError: (thrown) => {
          setError(shopErrorKey(thrown, 'save_category'));
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
      title={t('category.title')}
      footer={<DialogFooter pending={save.isPending} onSave={confirm} onClose={onClose} />}
    >
      <FieldGroup data-testid="category-form">
        <TextField
          id={`${id}-name`}
          label={t('product.nameCkb')}
          value={nameCkb}
          onChange={setNameCkb}
          problem={sent && nameProblem ? t('product.nameProblem') : null}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={`${id}-en`}
            label={t('product.nameEn')}
            value={nameEn}
            onChange={setNameEn}
            dir="ltr"
          />
          <TextField
            id={`${id}-ar`}
            label={t('product.nameAr')}
            value={nameAr}
            onChange={setNameAr}
            dir="rtl"
          />
        </div>
        <TextField
          id={`${id}-order`}
          label={t('category.order')}
          value={order}
          onChange={setOrder}
          problem={sent && orderProblem ? t('product.numberProblem') : null}
          dir="ltr"
          numeric
        />
        <ActiveBox
          id={`${id}-active`}
          checked={isActive}
          onChange={setIsActive}
          label={t('product.active')}
        />
        <ShopError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}

function ProductDialog({
  product,
  categories,
  onClose,
}: {
  readonly product: Product | null;
  readonly categories: readonly ProductCategory[];
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('shop');
  const { language } = usePreferences();
  const id = useId();
  const save = useSaveProduct();
  const [nameCkb, setNameCkb] = useState(product?.nameCkb ?? '');
  const [nameEn, setNameEn] = useState(product?.nameEn ?? '');
  const [nameAr, setNameAr] = useState(product?.nameAr ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? true);
  const [lowLevel, setLowLevel] = useState(
    product?.lowStockLevel == null ? '' : String(product.lowStockLevel),
  );
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ShopErrorKey | null>(null);
  const name = normalizeName(nameCkb);
  const priceValue = parseWholeNumber(price);
  const code = normalizeBarcode(barcode);
  const lowValue = lowLevel.trim() === '' ? null : parseWholeNumber(lowLevel);
  const nameProblem = !isCleanText(name, 80);
  const priceProblem = priceValue === null;
  const barcodeProblem = code !== '' && !isValidBarcode(code);
  const lowProblem = lowLevel.trim() !== '' && (lowValue === null || lowValue > 100000);
  // Inactive categories stay offered only to the product already in one.
  const offered = categories.filter((each) => each.isActive || each.id === product?.categoryId);

  const confirm = () => {
    setSent(true);
    if (nameProblem || priceProblem || barcodeProblem || lowProblem) return;
    setError(null);
    save.mutate(
      {
        id: product?.id ?? null,
        product: {
          nameCkb: name,
          nameEn: normalizeName(nameEn) || null,
          nameAr: normalizeName(nameAr) || null,
          categoryId: categoryId === '' ? null : categoryId,
          price: priceValue,
          barcode: code === '' ? null : code,
          trackStock,
          lowStockLevel: trackStock ? lowValue : null,
          isActive,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('product.saved'));
          onClose();
        },
        onError: (thrown) => {
          setError(shopErrorKey(thrown, 'save_product'));
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
      title={t('product.title')}
      footer={<DialogFooter pending={save.isPending} onSave={confirm} onClose={onClose} />}
    >
      <FieldGroup data-testid="product-form">
        <TextField
          id={`${id}-name`}
          label={t('product.nameCkb')}
          value={nameCkb}
          onChange={setNameCkb}
          problem={sent && nameProblem ? t('product.nameProblem') : null}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={`${id}-en`}
            label={t('product.nameEn')}
            value={nameEn}
            onChange={setNameEn}
            dir="ltr"
          />
          <TextField
            id={`${id}-ar`}
            label={t('product.nameAr')}
            value={nameAr}
            onChange={setNameAr}
            dir="rtl"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-category`}>{t('product.category')}</FieldLabel>
            <NativeSelect
              id={`${id}-category`}
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
              }}
            >
              <NativeSelectOption value="">{t('products.noCategory')}</NativeSelectOption>
              {offered.map((each) => (
                <NativeSelectOption key={each.id} value={each.id}>
                  {localizedName(each, language)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <TextField
            id={`${id}-price`}
            label={t('product.price')}
            value={price}
            onChange={setPrice}
            problem={sent && priceProblem ? t('product.numberProblem') : null}
            dir="ltr"
            numeric
          />
        </div>
        <TextField
          id={`${id}-barcode`}
          label={t('product.barcode')}
          value={barcode}
          onChange={setBarcode}
          hint={t('product.barcodeHint')}
          problem={sent && barcodeProblem ? t('product.barcodeProblem') : null}
          dir="ltr"
        />
        <ActiveBox
          id={`${id}-track`}
          checked={trackStock}
          onChange={setTrackStock}
          label={t('product.trackStock')}
        />
        <p className="-mt-3 text-sm text-muted-foreground">{t('product.trackStockHint')}</p>
        {trackStock && (
          <TextField
            id={`${id}-low`}
            label={t('product.lowLevel')}
            value={lowLevel}
            onChange={setLowLevel}
            problem={sent && lowProblem ? t('product.numberProblem') : null}
            dir="ltr"
            numeric
          />
        )}
        <ActiveBox
          id={`${id}-active`}
          checked={isActive}
          onChange={setIsActive}
          label={t('product.active')}
        />
        <ShopError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
