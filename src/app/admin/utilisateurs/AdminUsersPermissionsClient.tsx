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
import {
  HORORA_BUSINESS_PERMISSION_DOMAINS,
  HORORA_BUSINESS_PERMISSION_LABELS,
  HORORA_CANONICAL_PERMISSION_DOMAINS,
  HORORA_ROLE_AUTHORITY,
  actorCanEditLocalPresetRoles,
  businessPermissionGrantLabel,
  capabilityForPermissionSection,
  decideNexusAuthorizedLocalBinding,
  describeHororaRoleRightsTransition,
  describeLocalRoleChange,
  formatHororaRoleAuditActivity,
  formatHororaRoleRightList,
  listHororaRolePresets,
  nexusLocalBindingDenialMessage,
  type HororaPremiumDashboard,
  type HororaRoleAuditEntry,
} from "@/app/lib/auth/horora-premium-user-central.shared";
import type { OrganizationMembershipRole } from "@/app/lib/saas/tenant-foundation.shared";

type DirectoryResponse = {
  success?: boolean;
  blocker?: string | null;
  serviceMessage?: string;
  serviceStatus?: string;
  scope?: HororaDirectoryScope | null;
  rows?: HororaDirectoryUserRow[];
  premium?: HororaPremiumDashboard;
  roleAudit?: HororaRoleAuditEntry[] | null;
  actorMembershipRole?: OrganizationMembershipRole | null;
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
  const [serviceStatus, setServiceStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [refreshToken, setRefreshToken] = useState(0);
  const [premium, setPremium] = useState<HororaPremiumDashboard | null>(null);
  const [roleAudit, setRoleAudit] = useState<HororaRoleAuditEntry[] | null>(null);
  const [actorMembershipRole, setActorMembershipRole] =
    useState<OrganizationMembershipRole | null>(null);
  const [query, setQuery] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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
        setPremium(json.premium ?? null);
        setRoleAudit(json.roleAudit === null ? null : (json.roleAudit ?? []));
        setActorMembershipRole(json.actorMembershipRole ?? null);
        setScope(json.scope ?? null);
        setServiceStatus(typeof json.serviceStatus === "string" ? json.serviceStatus : null);
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

  const visibleRows = rows.filter((row) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      row.displayName.toLowerCase().includes(needle) ||
      (row.membershipRole ?? "").includes(needle) ||
      (row.nexusUserId ?? "").toLowerCase().includes(needle)
    );
  });
  const paged = pageDirectoryRows(visibleRows, page);
  const selected = rows.find((row) => row.key === selectedKey) ?? null;
  const rosterConfirmed =
    serviceStatus === "ready" ||
    rows.some(
      (row) =>
        row.identityProjection === "remote_directory" && row.directoryStatus === "ACTIVE"
    );

  return (
    <HororaAppShell
      workspace="admin"
      active="utilisateurs"
      title="Utilisateurs et permissions"
      subtitle="Console locale. Les rôles et permissions HORORA déjà enregistrés restent la seule autorité."
    >
      <div className="ui-stack-md">
        <p className="tagora-note" style={{ margin: 0, lineHeight: 1.55 }}>
          Sélectionnez un employé déjà autorisé dans NEXUS pour cette organisation. HORORA
          attribue ensuite un rôle local existant. Aucun utilisateur central n&apos;est créé
          ici, et un rôle NEXUS ne devient pas propriétaire HORORA.
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

        <PremiumDashboard
          premium={premium}
          serviceStatus={serviceStatus}
          roleAudit={roleAudit}
        />

        <RolePresetCatalogue />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <p className="tagora-note" style={{ margin: 0 }}>
            {scope
              ? `Organisation ${scope.organizationId} · tenant ${scope.tenantId} · ${scope.moduleKey}`
              : "Organisation non résolue. Aucune lecture hors filtre."}
          </p>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Rechercher un nom, un rôle ou une identité"
            aria-label="Rechercher"
            style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 10px", minWidth: 240 }}
          />
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
              {visibleRows.length === 0 ? (
                <p className="tagora-note" style={{ margin: 8 }}>
                  {rows.length === 0
                    ? "Aucun dossier employé local."
                    : "Aucun dossier ne correspond à cette recherche."}
                </p>
              ) : (
                paged.rows.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => {
                      setSelectedKey(row.key);
                      setActionMessage(null);
                    }}
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
                      {directoryStatusLabel(row.directoryStatus, serviceStatus, row.identityProjection)}
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

            {selected ? (
              <PermissionPreview
                key={selected.key}
                row={selected}
                scope={scope}
                serviceStatus={serviceStatus}
                rosterConfirmed={rosterConfirmed}
                actorMembershipRole={actorMembershipRole}
                actionMessage={actionMessage}
                onAssigned={(message, persisted) => {
                  setActionMessage(message);
                  if (!persisted) return;
                  setLoading(true);
                  setRefreshToken((current) => current + 1);
                }}
              />
            ) : null}
          </div>
        )}
      </div>
    </HororaAppShell>
  );
}

