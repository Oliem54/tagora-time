"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import HeaderTagora from "@/app/components/HeaderTagora";
import { DataTable, DataTableCell, DataTableRow } from "@/app/components/ui/DataTable";
import StatusBadge from "@/app/components/ui/StatusBadge";
import {
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { supabase } from "@/app/lib/supabase/client";

type EmployeListRow = {
  id: number;
  nom: string | null;
  courriel: string | null;
  telephone: string | null;
  actif: boolean | null;
  primary_company: AccountRequestCompany | null;
  workStatusTag?: "available" | "long_leave" | "sick" | "indefinite";
  workStatusLabel?: string | null;
};

type StatusFilter = "active" | "inactive" | "all";

export default function Page() {
  const [employes, setEmployes] = useState<EmployeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");

  const fetchEmployes = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setMessageType(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setMessage("Session expirée. Reconnectez-vous.");
      setMessageType("error");
      setEmployes([]);
      setLoading(false);
      return;
    }

    const params = new URLSearchParams();
    params.set("status", statusFilter);

    const res = await fetch(`/api/direction/ressources/employes?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      employees?: EmployeListRow[];
      error?: string;
    };

    if (!res.ok || json.success === false) {
      setMessage(typeof json.error === "string" ? json.error : "Erreur de chargement.");
      setMessageType("error");
      setEmployes([]);
      setLoading(false);
      return;
    }

    setEmployes(json.employees ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    void fetchEmployes();
  }, [fetchEmployes]);

  async function callActivation(id: number, action: "activate" | "deactivate") {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setMessage("Session expirée.");
      setMessageType("error");
      return;
    }

    setActionId(id);
    setMessage("");
    setMessageType(null);

    const res = await fetch(`/api/direction/ressources/employes/${id}/activation`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      error?: string;
    };

    setActionId(null);

    if (!res.ok || json.success === false) {
      setMessage(typeof json.error === "string" ? json.error : "Action impossible.");
      setMessageType("error");
      return;
    }

    setMessage(typeof json.message === "string" ? json.message : "OK.");
    setMessageType("success");
    await fetchEmployes();
  }

  function handleDeactivate(id: number) {
    const ok = window.confirm(
      "Désactiver cet employé ? Il ne pourra plus utiliser le portail, mais son historique sera conservé."
    );
    if (!ok) return;
    void callActivation(id, "deactivate");
  }

  function handleReactivate(id: number) {
    void callActivation(id, "activate");
  }

  async function handleArchiveDelete(id: number) {
    const ok = window.confirm(
      "Supprimer ou archiver cet employé ? S'il existe des données liées (horodateur, livraisons, etc.), le compte sera désactivé plutôt que supprimé."
    );
    if (!ok) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setMessage("Session expirée.");
      setMessageType("error");
      return;
    }

    setActionId(id);
    setMessage("");
    setMessageType(null);

    const res = await fetch(`/api/direction/ressources/employes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      error?: string;
      softDeleted?: boolean;
      deleted?: boolean;
    };

    setActionId(null);

    if (!res.ok || json.success === false) {
      setMessage(typeof json.error === "string" ? json.error : "Action impossible.");
      setMessageType("error");
      return;
    }

    setMessage(typeof json.message === "string" ? json.message : "OK.");
    setMessageType("success");
    await fetchEmployes();
  }

  const isActiveRow = (item: EmployeListRow) => item.actif === true;

  const displayedEmployes = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return employes;
    return employes.filter((r) => {
      const nom = (r.nom ?? "").toLowerCase();
      const mail = (r.courriel ?? "").toLowerCase();
      return nom.includes(t) || mail.includes(t);
    });
  }, [employes, search]);

  function workStatusBadge(item: EmployeListRow) {
    if (!item.workStatusTag || item.workStatusTag === "available") {
      return null;
    }
    const label =
      item.workStatusTag === "sick"
        ? "Maladie"
        : item.workStatusTag === "indefinite"
          ? "Retour indéterminé"
          : "Congé prolongé";
    return (
      <StatusBadge
        label={item.workStatusLabel?.trim() ? `${label} · ${item.workStatusLabel.trim()}` : label}
        tone="warning"
      />
    );
  }

  return (
    <main className="tagora-app-shell employes-ressources-page">
      <div className="tagora-app-content ui-stack-lg" style={{ maxWidth: 1280 }}>
        <HeaderTagora
          title="Employés et chauffeurs"
          actions={
            <div className="tagora-actions">
              <Link href="/direction/ressources/employes/nouveau" className="tagora-dark-action">
                Nouvel employé
              </Link>
            </div>
          }
        />

        <FeedbackMessage message={message} type={messageType} />

        <section className="tagora-panel ui-stack-md">
          <div className="employes-ressources-toolbar">
            <h2 className="employes-ressources-panel-title">Liste des employés</h2>
            <button
              type="button"
              className="tagora-dark-outline-action"
              onClick={() => void fetchEmployes()}
              disabled={loading}
            >
              {loading ? "Actualisation…" : "Actualiser"}
            </button>
          </div>

          <div className="employes-ressources-filters">
            <label className="tagora-field" style={{ marginBottom: 0, minWidth: 160 }}>
              <span className="tagora-label">Statut</span>
              <select
                className="tagora-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="active">Actifs</option>
                <option value="inactive">Inactifs</option>
                <option value="all">Tous</option>
              </select>
            </label>
            <label className="tagora-field" style={{ marginBottom: 0, flex: "1 1 220px", maxWidth: 360 }}>
              <span className="tagora-label">Recherche</span>
              <input
                className="tagora-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom ou courriel"
              />
            </label>
          </div>

          {loading ? (
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Chargement…
              </p>
            </div>
          ) : displayedEmployes.length === 0 ? (
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Aucun employé ne correspond à ce filtre.
              </p>
            </div>
          ) : (
            <DataTable
              columns={[
                { key: "id", label: "ID" },
                { key: "nom", label: "Nom" },
                { key: "courriel", label: "Courriel" },
                { key: "telephone", label: "Téléphone" },
                { key: "compagnie", label: "Compagnie" },
                { key: "statut", label: "Statut" },
                { key: "actions", label: "Actions" },
              ]}
            >
              {displayedEmployes.map((item) => (
                <DataTableRow key={item.id}>
                  <DataTableCell>#{item.id}</DataTableCell>
                  <DataTableCell>{item.nom || "—"}</DataTableCell>
                  <DataTableCell>{item.courriel || "—"}</DataTableCell>
                  <DataTableCell>{item.telephone || "—"}</DataTableCell>
                  <DataTableCell>
                    {item.primary_company ? getCompanyLabel(item.primary_company) : "—"}
                  </DataTableCell>
                  <DataTableCell>
                    <div className="employes-statut-stack">
                      <StatusBadge
                        label={isActiveRow(item) ? "Actif" : "Inactif"}
                        tone={isActiveRow(item) ? "success" : "default"}
                      />
                      {workStatusBadge(item)}
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <div className="employes-actions-stack">
                      <Link
                        href={`/direction/ressources/employes/${item.id}`}
                        className="tagora-dark-outline-action employes-action-btn"
                      >
                        Modifier profil
                      </Link>
                      {isActiveRow(item) ? (
                        <button
                          type="button"
                          className="tagora-btn-danger employes-action-btn"
                          onClick={() => handleDeactivate(item.id)}
                          disabled={actionId === item.id}
                        >
                          {actionId === item.id ? "…" : "Désactiver"}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="tagora-dark-action employes-action-btn"
                            onClick={() => handleReactivate(item.id)}
                            disabled={actionId === item.id}
                          >
                            {actionId === item.id ? "…" : "Réactiver"}
                          </button>
                          <button
                            type="button"
                            className="tagora-dark-outline-action employes-action-btn"
                            onClick={() => void handleArchiveDelete(item.id)}
                            disabled={actionId === item.id}
                          >
                            {actionId === item.id ? "…" : "Supprimer / Archiver"}
                          </button>
                        </>
                      )}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
          )}
        </section>
      </div>
    </main>
  );
}
