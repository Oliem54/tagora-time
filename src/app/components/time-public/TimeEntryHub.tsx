import Link from "next/link";
import TimePublicShell from "./TimePublicShell";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";

export default function TimeEntryHub() {
  return (
    <TimePublicShell brandSize="hub" showWordmark={false}>
      <section className="time-public-hub" aria-labelledby="time-public-hub-title">
        <p className="time-public-status" role="status">
          Application
        </p>
        <h1 id="time-public-hub-title" className="time-public-title">
          Connexion
        </h1>
        <p className="time-public-lead">
          Choisissez votre espace pour pointer, consulter vos heures ou gérer les opérations.
        </p>

        <div className="time-public-hub-actions">
          <Link href={NEXUS_PUBLIC_LOGIN_URL} className="time-public-cta time-public-cta--primary">
            Employé
          </Link>
          <Link href={NEXUS_PUBLIC_LOGIN_URL} className="time-public-cta time-public-cta--secondary">
            Direction
          </Link>
        </div>
      </section>
    </TimePublicShell>
  );
}
