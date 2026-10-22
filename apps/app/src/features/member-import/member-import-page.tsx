import {
  applyImportMatches,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  importBranchValues,
  importIssueLevel,
  importPayloadRow,
  importRowStatus,
  importRowTickedFirst,
  matchImportBranch,
  matchImportColumns,
  normalizeName,
  prepareImport,
  type ImportBranch,
  type ImportField,
  type ImportPayloadRow,
  type ImportRow,
} from '@gym/core';
import { localizedName } from '@gym/i18n';
import { PageHeader } from '@gym/ui/blocks/page-header';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { StickyActionBar } from '@gym/ui/blocks/sticky-action-bar';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { Link } from '@tanstack/react-router';
import {
  ArchiveIcon,
  CircleCheckIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  TriangleAlertIcon,
  UploadIcon,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RequirePermission } from '@/components/no-access';
import { useAuthState } from '@/features/auth/auth-context';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminBranches } from '@/features/staff/admin-data';
import { BackToList } from '@/features/staff/admin-error';
import { WriteStateNotice } from '@/features/staff/write-state-notice';
import { useAdminWriteState } from '@/features/staff/write-state';
import { usePreferences } from '@/lib/preferences';
import { useUnsavedChanges } from '@/lib/unsaved-changes';
import { useBaghdadToday } from '@/lib/use-today';
import { ImportBranches } from './import-branches';
import { ImportColumns } from './import-columns';
import { ImportHistory } from './import-history';
import { ImportPreview } from './import-preview';
import { importIssueText, importServerText, notImportedCsv } from './import-texts';
import { UndoImportButton } from './import-undo';
import {
  importFailureOf,
  useImportCheck,
  useImportMembers,
  type ImportFailure,
  type SavedImport,
} from './member-import-data';
import {
  ImportFileError,
  readImportFile,
  type ImportFile,
  type ImportFileProblem,
} from './read-import-file';

/** The server keeps the file's name with the import record, up to this many letters. */
const FILE_NAME_LIMIT = 200;

/**
 * Importing members from an Excel or CSV file (step 2j, members.import and members.create): the
 * file is read here, every row is shown with what it becomes, and the ticked rows are saved all
 * together or not at all.
 */
export function MemberImportPage() {
  return (
    <RequirePermission permission="members.import">
      <RequirePermission permission="members.create">
        <MemberImport />
      </RequirePermission>
    </RequirePermission>
  );
}

/** A file being imported, with the ids its members and cards get (kept, so a retry saves them once). */
interface Loaded {
  readonly file: ImportFile;
  readonly importId: string;
  readonly ids: ReadonlyMap<number, { readonly member: string; readonly card: string }>;
}

interface Done extends SavedImport {
  /** The rows left out, with the reason, for the CSV staff can download. */
  readonly skipped: ReadonlyMap<number, string>;
}

