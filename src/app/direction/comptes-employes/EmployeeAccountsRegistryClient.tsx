"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Search,
  Users,
} from "lucide-react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import StatusBadge from "@/app/components/ui/StatusBadge";
import UserIdentityBadge from "@/app/components/ui/UserIdentityBadge";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  matchesRegistryTab,
  type EmployeeAccountsRegistryEntry,
  type EmployeeAccountsRegistryTab,
} from "@/app/lib/employee-accounts-registry.shared";
import { supabase } from "@/app/lib/supabase/client";

const TAB_OPTIONS: Array<{ value: EmployeeAccountsRegistryTab; label: string }> = [
  { value: "active", label: "Actifs" },
  { value: "pending", label: "En attente" },
  { value: "archived", label: "Archivés" },
  { value: "orphan", label: "Orphelins" },
  { value: "conflict", label: "Conflits" },
];

function boolLabel(value: boolean | null | undefined) {
  if (value === true) return "Oui";
  if (value === false) return "Non";
  return "—";
}

function getDerivedStatusTone(status: string) {
  if (status === "Actif") return "success" as const;
  if (status === "Accès désactivé" || status === "Refusé") return "danger" as const;
  if (status === "Conflit" || status === "Erreur") return "warning" as const;
  if (status === "Orphelin auth" || status === "Orphelin fiche") return "warning" as const;
  if (status === "En attente" || status === "Invité") return "info" as const;
  return "default" as const;
}

