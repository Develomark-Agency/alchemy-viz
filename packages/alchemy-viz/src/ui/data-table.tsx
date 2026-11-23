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
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "cn";
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
  sortable?: boolean,
  /** Shades the column, e.g. a primary key, so it reads as the row's identity. */
  emphasis?: boolean
}

/** Shows any value in a cell: null as a muted label, objects as JSON. */
export function formatCell(value: unknown): ReactNode {
  if(value === null || value === undefined) return <span className="text-fg-subtle italic">{String(value)}</span>;
  if(value instanceof Date) return formatTime(value);
  if(typeof value === "object") return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  if(typeof value === "number") return <span className="tabular-nums">{value}</span>;
  return String(value);
}

/**
 * A starting width for a column from its header and a sample of its values,
 * so short columns stay short. Uses the 80th percentile, so one long value
 * doesn't widen the whole column.
 */
export function fitColumnWidth(rows: Array<Record<string, unknown>>, id: string, headerChars = id.length) {
  const sample = rows.slice(0, 50).map(r => {
    const v = r[id];
    return v === null || v === undefined ? 4 : typeof v === "object" ? JSON.stringify(v).length : String(v).length;
  }).sort((a, b) => a - b);
  const content = sample[Math.floor(sample.length * 0.8)] ?? 0;
  return Math.round(Math.min(Math.max(Math.max(content, headerChars) * 7.4 + 32, 72), 340));
}

/** Columns from the keys of the rows, for data without a fixed shape. Numeric columns align right. */
export function inferColumns<Row extends Record<string, unknown>>(rows: Row[]): Array<Column<Row>> {
  const keys = new Set<string>();
  for(const r of rows.slice(0, 100)) for(const k of Object.keys(r)) keys.add(k);
  return [...keys].map(k => {
    const values = rows.slice(0, 100).map(r => r[k]).filter(v => v !== null && v !== undefined);
    const numeric = values.length > 0 && values.every(v => typeof v === "number");
    return { id: k, header: k, size: fitColumnWidth(rows, k), align: numeric ? "right" : "left" };
  });
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
 *
 * `scroll="page"` lets the table grow with the page instead of scrolling
 * inside a box: the page scrolls, the header sticks under the top bar, and
 * rows are still virtualized against the window.
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
  scroll = "container",
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
  scroll?: "container" | "page",
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

  const page = scroll === "page";
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [bodyTop, setBodyTop] = useState(0);
  const tableRows = table.getRowModel().rows;
  // Both are created so hook order stays fixed; the unused one counts nothing.
  const boxed = useVirtualizer({
    count: page ? 0 : tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: index => tableRows[index]!.id,
    overscan: 12
  });
  const windowed = useWindowVirtualizer({
    count: page ? tableRows.length : 0,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: index => tableRows[index]!.id,
    overscan: 12,
    scrollMargin: bodyTop
  });
  const virtualizer = page ? windowed : boxed;
  const items = virtualizer.getVirtualItems();

  // The window virtualizer needs the body's distance from the top of the page.
  useLayoutEffect(() => {
    if(!page || !bodyRef.current) return;
    const top = bodyRef.current.getBoundingClientRect().top + window.scrollY;
    if(Math.abs(top - bodyTop) > 1) setBodyTop(top);
  });
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
      <div ref={scrollRef} className={cn("relative", page ? "overflow-x-clip" : "overflow-auto")} style={page ? undefined : { maxHeight }}>
        <table className="grid text-[13px]" style={{ minWidth: "100%", width: table.getTotalSize() }}>
          <thead className={cn("sticky z-1 grid bg-surface-2 shadow-[inset_0_-1px_0_var(--av-line)]", page ? "top-(--topbar-h)" : "top-0")}>
            {table.getHeaderGroups().map(group => (
              <tr key={group.id} className="flex w-full">
                {group.headers.map((header, i) => {
                  const col = byId.get(header.column.id)!;
                  const sorted = header.column.getIsSorted();
                  const last = i === group.headers.length - 1;
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "group/th relative flex h-8 items-center text-left text-xs font-medium text-fg-muted transition-colors duration-150 ease-out",
                        last && "flex-1",
                        col.emphasis && "bg-hover text-fg",
                        sorted && "bg-accent-soft text-accent-soft-fg"
                      )}
                      style={{ width: header.getSize(), minWidth: last ? header.getSize() : undefined }}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn("flex h-full min-w-0 flex-1 items-center gap-1 px-3 hover:text-fg", col.align === "right" && "flex-row-reverse justify-start")}
                        >
                          <span className="truncate">{col.header}</span>
                          {sorted === "asc" && <ArrowUp className="size-3 shrink-0 text-accent" />}
                          {sorted === "desc" && <ArrowDown className="size-3 shrink-0 text-accent" />}
                          {!sorted && <ArrowUpDown className="size-3 shrink-0 opacity-0 transition-opacity duration-150 group-hover/th:opacity-50" />}
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
          <tbody ref={bodyRef} className="relative grid" style={{ height: virtualizer.getTotalSize() }}>
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
                    // A clickable row acts like a button: clicking (or double-clicking) it shouldn't highlight text.
                    onRowClick && "cursor-pointer transition-colors duration-100 ease-out select-none hover:bg-hover",
                    selected && "bg-accent-soft hover:bg-accent-soft"
                  )}
                  style={{ height: ROW_HEIGHT, transform: `translateY(${item.start - (page ? bodyTop : 0)}px)` }}
                >
                  {row.getAllCells().map((cell, i, all) => {
                    const col = byId.get(cell.column.id)!;
                    const last = i === all.length - 1;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "flex items-center overflow-hidden px-3 whitespace-nowrap",
                          last && "flex-1",
                          col.align === "right" && "justify-end",
                          col.emphasis && "bg-surface-2 font-medium",
                          cell.column.getIsSorted() && "bg-accent-soft/30"
                        )}
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
        // With the page scrolling, the footer pins to the bottom of the window
        // instead of waiting at the end of a list that loads as you scroll.
        <div className={cn("flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-fg-muted", page && "sticky bottom-0 z-1 bg-surface")}>
          <span>{footer}</span>
          {loadingMore && <Spinner />}
        </div>
      )}
    </div>
  );
}
