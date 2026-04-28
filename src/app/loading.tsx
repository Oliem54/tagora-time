import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";

export default function AppRouteLoading() {
  return (
    <TagoraLoadingScreen
      isLoading
      message="Initialisation de TAGORA..."
      fullScreen
    />
  );
}
