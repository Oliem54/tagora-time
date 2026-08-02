"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
  canDissociatePortalEntry,
  matchesRegistryTab,
  type EmployeeAccountsRegistryEntry,
  type EmployeeAccountsRegistryTab,
} from "@/app/lib/employee-accounts-registry.shared";
import { supabase } from "@/app/lib/supabase/client";

const TAB_OPTIONS: Array<{
  value: EmployeeAccountsRegistryTab;
  label: string;
}> = [
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
  if (
    status === "Inactif (portail)" ||
    status === "Inactif (fiche)" ||
    status === "Refusé"
  ) {
    return "danger" as const;
  }
  if (status === "Conflit" || status === "Conflit (metadata)" || status === "Erreur") {
    return "warning" as const;
  }
  if (status === "Orphelin (portail)" || status === "Orphelin (fiche)") {
    return "warning" as const;
  }
  if (status === "Demande en attente" || status === "Invité") return "info" as const;
  return "default" as const;
}

function RegistrySummaryCell({ entry }: { entry: EmployeeAccountsRegistryEntry }) {
  const conflictCount = entry.conflictIndicators.length;

  return (
    <div className="employee-accounts-registry-summary">
      <span
        className={`employee-accounts-registry-summary-chip${
          entry.employeeProfileActive === true
            ? " employee-accounts-registry-summary-chip--ok"
            : entry.employeeProfileActive === false
              ? " employee-accounts-registry-summary-chip--off"
              : ""
        }`}
      >
        Fiche {boolLabel(entry.employeeProfileActive)}
      </span>
      <span
        className={`employee-accounts-registry-summary-chip${
          entry.authLinked
            ? " employee-accounts-registry-summary-chip--ok"
            : entry.accessDisabled
              ? " employee-accounts-registry-summary-chip--off"
              : ""
        }`}
      >
        Portail {entry.authLinked ? "lié" : entry.accessDisabled ? "inactif" : "non lié"}
      </span>
      {entry.hasAccountRequest ? (
        <span className="employee-accounts-registry-summary-chip">Demande</span>
      ) : null}
      {conflictCount > 0 ? (
        <span className="employee-accounts-registry-summary-chip employee-accounts-registry-summary-chip--alert">
          <AlertTriangle size={12} aria-hidden />
          {conflictCount} alerte{conflictCount > 1 ? "s" : ""}
        </span>
      ) : null}
    </div>
  );
}

