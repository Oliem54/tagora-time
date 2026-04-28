"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import Link from "next/link";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";

type ArchiveListItem = {
  id: number;
  type: "livraison" | "ramassage";
  status: string;
  plannedDate: string;
  client: string;
  address: string;
  commande: string;
  facture: string;
  phone: string;
  email: string;
  company: string;
  chauffeurLabel: string;
  vehiculeLabel: string;
  remorqueLabel: string;
  proofCount: number;
};

type ArchiveProof = {
  id: string;
  type_preuve: string;
  categorie: string | null;
  nom: string;
  date_heure: string;
  url_fichier: string;
  mime_type: string | null;
  commentaire: string | null;
};

type ArchiveDetail = ArchiveListItem & {
  realDate: string;
  departureTime: string;
  arrivalTime: string;
  kmDepart: string;
  kmArrivee: string;
  internalNotes: string;
  driverNotes: string;
  history: string;
  dossierLabel: string;
  proofs: ArchiveProof[];
};

type ArchiveAuditItem = {
  id: number;
  action: string;
  user_email: string | null;
  document_name: string | null;
  created_at: string;
};

type ApiListResponse = {
  items: ArchiveListItem[];
  total: number;
};

function dateLabel(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("fr-CA");
}

function safeFilenamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
}

function groupProofsByCategory(proofs: ArchiveProof[]) {
  const photos: ArchiveProof[] = [];
  const signatures: ArchiveProof[] = [];
  const pdfs: ArchiveProof[] = [];
  const preuves: ArchiveProof[] = [];
  const autres: ArchiveProof[] = [];

  for (const proof of proofs) {
    if (proof.type_preuve === "signature") signatures.push(proof);
    else if (proof.mime_type?.startsWith("image/")) photos.push(proof);
    else if (proof.mime_type?.includes("pdf")) pdfs.push(proof);
    else if (
      proof.type_preuve === "document" ||
      proof.type_preuve === "voice" ||
      proof.type_preuve === "note"
    )
      preuves.push(proof);
    else autres.push(proof);
  }

  return { photos, signatures, pdfs, preuves, autres };
}

