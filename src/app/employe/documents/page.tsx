"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AccessNotice from "@/app/components/AccessNotice";
import HeaderTagora from "@/app/components/HeaderTagora";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";

type DossierRow = {
  id: number;
  nom: string | null;
  client: string | null;
  description: string | null;
  statut: string | null;
  created_at?: string | null;
};

type MediaRow = {
  id: number;
  dossier_id: number;
  image_url: string | null;
};

type NoteRow = {
  id: number;
  dossier_id: number;
};

type DocumentRow = {
  id: number;
  reference: string;
  client: string;
  type: string;
  date: string;
  statut: string;
  statutColor: string;
  statutBg: string;
  mediaCount: number;
  notesCount: number;
};

function getStatusPresentation(status: string) {
  if (status === "TerminÃ©" || status === "Envoye") {
    return { color: "#15803d", background: "#dcfce7" };
  }

  if (status === "En cours" || status === "En attente") {
    return { color: "#b45309", background: "#fef3c7" };
  }

  return { color: "#1d4ed8", background: "#dbeafe" };
}

export default function EmployeDocumentsPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const userId = user?.id ?? null;
  const canUseDocuments = hasPermission("documents");

  useEffect(() => {
    async function loadDocuments() {
      if (accessLoading) {
        return;
      }

      if (!userId || !canUseDocuments) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data: dossiersData, error: dossiersError } = await supabase
        .from("dossiers")
        .select("id, nom, client, description, statut, created_at")
        .eq("user_id", userId)
        .order("id", { ascending: false });

      if (dossiersError) {
        setRows([]);
        setLoading(false);
        return;
      }

      const dossiers = (dossiersData ?? []) as DossierRow[];
      const dossierIds = dossiers.map((item) => item.id);

      if (dossierIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const [{ data: mediasData }, { data: notesData }] = await Promise.all([
        supabase
          .from("photos_dossier")
          .select("id, dossier_id, image_url")
          .in("dossier_id", dossierIds),
        supabase
          .from("notes_dossier")
          .select("id, dossier_id")
          .in("dossier_id", dossierIds),
      ]);

      const mediaCountByDossier: Record<number, number> = {};
      ((mediasData ?? []) as MediaRow[]).forEach((item) => {
        mediaCountByDossier[item.dossier_id] =
          (mediaCountByDossier[item.dossier_id] || 0) + 1;
      });

      const noteCountByDossier: Record<number, number> = {};
      ((notesData ?? []) as NoteRow[]).forEach((item) => {
        noteCountByDossier[item.dossier_id] =
          (noteCountByDossier[item.dossier_id] || 0) + 1;
      });

      setRows(
        dossiers.map((item) => {
          const status = item.statut || "Nouveau";
          const statusPresentation = getStatusPresentation(status);

          return {
            id: item.id,
            reference: item.nom || `Dossier #${item.id}`,
            client: item.client || "-",
            type: item.description || "Document terrain",
            date: item.created_at?.slice(0, 10) || "-",
            statut: status,
            statutColor: statusPresentation.color,
            statutBg: statusPresentation.background,
            mediaCount: mediaCountByDossier[item.id] || 0,
            notesCount: noteCountByDossier[item.id] || 0,
          };
        })
      );

      setLoading(false);
    }

    void loadDocuments();
  }, [accessLoading, canUseDocuments, userId]);

  if (accessLoading) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content" style={{ maxWidth: 1400 }}>
          <HeaderTagora title="Documents" subtitle="Chargement" />
          <AccessNotice description="Acces en cours." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content" style={{ maxWidth: 1400 }}>
        <HeaderTagora
          title="Documents"
          subtitle="Liste."
        />

        {!hasPermission("documents") && !accessLoading ? (
          <AccessNotice description="Permission requise." />
        ) : (
          <>
            <div className="tagora-panel">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
                <div>
                  <h2 className="section-title" style={{ marginBottom: 8 }}>Documents</h2>
                  <p className="tagora-note">{rows.length} element{rows.length > 1 ? "s" : ""}</p>
                </div>

                <div className="tagora-actions">
                  <Link
                    href="/employe/documents/new"
                    className="tagora-dark-action rounded-xl px-6 py-3 text-center text-base font-semibold transition"
                  >
                    Creer
                  </Link>

                  <Link
                    href="/employe/dashboard"
                    className="tagora-dark-outline-action rounded-xl border px-6 py-3 text-center text-base font-semibold transition"
                  >
                    Retour
                  </Link>
                </div>
              </div>

              {loading ? (
                <p className="tagora-note">Chargement...</p>
              ) : rows.length === 0 ? (
                <div className="tagora-panel-muted">
                  <p className="tagora-note">Aucun document.</p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={tableHeadStyle}>Reference</th>
                        <th style={tableHeadStyle}>Client</th>
                        <th style={tableHeadStyle}>Type</th>
                        <th style={tableHeadStyle}>Date</th>
                        <th style={tableHeadStyle}>Pieces</th>
                        <th style={tableHeadStyle}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td style={tableCellStyle}>{row.reference}</td>
                          <td style={tableCellStyle}>{row.client}</td>
                          <td style={tableCellStyle}>{row.type}</td>
                          <td style={tableCellStyle}>{row.date}</td>
                          <td style={tableCellStyle}>
                            {row.mediaCount} media, {row.notesCount} note{row.notesCount > 1 ? "s" : ""}
                          </td>
                          <td style={tableCellStyle}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "6px 12px",
                                borderRadius: 999,
                                fontSize: 13,
                                fontWeight: 700,
                                color: row.statutColor,
                                background: row.statutBg,
                              }}
                            >
                              {row.statut}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

const tableHeadStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  borderBottom: "1px solid #e2e8f0",
  fontSize: 13,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tableCellStyle: React.CSSProperties = {
  padding: "16px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#0f172a",
  verticalAlign: "middle",
};
