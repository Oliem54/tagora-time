import { Suspense } from "react";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import DirectionEffectifsClient from "./DirectionEffectifsClient";

export default function DirectionEffectifsPage() {
  return (
    <Suspense
      fallback={<TagoraLoadingScreen isLoading message="Chargement…" fullScreen />}
    >
      <DirectionEffectifsClient />
    </Suspense>
  );
}
