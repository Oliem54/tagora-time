"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
};

export default function Page() {
  const [employes, setEmployes] = useState<EmployeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(
    null
  );

  async function fetchEmployes() {
    setLoading(true);

    const res = await supabase
      .from("chauffeurs")
      .select("id, nom, courriel, telephone, actif, primary_company")
      .neq("actif", false)
      .order("id", { ascending: true });

    if (res.error) {
      setMessage(`Erreur chargement: ${res.error.message}`);
      setMessageType("error");
      setEmployes([]);
      setLoading(false);
      return;
    }

    setEmployes((res.data as EmployeListRow[]) || []);
    setMessage("");
    setMessageType(null);
    setLoading(false);
  }

  useEffect(() => {
    let isActive = true;

    async function loadInitialEmployes() {
      const res = await supabase
        .from("chauffeurs")
        .select("id, nom, courriel, telephone, actif, primary_company")
        .neq("actif", false)
        .order("id", { ascending: true });

      if (!isActive) {
        return;
      }

      if (res.error) {
        setMessage(`Erreur chargement: ${res.error.message}`);
        setMessageType("error");
        setEmployes([]);
        setLoading(false);
        return;
      }

      setEmployes((res.data as EmployeListRow[]) || []);
      setMessage("");
      setMessageType(null);
      setLoading(false);
    }

    void loadInitialEmployes();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleDelete(id: number) {
    const confirmed = window.confirm(
      "Desactiver cet employe ? Son historique sera conserve."
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(id);
    setMessage("");
    setMessageType(null);

    const res = await supabase
      .from("chauffeurs")
      .update({ actif: false })
      .eq("id", id);

    if (res.error) {
      if (res.error.code === "23503") {
        const fallback = await supabase
          .from("chauffeurs")
          .update({ actif: false })
          .eq("id", id);
        if (!fallback.error) {
          setMessage(
            "Impossible de supprimer cet employe, car il possede deja un historique. Il a ete desactive a la place."
          );
          setMessageType("success");
          setDeletingId(null);
          await fetchEmployes();
          return;
        }
      }
      setMessage(`Erreur suppression: ${res.error.message}`);
      setMessageType("error");
      setDeletingId(null);
      return;
    }

    setMessage("Employe desactive. Son historique est conserve.");
    setMessageType("success");
    setDeletingId(null);
    await fetchEmployes();
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg" style={{ maxWidth: 1320 }}>
        <HeaderTagora
          title="Employes et chauffeurs"
          subtitle="Liste de travail. Ouvrez chaque fiche dans une vraie page profil employee."
          actions={
            <div className="tagora-actions">
              <Link
                href="/direction/ressources/employes/nouveau"
                className="tagora-dark-action"
              >
                Nouvel employe
              </Link>
            </div>
          }
        />

        <FeedbackMessage message={message} type={messageType} />

        <section className="tagora-panel ui-stack-md">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div className="ui-stack-xs">
              <h2 className="section-title" style={{ marginBottom: 0 }}>
                Liste des employes
              </h2>
              <p className="tagora-note" style={{ margin: 0 }}>
                Modifier profil ouvre la fiche employee dediee.
              </p>
            </div>

            <button
              type="button"
              className="tagora-dark-outline-action"
              onClick={() => void fetchEmployes()}
              disabled={loading}
            >
              {loading ? "Actualisation..." : "Actualiser"}
            </button>
          </div>

          {loading ? (
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Chargement...
              </p>
            </div>
          ) : employes.length === 0 ? (
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Aucun employe trouve.
              </p>
            </div>
          ) : (
            <DataTable
              columns={[
                { key: "id", label: "ID" },
                { key: "nom", label: "Nom" },
                { key: "courriel", label: "Courriel" },
                { key: "telephone", label: "Telephone" },
                { key: "compagnie", label: "Compagnie" },
                { key: "statut", label: "Statut" },
                { key: "actions", label: "Actions" },
              ]}
            >
              {employes.map((item) => (
                <DataTableRow key={item.id}>
                  <DataTableCell>#{item.id}</DataTableCell>
                  <DataTableCell>{item.nom || "-"}</DataTableCell>
                  <DataTableCell>{item.courriel || "-"}</DataTableCell>
                  <DataTableCell>{item.telephone || "-"}</DataTableCell>
                  <DataTableCell>
                    {item.primary_company ? getCompanyLabel(item.primary_company) : "-"}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge
                      label={item.actif ? "Actif" : "Inactif"}
                      tone={item.actif ? "success" : "default"}
                    />
                  </DataTableCell>
                  <DataTableCell>
                    <div style={actionsRowStyle}>
                      <Link
                        href={`/direction/ressources/employes/${item.id}`}
                        className="tagora-dark-action"
                        style={actionButtonStyle}
                      >
                        Modifier profil
                      </Link>
                      <button
                        type="button"
                        className="tagora-btn-danger"
                        onClick={() => void handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        style={actionButtonStyle}
                      >
                        {deletingId === item.id ? "Desactivation..." : "Desactiver"}
                      </button>
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

const actionsRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "stretch",
  minWidth: 184,
};

const actionButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  justifyContent: "center",
};
