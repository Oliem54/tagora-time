import Link from "next/link";
import { readHororaNexusLoginUrl } from "@/app/lib/auth/horora-nexus-login.server";

type TimeRoleSwitchLinkProps = {
  target: "employe" | "direction";
};

export default async function TimeRoleSwitchLink({ target }: TimeRoleSwitchLinkProps) {
  const loginUrl = await readHororaNexusLoginUrl();

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