function MemberImport() {
  const { t } = useTranslation('memberImport');
  const { t: tMembers } = useTranslation('members');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [columns, setColumns] = useState<(ImportField | null)[]>([]);
  const [branchChoices, setBranchChoices] = useState<ReadonlyMap<string, string>>(new Map());
  // Rows staff ticked or unticked themselves; the others follow importRowTickedFirst.
  const [ticks, setTicks] = useState<ReadonlyMap<number, boolean>>(new Map());
  const [refused, setRefused] = useState<ReadonlyMap<number, readonly string[]>>(new Map());
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  useUnsavedChanges(loaded !== null && done === null);

  const start = (file: ImportFile) => {
    const ids = new Map(
      file.sheet.rows.map((each) => [
        each.row,
        { member: crypto.randomUUID(), card: crypto.randomUUID() },
      ]),
    );
    setLoaded({ file, importId: crypto.randomUUID(), ids });
    setColumns(matchImportColumns(file.sheet.headers));
    setBranchChoices(new Map());
    setTicks(new Map());
    setRefused(new Map());
    setFailure(null);
    setDone(null);
  };
  const reset = () => {
    setLoaded(null);
    setDone(null);
    setFailure(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <BackToList to="/members" label={tMembers('list.back')} always />
      <PageHeader title={t('title')} description={t('description')} />
      <WriteStateNotice area="members" />
      {done ? (
        loaded && <ImportDone done={done} loaded={loaded} onAnother={reset} />
      ) : (
        <>
          <ImportFileCard loaded={loaded} onLoad={start} />
          {!loaded && <ImportHistory />}
          {loaded && (
            <ImportSteps
              loaded={loaded}
              columns={columns}
              onColumns={setColumns}
              branchChoices={branchChoices}
              onBranch={(value, branchId) => {
                setBranchChoices((previous) => new Map(previous).set(value, branchId));
              }}
              ticks={ticks}
              onTicks={setTicks}
              refused={refused}
              onRefused={setRefused}
              failure={failure}
              onFailure={setFailure}
              confirmOpen={confirmOpen}
              onConfirmOpen={setConfirmOpen}
              onDone={setDone}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Choosing the file, and what was read from it. */
function ImportFileCard({
  loaded,
  onLoad,
}: {
  readonly loaded: Loaded | null;
  readonly onLoad: (file: ImportFile) => void;
}) {
  const { t } = useTranslation('memberImport');
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<ImportFileProblem | null>(null);

  const choose = async (file: File) => {
    setReading(true);
    setProblem(null);
    try {
      onLoad(await readImportFile(file));
    } catch (error) {
      setProblem(error instanceof ImportFileError ? error.problem : 'unreadable');
    } finally {
      setReading(false);
    }
  };
  const limits = { rows: IMPORT_MAX_ROWS, size: IMPORT_MAX_BYTES / 1024 / 1024 };

  return (
    <Card data-testid="import-file">
      <CardHeader>
        <CardTitle>{t('file.title')}</CardTitle>
        <CardDescription>{t('file.hint', limits)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <input
          ref={input}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="import-file-input"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void choose(file);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          {loaded && (
            <span className="flex min-w-0 items-center gap-2">
              <FileSpreadsheetIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground"
              />
              <span className="truncate font-medium" dir="auto">
                {loaded.file.name}
              </span>
              <span className="text-sm text-muted-foreground">
                {t('file.loaded', { count: loaded.file.sheet.rows.length })}
              </span>
            </span>
          )}
          <Button
            variant={loaded ? 'outline' : 'default'}
            disabled={reading}
            onClick={() => input.current?.click()}
          >
            {reading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <UploadIcon data-icon="inline-start" />
            )}
            {reading ? t('file.reading') : loaded ? t('file.another') : t('file.choose')}
          </Button>
        </div>
        {problem && (
          <Alert variant="destructive" role="alert" data-testid="import-file-problem">
            <TriangleAlertIcon />
            <AlertDescription>{t(`file.problems.${problem}`, limits)}</AlertDescription>
          </Alert>
        )}
        {loaded?.file.guessedEncoding && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>{t('file.encoding')}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/** The columns, the branches and the preview of a loaded file, then the import. */
function ImportSteps({
  loaded,
  columns,
  onColumns,
  branchChoices,
  onBranch,
  ticks,
  onTicks,
  refused,
  onRefused,
  failure,
  onFailure,
  confirmOpen,
  onConfirmOpen,
  onDone,
}: {
  readonly loaded: Loaded;
  readonly columns: readonly (ImportField | null)[];
  readonly onColumns: (columns: (ImportField | null)[]) => void;
  readonly branchChoices: ReadonlyMap<string, string>;
  readonly onBranch: (value: string, branchId: string) => void;
  readonly ticks: ReadonlyMap<number, boolean>;
  readonly onTicks: (ticks: ReadonlyMap<number, boolean>) => void;
  readonly refused: ReadonlyMap<number, readonly string[]>;
  readonly onRefused: (refused: ReadonlyMap<number, readonly string[]>) => void;
  readonly failure: ImportFailure | null;
  readonly onFailure: (failure: ImportFailure | null) => void;
  readonly confirmOpen: boolean;
  readonly onConfirmOpen: (open: boolean) => void;
  readonly onDone: (done: Done) => void;
}) {
  const { t } = useTranslation('memberImport');
  const today = useBaghdadToday();
  const canGiveCards = usePermission('cards.manage');
  const { online, readOnly } = useAdminWriteState();
  const { branchId: deviceBranchId } = useAuthState();
  const { language } = usePreferences();
  const branches = useAdminBranches();
  const importMembers = useImportMembers();
  const { sheet } = loaded.file;

  // Members join active branches only (the server refuses the others).
  const active = useMemo(
    () => (branches.data ?? []).filter((branch) => branch.isActive),
    [branches.data],
  );
  const branchFor = useMemo(() => {
    const known: ImportBranch[] = active.map((branch) => ({
      id: branch.id,
      code: branch.code,
      names: [branch.nameCkb, branch.nameEn, branch.nameAr],
    }));
    // An empty cell, or no branch column: this device's branch, or the gym's only one.
    const usual =
      active.find((branch) => branch.id === deviceBranchId)?.id ??
      (active.length === 1 ? (active[0]?.id ?? null) : null);
    return (value: string): string | null =>
      branchChoices.get(value) ?? (value === '' ? usual : matchImportBranch(value, known));
  }, [active, branchChoices, deviceBranchId]);

  const prepared = useMemo(
    () => prepareImport(sheet, columns, { today, canGiveCards, branchFor }),
    [sheet, columns, today, canGiveCards, branchFor],
  );
  const check = useImportCheck(prepared, branches.isSuccess);
  const rows = useMemo(
    () => (check.data ? applyImportMatches(prepared, check.data) : prepared),
    [prepared, check.data],
  );

  const isTicked = (row: ImportRow) => {
    const status = importRowStatus(row);
    if (status !== 'valid' && status !== 'warning') return false;
    return ticks.get(row.row) ?? importRowTickedFirst(row);
  };
  const selected = new Set(rows.filter(isTicked).map((row) => row.row));
  const payload = rows
    .filter((row) => selected.has(row.row))
    .map((row) => {
      const ids = loaded.ids.get(row.row);
      return ids ? importPayloadRow(row, ids) : null;
    })
    .filter((row): row is ImportPayloadRow => row !== null);
  const cardCount = payload.filter((row) => row.card_uid !== null).length;

  const branchValues = importBranchValues(sheet, columns);
  const branchCounts = new Map<string, number>();
  for (const row of prepared) {
    branchCounts.set(row.draft.branchValue, (branchCounts.get(row.draft.branchValue) ?? 0) + 1);
  }

  const save = () => {
    onFailure(null);
    onRefused(new Map());
    const fileName = normalizeName(loaded.file.name).slice(0, FILE_NAME_LIMIT).trim();
    importMembers.mutate(
      { importId: loaded.importId, fileName, rows: payload },
      {
        onSuccess: (saved) => {
          onConfirmOpen(false);
          const imported = new Set(payload.map((row) => row.row));
          const skipped = new Map<number, string>();
          for (const row of rows) {
            if (imported.has(row.row)) continue;
            const status = importRowStatus(row);
            const reasons =
              status === 'error' || status === 'exists'
                ? row.issues
                    .filter((issue) => importIssueLevel(issue.key) !== 'warning')
                    .map((issue) => importIssueText(t, issue))
                : [
                    t('done.notTicked'),
                    // Why it started unticked, if it did.
                    ...row.issues
                      .filter((issue) => issue.key === 'same_person')
                      .map((issue) => importIssueText(t, issue)),
                  ];
            skipped.set(row.row, reasons.join(' '));
          }
          onDone({ ...saved, skipped });
        },
        onError: (error) => {
          onConfirmOpen(false);
          const failed = importFailureOf(error);
          onFailure(failed);
          if (failed.kind !== 'refused') return;
          // The refused rows show why, and are unticked so the rest can be imported again.
          const byRow = new Map<number, string[]>();
          for (const each of failed.rows) {
            if (each.row !== null) byRow.set(each.row, [...(byRow.get(each.row) ?? []), each.key]);
          }
          onRefused(byRow);
          const next = new Map(ticks);
          for (const row of byRow.keys()) next.set(row, false);
          onTicks(next);
        },
      },
    );
  };

  const blocked = !online || readOnly;
  const canImport = !blocked && check.isSuccess && payload.length > 0 && !importMembers.isPending;

  return (
    <>
      <ImportColumns
        sheet={sheet}
        columns={columns}
        canGiveCards={canGiveCards}
        onChange={onColumns}
      />
      {branches.isPending ? (
        <Skeleton className="h-40 rounded-3xl" />
      ) : (
        <ImportBranches
          values={branchValues}
          counts={branchCounts}
          hasBranchColumn={columns.includes('branch')}
          branches={active}
          branchFor={branchFor}
          onChoose={onBranch}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('preview.title')}</CardTitle>
          <CardDescription>{t('preview.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {check.isError ? (
            <Alert variant="destructive" role="alert">
              <TriangleAlertIcon />
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>{t('preview.checkFailed')}</span>
                <Button variant="outline" size="sm" onClick={() => void check.refetch()}>
                  {t('preview.retry')}
                </Button>
              </AlertDescription>
            </Alert>
          ) : !check.isSuccess ? (
            <div className="flex flex-col gap-3" data-testid="import-checking">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                {t('preview.checking')}
              </p>
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
          ) : (
            <ImportPreview
              rows={rows}
              refused={refused}
              selected={selected}
              branchName={(id) => {
                const branch = active.find((each) => each.id === id);
                return branch ? localizedName(branch, language) : '';
              }}
              onToggle={(row, ticked) => {
                onTicks(new Map(ticks).set(row, ticked));
              }}
              onSelectAll={() => {
                const next = new Map(ticks);
                for (const row of rows) {
                  const status = importRowStatus(row);
                  if (status === 'valid' || status === 'warning') next.set(row.row, true);
                }
                onTicks(next);
              }}
              onSelectNone={() => {
                onTicks(new Map(rows.map((row) => [row.row, false])));
              }}
            />
          )}
        </CardContent>
      </Card>

      {failure && <ImportFailureAlert failure={failure} />}

      <StickyActionBar>
        <Button
          size="lg"
          disabled={!canImport}
          data-testid="import-start"
          onClick={() => {
            onConfirmOpen(true);
          }}
        >
          <UploadIcon data-icon="inline-start" />
          {t('import.action', { count: payload.length })}
        </Button>
      </StickyActionBar>

      <ResponsiveDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!importMembers.isPending) onConfirmOpen(open);
        }}
        title={t('import.confirmTitle', { count: payload.length })}
        description={t('import.confirmText')}
        footer={
          <>
            <Button
              variant="outline"
              disabled={importMembers.isPending}
              onClick={() => {
                onConfirmOpen(false);
              }}
            >
              {t('import.cancel')}
            </Button>
            <Button disabled={!canImport} data-testid="import-confirm" onClick={save}>
              {importMembers.isPending && <Spinner data-icon="inline-start" />}
              {t('import.confirm')}
            </Button>
          </>
        }
      >
        {cardCount > 0 && <p className="text-sm">{t('import.cards', { count: cardCount })}</p>}
      </ResponsiveDialog>
    </>
  );
}

function ImportFailureAlert({ failure }: { readonly failure: ImportFailure }) {
  const { t } = useTranslation('memberImport');
  const text =
    failure.kind === 'refused'
      ? failure.rows.some((each) => each.row !== null)
        ? t('import.refused', { count: new Set(failure.rows.map((each) => each.row)).size })
        : failure.rows.map((each) => importServerText(t, each.key)).join(' ')
      : failure.kind === 'too_slow'
        ? t('import.tooSlow')
        : failure.kind === 'network'
          ? t('import.network')
          : failure.kind === 'read_only'
            ? t('import.readOnly')
            : t('import.failed');
  return (
    <Alert variant="destructive" role="alert" data-testid="import-failure">
      <TriangleAlertIcon />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

/** What was imported, and the rows left out as a file staff can fix and import again. */
function ImportDone({
  done,
  loaded,
  onAnother,
}: {
  readonly done: Done;
  readonly loaded: Loaded;
  readonly onAnother: () => void;
}) {
  const { t } = useTranslation('memberImport');
  const canUndo = usePermission('members.delete');
  const [undone, setUndone] = useState(false);
  const download = async () => {
    const blob = await notImportedCsv(loaded.file.sheet, done.skipped, t('done.reasonColumn'));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${t('done.fileName', { name: loaded.file.name.replace(/\.[^.]+$/, '') })}.csv`;
    link.click();
    // Some browsers start the download only after the click returns.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
  };

  return (
    <Card data-testid="import-done">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleCheckIcon aria-hidden="true" className="size-6 text-success" />
          {t('done.title', { count: done.memberCount })}
        </CardTitle>
        <CardDescription className="flex flex-col gap-1">
          {done.cardCount > 0 && <span>{t('done.cards', { count: done.cardCount })}</span>}
          {done.skipped.size > 0 && <span>{t('done.skipped', { count: done.skipped.size })}</span>}
        </CardDescription>
      </CardHeader>
      {undone && (
        <CardContent>
          <Alert data-testid="import-done-undone">
            <ArchiveIcon />
            <AlertDescription>{t('done.undone')}</AlertDescription>
          </Alert>
        </CardContent>
      )}
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/members">{t('done.members')}</Link>
        </Button>
        {done.skipped.size > 0 && (
          <Button variant="outline" onClick={() => void download()}>
            <DownloadIcon data-icon="inline-start" />
            {t('done.download')}
          </Button>
        )}
        <Button variant="outline" onClick={onAnother}>
          {t('done.another')}
        </Button>
        {canUndo && !undone && (
          <UndoImportButton
            importId={loaded.importId}
            fileName={loaded.file.name}
            onDone={() => {
              setUndone(true);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