function RegistryDiagnosticPanel({
  entry,
  onClose,
  onDissociate,
  dissociating,
}: {
  entry: EmployeeAccountsRegistryEntry;
  onClose: () => void;
  onDissociate?: () => void;
  dissociating?: boolean;
}) {
  const diagnostic = entry.diagnostic;
  const showDissociate = canDissociatePortalEntry(entry) && onDissociate;

  return (
    <div className="employee-accounts-registry-diagnostic-panel" role="region" aria-label="Détail du compte employé">
      <div className="employee-accounts-registry-diagnostic-panel__head">
        <div>
          <h2 className="employee-accounts-registry-diagnostic-panel__title">
            {entry.displayName}
          </h2>
          <p className="employee-accounts-registry-diagnostic-panel__subtitle">
            {entry.email ?? "Courriel non disponible"}
          </p>
        </div>
        <button
          type="button"
          className="employee-accounts-registry-action-btn employee-accounts-registry-action-btn--ghost"
          onClick={onClose}
        >
          Fermer
        </button>
      </div>

      <div className="employee-accounts-registry-diagnostic-highlights">
        <StatusBadge
          label={entry.derivedStatus}
          tone={getDerivedStatusTone(entry.derivedStatus)}
        />
        <span className="employee-accounts-registry-diagnostic-highlights__meta">
          Fiche {boolLabel(entry.employeeProfileActive)} · Portail {boolLabel(entry.authLinked)}
        </span>
      </div>

      <dl className="employee-accounts-registry-diagnostic-grid employee-accounts-registry-diagnostic-grid--compact">
        <div>
          <dt>Demande compte</dt>
          <dd>{diagnostic.accountRequestStatus ?? "Aucune"}</dd>
        </div>
        <div>
          <dt>Portail inactif</dt>
          <dd>{boolLabel(diagnostic.accessDisabled)}</dd>
        </div>
        <div>
          <dt>Fiche employé inactive</dt>
          <dd>{boolLabel(diagnostic.employeeProfileInactive)}</dd>
        </div>
        <div>
          <dt>Portail sans fiche</dt>
          <dd>{boolLabel(diagnostic.authUserWithoutChauffeur)}</dd>
        </div>
        <div>
          <dt>Fiche sans portail</dt>
          <dd>{boolLabel(diagnostic.chauffeurWithoutAuthUser)}</dd>
        </div>
        <div>
          <dt>Lien obsolète</dt>
          <dd>{boolLabel(diagnostic.staleChauffeurMetadata)}</dd>
        </div>
        <div>
          <dt>Courriel divergent</dt>
          <dd>{boolLabel(diagnostic.emailDivergent)}</dd>
        </div>
        <div>
          <dt>Téléphone divergent</dt>
          <dd>{boolLabel(diagnostic.phoneDivergent)}</dd>
        </div>
      </dl>

      {diagnostic.inconsistencies.length > 0 ? (
        <div className="employee-accounts-registry-diagnostic-conflicts">
          <h3>Incohérences détectées</h3>
          <ul>
            {diagnostic.inconsistencies.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="tagora-note employee-accounts-registry-diagnostic-empty">
          Aucune incohérence détectée pour cette entrée.
        </p>
      )}

      <div className="employee-accounts-registry-diagnostic-links">
        {showDissociate ? (
          <button
            type="button"
            className="employee-accounts-registry-action-btn employee-accounts-registry-action-btn--danger"
            onClick={onDissociate}
            disabled={dissociating}
          >
            {dissociating ? "Dissociation…" : "Dissocier le portail"}
          </button>
        ) : null}
        {entry.chauffeurId ? (
          <Link
            href={`/direction/ressources/employes/${entry.chauffeurId}`}
            className="employee-accounts-registry-action-btn employee-accounts-registry-action-btn--secondary"
          >
            <ExternalLink size={14} aria-hidden />
            Ouvrir fiche employé
          </Link>
        ) : null}
        {entry.accountRequestId ? (
          <Link
            href="/direction/demandes-comptes"
            className="employee-accounts-registry-action-btn employee-accounts-registry-action-btn--secondary"
          >
            <ExternalLink size={14} aria-hidden />
            Ouvrir demandes de comptes
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function RegistryMobileField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="account-requests-mobile-card__field">
      <span className="account-requests-mobile-card__field-label">{label}</span>
      <div className="account-requests-mobile-card__field-value">{children}</div>
    </div>
  );
}

function RegistryFilterBar({
  activeTab,
  tabCounts,
  onSelect,
}: {
  activeTab: EmployeeAccountsRegistryTab;
  tabCounts: Record<EmployeeAccountsRegistryTab, number>;
  onSelect: (tab: EmployeeAccountsRegistryTab) => void;
}) {
  return (
    <div className="accounts-premium-filter-bar" role="tablist" aria-label="Filtrer le registre">
      {TAB_OPTIONS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.value}
          className={`accounts-premium-filter-chip${
            activeTab === tab.value ? " accounts-premium-filter-chip--active" : ""
          }`}
          onClick={() => onSelect(tab.value)}
        >
          <span>{tab.label}</span>
          <span className="accounts-premium-filter-chip__count">{tabCounts[tab.value]}</span>
        </button>
      ))}
    </div>
  );
}

