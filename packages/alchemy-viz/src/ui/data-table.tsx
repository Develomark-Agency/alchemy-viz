import {
  type ColumnDef,
  columnResizingFeature,
  columnSizingFeature,
  createSortedRowModel,
  rowSortingFeature,
  type RowData,
  tableFeatures,
  useTable
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef } from "react";
import { cn } from "./cn.ts";
import { EmptyState, ErrorBanner, Loading, Spinner } from "./feedback.tsx";
import { formatTime } from "./format.ts";

const features = tableFeatures({
  columnSizingFeature,
  columnResizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel()
});

export interface Column<Row> {
  id: string,
  header: ReactNode,
  /** The value to sort by and to show when there's no `cell`. Defaults to `row[id]`. */
  accessor?: (row: Row) => unknown,
  cell?: (row: Row) => ReactNode,
  /** Width in pixels. Columns can be resized by dragging their edge. */
  size?: number,
  align?: "left" | "right",
  sortable?: boolean
}

/** Shows any value in a cell: null as a muted label, objects as JSON. */
export function formatCell(value: unknown): ReactNode {
  if(value === null || value === undefined) return <span className="text-fg-subtle italic">{String(value)}</span>;
  if(value instanceof Date) return formatTime(value);
  if(typeof value === "object") return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  if(typeof value === "number") return <span className="tabular-nums">{value}</span>;
  return String(value);
}

/** Columns from the keys of the rows, for data without a fixed shape. */
export function inferColumns<Row extends Record<string, unknown>>(rows: Row[]): Array<Column<Row>> {
  const keys = new Set<string>();
  for(const r of rows.slice(0, 100)) for(const k of Object.keys(r)) keys.add(k);
  return [...keys].map(k => ({ id: k, header: k }));
}

function compare(a: unknown, b: unknown) {
  if(a === b) return 0;
  if(a === null || a === undefined) return 1;
  if(b === null || b === undefined) return -1;
  if(typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

const ROW_HEIGHT = 34;

/**
 * A sortable, resizable, virtualized table. Pass `onEndReached` and
 * `hasMore` for infinite scrolling over cursor-paginated data.
 */
export function DataTable<Row extends RowData>({
  rows,
  columns,
  getRowId,
  onRowClick,
  selectedId,
  loading,
  error,
  empty = "No rows",
  footer,
  onEndReached,
  hasMore,
  loadingMore,
  maxHeight = 560,
  className
}: {
  rows: Row[] | undefined,
  columns: Array<Column<Row>>,
  getRowId: (row: Row, index: number) => string,
  onRowClick?: (row: Row) => void,
  selectedId?: string,
  loading?: boolean,
  error?: Error | string | null,
  empty?: ReactNode,
  footer?: ReactNode,
  onEndReached?: () => void,
  hasMore?: boolean,
  loadingMore?: boolean,
  maxHeight?: number | string,
  className?: string
}) {
  const data = useMemo(() => rows ?? [], [rows]);
  const byId = useMemo(() => new Map(columns.map(c => [c.id, c])), [columns]);
  const defs = useMemo(
    () => columns.map((c): ColumnDef<typeof features, Row> => ({
      id: c.id,
      accessorFn: c.accessor ?? (row => (row as Record<string, unknown>)[c.id]),
      header: c.id,
      size: c.size ?? 180,
      minSize: 60,
      enableSorting: c.sortable ?? true,
      sortFn: (a, b, id) => compare(a.getValue(id), b.getValue(id))
    })),
    [columns]
  );
  const table = useTable({
    features,
    columns: defs,
    data,
    getRowId: (row, index) => getRowId(row, index),
    columnResizeMode: "onChange"
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: index => tableRows[index]!.id,
    overscan: 12
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;

  useEffect(() => {
    if(onEndReached && hasMore && !loadingMore && lastIndex >= tableRows.length - 8) onEndReached();
  }, [lastIndex, tableRows.length, hasMore, loadingMore, onEndReached]);

  if(error) return <div className="p-3"><ErrorBanner error={error} /></div>;
  if(!rows && loading) return <Loading />;
  if(!rows || rows.length === 0) return typeof empty === "string" ? <EmptyState title={empty} /> : <>{empty}</>;

  function onRowKey(e: KeyboardEvent, row: Row) {
    if(onRowClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onRowClick(row);
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div ref={scrollRef} className="relative overflow-auto" style={{ maxHeight }}>
        <table className="grid text-[13px]" style={{ minWidth: "100%", width: table.getTotalSize() }}>
          <thead className="sticky top-0 z-1 grid bg-surface-2 shadow-[inset_0_-1px_0_var(--av-line)]">
            {table.getHeaderGroups().map(group => (
              <tr key={group.id} className="flex w-full">
                {group.headers.map((header, i) => {
                  const col = byId.get(header.column.id)!;
                  const sorted = header.column.getIsSorted();
                  const last = i === group.headers.length - 1;
                  return (
                    <th
                      key={header.id}
                      className={cn("group/th relative flex h-8 items-center text-left text-xs font-medium text-fg-muted", last && "flex-1")}
                      style={{ width: header.getSize(), minWidth: last ? header.getSize() : undefined }}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn("flex h-full min-w-0 flex-1 items-center gap-1 px-3 hover:text-fg", col.align === "right" && "justify-end")}
                        >
                          <span className="truncate">{col.header}</span>
                          {sorted === "asc" && <ArrowUp className="size-3 shrink-0" />}
                          {sorted === "desc" && <ArrowDown className="size-3 shrink-0" />}
                        </button>
                      ) : (
                        <span className="truncate px-3">{col.header}</span>
                      )}
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        className={cn("absolute top-1.5 right-0 bottom-1.5 w-1 cursor-col-resize touch-none rounded bg-line-strong opacity-0 select-none group-hover/th:opacity-100", header.column.getIsResizing() && "bg-accent opacity-100")}
                      />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="relative grid" style={{ height: virtualizer.getTotalSize() }}>
            {items.map(item => {
              const row = tableRows[item.index]!;
              const selected = selectedId !== undefined && row.id === selectedId;
              return (
                <tr
                  key={row.id}
                  data-index={item.index}
                  aria-selected={onRowClick ? selected : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? e => onRowKey(e, row.original) : undefined}
                  className={cn(
                    "absolute flex w-full border-b border-line outline-offset-[-2px]",
                    onRowClick && "cursor-pointer hover:bg-hover",
                    selected && "bg-accent-soft hover:bg-accent-soft"
                  )}
                  style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
                >
                  {row.getAllCells().map((cell, i, all) => {
                    const col = byId.get(cell.column.id)!;
                    const last = i === all.length - 1;
                    return (
                      <td
                        key={cell.id}
                        className={cn("flex items-center overflow-hidden px-3 whitespace-nowrap", last && "flex-1", col.align === "right" && "justify-end")}
                        style={{ width: cell.column.getSize(), minWidth: last ? cell.column.getSize() : undefined }}
                      >
                        <span className="truncate">{col.cell ? col.cell(row.original) : formatCell(cell.getValue())}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(footer || loadingMore) && (
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-fg-muted">
          <span>{footer}</span>
          {loadingMore && <Spinner />}
        </div>
      )}
    </div>
  );
}