function RegistryDiagnosticPanel({
  entry,
  onClose,
}: {
  entry: EmployeeAccountsRegistryEntry;
  onClose: () => void;
}) {
  const diagnostic = entry.diagnostic;

  return (
    <div
      className="tagora-panel"
      style={{ marginTop: 16, padding: 16 }}
      role="dialog"
      aria-label="Diagnostic compte employé"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Diagnostic — {entry.displayName}</h2>
          <p className="tagora-note" style={{ margin: "6px 0 0" }}>
            {entry.email ?? "Courriel non disponible"}
          </p>
        </div>
        <button type="button" className="account-requests-toolbar-button" onClick={onClose}>
          Fermer
        </button>
      </div>

      <dl
        style={{
          marginBottom: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        <div>
          <dt style={{ fontWeight: 600, fontSize: 12 }}>Statut dérivé</dt>
          <dd style={{ margin: "4px 0 0" }}>{entry.derivedStatus}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 600, fontSize: 12 }}>Demande compte</dt>
          <dd style={{ margin: "4px 0 0" }}>{diagnostic.accountRequestStatus ?? "Aucune"}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 600, fontSize: 12 }}>Accès désactivé</dt>
          <dd style={{ margin: "4px 0 0" }}>{boolLabel(diagnostic.accessDisabled)}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 600, fontSize: 12 }}>Fiche RH inactive</dt>
          <dd style={{ margin: "4px 0 0" }}>{boolLabel(diagnostic.employeeProfileInactive)}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 600, fontSize: 12 }}>Auth sans chauffeur</dt>
          <dd style={{ margin: "4px 0 0" }}>{boolLabel(diagnostic.authUserWithoutChauffeur)}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 600, fontSize: 12 }}>Chauffeur sans auth</dt>
          <dd style={{ margin: "4px 0 0" }}>{boolLabel(diagnostic.chauffeurWithoutAuthUser)}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 600, fontSize: 12 }}>Courriel divergent</dt>
          <dd style={{ margin: "4px 0 0" }}>{boolLabel(diagnostic.emailDivergent)}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 600, fontSize: 12 }}>Téléphone divergent</dt>
          <dd style={{ margin: "4px 0 0" }}>{boolLabel(diagnostic.phoneDivergent)}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 600, fontSize: 12 }}>MFA (phase future)</dt>
          <dd style={{ margin: "4px 0 0" }}>{diagnostic.futureMfaStatus}</dd>
        </div>
      </dl>

      {diagnostic.inconsistencies.length > 0 ? (
        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Incohérences détectées</h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {diagnostic.inconsistencies.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="tagora-note" style={{ margin: 0 }}>
          Aucune incohérence détectée pour cette entrée.
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {entry.chauffeurId ? (
          <Link
            href={`/direction/ressources/employes/${entry.chauffeurId}`}
            className="account-requests-toolbar-button"
          >
            <ExternalLink size={14} />
            Ouvrir fiche employé
          </Link>
        ) : null}
        {entry.accountRequestId ? (
          <Link href="/direction/demandes-comptes" className="account-requests-toolbar-button">
            <ExternalLink size={14} />
            Ouvrir demandes de comptes
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function EmployeeAccountsRegistryClient() {
  const { user, role } = useCurrentAccess();
  const canView = role === "direction" || role === "admin";
  const [entries, setEntries] = useState<EmployeeAccountsRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EmployeeAccountsRegistryTab>("active");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [diagnosticEntryKey, setDiagnosticEntryKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setAccessToken(data.session?.access_token ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchRegistry = useCallback(async () => {
    if (!accessToken || !canView) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/direction/comptes-employes/registry", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-account-requests-client": "browser-authenticated",
          "Cache-Control": "no-store",
        },
      });

      const payload = (await response.json()) as {
        entries?: EmployeeAccountsRegistryEntry[];
        error?: string;
      };

      if (!response.ok) {
        setEntries([]);
        setMessage(payload.error ?? "Impossible de charger le registre.");
        setMessageType("error");
        return;
      }

      setEntries(Array.isArray(payload.entries) ? payload.entries : []);
      setMessage("");
      setMessageType(null);
    } catch {
      setEntries([]);
      setMessage("Impossible de charger le registre pour le moment.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, [accessToken, canView]);

  useEffect(() => {
    void fetchRegistry();
  }, [fetchRegistry]);

  const tabCounts = useMemo(() => {
    const counts: Record<EmployeeAccountsRegistryTab, number> = {
      active: 0,
      pending: 0,
      archived: 0,
      orphan: 0,
      conflict: 0,
    };

    for (const entry of entries) {
      for (const tab of TAB_OPTIONS) {
        if (matchesRegistryTab(entry, tab.value)) {
          counts[tab.value] += 1;
        }
      }
    }

    return counts;
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return entries.filter((entry) => {
      if (!matchesRegistryTab(entry, activeTab)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        entry.displayName.toLowerCase().includes(query) ||
        (entry.email ?? "").toLowerCase().includes(query) ||
        entry.derivedStatus.toLowerCase().includes(query)
      );
    });
  }, [activeTab, entries, search]);

  const diagnosticEntry = useMemo(
    () => entries.find((entry) => entry.registryKey === diagnosticEntryKey) ?? null,
    [diagnosticEntryKey, entries]
  );

  if (!canView) {
    return (
      <main className="tagora-app-shell account-requests-page">
        <div className="tagora-app-content">
          <p className="tagora-note">Accès réservé à la direction et aux administrateurs.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell account-requests-page">
      <div className="tagora-app-content account-requests-premium-layout">
        <section className="account-requests-premium-hero">
          <div className="account-requests-premium-logo-card">
            <Image
              src="/logo.png"
              alt="Logo TAGORA"
              width={220}
              height={110}
              priority
              className="account-requests-premium-logo"
            />
          </div>

          <div className="account-requests-premium-hero-copy">
            <h1 className="account-requests-premium-title">Comptes employés</h1>
            <p className="account-requests-premium-description">
              Registre global des accès portail, fiches employés et diagnostics
            </p>
          </div>

          <div className="account-requests-premium-hero-actions">
            {user?.email ? (
              <UserIdentityBadge
                value={user.email}
                roleLabel={
                  role === "admin" ? "Admin" : role === "direction" ? "Direction" : null
                }
              />
            ) : null}
            <Link
              href="/direction/demandes-comptes"
              className="account-requests-hero-button account-requests-hero-button-secondary"
            >
              Demandes de comptes
            </Link>
            <Link
              href="/direction/ressources/employes"
              className="account-requests-hero-button account-requests-hero-button-secondary"
            >
              Fiches employés
            </Link>
            <Link href="/direction/dashboard" className="account-requests-hero-button account-requests-hero-button-light">
              <ArrowLeft size={14} />
              Retour
            </Link>
          </div>
        </section>

        <FeedbackMessage message={message} type={messageType} />

        <section className="account-requests-premium-shell">
          <div
            className="account-requests-premium-toolbar"
            style={{ flexWrap: "wrap", gap: 8 }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TAB_OPTIONS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className="account-requests-toolbar-button"
                  style={
                    activeTab === tab.value
                      ? { borderColor: "#0f2948", background: "#eef4fb" }
                      : undefined
                  }
                  onClick={() => setActiveTab(tab.value)}
                >
                  {tab.label} ({tabCounts[tab.value]})
                </button>
              ))}
            </div>

            <label className="tagora-field" style={{ marginBottom: 0, minWidth: 220 }}>
              <span className="tagora-label">Rechercher</span>
              <div style={{ position: "relative" }}>
                <Search
                  size={14}
                  style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
                  aria-hidden
                />
                <input
                  className="tagora-input"
                  style={{ paddingLeft: 32 }}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nom, courriel, statut…"
                />
              </div>
            </label>

            <button
              type="button"
              className="account-requests-toolbar-button"
              onClick={() => void fetchRegistry()}
              disabled={loading}
            >
              {loading ? "Actualisation…" : "Actualiser"}
            </button>
          </div>

          {loading ? (
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Chargement du registre…
              </p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Aucune entrée ne correspond à cet onglet.
              </p>
            </div>
          ) : (
            <div className="account-requests-premium-table-wrap account-requests-premium-table-wrap--desktop">
              <table className="account-requests-premium-table">
                <thead>
                  <tr>
                    <th>Employé / courriel</th>
                    <th>Statut dérivé</th>
                    <th>Fiche RH active</th>
                    <th>Auth lié</th>
                    <th>Demande compte</th>
                    <th>Accès désactivé</th>
                    <th>Tél. fiche</th>
                    <th>Conflits</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => (
                    <tr key={entry.registryKey}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{entry.displayName}</div>
                        <div className="tagora-note">{entry.email ?? "—"}</div>
                      </td>
                      <td>
                        <StatusBadge
                          label={entry.derivedStatus}
                          tone={getDerivedStatusTone(entry.derivedStatus)}
                        />
                      </td>
                      <td>{boolLabel(entry.employeeProfileActive)}</td>
                      <td>{boolLabel(entry.authLinked)}</td>
                      <td>{boolLabel(entry.hasAccountRequest)}</td>
                      <td>{boolLabel(entry.accessDisabled)}</td>
                      <td>{boolLabel(entry.profilePhonePresent)}</td>
                      <td>
                        {entry.conflictIndicators.length > 0 ? (
                          <span title={entry.conflictIndicators.join(" · ")}>
                            <AlertTriangle size={16} aria-hidden /> {entry.conflictIndicators.length}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <button
                            type="button"
                            className="account-requests-toolbar-button"
                            onClick={() => setDiagnosticEntryKey(entry.registryKey)}
                          >
                            Voir diagnostic
                          </button>
                          {entry.chauffeurId ? (
                            <Link
                              href={`/direction/ressources/employes/${entry.chauffeurId}`}
                              className="account-requests-toolbar-button"
                            >
                              Fiche employé
                            </Link>
                          ) : null}
                          {entry.accountRequestId ? (
                            <Link
                              href="/direction/demandes-comptes"
                              className="account-requests-toolbar-button"
                            >
                              Demande compte
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {diagnosticEntry ? (
            <RegistryDiagnosticPanel
              entry={diagnosticEntry}
              onClose={() => setDiagnosticEntryKey(null)}
            />
          ) : null}
        </section>

        <p className="tagora-note" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Users size={14} aria-hidden />
          Phase 1 — lecture seule. Aucune action destructive sur cette page.
        </p>
      </div>
    </main>
  );
}
