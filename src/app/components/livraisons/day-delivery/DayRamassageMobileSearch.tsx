"use client";

import DayOperationsMobileSearch from "@/app/components/livraisons/day-delivery/DayOperationsMobileSearch";
import type { RamassageStatusFilter } from "@/app/lib/livraisons/day-stop-search.shared";

type Props = {
  query: string;
  statusFilter: RamassageStatusFilter;
  resultCount: number;
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (value: RamassageStatusFilter) => void;
};

/** @deprecated Utiliser DayOperationsMobileSearch — conservé pour compatibilité imports. */
export default function DayRamassageMobileSearch(props: Props) {
  return <DayOperationsMobileSearch mode="ramassage" {...props} />;
}
