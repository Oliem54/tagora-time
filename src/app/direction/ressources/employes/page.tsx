"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import HeaderTagora from "@/app/components/HeaderTagora";
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
      "Supprimer cet employe ? Cette action est definitive."
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(id);
    setMessage("");
    setMessageType(null);

    const res = await supabase.from("chauffeurs").delete().eq("id", id);

    if (res.error) {
      setMessage(`Erreur suppression: ${res.error.message}`);
      setMessageType("error");
      setDeletingId(null);
      return;
    }

    setMessage("Employe supprime.");
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
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>Nom</th>
                    <th style={thStyle}>Courriel</th>
                    <th style={thStyle}>Telephone</th>
                    <th style={thStyle}>Compagnie</th>
                    <th style={thStyle}>Statut</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employes.map((item) => (
                    <tr key={item.id}>
                      <td style={tdStyle}>#{item.id}</td>
                      <td style={tdStyle}>{item.nom || "-"}</td>
                      <td style={tdStyle}>{item.courriel || "-"}</td>
                      <td style={tdStyle}>{item.telephone || "-"}</td>
                      <td style={tdStyle}>
                        {item.primary_company
                          ? getCompanyLabel(item.primary_company)
                          : "-"}
                      </td>
                      <td style={tdStyle}>{item.actif ? "Actif" : "Inactif"}</td>
                      <td style={tdStyle}>
                        <div style={actionsRowStyle}>
                          <Link
                            href={`/direction/ressources/employes/${item.id}`}
                            className="tagora-dark-action"
                          >
                            Modifier profil
                          </Link>
                          <button
                            type="button"
                            className="tagora-btn-danger"
                            onClick={() => void handleDelete(item.id)}
                            disabled={deletingId === item.id}
                          >
                            {deletingId === item.id ? "Suppression..." : "Supprimer"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 980,
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#475569",
  background: "#f8fafc",
};

const tdStyle: React.CSSProperties = {
  padding: "16px 12px",
  borderBottom: "1px solid #e5e7eb",
  verticalAlign: "top",
  fontSize: 14,
  color: "#0f172a",
};

const actionsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};
