import Link from "next/link";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";

type TimeRoleSwitchLinkProps = {
  target: "employe" | "direction";
};

export default function TimeRoleSwitchLink({ target }: TimeRoleSwitchLinkProps) {
  if (target === "direction") {
    return (
      <p className="time-public-role-switch">
        Accès direction ?{" "}
        <Link href={NEXUS_PUBLIC_LOGIN_URL} className="time-public-inline-link">
          Connexion direction
        </Link>
      </p>
    );
  }

  return (
    <p className="time-public-role-switch">
      Accès employé ?{" "}
      <Link href={NEXUS_PUBLIC_LOGIN_URL} className="time-public-inline-link">
        Connexion employé
      </Link>
    </p>
  );
}
