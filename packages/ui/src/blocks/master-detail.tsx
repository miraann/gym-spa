import type { ReactNode } from 'react';
import { useSideBySide } from '../hooks/use-side-by-side';

/**
 * A list and the item open from it (CLAUDE.md → Design). Side by side when there is room;
 * otherwise one at a time: the list, or the open item (detailOpen) with its own way back.
 */
export function MasterDetail({
  list,
  detail,
  detailOpen,
}: {
  readonly list: ReactNode;
  readonly detail: ReactNode;
  readonly detailOpen: boolean;
}) {
  if (!useSideBySide()) return <>{detailOpen ? detail : list}</>;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <div className="min-w-0">{list}</div>
      <div className="min-w-0">{detail}</div>
    </div>
  );
}
