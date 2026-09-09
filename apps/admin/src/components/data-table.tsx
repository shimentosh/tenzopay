'use client';

import { EmptyState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Hidden below the md breakpoint to keep narrow screens readable. */
  secondary?: boolean;
  numeric?: boolean;
}

/**
 * The console's table, built on shadcn's Table primitives.
 *
 * Scrolls horizontally inside its own container rather than letting the page
 * scroll sideways, and drops `secondary` columns on small screens so the
 * primary identifying column is always visible.
 */
export function DataTable<T>({
  title,
  description,
  action,
  columns,
  rows,
  isLoading,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  rowKey,
  onRowClick,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  columns: Column<T>[];
  rows: T[] | undefined;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <Panel>
      <PanelHeader title={title} description={description} action={action} />

      {isLoading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows?.length ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn(
                      'whitespace-nowrap',
                      column.secondary && 'hidden md:table-cell',
                      column.numeric && 'text-right',
                    )}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        'align-middle',
                        column.secondary && 'hidden md:table-cell',
                        column.numeric && 'tnum text-right',
                      )}
                    >
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}
    </Panel>
  );
}

/**
 * Status filter bar shared by the console's list pages.
 *
 * Uses a real tablist rather than a row of styled buttons, so keyboard users
 * get arrow-key navigation and screen readers announce the selected filter.
 */
export function StatusFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter by status"
      className="flex flex-wrap gap-1 rounded-card border bg-card p-1"
    >
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option || 'all'}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option)}
            className={cn(
              'rounded-md px-3 py-1.5 text-caption font-semibold transition-colors',
              selected
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option ? option.replace(/_/g, ' ') : 'All'}
          </button>
        );
      })}
    </div>
  );
}