function RegistryRowActions({
  entry,
  isExpanded,
  onToggleDiagnostic,
  onDissociate,
  dissociating,
  layout = "table",
}: {
  entry: EmployeeAccountsRegistryEntry;
  isExpanded: boolean;
  onToggleDiagnostic: () => void;
  onDissociate?: () => void;
  dissociating?: boolean;
  layout?: "table" | "mobile";
}) {
  const hasFicheLink = Boolean(entry.chauffeurId);
  const hasDemandeLink = Boolean(entry.accountRequestId);
  const isMobile = layout === "mobile";
  const showDissociate = canDissociatePortalEntry(entry) && onDissociate;

  if (!isMobile) {
    return (
      <div className="employee-accounts-registry-actions employee-accounts-registry-actions--table">
        <button
          type="button"
          className={`employee-accounts-registry-action-btn employee-accounts-registry-action-btn--compact${
            isExpanded
              ? " employee-accounts-registry-action-btn--primary"
              : " employee-accounts-registry-action-btn--secondary"
          }`}
          onClick={onToggleDiagnostic}
          aria-expanded={isExpanded}
        >
          {isExpanded ? "Masquer" : "Détail"}
        </button>
      </div>
    );
  }

  return (
    <div className="employee-accounts-registry-actions employee-accounts-registry-actions--mobile">
      <button
        type="button"
        className={`employee-accounts-registry-action-btn employee-accounts-registry-action-btn--compact${
          isExpanded
            ? " employee-accounts-registry-action-btn--primary"
            : " employee-accounts-registry-action-btn--secondary"
        }`}
        onClick={onToggleDiagnostic}
        aria-expanded={isExpanded}
      >
        {isExpanded ? "Masquer" : "Détail"}
      </button>

      {showDissociate ? (
        <button
          type="button"
          className="employee-accounts-registry-action-btn employee-accounts-registry-action-btn--compact employee-accounts-registry-action-btn--danger-subtle"
          onClick={onDissociate}
          disabled={dissociating}
        >
          {dissociating ? "Dissociation…" : "Dissocier"}
        </button>
      ) : null}

      {hasFicheLink ? (
        <Link
          href={`/direction/ressources/employes/${entry.chauffeurId}`}
          className="employee-accounts-registry-action-btn employee-accounts-registry-action-btn--compact employee-accounts-registry-action-btn--link"
        >
          Fiche
        </Link>
      ) : null}

      {hasDemandeLink ? (
        <Link
          href="/direction/demandes-comptes"
          className="employee-accounts-registry-action-btn employee-accounts-registry-action-btn--compact employee-accounts-registry-action-btn--link"
        >
          Demande
        </Link>
      ) : null}
    </div>
  );
}

function RegistryEntryMobileCard({
  entry,
  isExpanded,
  onToggleDiagnostic,
  onDissociate,
  dissociating,
}: {
  entry: EmployeeAccountsRegistryEntry;
  isExpanded: boolean;
  onToggleDiagnostic: () => void;
  onDissociate?: () => void;
  dissociating?: boolean;
}) {
  return (
    <article className="account-requests-mobile-card">
      <header className="account-requests-mobile-card__head">
        <h3 className="account-requests-mobile-card__name">{entry.displayName}</h3>
        <StatusBadge
          label={entry.derivedStatus}
          tone={getDerivedStatusTone(entry.derivedStatus)}
        />
      </header>

      <div className="account-requests-mobile-card__fields employee-accounts-registry-mobile-summary">
        <RegistryMobileField label="Courriel">{entry.email ?? "—"}</RegistryMobileField>
        <RegistryMobileField label="Synthèse">
          <RegistrySummaryCell entry={entry} />
        </RegistryMobileField>
      </div>

      <div className="account-requests-mobile-actions">
        <RegistryRowActions
          entry={entry}
          isExpanded={isExpanded}
          onToggleDiagnostic={onToggleDiagnostic}
          onDissociate={onDissociate}
          dissociating={dissociating}
          layout="mobile"
        />
      </div>

      {isExpanded ? (
        <div
          id={`registry-diagnostic-${entry.registryKey}`}
          className="employee-accounts-registry-mobile-diagnostic"
        >
          <RegistryDiagnosticPanel
            entry={entry}
            onClose={onToggleDiagnostic}
            onDissociate={onDissociate}
            dissociating={dissociating}
          />
        </div>
      ) : null}
    </article>
  );
}

