import Link from "next/link";
import { ArrowUpRight, Truck, UsersRound, Wrench } from "lucide-react";
import ModuleTile from "@/app/components/ui/ModuleTile";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";

export default function Page() {
  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg" style={{ maxWidth: 1240 }}>
        <AuthenticatedPageHeader
          title="Ressources direction"
          subtitle="Acces modules."
        />

        <div className="ui-grid-auto">
          <ModuleTile
            title="Employes et chauffeurs"
            description="Equipe."
            icon={<UsersRound size={24} strokeWidth={2.1} />}
            accent="linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(15,41,72,0.08) 100%)"
            action={
              <Link href="/direction/ressources/employes" className="tagora-dark-action" style={{ width: "100%", justifyContent: "space-between" }}>
                <span>Acceder</span>
                <ArrowUpRight size={16} />
              </Link>
            }
          />
          <ModuleTile
            title="Vehicules"
            description="Flotte."
            icon={<Truck size={24} strokeWidth={2.1} />}
            accent="linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(15,41,72,0.08) 100%)"
            action={
              <Link href="/direction/ressources/vehicules" className="tagora-dark-outline-action" style={{ width: "100%", justifyContent: "space-between" }}>
                <span>Acceder</span>
                <ArrowUpRight size={16} />
              </Link>
            }
          />
          <ModuleTile
            title="Remorques"
            description="Parc."
            icon={<Wrench size={24} strokeWidth={2.1} />}
            accent="linear-gradient(135deg, rgba(251,146,60,0.18) 0%, rgba(15,41,72,0.08) 100%)"
            action={
              <Link href="/direction/ressources/remorques" className="tagora-dark-outline-action" style={{ width: "100%", justifyContent: "space-between" }}>
                <span>Acceder</span>
                <ArrowUpRight size={16} />
              </Link>
            }
          />
        </div>
      </div>
    </main>
  );
}
