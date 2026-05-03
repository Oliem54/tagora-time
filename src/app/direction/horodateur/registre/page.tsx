import { Suspense } from "react";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import DirectionHorodateurRegistreClient from "./DirectionHorodateurRegistreClient";

export default function DirectionHorodateurRegistrePage() {
  return (
    <Suspense
      fallback={
        <TagoraLoadingScreen
          isLoading
          fullScreen={false}
          message="Chargement du registre..."
        />
      }
    >
      <DirectionHorodateurRegistreClient />
    </Suspense>
  );
}