function PremiumDashboard({
  premium,
  serviceStatus,
  roleAudit,
}: {
  premium: HororaPremiumDashboard | null;
  serviceStatus: string | null;
  roleAudit: HororaRoleAuditEntry[] | null;
}) {
  const counts = premium?.roleCounts;
  return (
    <section className="tagora-panel" style={{ padding: 16, borderRadius: 14 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Tableau de bord
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Metric label="Appartenances actives" value={premium?.activeMemberships ?? "—"} />
        <Metric label="Suspendues" value={premium?.suspendedMemberships ?? "—"} />
        <Metric label="Invitées" value={premium?.invitedMemberships ?? "—"} />
        <Metric label="Invitations en attente" value={premium?.pendingInvitations ?? "—"} />
      </div>
      <p className="tagora-note" style={{ marginBottom: 0 }}>
        Répartition active : propriétaire {counts?.organization_owner ?? "—"}, administration
        d&apos;organisation {counts?.organization_admin ?? "—"}, direction {counts?.direction ?? "—"},
        employé {counts?.employe ?? "—"}. Une seule organisation est dans le périmètre de cette
        session. Les départements suivent les compagnies de cette organisation. Connexion NEXUS :{" "}
        {serviceStatus ?? "non lue"}, en lecture seule. Employé et Direction se modifient seulement
        pour une identité NEXUS active de cette organisation, par la fonction auditée. La
        suspension et la réactivation d&apos;un employé ou d&apos;une direction sont confirmées,
        auditées, et coupent les sessions de cette organisation. Les cases de paie et
        d&apos;administration s&apos;enregistrent par la fonction de permission. Un rôle système
        reste protégé. L&apos;étiquette d&apos;écran admin ne crée aucune permission.
      </p>
      <p className="tagora-note" style={{ marginBottom: 0 }}>
        Activité des rôles : {formatHororaRoleAuditActivity(roleAudit)}
      </p>
      <p className="tagora-note" style={{ marginBottom: 0 }}>
        Droits métier conservés : {HORORA_BUSINESS_PERMISSION_DOMAINS.join(", ")}. Domaines
        canoniques inchangés : {HORORA_CANONICAL_PERMISSION_DOMAINS.join(", ")}. Les rôles système{" "}
        {Object.entries(HORORA_ROLE_AUTHORITY)
          .filter(([, authority]) => authority.system)
          .map(([role]) => role)
          .join(" et ")}{" "}
        restent protégés. L&apos;étiquette d&apos;écran admin ne crée aucune permission.
      </p>
    </section>
  );
}

function RolePresetCatalogue() {
  const presets = listHororaRolePresets();
  return (
    <section className="tagora-panel" style={{ padding: 16, borderRadius: 14 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Rôles locaux
      </h2>
      <p className="tagora-note" style={{ marginTop: 0 }}>
        Pointage, horaires, rapports et administration suivent la matrice déjà en place. Une
        permission explicite reste séparée du rôle. Cet écran ne l&apos;enregistre pas.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {presets.map((preset) => (
          <div key={preset.role} className="tagora-panel-muted" style={{ padding: 10, borderRadius: 10 }}>
            <strong>{preset.label}</strong>
            <span className="tagora-note">
              {" "}
              · {preset.assignableHere ? "attribuable ici" : "protégé"}
            </span>
            <div className="tagora-note" style={{ marginBottom: 0 }}>
              {HORORA_BUSINESS_PERMISSION_DOMAINS.map((domain) => (
                <span key={domain}>
                  {HORORA_BUSINESS_PERMISSION_LABELS[domain]} :{" "}
                  {businessPermissionGrantLabel(preset.domains[domain])}
                  {domain === "administration" ? "" : " · "}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="tagora-panel-muted" style={{ padding: 10, borderRadius: 10 }}>
      <div className="tagora-note" style={{ margin: 0 }}>{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function directoryStatusLabel(
  status: HororaDirectoryUserRow["directoryStatus"],
  serviceStatus: string | null,
  projection: HororaDirectoryUserRow["identityProjection"]
) {
  if (projection === "local_link") {
    return "identité locale liée, annuaire distant non certifié";
  }
  if (projection === "certified_absent") return "absent de l'annuaire certifié";
  if (projection === "remote_denied" && status === "SUSPENDED") return "suspendu dans Nexus";
  if (projection === "remote_denied" && status === "REVOKED") return "révoqué dans Nexus";
  if (status === "ACTIVE") return "autorisé dans Nexus";
  if (status === "PENDING") return "en attente dans Nexus";
  if (status === "SUSPENDED") return "suspendu dans Nexus";
  if (status === "REVOKED") return "révoqué dans Nexus";
  if (serviceStatus === "service_unavailable") return "service Nexus indisponible";
  if (serviceStatus === "ready") return "absent de l'annuaire Nexus";
  return "annuaire Nexus non branché";
}

function PermissionPreview({
  row,
  scope,
  serviceStatus,
  rosterConfirmed,
  actorMembershipRole,
  actionMessage,
  onAssigned,
}: {
  row: HororaDirectoryUserRow;
  scope: HororaDirectoryScope | null;
  serviceStatus: string | null;
  rosterConfirmed: boolean;
  actorMembershipRole: OrganizationMembershipRole | null;
  actionMessage: string | null;
  onAssigned: (message: string, persisted: boolean) => void;
}) {
  const [nextRole, setNextRole] = useState<"employe" | "direction">(
    row.membershipRole === "direction" ? "direction" : "employe"
  );
  const [saving, setSaving] = useState(false);
  const binding = decideNexusAuthorizedLocalBinding({
    directoryReadable: rosterConfirmed,
    identityLinkCount: row.nexusUserId ? 1 : 0,
    nexusUserId: row.nexusUserId,
    directoryStatus: row.directoryStatus,
    entryOrganizationId: row.nexusUserId ? (scope?.organizationId ?? null) : null,
    scopeOrganizationId: scope?.organizationId ?? null,
    moduleKey: row.nexusUserId ? (scope?.moduleKey ?? null) : null,
    membershipRole: row.membershipRole,
    membershipStatus: row.membershipStatus,
    membershipAmbiguous: row.membershipAmbiguous,
  });
  const canEdit =
    binding.ok &&
    actorCanEditLocalPresetRoles(actorMembershipRole) &&
    (row.membershipRole === "employe" || row.membershipRole === "direction");
  const change =
    row.membershipRole === "employe" || row.membershipRole === "direction"
      ? describeLocalRoleChange({ currentRole: row.membershipRole, nextRole })
      : "unchanged";
  const rights =
    row.membershipRole === "employe" || row.membershipRole === "direction"
      ? describeHororaRoleRightsTransition({ currentRole: row.membershipRole, nextRole })
      : null;
  const nextPreset = listHororaRolePresets().find((preset) => preset.role === nextRole);

  async function assignRole() {
    if (!row.membershipId) return;
    setSaving(true);
    try {
      const res = await fetch(
        "/api/admin/utilisateurs/membership",
        hororaNexusSessionRequestInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ membershipId: row.membershipId, nextRole }),
        })
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
        rolePersisted?: boolean;
        unchanged?: boolean;
        jwtPermissions?: string;
        sessionRevocation?: string;
      };
      const persisted = res.ok && json.success === true && json.rolePersisted === true;
      onAssigned(
        persisted
          ? json.unchanged
            ? "Rôle inchangé."
            : `Rôle enregistré et audité.${json.sessionRevocation === "revoked" ? " Sessions révoquées." : ""}`
          : (json.error ?? "Le rôle n'a pas été modifié."),
        persisted
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(nextStatus: "active" | "suspended") {
    if (!row.membershipId) return;
    const confirmed =
      typeof window !== "undefined" &&
      window.confirm(
        nextStatus === "suspended"
          ? "Suspendre cet accès ? Les sessions HORORA de cette organisation seront révoquées."
          : "Réactiver cet accès avec le même rôle local ? Les anciennes sessions restent fermées."
      );
    if (!confirmed) return;
    setSaving(true);
    try {
      const res = await fetch(
        "/api/admin/utilisateurs/membership-status",
        hororaNexusSessionRequestInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            membershipId: row.membershipId,
            nextStatus,
            confirmed: true,
          }),
        })
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
        statusPersisted?: boolean;
      };
      const persisted = res.ok && json.success === true && json.statusPersisted === true;
      onAssigned(
        persisted
          ? nextStatus === "suspended"
            ? "Accès suspendu et audité. Les sessions de cette organisation sont révoquées."
            : "Accès réactivé et audité. Une nouvelle session est requise."
          : (json.error ?? "Le statut n'a pas été modifié."),
        persisted
      );
    } finally {
      setSaving(false);
    }
  }

  async function changePermission(sectionId: string, checked: boolean, sensitive: boolean) {
    if (!row.membershipId || !capabilityForPermissionSection(sectionId)) return;
    const confirmed =
      !sensitive ||
      (typeof window !== "undefined" &&
        window.confirm(
          checked
            ? "Accorder cette permission sensible pour cette organisation seulement ?"
            : "Retirer cette permission ? L'accès précédent échouera après révocation des sessions."
        ));
    if (!confirmed) return;
    setSaving(true);
    try {
      const res = await fetch(
        "/api/admin/utilisateurs/permissions",
        hororaNexusSessionRequestInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            membershipId: row.membershipId,
            sectionId,
            effect: checked ? "allow" : "deny",
            confirmed: true,
          }),
        })
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
        permissionPersisted?: boolean;
      };
      const persisted = res.ok && json.success === true && json.permissionPersisted === true;
      onAssigned(
        persisted
          ? "Permission enregistrée et auditée. Les sessions de cette organisation sont révoquées."
          : (json.error ?? "La permission n'a pas été modifiée."),
        persisted
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="tagora-panel" style={{ padding: 16, borderRadius: 14 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        {row.displayName}
      </h2>
      <p className="tagora-note" style={{ marginTop: 0 }}>
        {row.nexusUserId ?? "identité Nexus absente"} · organisation{" "}
        {scope?.organizationId ?? "non résolue"} · tenant {scope?.tenantId ?? "non résolu"} ·
        rôle {row.nexusRoleKey ?? row.membershipRole ?? "absent"} ·{" "}
        {directoryStatusLabel(row.directoryStatus, serviceStatus, row.identityProjection)}.
        {row.identityProjection === "local_link"
          ? " Cette liaison n'accorde ni accès Nexus ni permission métier."
          : ""}
        {row.identityProjection === "certified_absent"
          ? " Une absence d'annuaire certifié reste ABSENT et n'est pas une révocation."
          : ""}
        {serviceStatus === "service_unavailable"
          ? " L'indisponibilité du service n'est pas une révocation."
          : ""}
        {row.revocationEnforced ? " La session HORORA est révoquée." : ""}
      </p>
      <p className="tagora-note">
        Rôle local : {row.membershipRole ?? "absent"} · statut {row.membershipStatus ?? "absent"} ·
        écran {row.portalRole ?? "absent"}. L&apos;écran admin n&apos;accorde aucune permission.
      </p>
      {canEdit ? (
        <div className="ui-stack-xs">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              aria-label="Rôle local"
              value={nextRole}
              onChange={(event) =>
                setNextRole(event.target.value === "direction" ? "direction" : "employe")
              }
            >
              <option value="employe">Employé</option>
              <option value="direction">Direction</option>
            </select>
            <button type="button" disabled={saving || change === "unchanged"} onClick={() => void assignRole()}>
              {change === "remove_direction" ? "Retirer le rôle Direction" : "Enregistrer le rôle"}
            </button>
          </div>
          <p className="tagora-note" style={{ margin: 0 }}>
            {rights && change !== "unchanged"
              ? `Droits gagnés : ${formatHororaRoleRightList(rights.gained)}. Droits perdus : ${formatHororaRoleRightList(rights.lost)}.`
              : "Aucun droit ne change."}{" "}
            Le parcours avant est{" "}
            {rights ? formatHororaRoleRightList(rights.journeyBefore.rights) : "absent"}. Le
            parcours après est{" "}
            {rights ? formatHororaRoleRightList(rights.journeyAfter.rights) : "absent"}. Ce rôle
            n&apos;administre pas les rôles. Lorsqu&apos;il est enregistré, il est audité et les
            sessions HORORA de cet employé dans cette organisation sont révoquées. Un refus ne
            laisse aucune écriture.
          </p>
          {nextPreset ? (
            <p className="tagora-note" style={{ margin: 0 }}>
              {nextPreset.label} :{" "}
              {HORORA_BUSINESS_PERMISSION_DOMAINS.map(
                (domain) =>
                  `${HORORA_BUSINESS_PERMISSION_LABELS[domain]} ${businessPermissionGrantLabel(nextPreset.domains[domain])}`
              ).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="tagora-note">
          {binding.ok
            ? "Cette session ne peut pas modifier les rôles locaux."
            : nexusLocalBindingDenialMessage(binding.reason)}
        </p>
      )}
      {actorCanEditLocalPresetRoles(actorMembershipRole) &&
      (row.membershipRole === "employe" || row.membershipRole === "direction") ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={saving || row.membershipStatus === "suspended"}
            onClick={() => void changeStatus("suspended")}
          >
            Suspendre l&apos;accès
          </button>
          <button
            type="button"
            disabled={saving || row.membershipStatus !== "suspended"}
            onClick={() => void changeStatus("active")}
          >
            Réactiver l&apos;accès
          </button>
        </div>
      ) : null}
      {actionMessage ? <p className="tagora-note">{actionMessage}</p> : null}
      <p className="tagora-note">
        Les cases de paie et d&apos;administration s&apos;enregistrent après confirmation. Les
        autres cases restent en lecture. Un refus du serveur n&apos;écrit rien.
      </p>
      <div className="ui-stack-xs">
        {row.sections.map((section) => {
          const capability = capabilityForPermissionSection(section.id);
          return (
            <label
              key={section.id}
              style={{ display: "flex", gap: 10, alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={section.checked}
                disabled={!canEdit || !capability || saving}
                onChange={(event) =>
                  void changePermission(section.id, event.target.checked, section.sensitive)
                }
                aria-label={section.label}
              />
              <span>
                {section.label}
                {section.sensitive ? " · sensible" : ""} · {sectionMark(section)}
                {capability ? "" : " · lecture seule"}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
