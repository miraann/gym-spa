import {
  BRAND_PRESETS,
  CORNER_STYLES,
  brandShades,
  checkBrandContrast,
  isBrandPreset,
  looksLikeStatusColor,
  oklchToHex,
  parseBrandColor,
  type BrandColor,
  type ContrastIssue,
} from '@gym/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, TriangleAlertIcon, WifiOffIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChoiceGroup } from '@/components/choice-group';
import { Chip, ChipRow } from '@/components/chip-row';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { StickyActionBar } from '@/components/sticky-action-bar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthController } from '@/features/auth/auth-context';
import {
  DEFAULT_GYM_LOOK,
  previewGymLook,
  restoreGymLook,
  setGymLook,
  useGymLook,
  type GymLook,
} from '@/lib/appearance';
import { useConnection } from '@/lib/connection';
import { saveErrorKey, type SaveErrorKey } from '@/lib/save-error';
import { cn } from '@/lib/utils';
import { LogoField } from './logo-field';
import { saveGymLook } from './save-appearance';
import { GYM_LOOK_QUERY } from './use-gym-appearance';

/** The example in the custom color hint: the default brand color as a code. */
const EXAMPLE_HEX = oklchToHex(brandShades('indigo').light);

function swatch(color: BrandColor): string {
  const { l, c, h } = brandShades(color).light;
  return `oklch(${String(l)} ${String(c)} ${String(h)})`;
}

/** The gym's look (needs settings.edit and all branches): brand color, corners and logo. */
export function GymLookCard() {
  const { t } = useTranslation(['settings', 'common']);
  const controller = useAuthController();
  const queryClient = useQueryClient();
  const saved = useGymLook();
  const online = useConnection().state === 'connected';
  const [draft, setDraft] = useState<GymLook>(saved);
  const [customOpen, setCustomOpen] = useState(!isBrandPreset(saved.brandColor));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<SaveErrorKey | null>(null);

  // Live preview of the draft on this screen only; leaving without saving goes back.
  useEffect(() => {
    previewGymLook(draft);
  }, [draft]);
  useEffect(() => restoreGymLook, []);

  const dirty = draft.brandColor !== saved.brandColor || draft.cornerStyle !== saved.cornerStyle;
  const issues = checkBrandContrast(draft.brandColor);
  const statusLike = looksLikeStatusColor(draft.brandColor);

  const save = useMutation({
    mutationFn: async (look: GymLook) => {
      const client = controller.activeClient;
      if (!client) throw new TypeError('Failed to fetch');
      await saveGymLook(client, look);
      return look;
    },
    onMutate: () => {
      setError(null);
    },
    onSuccess: (look) => {
      setGymLook(look);
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: [GYM_LOOK_QUERY] });
      toast.success(t('appearance.saved'));
    },
    onError: (failure) => {
      setConfirmOpen(false);
      setError(saveErrorKey(failure, 'appearance'));
    },
  });

  const requestSave = () => {
    // Warnings are not errors: the gym may still keep its color after reading them.
    if (issues.length > 0 || statusLike) setConfirmOpen(true);
    else save.mutate(draft);
  };

  const choose = (brandColor: BrandColor) => {
    setDraft((current) => ({ ...current, brandColor }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('appearance.gym.title')}</h2>
        </CardTitle>
        <CardDescription>{t('appearance.gym.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section className="flex flex-col gap-3" aria-labelledby="brand-color">
          <div>
            <h3 id="brand-color">{t('appearance.brand.label')}</h3>
            <p className="text-sm text-muted-foreground">{t('appearance.brand.hint')}</p>
          </div>
          <ChipRow label={t('appearance.brand.label')}>
            {BRAND_PRESETS.map((preset) => {
              const selected = !customOpen && draft.brandColor === preset;
              return (
                <Chip
                  key={preset}
                  type="button"
                  selected={selected}
                  aria-pressed={selected}
                  onClick={() => {
                    setCustomOpen(false);
                    choose(preset);
                  }}
                >
                  <span
                    aria-hidden
                    className="size-4 rounded-full ring-2 ring-background"
                    style={{ backgroundColor: swatch(preset) }}
                  />
                  {t(`appearance.brand.presets.${preset}`)}
                </Chip>
              );
            })}
            <Chip
              type="button"
              selected={customOpen}
              aria-pressed={customOpen}
              onClick={() => {
                setCustomOpen(true);
                // Start from the current color, as a hex the gym can then adjust.
                if (isBrandPreset(draft.brandColor)) {
                  choose(oklchToHex(brandShades(draft.brandColor).light) as BrandColor);
                }
              }}
            >
              <span
                aria-hidden
                className="size-4 rounded-full ring-2 ring-background"
                style={{
                  background: customOpen
                    ? swatch(draft.brandColor)
                    : 'conic-gradient(from 0deg, oklch(0.6 0.2 30), oklch(0.6 0.2 150), oklch(0.6 0.2 270), oklch(0.6 0.2 30))',
                }}
              />
              {t('appearance.brand.custom')}
            </Chip>
          </ChipRow>

          {customOpen && <CustomColor value={draft.brandColor} onChange={choose} />}
          <ColorWarnings issues={issues} statusLike={statusLike} />
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="corner-style">
          <div>
            <h3 id="corner-style">{t('appearance.corner.label')}</h3>
            <p className="text-sm text-muted-foreground">{t('appearance.corner.hint')}</p>
          </div>
          <ChoiceGroup
            label={t('appearance.corner.label')}
            value={draft.cornerStyle}
            choices={CORNER_STYLES.map((style) => ({
              value: style,
              label: t(`appearance.corner.${style}`),
            }))}
            onChange={(cornerStyle) => {
              setDraft((current) => ({ ...current, cornerStyle }));
            }}
          />
        </section>

        <div className="flex flex-col gap-3">
          {!online && (
            <Alert variant="warning">
              <WifiOffIcon />
              <AlertDescription>{t('appearance.needsConnection')}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" role="alert">
              <TriangleAlertIcon />
              <AlertDescription>{t(`common:saveErrors.${error}`)}</AlertDescription>
            </Alert>
          )}
          <Button
            variant="ghost"
            className="self-start"
            disabled={
              draft.brandColor === DEFAULT_GYM_LOOK.brandColor &&
              draft.cornerStyle === DEFAULT_GYM_LOOK.cornerStyle
            }
            onClick={() => {
              setCustomOpen(false);
              setDraft(DEFAULT_GYM_LOOK);
            }}
          >
            {t('appearance.reset')}
          </Button>
        </div>

        <StickyActionBar>
          <Button
            variant="outline"
            size="lg"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setCustomOpen(!isBrandPreset(saved.brandColor));
              setDraft(saved);
            }}
          >
            {t('appearance.discard')}
          </Button>
          <Button size="lg" disabled={!dirty || !online || save.isPending} onClick={requestSave}>
            <CheckIcon aria-hidden />
            {t('appearance.save')}
          </Button>
        </StickyActionBar>

        <hr className="border-border" />
        <LogoField />
      </CardContent>

      <ResponsiveDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('appearance.confirm.title')}
        description={t('appearance.confirm.description')}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
              }}
            >
              {t('appearance.confirm.back')}
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() => {
                save.mutate(draft);
              }}
            >
              {t('appearance.confirm.saveAnyway')}
            </Button>
          </>
        }
      >
        <ColorWarnings issues={issues} statusLike={statusLike} />
      </ResponsiveDialog>
    </Card>
  );
}

