import type { ReactNode } from 'react';
import { useSideBySide } from '../hooks/use-side-by-side';

/**
 * A list and the item open from it (CLAUDE.md → Design). With nothing open, the list alone, as wide
 * as the page (a grid of cards, step D-4f). With an item open: side by side when there is room,
 * otherwise the open item alone with its own way back.
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
  const sideBySide = useSideBySide();
  if (!detailOpen) return <>{list}</>;
  if (!sideBySide) return <>{detail}</>;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <div className="min-w-0">{list}</div>
      <div className="min-w-0">{detail}</div>
    </div>
  );
}
