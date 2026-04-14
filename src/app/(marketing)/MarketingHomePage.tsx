import BenefitsSection from "./components/home/BenefitsSection";
import CTASection from "./components/home/CTASection";
import HeroSection from "./components/home/HeroSection";
import LabelsSection from "./components/home/LabelsSection";
import PlatformPreview from "./components/home/PlatformPreview";
import SolutionCards from "./components/home/SolutionCards";
import MarketingShell from "./components/site/MarketingShell";

export default function MarketingHomePage() {
  return (
    <MarketingShell currentPath="/">
      <HeroSection />
      <SolutionCards />
      <PlatformPreview />
      <BenefitsSection />
      <LabelsSection />
      <CTASection />
    </MarketingShell>
  );
}
