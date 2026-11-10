"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type TableProps = React.ComponentProps<"table"> & {
  pagination?: boolean;
  pageSize?: number;
  itemLabel?: string;
};

type TablePaginationState = {
  enabled: boolean;
  pageSize: number;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  rowCount: number;
  setRowCount: React.Dispatch<React.SetStateAction<number>>;
};

const TablePaginationContext = React.createContext<TablePaginationState | null>(
  null,
);

export function getTableRows(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (React.isValidElement(child) && child.type === React.Fragment) {
      return getTableRows(
        (child as React.ReactElement<{ children?: React.ReactNode }>).props
          .children,
      );
    }

    return [child];
  });
}

function Table({
  className,
  pagination = true,
  pageSize = 10,
  itemLabel = "baris",
  children,
  ...props
}: TableProps) {
  const [page, setPage] = React.useState(1);
  const [rowCount, setRowCount] = React.useState(0);
  const safePageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.floor(pageSize))
    : 10;
  const paginationState = React.useMemo(
    () => ({
      enabled: pagination,
      pageSize: safePageSize,
      page,
      setPage,
      rowCount,
      setRowCount,
    }),
    [page, pagination, rowCount, safePageSize],
  );

  return (
    <TablePaginationContext.Provider value={paginationState}>
      <div className="w-full">
        <div
          data-slot="table-container"
          className="relative w-full overflow-x-auto rounded-lg border"
        >
          <table
            data-slot="table"
            className={cn("app-data-table w-full caption-bottom text-sm", className)}
            {...props}
          >
            {children}
          </table>
        </div>
        {pagination && <TablePagination itemLabel={itemLabel} />}
      </div>
    </TablePaginationContext.Provider>
  )
}

function TablePagination({ itemLabel }: { itemLabel: string }) {
  const state = React.useContext(TablePaginationContext);
  return (
    state ? (
      <TablePaginationControls
        count={state.rowCount}
        pageSize={state.pageSize}
        page={state.page}
        itemLabel={itemLabel}
        onPageChange={state.setPage}
      />
    ) : null
  );
}

export function TablePaginationControls({
  count,
  pageSize,
  page,
  itemLabel,
  onPageChange,
}: {
  count: number;
  pageSize: number;
  page: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}) {
  if (count <= pageSize) return null;

  const pageCount = Math.ceil(count / pageSize);
  const currentPage = Math.min(page, pageCount);
  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, count);

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite">
        Menampilkan {firstItem}-{lastItem} dari {count} {itemLabel}
      </p>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Halaman sebelumnya"
          className="size-9 border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Halaman berikutnya"
          className="size-9 border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
          disabled={currentPage >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-muted/50 text-muted-foreground [&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({
  className,
  children,
  ...props
}: React.ComponentProps<"tbody">) {
  const pagination = React.useContext(TablePaginationContext);
  const rows = getTableRows(children);
  const rowCount = rows.length;
  React.useEffect(() => {
    pagination?.setRowCount(rowCount);
  }, [pagination, rowCount]);
  const pageCount = Math.max(
    1,
    Math.ceil(rowCount / (pagination?.pageSize ?? 10)),
  );
  const currentPage = Math.min(pagination?.page ?? 1, pageCount);
  const visibleRows =
    pagination?.enabled && rowCount > pagination.pageSize
      ? rows.slice(
          (currentPage - 1) * pagination.pageSize,
          currentPage * pagination.pageSize,
        )
      : rows;

  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    >
      {visibleRows}
    </tbody>
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "data-[state=selected]:bg-muted border-b border-ld transition-colors hover:bg-muted/40",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 px-3 text-center align-middle font-semibold whitespace-nowrap sm:px-4 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-3 align-middle whitespace-nowrap sm:p-4 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
