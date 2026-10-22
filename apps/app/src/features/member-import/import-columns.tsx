import {
  cellText,
  IMPORT_FIELDS,
  KEPT_FIELDS,
  type ImportField,
  type ImportSheet,
} from '@gym/core';
import { Alert, AlertDescription, AlertTitle } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { ArchiveIcon, HeartPulseIcon, TriangleAlertIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

/** Fields every member needs; a phone may come from the emergency contact's column instead. */
const REQUIRED: readonly ImportField[] = ['fullName', 'gender', 'phone'];

/** What each column of the file becomes; a field goes to one column only. */
export function ImportColumns({
  sheet,
  columns,
  canGiveCards,
  onChange,
}: {
  readonly sheet: ImportSheet;
  readonly columns: readonly (ImportField | null)[];
  readonly canGiveCards: boolean;
  readonly onChange: (columns: (ImportField | null)[]) => void;
}) {
  const { t } = useTranslation('memberImport');
  const id = useId();
  const assign = (index: number, field: ImportField | null) => {
    onChange(
      columns.map((each, at) =>
        at === index ? field : field !== null && each === field ? null : each,
      ),
    );
  };
  const missing = REQUIRED.filter(
    (field) =>
      !columns.includes(field) && !(field === 'phone' && columns.includes('emergencyPhone')),
  );
  const kept = KEPT_FIELDS.filter((field) => columns.includes(field));
  const notesColumn = columns.indexOf('notes');
  const example = (index: number) =>
    sheet.rows.map((row) => cellText(row.cells[index])).find((text) => text !== '') ?? '';

  return (
    <Card data-testid="import-columns">
      <CardHeader>
        <CardTitle>{t('columns.title')}</CardTitle>
        <CardDescription>{t('columns.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notesColumn >= 0 && (
          <Alert variant="warning" data-testid="notes-warning">
            <HeartPulseIcon />
            <AlertTitle>{t('columns.notesWarning.title')}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{t('columns.notesWarning.text')}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  assign(notesColumn, 'medicalNotes');
                }}
              >
                <HeartPulseIcon data-icon="inline-start" />
                {t('columns.notesWarning.action')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {missing.length > 0 && (
          <Alert variant="destructive" role="alert">
            <TriangleAlertIcon />
            <AlertDescription>
              {t('columns.missing', {
                fields: missing
                  .map((field) => t(`columns.fields.${field}`))
                  .join(t('columns.separator')),
              })}
            </AlertDescription>
          </Alert>
        )}
        <ul className="flex flex-col divide-y rounded-2xl border">
          {sheet.headers.map((header, index) => (
            <li
              key={index}
              className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,14rem)] sm:items-center"
            >
              <label htmlFor={`${id}-${String(index)}`} className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{cellText(header) || '—'}</span>
                <span className="text-xs text-muted-foreground sm:hidden">
                  {t('columns.header')}
                </span>
              </label>
              <span className="truncate text-sm text-muted-foreground" title={example(index)}>
                {/* Isolated, so 0750 123 4567 keeps its order in a Kurdish line. */}
                <bdi>{example(index)}</bdi>
              </span>
              <NativeSelect
                id={`${id}-${String(index)}`}
                value={columns[index] ?? ''}
                onChange={(event) => {
                  const field = IMPORT_FIELDS.find((each) => each === event.target.value) ?? null;
                  assign(index, field);
                }}
              >
                <NativeSelectOption value="">{t('columns.skip')}</NativeSelectOption>
                {IMPORT_FIELDS.map((field) => (
                  <NativeSelectOption key={field} value={field}>
                    {t(`columns.fields.${field}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </li>
          ))}
        </ul>
        {(kept.length > 0 || (!canGiveCards && columns.includes('card'))) && (
          <Alert>
            <ArchiveIcon />
            <AlertDescription className="flex flex-col gap-1">
              {kept.length > 0 && (
                <span>
                  {t('columns.kept', {
                    fields: kept
                      .map((field) => t(`columns.fields.${field}`))
                      .join(t('columns.separator')),
                  })}
                </span>
              )}
              {!canGiveCards && columns.includes('card') && <span>{t('columns.cardsKept')}</span>}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
