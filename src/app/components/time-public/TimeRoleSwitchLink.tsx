import Link from "next/link";
import { resolveCurrentHororaLoginUrl } from "@/app/lib/auth/horora-login-redirect.server";

type TimeRoleSwitchLinkProps = {
  target: "employe" | "direction";
};

export default async function TimeRoleSwitchLink({ target }: TimeRoleSwitchLinkProps) {
  const loginUrl = await resolveCurrentHororaLoginUrl();
  if (target === "direction") {
    return (
      <p className="time-public-role-switch">
        Accès direction ?{" "}
        <Link href={loginUrl} className="time-public-inline-link">
          Connexion direction
        </Link>
      </p>
    );
  }

  return (
    <p className="time-public-role-switch">
      Accès employé ?{" "}
      <Link href={loginUrl} className="time-public-inline-link">
        Connexion employé
      </Link>
    </p>
  );
}
