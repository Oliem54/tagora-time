import { Suspense } from "react";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import DirectionHorodateurPastShiftsClient from "./DirectionHorodateurPastShiftsClient";

export default function DirectionHorodateurPastShiftsPage() {
  return (
    <Suspense
      fallback={
        <TagoraLoadingScreen
          isLoading
          fullScreen={false}
          message="Chargement des quarts passés..."
        />
      }
    >
      <DirectionHorodateurPastShiftsClient />
    </Suspense>
  );
}