function RegistryEntryRows({
  filteredEntries,
  diagnosticEntryKey,
  toggleDiagnostic,
  onDissociate,
  dissociatingKey,
}: {
  filteredEntries: EmployeeAccountsRegistryEntry[];
  diagnosticEntryKey: string | null;
  toggleDiagnostic: (registryKey: string) => void;
  onDissociate: (entry: EmployeeAccountsRegistryEntry) => void;
  dissociatingKey: string | null;
}) {
  return (
    <>
      <div className="account-requests-premium-table-wrap account-requests-premium-table-wrap--desktop">
        <table className="account-requests-premium-table account-requests-premium-table--registry account-requests-premium-table--registry-lite">
          <colgroup>
            <col style={{ width: "34%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "34%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Employé</th>
              <th>Statut</th>
              <th>Synthèse</th>
              <th className="employee-accounts-registry-cell--center employee-accounts-registry-cell--actions">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((entry) => {
              const isExpanded = diagnosticEntryKey === entry.registryKey;

              return (
                <Fragment key={entry.registryKey}>
                  <tr
                    className={
                      isExpanded ? "employee-accounts-registry-row--selected" : undefined
                    }
                  >
                    <td>
                      <div className="account-requests-requester">
                        <div className="account-requests-requester-name">{entry.displayName}</div>
                        <div className="account-requests-requester-meta">
                          {entry.email ?? "—"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge
                        label={entry.derivedStatus}
                        tone={getDerivedStatusTone(entry.derivedStatus)}
                      />
                    </td>
                    <td>
                      <RegistrySummaryCell entry={entry} />
                    </td>
                    <td className="employee-accounts-registry-cell--center employee-accounts-registry-cell--actions">
                      <RegistryRowActions
                        entry={entry}
                        isExpanded={isExpanded}
                        onToggleDiagnostic={() => toggleDiagnostic(entry.registryKey)}
                        onDissociate={() => onDissociate(entry)}
                        dissociating={dissociatingKey === entry.registryKey}
                      />
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr
                      id={`registry-diagnostic-${entry.registryKey}`}
                      className="employee-accounts-registry-diagnostic-row"
                    >
                      <td colSpan={4}>
                        <RegistryDiagnosticPanel
                          entry={entry}
                          onClose={() => toggleDiagnostic(entry.registryKey)}
                          onDissociate={() => onDissociate(entry)}
                          dissociating={dissociatingKey === entry.registryKey}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="account-requests-mobile-list" aria-label="Liste du registre comptes employés">
        {filteredEntries.map((entry) => (
          <RegistryEntryMobileCard
            key={entry.registryKey}
            entry={entry}
            isExpanded={diagnosticEntryKey === entry.registryKey}
            onToggleDiagnostic={() => toggleDiagnostic(entry.registryKey)}
            onDissociate={() => onDissociate(entry)}
            dissociating={dissociatingKey === entry.registryKey}
          />
        ))}
      </div>
    </>
  );
}

export default function EmployeeAccountsRegistryClient() {
  const { user, role, loading: accessLoading } = useCurrentAccess();
  const canView = role === "direction" || role === "admin";
  const [entries, setEntries] = useState<EmployeeAccountsRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [fetchAttempted, setFetchAttempted] = useState(false);
  const [activeTab, setActiveTab] = useState<EmployeeAccountsRegistryTab>("active");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [diagnosticEntryKey, setDiagnosticEntryKey] = useState<string | null>(null);
  const [dissociatingKey, setDissociatingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setAccessToken(data.session?.access_token ?? null);
        setSessionReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchRegistry = useCallback(async () => {
    if (accessLoading || !sessionReady) {
      return;
    }

    if (!canView) {
      setFetchAttempted(true);
      setLoading(false);
      return;
    }

    if (!accessToken) {
      setFetchAttempted(true);
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
      setFetchAttempted(true);
      setLoading(false);
    }
  }, [accessLoading, accessToken, canView, sessionReady]);

  useEffect(() => {
    void fetchRegistry();
  }, [fetchRegistry]);

  useEffect(() => {
    if (!diagnosticEntryKey) {
      return;
    }

    const row = document.getElementById(`registry-diagnostic-${diagnosticEntryKey}`);
    row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [diagnosticEntryKey]);

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

  const toggleDiagnostic = useCallback((registryKey: string) => {
    setDiagnosticEntryKey((current) => (current === registryKey ? null : registryKey));
  }, []);

  const handleDissociatePortal = useCallback(
    async (entry: EmployeeAccountsRegistryEntry) => {
      if (!accessToken || !canDissociatePortalEntry(entry)) {
        return;
      }

      const employeeLabel = entry.displayName.trim() || "Employé";
      const emailLabel = entry.email?.trim() || "courriel non disponible";
      const confirmed = window.confirm(
        `Dissocier le portail pour ${employeeLabel} (${emailLabel}) ?\n\n` +
          "Le lien entre la fiche employé et le compte portail sera retiré. " +
          "Le compte utilisateur Auth ne sera pas supprimé. La fiche employé sera conservée."
      );

      if (!confirmed) {
        return;
      }

      setDissociatingKey(entry.registryKey);
      setMessage("");
      setMessageType(null);

      try {
        const response = await fetch("/api/direction/comptes-employes/dissociate-portal", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-account-requests-client": "browser-authenticated",
          },
          body: JSON.stringify({
            chauffeurId: entry.chauffeurId,
            authUserId: entry.authUserId,
          }),
        });

        const payload = (await response.json()) as {
          success?: boolean;
          message?: string;
          error?: string;
        };

        if (!response.ok || !payload.success) {
          setMessage(payload.error ?? "Impossible de dissocier le portail.");
          setMessageType("error");
          return;
        }

        setMessage(
          payload.message ??
            "Le portail a été dissocié. La fiche employé existe toujours. Le compte utilisateur n'a pas été supprimé."
        );
        setMessageType("success");
        setDiagnosticEntryKey(null);
        await fetchRegistry();
      } catch {
        setMessage("Impossible de dissocier le portail pour le moment.");
        setMessageType("error");
      } finally {
        setDissociatingKey(null);
      }
    },
    [accessToken, fetchRegistry]
  );

  const sessionOrAccessLoading = accessLoading || !sessionReady;
  const registryLoading = sessionOrAccessLoading || loading;
  const showEmptyState = fetchAttempted && !registryLoading && filteredEntries.length === 0;

  if (sessionOrAccessLoading) {
    return (
      <main className="tagora-app-shell account-requests-page employee-accounts-registry-page">
        <div className="tagora-app-content">
          <p className="tagora-note">Chargement de la session…</p>
        </div>
      </main>
    );
  }

  if (!canView) {
    return (
      <main className="tagora-app-shell account-requests-page employee-accounts-registry-page">
        <div className="tagora-app-content">
          <p className="tagora-note">Accès réservé à la direction et aux administrateurs.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell account-requests-page employee-accounts-registry-page">
      <div className="tagora-app-content account-requests-premium-layout account-requests-premium-layout--2027">
        <section className="account-requests-premium-hero employee-accounts-registry-hero accounts-premium-hero--lite">
          <div className="account-requests-premium-logo-card employee-accounts-registry-logo-card">
            <Image
              src="/logo.png"
              alt="Logo TAGORA"
              width={140}
              height={70}
              priority
              className="account-requests-premium-logo"
            />
          </div>

          <div className="account-requests-premium-hero-copy">
            <h1 className="account-requests-premium-title">Comptes employés</h1>
            <p className="account-requests-premium-description">
              Vue d&apos;ensemble des accès portail et des fiches employés.
            </p>
          </div>

          <div className="account-requests-premium-hero-actions accounts-premium-hero-actions--compact">
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

        <RegistryFilterBar
          activeTab={activeTab}
          tabCounts={tabCounts}
          onSelect={setActiveTab}
        />

        <FeedbackMessage message={message} type={messageType} />

        <section className="account-requests-premium-shell employee-accounts-registry-shell accounts-premium-shell--lite">
          <div className="employee-accounts-registry-toolbar accounts-premium-toolbar--lite">
            <label className="tagora-field employee-accounts-registry-search">
              <span className="tagora-label">Rechercher</span>
              <div className="employee-accounts-registry-search__field">
                <Search size={14} aria-hidden />
                <input
                  className="tagora-input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nom, courriel, statut…"
                />
              </div>
            </label>

            <button
              type="button"
              className="employee-accounts-registry-action-btn employee-accounts-registry-action-btn--secondary"
              onClick={() => void fetchRegistry()}
              disabled={registryLoading}
            >
              {registryLoading ? "Actualisation…" : "Actualiser"}
            </button>
          </div>

          {registryLoading ? (
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Chargement du registre…
              </p>
            </div>
          ) : showEmptyState ? (
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Aucune entrée ne correspond à cet onglet.
              </p>
            </div>
          ) : (
            <RegistryEntryRows
              filteredEntries={filteredEntries}
              diagnosticEntryKey={diagnosticEntryKey}
              toggleDiagnostic={toggleDiagnostic}
              onDissociate={(entry) => void handleDissociatePortal(entry)}
              dissociatingKey={dissociatingKey}
            />
          )}
        </section>

        <p className="tagora-note employee-accounts-registry-footnote">
          <Users size={14} aria-hidden />
          Fiche employé et compte portail restent distincts. Ouvrez le détail pour les actions
          avancées.
        </p>
      </div>
    </main>
  );
}
