import type { ReactNode } from "react";
import AppCard from "./AppCard";

type Column = {
  key: string;
  label: string;
};

type DataTableProps = {
  columns: Column[];
  children: ReactNode;
  emptyState?: ReactNode;
};

export function DataTable({ columns, children, emptyState }: DataTableProps) {
  return (
    <AppCard className="ui-data-table-shell">
      <div className="ui-data-table-wrap">
        <table className="ui-data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {emptyState ? <div className="ui-data-table-empty">{emptyState}</div> : null}
    </AppCard>
  );
}

export function DataTableRow({ children }: { children: ReactNode }) {
  return <tr>{children}</tr>;
}

export function DataTableCell({ children }: { children: ReactNode }) {
  return <td>{children}</td>;
}