/** A custom color: the system color picker, or a typed #rrggbb. */
function CustomColor({
  value,
  onChange,
}: {
  readonly value: BrandColor;
  readonly onChange: (color: BrandColor) => void;
}) {
  const { t } = useTranslation('settings');
  const id = useId();
  const hex = isBrandPreset(value) ? '' : value;
  const [typed, setTyped] = useState(hex);
  const [shown, setShown] = useState(hex);
  // Follow the picker (and the reset) when they change the color.
  if (hex !== shown) {
    setShown(hex);
    setTyped(hex);
  }
  const typedColor = parseBrandColor(typed.trim().toLowerCase());

  return (
    <div className="flex flex-wrap items-end gap-3">
      <input
        type="color"
        aria-label={t('appearance.brand.picker')}
        value={hex || oklchToHex(brandShades(value).light)}
        onChange={(event) => {
          const color = parseBrandColor(event.target.value.toLowerCase());
          if (color) onChange(color);
        }}
        className="size-11 shrink-0 cursor-pointer rounded-xl border bg-card p-1"
      />
      <div className="flex min-w-40 flex-1 flex-col gap-1.5">
        <Label htmlFor={id}>{t('appearance.brand.customLabel')}</Label>
        <Input
          id={id}
          dir="ltr"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          aria-invalid={typed !== '' && !typedColor}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            setTyped(event.target.value);
            const color = parseBrandColor(event.target.value.trim().toLowerCase());
            if (color && !isBrandPreset(color)) onChange(color);
          }}
          className="text-start font-mono"
        />
        <p
          id={`${id}-hint`}
          className={cn(
            'text-xs',
            typed !== '' && !typedColor ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {t('appearance.brand.customHint')}{' '}
          {/* A color code reads left to right, also inside Kurdish and Arabic text. */}
          <bdi dir="ltr" className="font-mono">
            {EXAMPLE_HEX}
          </bdi>
        </p>
      </div>
    </div>
  );
}

/** What would be hard to read with this color, and whether it looks like a status color. */
function ColorWarnings({
  issues,
  statusLike,
}: {
  readonly issues: readonly ContrastIssue[];
  readonly statusLike: boolean;
}) {
  const { t } = useTranslation('settings');
  if (issues.length === 0 && !statusLike) return null;
  return (
    <div className="flex flex-col gap-2">
      {issues.length > 0 && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{t('appearance.contrast.title')}</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {issues.map((issue) => (
                <li key={`${issue.mode}-${issue.problem}`}>
                  {t(`appearance.contrast.${issue.problem}`, {
                    mode: t(`appearance.contrast.modes.${issue.mode}`),
                  })}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {statusLike && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>{t('appearance.statusLike')}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
