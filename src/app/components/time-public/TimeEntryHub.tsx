import Link from "next/link";
import TimePublicShell from "./TimePublicShell";
import { readHororaNexusLoginUrl } from "@/app/lib/auth/horora-nexus-login.server";

export default async function TimeEntryHub() {
  const loginUrl = await readHororaNexusLoginUrl();

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
          <Link href={loginUrl} className="time-public-cta time-public-cta--primary">
            Employé
          </Link>
          <Link href={loginUrl} className="time-public-cta time-public-cta--secondary">
            Direction
          </Link>
        </div>
      </section>
    </TimePublicShell>
  );
}
