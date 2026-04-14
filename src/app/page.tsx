import type { Metadata } from "next";
import MarketingHomePage from "./(marketing)/MarketingHomePage";

export const metadata: Metadata = {
  title: "Accueil",
  description:
    "TAGORA relie la gestion des opérations terrain et les étiquettes électroniques dans une plateforme structurée et premium.",
};

export default function Page() {
  return <MarketingHomePage />;
}
