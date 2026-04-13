import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Building2, UserRound } from "lucide-react";
import ModuleTile from "@/app/components/ui/ModuleTile";
import PageHeader from "@/app/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Accueil",
  description: "Portails d acces Tagora.",
};

export default function Home() {
  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg home-landing-shell">
        <PageHeader
          className="home-landing-header"
          title="Tagora"
          subtitle="Accedez a votre espace."
        />

        <div className="home-landing-cards">
          <ModuleTile
            className="home-landing-tile"
            eyebrow="Employe"
            title="Connexion employe"
            description="Terrain et operations."
            icon={<UserRound size={24} strokeWidth={2.1} />}
            accent="linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(15,41,72,0.08) 100%)"
            action={
              <Link href="/employe" className="tagora-dark-action" style={{ width: "100%", justifyContent: "space-between" }}>
                <span>Entrer</span>
                <ArrowUpRight size={16} />
              </Link>
            }
          />
          <ModuleTile
            className="home-landing-tile"
            eyebrow="Direction"
            title="Connexion direction"
            description="Gestion."
            icon={<Building2 size={24} strokeWidth={2.1} />}
            accent="linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(15,41,72,0.08) 100%)"
            action={
              <Link href="/direction" className="tagora-dark-outline-action" style={{ width: "100%", justifyContent: "space-between" }}>
                <span>Entrer</span>
                <ArrowUpRight size={16} />
              </Link>
            }
          />
        </div>

        <div className="home-landing-actions">
          <Link
            href="/demande-compte"
            className="tagora-dark-outline-action home-landing-request-action"
          >
            Demander un acces
          </Link>
        </div>
      </div>
    </main>
  );
}
