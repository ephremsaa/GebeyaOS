import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  isNumeric?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  isLoading,
  emptyState,
  className = '',
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className={`w-full overflow-hidden rounded-xl border border-border-subtle bg-surface p-4 ${className}`}>
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return (
      <div className={`w-full overflow-hidden rounded-xl border border-border-subtle bg-surface p-8 ${className}`}>
        {emptyState}
      </div>
    );
  }

  return (
    <div className={`w-full overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-soft ${className}`}>
      <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
        <table className="w-full border-collapse text-[14px]">
          <thead className="sticky top-0 z-10 bg-surface-2 border-b border-border-subtle">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted ${
                    col.align === 'right' || col.isNumeric
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {data.map((item) => {
              const key = keyExtractor(item);
              const isClickable = !!onRowClick;

              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(item)}
                  className={`transition-colors duration-fast ${
                    isClickable ? 'cursor-pointer hover:bg-surface-2 active:bg-surface-2/80' : 'hover:bg-surface-2/50'
                  }`}
                >
                  {columns.map((col) => {
                    const value = (item as any)[col.key];
                    const content = col.render ? col.render(item) : value;

                    return (
                      <td
                        key={`${key}-${col.key}`}
                        className={`px-4 py-3.5 text-text-main ${
                          col.isNumeric ? 'tabular-nums font-mono' : ''
                        } ${
                          col.align === 'right' || col.isNumeric
                            ? 'text-right'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                        }`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
