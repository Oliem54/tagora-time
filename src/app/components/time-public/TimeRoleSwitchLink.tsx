import Link from "next/link";

type TimeRoleSwitchLinkProps = {
  target: "employe" | "direction";
};

export default function TimeRoleSwitchLink({ target }: TimeRoleSwitchLinkProps) {
  if (target === "direction") {
    return (
      <p className="time-public-role-switch">
        Accès direction ?{" "}
        <Link href="/direction/login" className="time-public-inline-link">
          Connexion direction
        </Link>
      </p>
    );
  }

  return (
    <p className="time-public-role-switch">
      Accès employé ?{" "}
      <Link href="/employe/login" className="time-public-inline-link">
        Connexion employé
      </Link>
    </p>
  );
}
