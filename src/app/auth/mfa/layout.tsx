import { Suspense } from "react";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";

export default function MfaAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={<TagoraLoadingScreen isLoading message="Chargement MFA..." fullScreen />}
    >
      {children}
    </Suspense>
  );
}
