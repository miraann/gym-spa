import { AddTile } from '@gym/ui/blocks/add-tile';
import { GroupedListSkeleton } from '@gym/ui/blocks/list-group';
import { Badge } from '@gym/ui/components/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@gym/ui/components/empty';
import { CircleOffIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SpaError } from './spa-error';
import type { SpaErrorKey } from './spa-errors';

/**
 * One setup list (services, rooms, staff, packages): its add button, then a skeleton, the error,
 * the empty state or the list.
 */
export function SetupSection({
  addLabel,
  onAdd,
  canAdd,
  pending,
  error,
  empty,
  emptyIcon,
  isEmpty,
  toolbar,
  children,
}: {
  readonly addLabel: string;
  readonly onAdd: () => void;
  readonly canAdd: boolean;
  readonly pending: boolean;
  readonly error: SpaErrorKey | null;
  readonly empty: string;
  readonly emptyIcon: ReactNode;
  readonly isEmpty: boolean;
  /** Before the add button (the branch). */
  readonly toolbar?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      {toolbar}
      {canAdd && <AddTile label={addLabel} onClick={onAdd} />}
      {pending ? (
        <GroupedListSkeleton rows={3} />
      ) : error ? (
        <SpaError error={error} />
      ) : isEmpty ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">{emptyIcon}</EmptyMedia>
            <EmptyDescription>{empty}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        children
      )}
    </section>
  );
}

/** The "inactive" mark on a row. */
export function InactiveBadge() {
  const { t } = useTranslation('spa');
  return (
    <Badge variant="secondary">
      <CircleOffIcon aria-hidden="true" />
      {t('setup.inactive')}
    </Badge>
  );
}
