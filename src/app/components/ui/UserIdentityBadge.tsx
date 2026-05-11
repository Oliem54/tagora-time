"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppRole } from "@/app/lib/auth/roles";

type UserIdentityBadgeProps = {
  value: string;
  roleLabel?: string | null;
  /** Pour le badge MFA discret direction/admin. */
  role?: AppRole | null;
  className?: string;
};

export default function UserIdentityBadge({
  value,
  roleLabel,
  role,
  className,
}: UserIdentityBadgeProps) {
  void role;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const classes = ["ui-user-identity-badge", className].filter(Boolean).join(" ");
  const normalizedRole = useMemo(
    () => (roleLabel || "Rôle non défini").toLowerCase(),
    [roleLabel]
  );
  const initials = useMemo(() => {
    const source = value.split("@")[0] || value;
    const chunks = source
      .split(/[._\s-]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (chunks.length >= 2) {
      return `${chunks[0][0]}${chunks[1][0]}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div className="ui-user-identity-shell" ref={rootRef}>
      <button
        type="button"
        className={classes}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="ui-user-identity-avatar" aria-hidden>
          {initials}
        </span>
        <span className="ui-user-identity-badge-role-row">
          <span className="ui-user-identity-badge-role-value">{`Compte ${normalizedRole}`}</span>
        </span>
      </button>
      {open ? (
        <div className="ui-user-identity-menu" role="menu">
          <div className="ui-user-identity-menu-label">Connecté avec</div>
          <div className="ui-user-identity-menu-email" title={value}>
            {value}
          </div>
          <div className="ui-user-identity-menu-role">{`Rôle actif: ${roleLabel || "Rôle non défini"}`}</div>
          <Link
            href="/account/security"
            className="ui-button ui-button-secondary"
            role="menuitem"
            style={{ marginTop: 12, display: "inline-flex", justifyContent: "center" }}
          >
            Sécurité du compte
          </Link>
        </div>
      ) : null}
    </div>
  );
}
