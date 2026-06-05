"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import type { AccountAccessRequestRecord } from "@/app/lib/account-access";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import { supabase } from "@/app/lib/supabase/client";

const ACCOUNT_REQUESTS_CLIENT_HEADER = "x-account-requests-client";
const ACCOUNT_REQUESTS_CLIENT_VALUE = "browser-authenticated";

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

type DirectionViewerOption = {
  userId: string;
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

function buildDirectionViewerOptions(requests: AccountAccessRequestRecord[]): DirectionViewerOption[] {
  const map = new Map<string, DirectionViewerOption>();

  for (const request of requests) {
    const role =
      request.assigned_role ??
      request.existing_account?.role ??
      request.requested_role;
    if (role !== "direction") continue;

    const userId = request.existing_account?.userId ?? request.invited_user_id ?? null;
    if (!userId) continue;
    if (request.status !== "active" && request.status !== "invited") {
      continue;
    }
    if (request.existing_account?.accessDisabled) continue;

    map.set(userId, {
      userId,
      label: `${request.full_name} (${request.email})`,
    });
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "fr"));
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
  const [directionViewers, setDirectionViewers] = useState<DirectionViewerOption[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateGrantForm>(() => emptyCreateForm());
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "revoked">("all");

  const viewerLabelById = useMemo(() => {
    return new Map(directionViewers.map((item) => [item.userId, item.label]));
  }, [directionViewers]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setMessageType(null);

    const [grantsRes, chauffeursRes, requestsRes] = await Promise.all([
      commissionsFetch(`/api/admin/commission-book-access-grants?active=${activeFilter}`),
      supabase.from("chauffeurs").select("id, nom, prenom, nom_complet").order("nom", { ascending: true }),
      fetchAccountRequests(),
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
      setMessage(grantsPayload.error ?? "Impossible de charger les acces Direction.");
      setMessageType("error");
      setLoading(false);
      return;
    }

    setGrants(Array.isArray(grantsPayload.grants) ? grantsPayload.grants : []);

    const chauffeurOptions = (chauffeursRes.data ?? [])
      .map((row) => {
        const record = row as Record<string, unknown>;
        const id = Number(record.id);
        const label = String(
          record.nom_complet ||
            [record.prenom, record.nom].filter(Boolean).join(" ") ||
            `#${id}`
        ).trim();
        return Number.isFinite(id) ? { id, label } : null;
      })
      .filter((item): item is ChauffeurOption => Boolean(item));
    setChauffeurs(chauffeurOptions);

    if (requestsRes.ok && Array.isArray(requestsPayload.requests)) {
      setDirectionViewers(buildDirectionViewerOptions(requestsPayload.requests));
    } else {
      setDirectionViewers([]);
    }

    setLoading(false);
  }, [activeFilter]);

  useEffect(() => {
    if (accessLoading || !user) return;
    void loadData();
  }, [accessLoading, loadData, user]);

  async function handleCreateGrant() {
    if (!createForm.owner_chauffeur_id || !createForm.viewer_user_id) {
      setMessage("Selectionnez un employe proprietaire et un utilisateur Direction.");
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
      setMessage(payload.error ?? "Creation de l acces impossible.");
      setMessageType("error");
      return;
    }

    setCreateForm(emptyCreateForm());
    setShowCreateForm(false);
    setMessage("Acces Direction cree.");
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

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setActionKey(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Revocation impossible.");
      setMessageType("error");
      return;
    }

    setMessage("Acces Direction revoque.");
    setMessageType("success");
    await loadData();
  }

  if (accessLoading || loading) {
    return (
      <TagoraLoadingScreen
        isLoading
        message="Chargement des acces Direction aux livres..."
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
        title="Acces Direction aux livres"
        subtitle="Accordez ou revoquez la consultation operationnelle d un livre de ventes, sans montants monetaires."
        showNavigation={false}
      />

      {message && messageType ? <FeedbackMessage message={message} type={messageType} /> : null}

      <AppCard tone="elevated" className="admin-grants-hero">
        <div className="admin-grants-hero-icon" aria-hidden>
          <KeyRound size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>Acces Direction aux livres</div>
          <p className="tagora-note" style={{ margin: "8px 0 0" }}>
            Un acces Direction permet de consulter un livre operationnel sans montants monetaires.
          </p>
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
              {value === "all" ? "Tous" : value === "active" ? "Actifs" : "Revokes"}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="tagora-dark-action"
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          {showCreateForm ? "Fermer le formulaire" : "Nouvel acces Direction"}
        </button>
      </div>

      {showCreateForm ? (
        <SectionCard title="Creer un acces Direction" subtitle="can_view=true, can_edit=false (V1).">
          <div className="admin-grants-form-grid">
            <label className="tagora-field">
              <span className="tagora-label">Employe proprietaire du livre</span>
              <select
                className="tagora-input"
                value={createForm.owner_chauffeur_id}
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
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Utilisateur Direction autorise</span>
              <select
                className="tagora-input"
                value={createForm.viewer_user_id}
                onChange={(e) =>
                  setCreateForm({ ...createForm, viewer_user_id: e.target.value })
                }
              >
                <option value="">— Choisir —</option>
                {directionViewers.map((item) => (
                  <option key={item.userId} value={item.userId}>
                    {item.label}
                  </option>
                ))}
              </select>
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
            <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
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
            <StatusBadge label="can_edit verrouille (false)" tone="default" />
            <button
              type="button"
              className="tagora-dark-action"
              disabled={saving}
              onClick={() => void handleCreateGrant()}
            >
              {saving ? "Creation..." : "Accorder l acces"}
            </button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Grants enregistres" subtitle="Historique actif et revoque (sans suppression dure).">
        <div className="tagora-panel" style={{ overflowX: "auto" }}>
          <table className="admin-grants-table">
            <thead>
              <tr>
                <th>Employe proprietaire</th>
                <th>Directeur autorise</th>
                <th>Statut</th>
                <th>Expiration</th>
                <th>Notes</th>
                <th>Cree le</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => (
                <tr key={grant.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>
                      {grant.owner_chauffeur_label ?? `Employe #${grant.owner_chauffeur_id}`}
                    </div>
                    <div className="tagora-note">#{grant.owner_chauffeur_id}</div>
                  </td>
                  <td>
                    <div>{viewerLabelById.get(grant.viewer_user_id) ?? grant.viewer_user_id}</div>
                  </td>
                  <td>
                    <StatusBadge
                      label={grant.is_active ? "Actif" : "Revoke"}
                      tone={grant.is_active ? "success" : "default"}
                    />
                  </td>
                  <td>{formatDateTime(grant.expires_at)}</td>
                  <td>{grant.notes?.trim() || "—"}</td>
                  <td>{formatDateTime(grant.created_at)}</td>
                  <td>
                    {grant.is_active ? (
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        disabled={actionKey === grant.id}
                        onClick={() => void handleRevokeGrant(grant.id)}
                      >
                        {actionKey === grant.id ? "Revocation..." : "Revoquer"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {grants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-grants-empty">
                    Aucun acces Direction enregistre pour ce filtre.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Confidentialite">
        <div className="tagora-panel-muted admin-grants-security">
          <ShieldCheck size={18} aria-hidden />
          <p>
            Direction voit uniquement les livres explicitement accordes, sans montants monetaires. Les
            montants complets restent dans le module Admin commissions.
          </p>
        </div>
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
        .admin-grants-hero {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          padding: 18px;
          margin-top: 8px;
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
        .admin-grants-form-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          margin-top: 16px;
        }
        .admin-grants-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.92rem;
        }
        .admin-grants-table th,
        .admin-grants-table td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: top;
        }
        .admin-grants-table thead th {
          border-bottom: 1px solid #e2e8f0;
        }
        .admin-grants-empty {
          padding: 16px 12px;
          color: #64748b;
        }
        .admin-grants-security {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 14px;
        }
        .admin-grants-security p {
          margin: 0;
          line-height: 1.5;
        }
      `}</style>
    </main>
  );
}
