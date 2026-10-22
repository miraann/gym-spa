import { Badge } from '@gym/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Skeleton } from '@gym/ui/components/skeleton';
import { ArchiveIcon, FileSpreadsheetIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/features/auth/use-permissions';
import { useFormat } from '@/lib/format';
import { UndoImportButton } from './import-undo';
import { useImportHistory } from './member-import-data';

/**
 * The gym's earlier imports: when, who, which file and how many members and cards, and whether
 * they were taken back (with who and why). Staff with members.delete can take one back here.
 */
export function ImportHistory() {
  const { t } = useTranslation('memberImport');
  const { t: tMembers } = useTranslation('members');
  const format = useFormat();
  const canUndo = usePermission('members.delete');
  const history = useImportHistory();

  if (history.isPending) return <Skeleton className="h-32 rounded-3xl" />;
  // The history only helps; the import page works without it.
  if (history.isError || history.data.length === 0) return null;
  return (
    <Card data-testid="import-history">
      <CardHeader>
        <CardTitle>{t('history.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y rounded-2xl border">
          {history.data.map((record) => (
            <li
              key={record.id}
              className="flex flex-col gap-2 p-3"
              data-import-record={record.fileName}
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileSpreadsheetIcon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground"
                />
                <span className="truncate font-medium" dir="auto">
                  {record.fileName}
                </span>
                {record.undoneAt !== null && (
                  <Badge variant="secondary" className="ms-auto">
                    <ArchiveIcon aria-hidden="true" />
                    {tMembers('status.archived')}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {t('history.by', {
                  date: format.dateTime(record.createdAt),
                  name: record.createdByName ?? '—',
                })}
                {' · '}
                <span className="tabular-nums">
                  {t('history.members', { count: record.memberCount })}
                </span>
                {record.cardCount > 0 && (
                  <>
                    {' · '}
                    <span className="tabular-nums">
                      {t('history.cards', { count: record.cardCount })}
                    </span>
                  </>
                )}
              </p>
              {record.undoneAt !== null ? (
                <div className="flex flex-col gap-0.5 text-sm" data-testid="import-undone">
                  <span>
                    {t('history.undone', {
                      date: format.dateTime(record.undoneAt),
                      name: record.undoneByName ?? '—',
                    })}
                  </span>
                  {record.undoReason !== null && (
                    <span className="text-muted-foreground">
                      {t('history.reason', { reason: record.undoReason })}
                    </span>
                  )}
                </div>
              ) : (
                canUndo && (
                  <div>
                    <UndoImportButton importId={record.id} fileName={record.fileName} />
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
