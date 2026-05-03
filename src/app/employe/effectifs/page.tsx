import { Suspense } from "react";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import EmployeEffectifsShell from "./EmployeEffectifsShell";

export default function EmployeEffectifsPage() {
  return (
    <Suspense
      fallback={<TagoraLoadingScreen isLoading message="Chargement…" fullScreen />}
    >
      <EmployeEffectifsShell />
    </Suspense>
  );
}
