import type { ReactNode } from 'react';
import { useCollapsingTitle } from '../hooks/use-page-title';

/**
 * A page's large title (CLAUDE.md → Design), like a native app's: big and bold at the top of the
 * page; on phones the top bar takes it over in small type once it scrolls away. `actions` sit at
 * the end of the title row.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}) {
  const titleRef = useCollapsingTitle(title);

  return (
    <div
      data-slot="page-header"
      className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 ref={titleRef} className="text-title font-bold text-balance md:text-title-lg">
          {title}
        </h1>
        {description && <p className="text-base text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
