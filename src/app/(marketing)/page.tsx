import type { Metadata } from "next";
import BenefitsSection from "./components/BenefitsSection";
import CTASection from "./components/CTASection";
import HeroSection from "./components/HeroSection";
import LabelsSection from "./components/LabelsSection";
import PlatformPreview from "./components/PlatformPreview";
import SiteFooter from "./components/SiteFooter";
import SiteHeader from "./components/SiteHeader";
import SolutionCards from "./components/SolutionCards";

export const metadata: Metadata = {
  title: "Accueil",
  description:
    "TAGORA relie la gestion des opérations terrain et les étiquettes électroniques dans une plateforme structurée et premium.",
};

export default function Page() {
  return (
    <main
      id="accueil"
      className="min-h-screen bg-[linear-gradient(180deg,#eef4ff_0%,#f7f9fc_30%,#fcfdff_100%)] text-slate-950"
    >
      <div className="absolute inset-x-0 top-0 -z-10 overflow-hidden">
        <div className="mx-auto h-[560px] max-w-[1400px] bg-[radial-gradient(circle_at_top_left,rgba(72,116,255,0.30),transparent_38%),radial-gradient(circle_at_top_right,rgba(16,185,255,0.16),transparent_26%),linear-gradient(180deg,#071629_0%,#0c2240_62%,#16345f_100%)]" />
      </div>

      <SiteHeader />
      <HeroSection />
      <SolutionCards />
      <PlatformPreview />
      <BenefitsSection />
      <LabelsSection />
      <CTASection />
      <SiteFooter />
    </main>
  );
}
