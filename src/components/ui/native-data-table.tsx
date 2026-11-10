"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  getTableRows,
  TablePaginationControls,
} from "@/components/ui/table";

type NativeTableElement = React.ReactElement<{
  children?: React.ReactNode;
  className?: string;
}>;

export function NativeDataTable({
  children,
  itemLabel = "baris",
  pageSize = 10,
}: {
  children: NativeTableElement;
  itemLabel?: string;
  pageSize?: number;
}) {
  const [page, setPage] = React.useState(1);
  const table = React.Children.only(children);

  if (!React.isValidElement(table) || table.type !== "table") {
    throw new Error("NativeDataTable requires a native <table> element.");
  }

  const tableChildren = React.Children.toArray(table.props.children);
  const tableBodies = tableChildren.filter(
    (child): child is React.ReactElement<{ children?: React.ReactNode }> =>
      React.isValidElement(child) && child.type === "tbody",
  );
  const rows = tableBodies.flatMap((body) =>
    getTableRows(body.props.children),
  );
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10;
  const pageCount = Math.max(1, Math.ceil(rows.length / safePageSize));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * safePageSize;
  const paginatedTableChildren = tableChildren.map((child, bodyIndex) => {
    if (!React.isValidElement(child) || child.type !== "tbody") return child;

    const body = child as React.ReactElement<{ children?: React.ReactNode }>;
    const bodyRows = getTableRows(body.props.children);
    const bodyOffset = tableChildren
      .slice(0, bodyIndex)
      .filter(
        (previous) =>
          React.isValidElement(previous) && previous.type === "tbody",
      )
      .reduce<number>(
        (count, previous) =>
          count +
          getTableRows(
            (previous as React.ReactElement<{ children?: React.ReactNode }>).props
              .children,
          ).length,
        0,
      );
    const visibleBodyRows = bodyRows.filter((_, index) => {
      const rowIndex = bodyOffset + index;
      return rowIndex >= firstIndex && rowIndex < firstIndex + safePageSize;
    });
    return React.cloneElement(body, {}, visibleBodyRows);
  });
  const paginatedTable = React.cloneElement(
    table,
    {
      className: cn("app-data-table", table.props.className),
    },
    paginatedTableChildren,
  );

  return (
    <div className="w-full space-y-3">
      <div className="relative w-full overflow-x-auto rounded-lg border">
        {paginatedTable}
      </div>
      <TablePaginationControls
        count={rows.length}
        pageSize={safePageSize}
        page={currentPage}
        itemLabel={itemLabel}
        onPageChange={setPage}
      />
    </div>
  );
}