export default function LivraisonArchivesPage() {
  const { user, loading: accessLoading, hasPermission, role } = useCurrentAccess();
  const blocked = !accessLoading && !!user && !hasPermission("livraisons");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [clientFilter, setClientFilter] = useState("");
  const [chauffeurFilter, setChauffeurFilter] = useState("");
  const [vehiculeFilter, setVehiculeFilter] = useState("");
  const [remorqueFilter, setRemorqueFilter] = useState("");
  const [addressFilter, setAddressFilter] = useState("");
  const [commandeFilter, setCommandeFilter] = useState("");
  const [factureFilter, setFactureFilter] = useState("");
  const [contactFilter, setContactFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");

  const [page, setPage] = useState(1);
  const limit = 25;

  const [rows, setRows] = useState<ArchiveListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selected, setSelected] = useState<ArchiveDetail | null>(null);
  const [auditItems, setAuditItems] = useState<ArchiveAuditItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [zipLoadingId, setZipLoadingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (statusFilter) params.set("statut", statusFilter);
    if (dateDebut) params.set("dateDebut", dateDebut);
    if (dateFin) params.set("dateFin", dateFin);
    if (search) params.set("search", search);

    if (clientFilter) params.set("client", clientFilter);
    if (chauffeurFilter) params.set("chauffeur", chauffeurFilter);
    if (vehiculeFilter) params.set("vehicule", vehiculeFilter);
    if (remorqueFilter) params.set("remorque", remorqueFilter);
    if (addressFilter) params.set("adresse", addressFilter);
    if (commandeFilter) params.set("commande", commandeFilter);
    if (factureFilter) params.set("facture", factureFilter);
    if (contactFilter) params.set("contact", contactFilter);
    if (companyFilter) params.set("entreprise", companyFilter);
    return params.toString();
  }, [
    page,
    limit,
    typeFilter,
    statusFilter,
    dateDebut,
    dateFin,
    search,
    clientFilter,
    chauffeurFilter,
    vehiculeFilter,
    remorqueFilter,
    addressFilter,
    commandeFilter,
    factureFilter,
    contactFilter,
    companyFilter,
  ]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setMessageType(null);
    try {
      const res = await fetch(`/api/direction/livraisons-ramassages/archives?${queryString}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Erreur chargement archives.");
      }
      const payload = (await res.json()) as ApiListResponse;
      setRows(payload.items ?? []);
      setTotal(payload.total ?? 0);
    } catch (error) {
      setRows([]);
      setTotal(0);
      setMessage(error instanceof Error ? error.message : "Erreur chargement archives.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  const fetchDetail = useCallback(async () => {
    if (!selectedId || !isDetailOpen) {
      setSelected(null);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/direction/livraisons-ramassages/archives/${selectedId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setSelected(null);
        return;
      }
      setSelected((await res.json()) as ArchiveDetail);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedId, isDetailOpen]);

  const fetchAudit = useCallback(async () => {
    if (!selectedId || !isDetailOpen) {
      setAuditItems([]);
      return;
    }
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/direction/livraisons-ramassages/archives/${selectedId}/audit?limit=20`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setAuditItems([]);
        return;
      }
      const payload = (await res.json()) as { items?: ArchiveAuditItem[] };
      setAuditItems(payload.items ?? []);
    } finally {
      setAuditLoading(false);
    }
  }, [selectedId, isDetailOpen]);

  useEffect(() => {
    if (accessLoading || !user || blocked) return;
    const timer = window.setTimeout(() => {
      void fetchList();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accessLoading, user, blocked, fetchList]);

  useEffect(() => {
    if (accessLoading || !user || blocked) return;
    const timer = window.setTimeout(() => {
      void fetchDetail();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accessLoading, user, blocked, fetchDetail]);

  useEffect(() => {
    if (accessLoading || !user || blocked) return;
    const timer = window.setTimeout(() => {
      void fetchAudit();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accessLoading, user, blocked, fetchAudit]);

  const maxPage = Math.max(1, Math.ceil(total / limit));
  const statusOptions = Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort();
  const grouped = selected ? groupProofsByCategory(selected.proofs) : null;

  const compactInputStyle: React.CSSProperties = { minHeight: 36, height: 36, padding: "6px 10px" };
  const compactGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 8,
  };

  function applyFilters() {
    setPage(1);
    void fetchList();
  }

  function resetAdvancedFilters() {
    setClientFilter("");
    setCommandeFilter("");
    setFactureFilter("");
    setChauffeurFilter("");
    setVehiculeFilter("");
    setRemorqueFilter("");
    setCompanyFilter("");
    setAddressFilter("");
    setContactFilter("");
    setPage(1);
  }

  async function downloadZipServer(item: ArchiveListItem) {
    setZipLoadingId(item.id);
    setMessage("");
    setMessageType(null);
    try {
      const response = await fetch(`/api/direction/livraisons-ramassages/archives/${item.id}/zip`, {
        method: "GET",
      });
      if (!response.ok) throw new Error("ZIP serveur indisponible.");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ??
        `${item.type}_COMMANDE-${safeFilenamePart(item.commande || "commande")}_FACTURE-${safeFilenamePart(item.facture || "facture")}_${safeFilenamePart(item.client || "client")}-${safeFilenamePart(item.plannedDate || new Date().toISOString().slice(0, 10))}.zip`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Téléchargement terminé.");
      setMessageType("success");
      void fetchAudit();
    } catch {
      setMessage("Le téléchargement principal n’a pas fonctionné. Tentative de téléchargement alternatif en cours.");
      setMessageType("error");
      if (selected && selected.id === item.id) {
        try {
          await downloadZipClientFallback(selected);
        } catch {
          setMessage("Impossible de télécharger le dossier complet pour le moment. Veuillez réessayer.");
          setMessageType("error");
        }
      } else {
        setMessage("Impossible de télécharger le dossier complet pour le moment. Veuillez réessayer.");
        setMessageType("error");
      }
    } finally {
      setZipLoadingId(null);
    }
  }

  async function downloadZipClientFallback(detail: ArchiveDetail) {
    const zip = new JSZip();
    const photos = zip.folder("photos");
    const signatures = zip.folder("signatures");
    const documents = zip.folder("documents");
    const preuves = zip.folder("preuves");
    const names = new Map<string, number>();
    const uniqueName = (value: string) => {
      const safe = safeFilenamePart(value || "piece") || "piece";
      const count = names.get(safe) ?? 0;
      names.set(safe, count + 1);
      if (count === 0) return safe;
      const dot = safe.lastIndexOf(".");
      if (dot > 0 && dot < safe.length - 1) return `${safe.slice(0, dot)}-${count + 1}${safe.slice(dot)}`;
      return `${safe}-${count + 1}`;
    };

    for (const doc of detail.proofs) {
      if (!doc.url_fichier) continue;
      try {
        const response = await fetch(doc.url_fichier);
        if (!response.ok) continue;
        const blob = await response.blob();
        const name = uniqueName(doc.nom || `${doc.type_preuve}-${doc.id}`);
        if (doc.type_preuve === "signature") signatures?.file(name, blob);
        else if (doc.mime_type?.startsWith("image/")) photos?.file(name, blob);
        else if (doc.mime_type?.includes("pdf")) documents?.file(name, blob);
        else preuves?.file(name, blob);
      } catch {
        // Skip broken file
      }
    }
    zip.file("resume-dossier.txt", `Type: ${detail.type}\nClient: ${detail.client || "-"}\nStatut: ${detail.status || "-"}`);
    const blob = await zip.generateAsync({ type: "blob" });
    const fallbackName = `${detail.type}_COMMANDE-${safeFilenamePart(detail.commande || "commande")}_FACTURE-${safeFilenamePart(detail.facture || "facture")}_${safeFilenamePart(detail.client || "client")}-${safeFilenamePart(detail.plannedDate || new Date().toISOString().slice(0, 10))}.zip`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fallbackName;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Téléchargement terminé.");
    setMessageType("success");
  }

  if (accessLoading || loading) {
    return <TagoraLoadingScreen isLoading message="Chargement de votre espace..." fullScreen />;
  }

  if (!user) return null;
  if (blocked || (role !== "direction" && role !== "admin")) return null;

  return (
    <main className="page-container">
      <HeaderTagora title="Archives livraisons & ramassages" subtitle="Recherche rapide et dossier complet" />

      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/direction/livraisons" className="tagora-dark-outline-action">Livraisons</Link>
        <Link href="/direction/ramassages" className="tagora-dark-outline-action">Ramassages</Link>
      </div>

      <FeedbackMessage message={message} type={messageType} />

      <section className="tagora-panel" style={{ marginTop: 12, padding: 12 }}>
        <div style={compactGridStyle}>
          <input className="tagora-input" style={compactInputStyle} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche globale" />
          <select className="tagora-input" style={compactInputStyle} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">Type: Tous</option>
            <option value="livraison">Livraison</option>
            <option value="ramassage">Ramassage</option>
          </select>
          <select className="tagora-input" style={compactInputStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Statut: Tous</option>
            {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <input type="date" className="tagora-input" style={compactInputStyle} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          <input type="date" className="tagora-input" style={compactInputStyle} value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          <button type="button" className="tagora-dark-action" onClick={applyFilters}>Rechercher</button>
          <button type="button" className="tagora-dark-outline-action" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Masquer filtres avancés" : "Filtres avancés"}
          </button>
          <button type="button" className="tagora-dark-outline-action" onClick={() => void fetchList()}>
            Actualiser
          </button>
        </div>

        {showAdvanced ? (
          <div style={{ ...compactGridStyle, marginTop: 10 }}>
            <input className="tagora-input" style={compactInputStyle} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} placeholder="Client" />
            <input className="tagora-input" style={compactInputStyle} value={commandeFilter} onChange={(e) => setCommandeFilter(e.target.value)} placeholder="Commande" />
            <input className="tagora-input" style={compactInputStyle} value={factureFilter} onChange={(e) => setFactureFilter(e.target.value)} placeholder="Facture" />
            <input className="tagora-input" style={compactInputStyle} value={chauffeurFilter} onChange={(e) => setChauffeurFilter(e.target.value)} placeholder="Chauffeur" />
            <input className="tagora-input" style={compactInputStyle} value={vehiculeFilter} onChange={(e) => setVehiculeFilter(e.target.value)} placeholder="Vehicule" />
            <input className="tagora-input" style={compactInputStyle} value={remorqueFilter} onChange={(e) => setRemorqueFilter(e.target.value)} placeholder="Remorque" />
            <input className="tagora-input" style={compactInputStyle} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} placeholder="Entreprise" />
            <input className="tagora-input" style={compactInputStyle} value={addressFilter} onChange={(e) => setAddressFilter(e.target.value)} placeholder="Adresse" />
            <input className="tagora-input" style={compactInputStyle} value={contactFilter} onChange={(e) => setContactFilter(e.target.value)} placeholder="Téléphone/courriel" />
            <button type="button" className="tagora-dark-action" onClick={applyFilters}>Appliquer</button>
            <button type="button" className="tagora-dark-outline-action" onClick={resetAdvancedFilters}>Réinitialiser</button>
          </div>
        ) : null}
      </section>

      <section className="tagora-panel" style={{ marginTop: 12, paddingTop: 10 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Client</th>
                <th style={thStyle}>Commande</th>
                <th style={thStyle}>Facture</th>
                <th style={thStyle}>Chauffeur</th>
                <th style={thStyle}>Statut</th>
                <th style={thStyle}>Documents</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id}>
                  <td style={tdStyle}>{entry.plannedDate || "-"}</td>
                  <td style={tdStyle}>{entry.type === "ramassage" ? "Ramassage" : "Livraison"}</td>
                  <td style={tdStyle}>{entry.client || "-"}</td>
                  <td style={tdStyle}>{entry.commande || "-"}</td>
                  <td style={tdStyle}>{entry.facture || "-"}</td>
                  <td style={tdStyle}>{entry.chauffeurLabel || "-"}</td>
                  <td style={tdStyle}>{entry.status || "-"}</td>
                  <td style={tdStyle}>{entry.proofCount > 0 ? String(entry.proofCount) : "Aucun document"}</td>
                  <td style={tdStyle}>
                    <div className="actions-row">
                      <button
                        className="tagora-dark-outline-action"
                        onClick={() => {
                          setSelectedId(entry.id);
                          setIsDetailOpen(true);
                        }}
                      >
                        Voir
                      </button>
                      <button
                        className="tagora-dark-action"
                        onClick={() => void downloadZipServer(entry)}
                        disabled={zipLoadingId === entry.id || entry.proofCount === 0}
                      >
                        {zipLoadingId === entry.id ? "ZIP..." : "ZIP"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span className="ui-text-muted">Page {page} / {maxPage}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="tagora-dark-outline-action" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Précédent</button>
            <button className="tagora-dark-outline-action" onClick={() => setPage((p) => Math.min(maxPage, p + 1))} disabled={page >= maxPage}>Suivant</button>
          </div>
        </div>
      </section>

      {isDetailOpen ? (
        <>
          <button
            type="button"
            onClick={() => setIsDetailOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.42)",
              border: "none",
              zIndex: 80,
            }}
            aria-label="Fermer le panneau détail"
          />
          <aside
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100vh",
              width: "min(760px, 100vw)",
              background: "#ffffff",
              borderLeft: "1px solid #e2e8f0",
              boxShadow: "-8px 0 30px rgba(15,23,42,0.18)",
              zIndex: 90,
              overflowY: "auto",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <h2 className="section-title" style={{ margin: 0 }}>
                Dossier {selectedId ? `#${selectedId}` : ""}
              </h2>
              <button className="tagora-dark-outline-action" onClick={() => setIsDetailOpen(false)}>Fermer</button>
            </div>

            {detailLoading || !selected ? (
              <p className="ui-text-muted" style={{ marginTop: 12 }}>Chargement de la fiche...</p>
            ) : (
              <>
                <div className="tagora-form-grid" style={{ marginTop: 10 }}>
                  <Info label="Type" value={selected.type} />
                  <Info label="Date prevue" value={selected.plannedDate || "-"} />
                  <Info label="Date reelle" value={selected.realDate || "-"} />
                  <Info label="Client" value={selected.client || "-"} />
                  <Info label="Adresse" value={selected.address || "-"} />
                  <Info label="Commande" value={selected.commande || "-"} />
                  <Info label="Facture" value={selected.facture || "-"} />
                  <Info label="Chauffeur" value={selected.chauffeurLabel || "-"} />
                  <Info label="Vehicule" value={selected.vehiculeLabel || "-"} />
                  <Info label="Remorque" value={selected.remorqueLabel || "-"} />
                  <Info label="Statut" value={selected.status || "-"} />
                  <Info label="Notes internes" value={selected.internalNotes || "-"} />
                  <Info label="Notes chauffeur" value={selected.driverNotes || "-"} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <button className="tagora-dark-action" onClick={() => void downloadZipServer(selected)} disabled={zipLoadingId === selected.id || selected.proofCount === 0}>
                    {zipLoadingId === selected.id ? "Generation ZIP..." : "Télécharger ZIP"}
                  </button>
                </div>

                <h3 style={{ marginTop: 16, marginBottom: 8, fontSize: 16 }}>
                  Documents ({selected.proofs.length})
                </h3>
                {grouped ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <ProofSection title="Photos" proofs={grouped.photos} />
                    <ProofSection title="Signatures" proofs={grouped.signatures} />
                    <ProofSection title="Documents PDF" proofs={grouped.pdfs} />
                    <ProofSection title="Preuves" proofs={grouped.preuves} />
                    <ProofSection title="Autres fichiers" proofs={grouped.autres} />
                  </div>
                ) : (
                  <p className="ui-text-muted">Aucun document</p>
                )}

                <section style={{ marginTop: 16 }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Historique du dossier</h3>
                  {auditLoading ? (
                    <p className="ui-text-muted">Chargement de l historique...</p>
                  ) : auditItems.length === 0 ? (
                    <p className="ui-text-muted">Aucune action enregistrée.</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Date</th>
                            <th style={thStyle}>Utilisateur</th>
                            <th style={thStyle}>Action</th>
                            <th style={thStyle}>Detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditItems.map((item) => (
                            <tr key={item.id}>
                              <td style={tdStyle}>{dateLabel(item.created_at)}</td>
                              <td style={tdStyle}>{item.user_email || "-"}</td>
                              <td style={tdStyle}>{item.action}</td>
                              <td style={tdStyle}>{item.document_name || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </aside>
        </>
      ) : null}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="tagora-field">
      <span className="tagora-label">{label}</span>
      <div className="tagora-input" style={{ minHeight: 36, display: "flex", alignItems: "center", padding: "4px 10px" }}>
        {value}
      </div>
    </div>
  );
}

function ProofSection({ title, proofs }: { title: string; proofs: ArchiveProof[] }) {
  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h4>
      {proofs.length === 0 ? (
        <p className="ui-text-muted" style={{ margin: 0 }}>Aucun document</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {proofs.map((doc) => (
            <div key={doc.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{doc.nom || doc.type_preuve}</strong>
                <span className="ui-text-muted">{dateLabel(doc.date_heure)}</span>
              </div>
              <p className="ui-text-muted" style={{ margin: "6px 0" }}>
                Type: {doc.type_preuve}{doc.categorie ? ` • ${doc.categorie}` : ""}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className="tagora-dark-outline-action" href={doc.url_fichier} target="_blank" rel="noopener noreferrer">Ouvrir</a>
                <a className="tagora-dark-action" href={doc.url_fichier} download={doc.nom || undefined} style={{ textDecoration: "none", display: "inline-flex", padding: "8px 12px", borderRadius: 8 }}>
                  Télécharger
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 12,
  color: "#475569",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 12,
  color: "#0f172a",
  verticalAlign: "top",
};
