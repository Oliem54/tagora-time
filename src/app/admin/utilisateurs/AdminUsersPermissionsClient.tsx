"use client";

import { useEffect, useState } from "react";
import HororaAppShell from "@/app/components/horora/HororaAppShell";
import {
  hororaNexusSessionRequestInit,
  redirectToNexusLoginIfUnauthenticated,
} from "@/app/lib/auth/horora-nexus-session.client";
import {
  HORORA_DIRECTORY_REFRESH_MS,
  pageDirectoryRows,
  type HororaDirectoryScope,
  type HororaDirectoryUserRow,
  type HororaPermissionSectionState,
} from "@/app/lib/auth/horora-authorized-module-directory.shared";

type DirectoryResponse = {
  success?: boolean;
  blocker?: string | null;
  serviceMessage?: string;
  serviceStatus?: string;
  scope?: HororaDirectoryScope | null;
  rows?: HororaDirectoryUserRow[];
  error?: string;
};

function sectionMark(section: HororaPermissionSectionState) {
  return section.checked ? "Oui" : "Non";
}

export default function AdminUsersPermissionsClient() {
  const [rows, setRows] = useState<HororaDirectoryUserRow[]>([]);
  const [blocker, setBlocker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [scope, setScope] = useState<HororaDirectoryScope | null>(null);
  const [page, setPage] = useState(1);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    let timer = 0;

    async function load() {
      try {
        const res = await fetch(
          "/api/admin/utilisateurs/directory",
          hororaNexusSessionRequestInit({ signal: ac.signal })
        );
        if (redirectToNexusLoginIfUnauthenticated(res.status)) return;
        const json = (await res.json().catch(() => ({}))) as DirectoryResponse;
        if (!res.ok || json.success === false) {
          setError(typeof json.error === "string" ? json.error : "Chargement impossible.");
          return;
        }
        const nextRows = Array.isArray(json.rows) ? json.rows : [];
        setRows(nextRows);
        setScope(json.scope ?? null);
        setError(null);
        const message =
          typeof json.serviceMessage === "string"
            ? json.serviceMessage
            : typeof json.blocker === "string"
              ? json.blocker
              : null;
        setBlocker(message);
        setPage((current) => pageDirectoryRows(nextRows, current).page);
        setSelectedKey((current) =>
          current && nextRows.some((row) => row.key === current)
            ? current
            : (nextRows[0]?.key ?? null)
        );
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError("Chargement impossible.");
      } finally {
        setLoading(false);
      }
    }

    void load();
    timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, HORORA_DIRECTORY_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ac.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshToken]);

  const paged = pageDirectoryRows(rows, page);
  const selected = rows.find((row) => row.key === selectedKey) ?? null;

  return (
    <HororaAppShell
      workspace="admin"
      active="utilisateurs"
      title="Utilisateurs et permissions"
      subtitle="Préparation locale. Les dossiers et memberships existants restent en place. Aucune case n'est enregistrée."
    >
      <div className="ui-stack-md">
        <p className="tagora-note" style={{ margin: 0, lineHeight: 1.55 }}>
          Pointage, finance, paie, rémunération, commissions et administration restent des
          cases distinctes. Un rôle Nexus ne coche aucune case sensible. La révocation
          d&apos;accès Nexus est préparée côté serveur et n&apos;est pas branchée au handoff.
        </p>

        {blocker ? (
          <div
            className="tagora-panel-muted"
            style={{ padding: 14, borderRadius: 12, lineHeight: 1.5 }}
          >
            {blocker}
          </div>
        ) : null}

        {error ? (
          <p className="tagora-note" style={{ color: "#b91c1c", margin: 0 }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <p className="tagora-note" style={{ margin: 0 }}>
            {scope
              ? `Organisation ${scope.organizationId} · tenant ${scope.tenantId} · ${scope.moduleKey}`
              : "Organisation non résolue. Aucune lecture hors filtre."}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRefreshToken((current) => current + 1);
            }}
            style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", padding: "6px 10px" }}
          >
            Actualiser
          </button>
        </div>

        {loading ? (
          <p className="tagora-note" style={{ margin: 0 }}>
            Chargement des dossiers employés...
          </p>
        ) : (
          <div className="ui-stack-md">
            <div className="tagora-panel-muted" style={{ padding: 8, borderRadius: 14 }}>
              {rows.length === 0 ? (
                <p className="tagora-note" style={{ margin: 8 }}>
                  Aucun dossier employé local.
                </p>
              ) : (
                paged.rows.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => setSelectedKey(row.key)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: row.key === selectedKey ? "#e2e8f0" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <strong>{row.displayName}</strong>
                    <div className="tagora-note" style={{ margin: 0 }}>
                      {row.nexusUserId ?? "identité Nexus absente"}
                      {" · "}
                      {row.nexusRoleKey ?? row.membershipRole ?? "rôle absent"}
                      {" · "}
                      {row.directoryStatus}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                disabled={paged.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Page précédente
              </button>
              <span className="tagora-note">
                Page {paged.page} / {paged.pageCount}
              </span>
              <button
                type="button"
                disabled={paged.page >= paged.pageCount}
                onClick={() => setPage((current) => current + 1)}
              >
                Page suivante
              </button>
            </div>

            {selected ? <PermissionPreview row={selected} scope={scope} /> : null}
          </div>
        )}
      </div>
    </HororaAppShell>
  );
}

function directoryStatusLabel(status: HororaDirectoryUserRow["directoryStatus"]) {
  if (status === "ACTIVE") return "autorisé dans Nexus";
  if (status === "PENDING") return "en attente dans Nexus";
  if (status === "SUSPENDED") return "suspendu dans Nexus";
  if (status === "REVOKED") return "révoqué dans Nexus";
  return "annuaire Nexus non branché";
}

function PermissionPreview({
  row,
  scope,
}: {
  row: HororaDirectoryUserRow;
  scope: HororaDirectoryScope | null;
}) {
  return (
    <section className="tagora-panel" style={{ padding: 16, borderRadius: 14 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        {row.displayName}
      </h2>
      <p className="tagora-note" style={{ marginTop: 0 }}>
        {row.nexusUserId ?? "identité Nexus absente"} · organisation{" "}
        {scope?.organizationId ?? "non résolue"} · tenant {scope?.tenantId ?? "non résolu"} ·
        rôle {row.nexusRoleKey ?? row.membershipRole ?? "absent"} ·{" "}
        {directoryStatusLabel(row.directoryStatus)}.
        {row.directoryStatus === "ABSENT"
          ? " Une absence d'annuaire reste ABSENT et n'est pas une révocation."
          : ""}
      </p>
      <div className="ui-stack-xs">
        {row.sections.map((section) => (
          <label
            key={section.id}
            style={{ display: "flex", gap: 10, alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={section.checked}
              disabled
              onChange={() => undefined}
              aria-label={section.label}
            />
            <span>
              {section.label}
              {section.sensitive ? " · sensible" : ""} · {sectionMark(section)}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
