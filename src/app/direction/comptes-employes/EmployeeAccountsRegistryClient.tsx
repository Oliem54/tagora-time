"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  Search,
  UserCheck,
  UserRound,
  UserX,
  Users,
} from "lucide-react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import TagoraStatCard from "@/app/components/TagoraStatCard";
import type { TagoraStatTone } from "@/app/components/tagora-stat-tone";
import StatusBadge from "@/app/components/ui/StatusBadge";
import UserIdentityBadge from "@/app/components/ui/UserIdentityBadge";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  matchesRegistryTab,
  type EmployeeAccountsRegistryEntry,
  type EmployeeAccountsRegistryTab,
} from "@/app/lib/employee-accounts-registry.shared";
import { supabase } from "@/app/lib/supabase/client";

const TAB_OPTIONS: Array<{
  value: EmployeeAccountsRegistryTab;
  label: string;
  tone: TagoraStatTone;
}> = [
  { value: "active", label: "Actifs", tone: "green" },
  { value: "pending", label: "En attente", tone: "blue" },
  { value: "archived", label: "Archivés", tone: "slate" },
  { value: "orphan", label: "Orphelins", tone: "orange" },
  { value: "conflict", label: "Conflits", tone: "red" },
];

const TAB_ICONS: Record<EmployeeAccountsRegistryTab, ReactNode> = {
  active: <UserCheck strokeWidth={1.9} aria-hidden />,
  pending: <Clock3 strokeWidth={1.9} aria-hidden />,
  archived: <Archive strokeWidth={1.9} aria-hidden />,
  orphan: <UserX strokeWidth={1.9} aria-hidden />,
  conflict: <AlertTriangle strokeWidth={1.9} aria-hidden />,
};

function boolLabel(value: boolean | null | undefined) {
  if (value === true) return "Oui";
  if (value === false) return "Non";
  return "—";
}

function BoolCell({ value }: { value: boolean | null | undefined }) {
  const label = boolLabel(value);
  const tone =
    value === true ? "employee-accounts-registry-bool--yes" : value === false ? "employee-accounts-registry-bool--no" : "employee-accounts-registry-bool--na";

  return (
    <span className={`employee-accounts-registry-bool ${tone}`} aria-label={label}>
      {label}
    </span>
  );
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
    <div className="employee-accounts-registry-diagnostic-panel" role="region" aria-label="Diagnostic compte employé">
      <div className="employee-accounts-registry-diagnostic-panel__head">
        <div>
          <h2 className="employee-accounts-registry-diagnostic-panel__title">
            Diagnostic — {entry.displayName}
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

      <dl className="employee-accounts-registry-diagnostic-grid">
        <div>
          <dt>Statut dérivé</dt>
          <dd>{entry.derivedStatus}</dd>
        </div>
        <div>
          <dt>Courriel</dt>
          <dd>{entry.email ?? "—"}</dd>
        </div>
        <div>
          <dt>Fiche RH active</dt>
          <dd>{boolLabel(entry.employeeProfileActive)}</dd>
        </div>
        <div>
          <dt>Auth lié</dt>
          <dd>{boolLabel(entry.authLinked)}</dd>
        </div>
        <div>
          <dt>Demande compte</dt>
          <dd>{diagnostic.accountRequestStatus ?? "Aucune"}</dd>
        </div>
        <div>
          <dt>Accès désactivé</dt>
          <dd>{boolLabel(diagnostic.accessDisabled)}</dd>
        </div>
        <div>
          <dt>Fiche RH inactive</dt>
          <dd>{boolLabel(diagnostic.employeeProfileInactive)}</dd>
        </div>
        <div>
          <dt>Auth sans chauffeur</dt>
          <dd>{boolLabel(diagnostic.authUserWithoutChauffeur)}</dd>
        </div>
        <div>
          <dt>Metadata chauffeur obsolète</dt>
          <dd>{boolLabel(diagnostic.staleChauffeurMetadata)}</dd>
        </div>
        <div>
          <dt>Chauffeur sans auth</dt>
          <dd>{boolLabel(diagnostic.chauffeurWithoutAuthUser)}</dd>
        </div>
        <div>
          <dt>Courriel divergent</dt>
          <dd>{boolLabel(diagnostic.emailDivergent)}</dd>
        </div>
        <div>
          <dt>Téléphone divergent</dt>
          <dd>{boolLabel(diagnostic.phoneDivergent)}</dd>
        </div>
        <div>
          <dt>MFA (phase future)</dt>
          <dd>{diagnostic.futureMfaStatus}</dd>
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

const TAB_LABELS: Record<EmployeeAccountsRegistryTab, string> = {
  active: "Actifs",
  pending: "En attente",
  archived: "Archivés",
  orphan: "Orphelins",
  conflict: "Conflits",
};

function RegistryMobileField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="account-requests-mobile-card__field">
      <span className="account-requests-mobile-card__field-label">{label}</span>
      <div className="account-requests-mobile-card__field-value">{children}</div>
    </div>
  );
}

