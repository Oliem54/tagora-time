"use client";

import DayOperationsMobileStopList, {
  type OperationsMobileStopItem,
} from "@/app/components/livraisons/day-delivery/DayOperationsMobileStopList";

export type RamassageMobileStopItem = OperationsMobileStopItem;

type Props = {
  stops: RamassageMobileStopItem[];
  selectedId: number | null;
  emptyMessage: string;
  onSelect: (id: number) => void;
};

/** @deprecated Utiliser DayOperationsMobileStopList — conservé pour compatibilité imports. */
export default function DayRamassageMobileStopList(props: Props) {
  return <DayOperationsMobileStopList {...props} />;
}
