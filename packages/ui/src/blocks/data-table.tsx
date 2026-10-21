import type { ReactTable, RowData } from '@tanstack/react-table';
import { Columns3Icon } from 'lucide-react';
import { Button } from '../components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../components/dropdown-menu';
import { cn } from '../lib/utils';
import type { DataTableFeatures } from '../lib/data-table-features';

// Dense tables for wide screens (CLAUDE.md → Design: desktop has dense tables; phones get card
// lists instead). TanStack Table builds the model, this block draws it with semantic markup and the
// theme's tokens. Paging, sorting and filtering happen on the server: the page owns that state.

export type DataTable<TData extends RowData> = ReactTable<DataTableFeatures, TData>;

export function DataTable<TData extends RowData>({
  table,
  label,
  onRowClick,
  isRowSelected,
}: {
  readonly table: DataTable<TData>;
  /** Names the table for screen readers. */
  readonly label: string;
  /** Pointer users open a row by clicking it; keyboard users use the link in its first cell. */
  readonly onRowClick?: (row: TData) => void;
  readonly isRowSelected?: (row: TData) => boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-card bg-card shadow-sm ring-1 ring-foreground/6 dark:ring-foreground/7">
      <table className="w-full text-[0.9375rem]">
        <caption className="sr-only">{label}</caption>
        <thead className="bg-muted/40 text-sm text-muted-foreground">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="h-11 px-4 text-start font-semibold whitespace-nowrap"
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const selected = isRowSelected?.(row.original) ?? false;
            return (
              <tr
                key={row.id}
                aria-selected={isRowSelected ? selected : undefined}
                onClick={
                  onRowClick
                    ? () => {
                        onRowClick(row.original);
                      }
                    : undefined
                }
                className={cn(
                  'border-t border-border transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-muted/50',
                  selected && 'bg-accent hover:bg-accent',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle pointer-coarse:py-3.5">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Lets the staff member choose which columns they see. Columns that can't be hidden stay. */
export function ColumnVisibilityMenu<TData extends RowData>({
  table,
  label,
  columnLabel,
}: {
  readonly table: DataTable<TData>;
  readonly label: string;
  readonly columnLabel: (columnId: string) => string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Columns3Icon data-icon="inline-start" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {table
          .getAllLeafColumns()
          .filter((column) => column.getCanHide())
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(checked) => {
                column.toggleVisibility(checked);
              }}
              // Keep the menu open while choosing several columns.
              onSelect={(event) => {
                event.preventDefault();
              }}
            >
              {columnLabel(column.id)}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
