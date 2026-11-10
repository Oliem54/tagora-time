import Link from "next/link";
import TimePublicShell from "./TimePublicShell";
import { resolveCurrentHororaLoginUrl } from "@/app/lib/auth/horora-login-redirect.server";
import { isProcessLocalNexusFixtureEnabled } from "@/app/lib/auth/horora-local-nexus-fixture";

export default async function TimeEntryHub() {
  const localFixture = isProcessLocalNexusFixtureEnabled();
  const loginUrl = await resolveCurrentHororaLoginUrl();
  const employeeHref = localFixture ? "/employe/dashboard" : loginUrl;
  const directionHref = localFixture ? "/direction/dashboard" : loginUrl;
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
          <Link href={employeeHref} className="time-public-cta time-public-cta--primary">
            Employé
          </Link>
          <Link href={directionHref} className="time-public-cta time-public-cta--secondary">
            Direction
          </Link>
        </div>
      </section>
    </TimePublicShell>
  );
}