function RegistryRowActions({
  entry,
  isExpanded,
  onToggleDiagnostic,
  layout = "table",
}: {
  entry: EmployeeAccountsRegistryEntry;
  isExpanded: boolean;
  onToggleDiagnostic: () => void;
  layout?: "table" | "mobile";
}) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasFicheLink = Boolean(entry.chauffeurId);
  const hasDemandeLink = Boolean(entry.accountRequestId);
  const hasOpenMenu = hasFicheLink || hasDemandeLink;
  const isMobile = layout === "mobile";

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <div
      ref={menuRef}
      className={`employee-accounts-registry-actions${
        isMobile ? " employee-accounts-registry-actions--mobile" : ""
      }`}
    >
      <button
        type="button"
        className={`employee-accounts-registry-action-btn${
          isExpanded
            ? " employee-accounts-registry-action-btn--primary"
            : " employee-accounts-registry-action-btn--secondary"
        }`}
        onClick={onToggleDiagnostic}
        aria-expanded={isExpanded}
      >
        {isExpanded
          ? isMobile
            ? "Masquer le diagnostic"
            : "Masquer"
          : "Diagnostic"}
      </button>

      {hasOpenMenu ? (
        <div className="employee-accounts-registry-actions-menu-wrap">
          <button
            type="button"
            className="employee-accounts-registry-action-btn employee-accounts-registry-action-btn--ghost employee-accounts-registry-action-btn--menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-controls={menuId}
            onClick={() => setMenuOpen((current) => !current)}
          >
            Ouvrir
            <ChevronDown
              size={14}
              strokeWidth={2.2}
              aria-hidden
              className="employee-accounts-registry-action-btn__chevron"
            />
          </button>

          {menuOpen ? (
            <div
              id={menuId}
              role="menu"
              className="employee-accounts-registry-actions-menu"
              aria-label="Liens registre compte employé"
            >
              {hasFicheLink ? (
                <Link
                  role="menuitem"
                  href={`/direction/ressources/employes/${entry.chauffeurId}`}
                  className="employee-accounts-registry-actions-menu-item"
                  onClick={() => setMenuOpen(false)}
                >
                  <UserRound size={15} strokeWidth={2} aria-hidden />
                  Fiche employé
                </Link>
              ) : null}
              {hasDemandeLink ? (
                <Link
                  role="menuitem"
                  href="/direction/demandes-comptes"
                  className="employee-accounts-registry-actions-menu-item"
                  onClick={() => setMenuOpen(false)}
                >
                  <FileText size={15} strokeWidth={2} aria-hidden />
                  Demande compte
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RegistryEntryMobileCard({
  entry,
  activeTab,
  isExpanded,
  onToggleDiagnostic,
}: {
  entry: EmployeeAccountsRegistryEntry;
  activeTab: EmployeeAccountsRegistryTab;
  isExpanded: boolean;
  onToggleDiagnostic: () => void;
}) {
  const diagnosticSummary =
    entry.conflictIndicators.length > 0
      ? entry.conflictIndicators.slice(0, 2).join(" · ")
      : "Aucune incohérence détectée";

  return (
    <article className="account-requests-mobile-card">
      <header className="account-requests-mobile-card__head">
        <h3 className="account-requests-mobile-card__name">{entry.displayName}</h3>
        <StatusBadge
          label={entry.derivedStatus}
          tone={getDerivedStatusTone(entry.derivedStatus)}
        />
      </header>

      <div className="account-requests-mobile-card__fields">
        <RegistryMobileField label="Courriel">{entry.email ?? "—"}</RegistryMobileField>
        <RegistryMobileField label="Onglet">{TAB_LABELS[activeTab]}</RegistryMobileField>
        <RegistryMobileField label="Fiche RH">
          {boolLabel(entry.employeeProfileActive)}
        </RegistryMobileField>
        <RegistryMobileField label="Auth lié">{boolLabel(entry.authLinked)}</RegistryMobileField>
        <RegistryMobileField label="Demande">{boolLabel(entry.hasAccountRequest)}</RegistryMobileField>
        <RegistryMobileField label="Diagnostics">
          {diagnosticSummary}
          {entry.conflictIndicators.length > 2 ? (
            <span className="account-requests-mobile-card__sub">
              +{entry.conflictIndicators.length - 2} autre(s)
            </span>
          ) : null}
        </RegistryMobileField>
      </div>

      <div className="account-requests-mobile-actions">
        <RegistryRowActions
          entry={entry}
          isExpanded={isExpanded}
          onToggleDiagnostic={onToggleDiagnostic}
          layout="mobile"
        />
      </div>

      {isExpanded ? (
        <div
          id={`registry-diagnostic-${entry.registryKey}`}
          className="employee-accounts-registry-mobile-diagnostic"
        >
          <RegistryDiagnosticPanel entry={entry} onClose={onToggleDiagnostic} />
        </div>
      ) : null}
    </article>
  );
}

function RegistryEntryRows({
  filteredEntries,
  activeTab,
  diagnosticEntryKey,
  toggleDiagnostic,
}: {
  filteredEntries: EmployeeAccountsRegistryEntry[];
  activeTab: EmployeeAccountsRegistryTab;
  diagnosticEntryKey: string | null;
  toggleDiagnostic: (registryKey: string) => void;
}) {
  return (
    <>
      <div className="account-requests-premium-table-wrap account-requests-premium-table-wrap--desktop">
        <table className="account-requests-premium-table account-requests-premium-table--registry">
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Employé / courriel</th>
              <th>Statut dérivé</th>
              <th className="employee-accounts-registry-cell--center">Fiche RH</th>
              <th className="employee-accounts-registry-cell--center">Auth</th>
              <th className="employee-accounts-registry-cell--center">Demande</th>
              <th className="employee-accounts-registry-cell--center">Désactivé</th>
              <th className="employee-accounts-registry-cell--center">Tél.</th>
              <th className="employee-accounts-registry-cell--center">Conflits</th>
              <th className="employee-accounts-registry-cell--center">Actions</th>
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
                    <td className="employee-accounts-registry-cell--center">
                      <BoolCell value={entry.employeeProfileActive} />
                    </td>
                    <td className="employee-accounts-registry-cell--center">
                      <BoolCell value={entry.authLinked} />
                    </td>
                    <td className="employee-accounts-registry-cell--center">
                      <BoolCell value={entry.hasAccountRequest} />
                    </td>
                    <td className="employee-accounts-registry-cell--center">
                      <BoolCell value={entry.accessDisabled} />
                    </td>
                    <td className="employee-accounts-registry-cell--center">
                      <BoolCell value={entry.profilePhonePresent} />
                    </td>
                    <td className="employee-accounts-registry-cell--center">
                      {entry.conflictIndicators.length > 0 ? (
                        <span
                          className="employee-accounts-registry-conflict-badge"
                          title={entry.conflictIndicators.join(" · ")}
                        >
                          <AlertTriangle size={14} aria-hidden />
                          {entry.conflictIndicators.length}
                        </span>
                      ) : (
                        <span className="employee-accounts-registry-bool employee-accounts-registry-bool--na">
                          —
                        </span>
                      )}
                    </td>
                    <td className="employee-accounts-registry-cell--center employee-accounts-registry-cell--actions">
                      <RegistryRowActions
                        entry={entry}
                        isExpanded={isExpanded}
                        onToggleDiagnostic={() => toggleDiagnostic(entry.registryKey)}
                      />
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr
                      id={`registry-diagnostic-${entry.registryKey}`}
                      className="employee-accounts-registry-diagnostic-row"
                    >
                      <td colSpan={9}>
                        <RegistryDiagnosticPanel
                          entry={entry}
                          onClose={() => toggleDiagnostic(entry.registryKey)}
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
            activeTab={activeTab}
            isExpanded={diagnosticEntryKey === entry.registryKey}
            onToggleDiagnostic={() => toggleDiagnostic(entry.registryKey)}
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
      <div className="tagora-app-content account-requests-premium-layout">
        <section className="account-requests-premium-hero employee-accounts-registry-hero">
          <div className="account-requests-premium-logo-card employee-accounts-registry-logo-card">
            <Image
              src="/logo.png"
              alt="Logo TAGORA"
              width={180}
              height={90}
              priority
              className="account-requests-premium-logo"
            />
          </div>

          <div className="account-requests-premium-hero-copy">
            <h1 className="account-requests-premium-title">Comptes employés</h1>
            <p className="account-requests-premium-description">
              Registre global des accès portail, fiches employés et diagnostics de cohérence.
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

        <div className="tagora-stat-grid tagora-stat-grid--five employee-accounts-registry-stat-grid">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`employee-accounts-registry-stat-button${activeTab === tab.value ? " employee-accounts-registry-stat-button--active" : ""}`}
              onClick={() => setActiveTab(tab.value)}
            >
              <TagoraStatCard
                title={tab.label}
                value={tabCounts[tab.value]}
                tone={tab.tone}
                icon={TAB_ICONS[tab.value]}
                iconSize="sm"
              />
            </button>
          ))}
        </div>

        <FeedbackMessage message={message} type={messageType} />

        <section className="account-requests-premium-shell employee-accounts-registry-shell">
          <div className="employee-accounts-registry-toolbar">
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
              activeTab={activeTab}
              diagnosticEntryKey={diagnosticEntryKey}
              toggleDiagnostic={toggleDiagnostic}
            />
          )}
        </section>

        <p className="tagora-note employee-accounts-registry-footnote">
          <Users size={14} aria-hidden />
          Phase 1 — lecture seule. Aucune action destructive sur cette page.
        </p>
      </div>
    </main>
  );
}
