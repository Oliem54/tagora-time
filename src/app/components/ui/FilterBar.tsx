import type { ReactNode } from "react";
import SectionCard from "./SectionCard";

type FilterBarProps = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function FilterBar({
  title = "Filtres",
  subtitle,
  actions,
  children,
}: FilterBarProps) {
  return (
    <SectionCard title={title} subtitle={subtitle} actions={actions} tone="muted">
      <div className="ui-filter-bar">{children}</div>
    </SectionCard>
  );
}
