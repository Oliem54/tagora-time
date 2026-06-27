"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  EyeOff,
  KeyRound,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import type { AccountAccessRequestRecord } from "@/app/lib/account-access";
import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  buildAuthorizedViewerDirectory,
  buildAuthorizedViewerOptions,
  type AuthorizedViewerProfile,
} from "@/app/lib/commissions/commission-book-authorized-viewers.shared";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import {
  buildEmployeeResourceSelectLabel,
  hasLinkedPortalAccount,
} from "@/app/lib/employee-resource-select.shared";
import { supabase } from "@/app/lib/supabase/client";

const ACCOUNT_REQUESTS_CLIENT_HEADER = "x-account-requests-client";
const ACCOUNT_REQUESTS_CLIENT_VALUE = "browser-authenticated";

const SETUP_STEPS = [
  {
    icon: BookOpen,
    title: "Choisir le livre",
    text: "Sélectionnez l'employé dont le livre sera consulté.",
  },
  {
    icon: UserCheck,
    title: "Choisir la personne",
    text: "Admin ou Direction autorisée à consulter ce livre.",
  },
  {
    icon: KeyRound,
    title: "Accorder ou révoquer",
    text: "Gérez chaque accès individuellement à tout moment.",
  },
] as const;

type DirectionEmployeeRow = {
  id: number;
  nom: string | null;
  courriel: string | null;
  actif: boolean | null;
  auth_user_id?: string | null;
  primary_company: AccountRequestCompany | null;
  fonctions?: string[] | null;
  fonction_autre?: string | null;
};

async function fetchDirectionActiveEmployees() {
  const response = await commissionsFetch("/api/direction/ressources/employes?status=active");
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    employees?: DirectionEmployeeRow[];
  };

  if (!response.ok || payload.success === false) {
    return {
      ok: false as const,
      error: payload.error ?? "Impossible de charger la liste des employés.",
      employees: [] as DirectionEmployeeRow[],
    };
  }

  return {
    ok: true as const,
    employees: Array.isArray(payload.employees) ? payload.employees : [],
  };
}

async function fetchAccountRequests() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetch("/api/account-requests", {
    method: "GET",
    headers: {
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      [ACCOUNT_REQUESTS_CLIENT_HEADER]: ACCOUNT_REQUESTS_CLIENT_VALUE,
      "Cache-Control": "no-store",
    },
    cache: "no-store",
  });
}

type ChauffeurOption = {
  id: number;
  label: string;
};

type GrantRecord = {
  id: string;
  owner_chauffeur_id: number;
  viewer_user_id: string;
  granted_by_admin_id: string;
  can_view: boolean;
  can_edit: boolean;
  created_at: string;
  revoked_at: string | null;
  expires_at: string | null;
  notes: string | null;
  is_active: boolean;
  owner_chauffeur_label: string | null;
};

type CreateGrantForm = {
  owner_chauffeur_id: string;
  viewer_user_id: string;
  notes: string;
  expires_at: string;
};

