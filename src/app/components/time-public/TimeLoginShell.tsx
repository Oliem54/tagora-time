import type { ReactNode } from "react";
import Link from "next/link";
import TimePublicShell from "./TimePublicShell";

type TimeLoginShellProps = {
  roleLabel: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  showWordmark?: boolean;
  logoSrc?: string;
};

export default function TimeLoginShell({
  roleLabel,
  title,
  description,
  children,
  footer,
  showWordmark = true,
  logoSrc,
}: TimeLoginShellProps) {
  return (
    <TimePublicShell
      brandSize="login"
      compact
      showWordmark={showWordmark}
      logoSrc={logoSrc}
    >
      <section className="time-public-login" aria-labelledby="time-public-login-title">
        <p className="time-public-role-badge">{roleLabel}</p>
        <h1 id="time-public-login-title" className="time-public-title time-public-title--login">
          {title}
        </h1>
        <p className="time-public-lead time-public-lead--login">{description}</p>

        <div className="time-public-login-panel">{children}</div>

        {footer ? <div className="time-public-login-footer">{footer}</div> : null}

        <p className="time-public-back">
          <Link href="/" className="time-public-inline-link">
            Retour à l’accueil
          </Link>
        </p>
      </section>
    </TimePublicShell>
  );
}