function emptyCreateForm(): CreateGrantForm {
  return {
    owner_chauffeur_id: "",
    viewer_user_id: "",
    notes: "",
    expires_at: "",
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function viewerRoleBadgeTone(role: AuthorizedViewerProfile["role"] | undefined) {
  return role === "admin" ? ("info" as const) : ("default" as const);
}

function GrantViewerCell({
  viewer,
  fallbackId,
}: {
  viewer: AuthorizedViewerProfile | undefined;
  fallbackId: string;
}) {
  if (!viewer) {
    return <span className="tagora-note">{fallbackId}</span>;
  }

  return (
    <div className="admin-grants-person-cell">
      <div className="admin-grants-cell-title">
        <UserCheck size={15} aria-hidden />
        <span>{viewer.fullName}</span>
      </div>
      {viewer.email ? <div className="tagora-note">{viewer.email}</div> : null}
      <div className="admin-grants-badge-row">
        <StatusBadge label={viewer.roleBadgeLabel} tone={viewerRoleBadgeTone(viewer.role)} />
        <StatusBadge label="Montants masqués" tone="warning" />
      </div>
    </div>
  );
}

function GrantBookCell({ grant }: { grant: GrantRecord }) {
  return (
    <div className="admin-grants-book-cell">
      <div className="admin-grants-cell-title">
        <BookOpen size={15} aria-hidden />
        <span>{grant.owner_chauffeur_label ?? `Employé #${grant.owner_chauffeur_id}`}</span>
      </div>
      <div className="tagora-note">#{grant.owner_chauffeur_id}</div>
    </div>
  );
}

export default function AdminCommissionBookAccessClient() {
  const { user, loading: accessLoading } = useCurrentAccess();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [grants, setGrants] = useState<GrantRecord[]>([]);
  const [chauffeurs, setChauffeurs] = useState<ChauffeurOption[]>([]);
  const [chauffeursLoadError, setChauffeursLoadError] = useState<string | null>(null);
  const [hasSalesObjectives, setHasSalesObjectives] = useState<boolean | null>(null);
  const [viewerDirectory, setViewerDirectory] = useState<Map<string, AuthorizedViewerProfile>>(
    () => new Map()
  );
  const [authorizedViewers, setAuthorizedViewers] = useState<
    ReturnType<typeof buildAuthorizedViewerOptions>
  >([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateGrantForm>(() => emptyCreateForm());
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "revoked">("all");

  const canGrantAccess = useMemo(() => {
    return (
      Boolean(createForm.owner_chauffeur_id) &&
      Boolean(createForm.viewer_user_id) &&
      chauffeurs.length > 0 &&
      !chauffeursLoadError
    );
  }, [
    chauffeurs.length,
    chauffeursLoadError,
    createForm.owner_chauffeur_id,
    createForm.viewer_user_id,
  ]);

  const summary = useMemo(() => {
    const activeGrants = grants.filter((grant) => grant.is_active);
    const authorizedPeople = new Set(activeGrants.map((grant) => grant.viewer_user_id)).size;
    return {
      shareableBooks: chauffeurs.length,
      authorizedPeople,
      activeShares: activeGrants.length,
    };
  }, [chauffeurs.length, grants]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setMessageType(null);

    const [grantsRes, employeesRes, requestsRes, objectivesRes] = await Promise.all([
      commissionsFetch(`/api/admin/commission-book-access-grants?active=${activeFilter}`),
      fetchDirectionActiveEmployees(),
      fetchAccountRequests(),
      commissionsFetch("/api/direction/commissions/objectives"),
    ]);

    const grantsPayload = (await grantsRes.json().catch(() => ({}))) as {
      error?: string;
      grants?: GrantRecord[];
    };
    const requestsPayload = (await requestsRes.json().catch(() => ({}))) as {
      error?: string;
      requests?: AccountAccessRequestRecord[];
    };

    if (!grantsRes.ok) {
      setGrants([]);
      setMessage(grantsPayload.error ?? "Impossible de charger les accès au partage des livres.");
      setMessageType("error");
      setLoading(false);
      return;
    }

    setGrants(Array.isArray(grantsPayload.grants) ? grantsPayload.grants : []);

    if (!employeesRes.ok) {
      setChauffeurs([]);
      setChauffeursLoadError(employeesRes.error);
    } else {
      const chauffeurOptions = employeesRes.employees
        .filter((row) => row.actif === true && hasLinkedPortalAccount(row.auth_user_id))
        .map((row) => {
          const id = Number(row.id);
          if (!Number.isFinite(id)) return null;
          return { id, label: buildEmployeeResourceSelectLabel(row) };
        })
        .filter((item): item is ChauffeurOption => Boolean(item))
        .sort((a, b) => a.label.localeCompare(b.label, "fr"));
      setChauffeurs(chauffeurOptions);
      setChauffeursLoadError(null);
    }

    const objectivesPayload = (await objectivesRes.json().catch(() => ({}))) as {
      objectives?: unknown[];
    };
    if (objectivesRes.ok) {
      setHasSalesObjectives(
        Array.isArray(objectivesPayload.objectives) && objectivesPayload.objectives.length > 0
      );
    } else {
      setHasSalesObjectives(null);
    }

    if (requestsRes.ok && Array.isArray(requestsPayload.requests)) {
      const directory = buildAuthorizedViewerDirectory(requestsPayload.requests);
      setViewerDirectory(directory);
      setAuthorizedViewers(buildAuthorizedViewerOptions(requestsPayload.requests));
    } else {
      setViewerDirectory(new Map());
      setAuthorizedViewers([]);
    }

    setLoading(false);
  }, [activeFilter]);

  useEffect(() => {
    if (accessLoading || !user) return;
    void loadData();
  }, [accessLoading, loadData, user]);

  async function handleCreateGrant() {
    if (!createForm.owner_chauffeur_id || !createForm.viewer_user_id) {
      setMessage("Sélectionnez un livre de ventes et une personne autorisée à consulter.");
      setMessageType("error");
      return;
    }

    setSaving(true);
    setMessage("");
    setMessageType(null);

    const response = await commissionsFetch("/api/admin/commission-book-access-grants", {
      method: "POST",
      body: JSON.stringify({
        owner_chauffeur_id: Number(createForm.owner_chauffeur_id),
        viewer_user_id: createForm.viewer_user_id,
        notes: createForm.notes.trim() || null,
        expires_at: createForm.expires_at.trim()
          ? new Date(createForm.expires_at).toISOString()
          : null,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setSaving(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Ajout de la personne autorisée impossible.");
      setMessageType("error");
      return;
    }

    setCreateForm(emptyCreateForm());
    setShowCreateForm(false);
    setMessage("Personne autorisée ajoutée.");
    setMessageType("success");
    await loadData();
  }

  async function handleRevokeGrant(grantId: string) {
    setActionKey(grantId);
    setMessage("");
    setMessageType(null);

    const response = await commissionsFetch(`/api/admin/commission-book-access-grants/${grantId}`, {
      method: "PATCH",
      body: JSON.stringify({ revoke: true }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      grant?: GrantRecord;
    };
    setActionKey(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Révocation impossible.");
      setMessageType("error");
      return;
    }

    const revokedAt = payload.grant?.revoked_at?.trim() ?? "";
    const revokeConfirmed = Boolean(revokedAt) || payload.grant?.is_active === false;
    if (!revokeConfirmed) {
      setMessage("Révocation non confirmée en base.");
      setMessageType("error");
      return;
    }

    setMessage("Accès révoqué.");
    setMessageType("success");
    await loadData();
  }

  if (accessLoading || loading) {
    return (
      <TagoraLoadingScreen
        isLoading
        message="Chargement du partage des livres de ventes..."
        fullScreen
      />
    );
  }

  if (!user) return null;

  return (
    <main className="page-container admin-grants-page">
      <div className="admin-grants-nav">
        <Link href="/admin/commissions" className="admin-grants-back">
          <ArrowLeft size={16} aria-hidden />
          Commissions & objectifs
        </Link>
      </div>

      <AuthenticatedPageHeader
        title="Partage des livres de ventes"
        subtitle="Configurez qui peut consulter les livres de ventes, sans exposer les montants confidentiels."
        showNavigation={false}
      />

      {message && messageType ? <FeedbackMessage message={message} type={messageType} /> : null}

      <div className="admin-grants-kpi-grid">
        <AppCard tone="muted" className="admin-grants-kpi-card">
          <div className="admin-grants-kpi-icon admin-grants-kpi-icon-book" aria-hidden>
            <BookOpen size={20} />
          </div>
          <div>
            <div className="admin-grants-kpi-value">{summary.shareableBooks}</div>
            <div className="admin-grants-kpi-label">Livres partageables</div>
          </div>
        </AppCard>
        <AppCard tone="muted" className="admin-grants-kpi-card">
          <div className="admin-grants-kpi-icon admin-grants-kpi-icon-users" aria-hidden>
            <Users size={20} />
          </div>
          <div>
            <div className="admin-grants-kpi-value">{summary.authorizedPeople}</div>
            <div className="admin-grants-kpi-label">Personnes autorisées</div>
            <div className="tagora-note admin-grants-kpi-note">
              {summary.activeShares} partage{summary.activeShares > 1 ? "s" : ""} actif
              {summary.activeShares === 1 ? "" : "s"}
            </div>
          </div>
        </AppCard>
        <AppCard tone="muted" className="admin-grants-kpi-card">
          <div className="admin-grants-kpi-icon admin-grants-kpi-icon-shield" aria-hidden>
            <Shield size={20} />
          </div>
          <div>
            <div className="admin-grants-kpi-value">Protégée</div>
            <div className="admin-grants-kpi-label">Confidentialité</div>
            <div className="tagora-note admin-grants-kpi-note">Montants masqués côté consultation</div>
          </div>
        </AppCard>
      </div>

      <AppCard tone="elevated" className="admin-grants-hero">
        <div className="admin-grants-hero-icon" aria-hidden>
          <KeyRound size={22} />
        </div>
        <div className="admin-grants-hero-body">
          <div className="admin-grants-hero-title">Configuration des personnes autorisées</div>
          <p className="tagora-note admin-grants-hero-text">
            Sélectionnez un livre de ventes, puis ajoutez les personnes autorisées à le consulter.
            Les accès sont individuels, révocables et limités selon le rôle de l&apos;utilisateur.
          </p>
          <div className="admin-grants-steps">
            {SETUP_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="admin-grants-step-card">
                  <div className="admin-grants-step-icon" aria-hidden>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="admin-grants-step-title">{step.title}</div>
                    <p className="tagora-note admin-grants-step-text">{step.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AppCard>

      <div className="admin-grants-toolbar">
        <div className="admin-grants-filters">
          {(["all", "active", "revoked"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={activeFilter === value ? "tagora-dark-action" : "tagora-dark-outline-action"}
              onClick={() => setActiveFilter(value)}
            >
              {value === "all" ? "Tous" : value === "active" ? "Actifs" : "Révoqués"}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="tagora-dark-action"
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          {showCreateForm ? "Fermer le formulaire" : "Ajouter une personne autorisée"}
        </button>
      </div>

      {showCreateForm ? (
        <SectionCard
          title="Ajouter une personne autorisée"
          subtitle="Consultation seule — chaque accès est individuel et révocable."
        >
          {hasSalesObjectives === false ? (
            <p className="tagora-note admin-grants-form-note">
              Un accès peut être accordé même si le livre est vide. Les objectifs pourront être créés
              ensuite dans Admin commissions.
            </p>
          ) : null}
          <div className="admin-grants-form-grid">
            <label className="tagora-field">
              <span className="tagora-label">Livre de ventes à partager</span>
              <select
                className="tagora-input"
                value={createForm.owner_chauffeur_id}
                disabled={Boolean(chauffeursLoadError) || chauffeurs.length === 0}
                onChange={(e) =>
                  setCreateForm({ ...createForm, owner_chauffeur_id: e.target.value })
                }
              >
                <option value="">— Choisir —</option>
                {chauffeurs.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="tagora-note admin-grants-field-help">
                Choisissez l&apos;employé dont le livre sera consulté.
              </span>
              {chauffeursLoadError ? (
                <span className="ui-form-field-error" role="alert">
                  {chauffeursLoadError}
                </span>
              ) : chauffeurs.length === 0 ? (
                <span className="ui-form-field-error" role="status">
                  Aucun employé actif disponible.
                </span>
              ) : null}
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Personne autorisée à consulter</span>
              <select
                className="tagora-input"
                value={createForm.viewer_user_id}
                onChange={(e) =>
                  setCreateForm({ ...createForm, viewer_user_id: e.target.value })
                }
              >
                <option value="">— Choisir —</option>
                {authorizedViewers.map((item) => (
                  <option key={item.userId} value={item.userId}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="tagora-note admin-grants-field-help">
                Admin, Direction ou compte autorisé pouvant consulter ce livre.
              </span>
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Expiration (optionnel)</span>
              <input
                type="datetime-local"
                className="tagora-input"
                value={createForm.expires_at}
                onChange={(e) => setCreateForm({ ...createForm, expires_at: e.target.value })}
              />
            </label>
            <label className="tagora-field admin-grants-notes-field">
              <span className="tagora-label">Notes (optionnel)</span>
              <textarea
                className="tagora-textarea"
                rows={3}
                value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
              />
            </label>
          </div>
          <div className="admin-grants-form-actions">
            <button
              type="button"
              className="tagora-dark-action"
              disabled={saving || !canGrantAccess}
              onClick={() => void handleCreateGrant()}
            >
              {saving ? "Ajout..." : "Accorder l'accès"}
            </button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Accès enregistrés"
        subtitle="Historique des partages actifs et révoqués."
      >
        {grants.length === 0 ? (
          <div className="admin-grants-empty-state">
            <BookOpen size={28} aria-hidden />
            <div className="admin-grants-empty-title">Aucun partage configuré pour le moment.</div>
            <p className="tagora-note">Ajoutez une personne autorisée pour commencer.</p>
          </div>
        ) : (
          <>
            <div className="admin-grants-table-wrap tagora-panel">
              <table className="admin-grants-table admin-grants-table-desktop">
                <thead>
                  <tr>
                    <th>Livre de ventes</th>
                    <th>Personne autorisée</th>
                    <th>Statut</th>
                    <th>Expiration</th>
                    <th>Notes</th>
                    <th>Créé le</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {grants.map((grant) => {
                    const viewer = viewerDirectory.get(grant.viewer_user_id);
                    return (
                      <tr key={grant.id}>
                        <td>
                          <GrantBookCell grant={grant} />
                        </td>
                        <td>
                          <GrantViewerCell
                            viewer={viewer}
                            fallbackId={grant.viewer_user_id}
                          />
                        </td>
                        <td>
                          <div className="admin-grants-badge-row">
                            <StatusBadge
                              label={grant.is_active ? "Actif" : "Révoqué"}
                              tone={grant.is_active ? "success" : "default"}
                            />
                          </div>
                        </td>
                        <td>{formatDateTime(grant.expires_at)}</td>
                        <td>{grant.notes?.trim() || "—"}</td>
                        <td>{formatDateTime(grant.created_at)}</td>
                        <td>
                          {grant.is_active ? (
                            <button
                              type="button"
                              className="tagora-dark-outline-action admin-grants-revoke-btn"
                              disabled={actionKey === grant.id}
                              onClick={() => void handleRevokeGrant(grant.id)}
                            >
                              {actionKey === grant.id ? "Révocation..." : "Révoquer"}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="admin-grants-mobile-list">
              {grants.map((grant) => {
                const viewer = viewerDirectory.get(grant.viewer_user_id);
                return (
                  <AppCard key={grant.id} tone="elevated" className="admin-grants-mobile-card">
                    <GrantBookCell grant={grant} />
                    <div className="admin-grants-mobile-divider" />
                    <GrantViewerCell viewer={viewer} fallbackId={grant.viewer_user_id} />
                    <div className="admin-grants-badge-row">
                      <StatusBadge
                        label={grant.is_active ? "Actif" : "Révoqué"}
                        tone={grant.is_active ? "success" : "default"}
                      />
                      <StatusBadge label="Montants masqués" tone="warning" />
                    </div>
                    <div className="admin-grants-mobile-meta">
                      <span>Expiration : {formatDateTime(grant.expires_at)}</span>
                      <span>Créé le : {formatDateTime(grant.created_at)}</span>
                    </div>
                    {grant.notes?.trim() ? (
                      <p className="tagora-note admin-grants-mobile-notes">{grant.notes.trim()}</p>
                    ) : null}
                    {grant.is_active ? (
                      <button
                        type="button"
                        className="tagora-dark-outline-action admin-grants-revoke-btn"
                        disabled={actionKey === grant.id}
                        onClick={() => void handleRevokeGrant(grant.id)}
                      >
                        {actionKey === grant.id ? "Révocation..." : "Révoquer l'accès"}
                      </button>
                    ) : null}
                  </AppCard>
                );
              })}
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title="Confidentialité protégée">
        <AppCard tone="muted" className="admin-grants-security-card">
          <div className="admin-grants-security-icon" aria-hidden>
            <Shield size={22} />
          </div>
          <div className="admin-grants-security-body">
            <div className="admin-grants-security-title">Montants confidentiels réservés à l&apos;Admin</div>
            <p className="tagora-note admin-grants-security-text">
              Les personnes autorisées voient seulement les livres accordés. Les montants
              confidentiels restent réservés au module Admin commissions.
            </p>
            <div className="admin-grants-badge-row">
              <StatusBadge label="Montants masqués" tone="warning" />
              <StatusBadge label="Accès sur invitation" tone="default" />
            </div>
          </div>
          <EyeOff size={20} className="admin-grants-security-watermark" aria-hidden />
        </AppCard>
      </SectionCard>

      <style jsx>{`
        .admin-grants-nav {
          margin-bottom: 12px;
        }
        .admin-grants-back {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #334155;
          text-decoration: none;
          font-weight: 600;
        }
        .admin-grants-kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 12px;
        }
        .admin-grants-kpi-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
        }
        .admin-grants-kpi-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          flex-shrink: 0;
        }
        .admin-grants-kpi-icon-book {
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
          color: #1d4ed8;
        }
        .admin-grants-kpi-icon-users {
          background: linear-gradient(135deg, #f5f3ff, #ede9fe);
          color: #6d28d9;
        }
        .admin-grants-kpi-icon-shield {
          background: linear-gradient(135deg, #ecfdf5, #d1fae5);
          color: #047857;
        }
        .admin-grants-kpi-value {
          font-size: 1.35rem;
          font-weight: 800;
          line-height: 1.1;
          color: #0f172a;
        }
        .admin-grants-kpi-label {
          font-weight: 700;
          color: #334155;
          margin-top: 4px;
        }
        .admin-grants-kpi-note {
          margin: 4px 0 0;
          font-size: 0.82rem;
        }
        .admin-grants-hero {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          padding: 18px;
          margin-top: 16px;
        }
        .admin-grants-hero-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(135deg, #ecfdf5, #d1fae5);
          color: #047857;
          flex-shrink: 0;
        }
        .admin-grants-hero-body {
          flex: 1;
          min-width: 0;
        }
        .admin-grants-hero-title {
          font-weight: 800;
          font-size: 1.05rem;
        }
        .admin-grants-hero-text {
          margin: 8px 0 0;
        }
        .admin-grants-steps {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 16px;
        }
        .admin-grants-step-card {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 12px;
          border-radius: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }
        .admin-grants-step-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: #fff;
          color: #047857;
          flex-shrink: 0;
        }
        .admin-grants-step-title {
          font-weight: 700;
          font-size: 0.92rem;
        }
        .admin-grants-step-text {
          margin: 4px 0 0;
          font-size: 0.84rem;
        }
        .admin-grants-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: space-between;
          align-items: center;
          margin: 18px 0;
        }
        .admin-grants-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .admin-grants-form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 14px;
        }
        .admin-grants-notes-field {
          grid-column: 1 / -1;
        }
        .admin-grants-field-help {
          display: block;
          margin-top: 6px;
          font-size: 0.84rem;
        }
        .admin-grants-form-note {
          margin: 0 0 16px;
        }
        .admin-grants-form-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          margin-top: 16px;
        }
        .admin-grants-table-wrap {
          overflow-x: auto;
        }
        .admin-grants-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.92rem;
        }
        .admin-grants-table th,
        .admin-grants-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: top;
        }
        .admin-grants-table thead th {
          border-bottom: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 0.82rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .admin-grants-cell-title {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          color: #0f172a;
        }
        .admin-grants-badge-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }
        .admin-grants-person-cell,
        .admin-grants-book-cell {
          min-width: 180px;
        }
        .admin-grants-revoke-btn {
          font-size: 0.88rem;
        }
        .admin-grants-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 8px;
          padding: 28px 16px;
          color: #64748b;
          border: 1px dashed #cbd5e1;
          border-radius: 14px;
          background: #f8fafc;
        }
        .admin-grants-empty-title {
          font-weight: 800;
          color: #334155;
        }
        .admin-grants-mobile-list {
          display: none;
          gap: 12px;
        }
        .admin-grants-mobile-card {
          padding: 16px;
        }
        .admin-grants-mobile-divider {
          height: 1px;
          background: #e2e8f0;
          margin: 12px 0;
        }
        .admin-grants-mobile-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 10px;
          font-size: 0.84rem;
          color: #64748b;
        }
        .admin-grants-mobile-notes {
          margin: 10px 0 0;
        }
        .admin-grants-security-card {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 14px;
          align-items: start;
          padding: 18px;
          position: relative;
          overflow: hidden;
        }
        .admin-grants-security-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #ecfdf5, #d1fae5);
          color: #047857;
        }
        .admin-grants-security-title {
          font-weight: 800;
          margin-bottom: 6px;
        }
        .admin-grants-security-text {
          margin: 0 0 10px;
        }
        .admin-grants-security-watermark {
          color: #cbd5e1;
          align-self: center;
        }
        @media (max-width: 900px) {
          .admin-grants-kpi-grid,
          .admin-grants-steps {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 768px) {
          .admin-grants-table-desktop {
            display: none;
          }
          .admin-grants-mobile-list {
            display: grid;
          }
          .admin-grants-security-card {
            grid-template-columns: auto 1fr;
          }
          .admin-grants-security-watermark {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
