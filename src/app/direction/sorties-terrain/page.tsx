"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AccessNotice from "@/app/components/AccessNotice";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";

type Row = Record<string, string | number | null | undefined>;

const emptyForm = {
  livraison_id: "",
  dossier_id: "",
  chauffeur_id: "",
  vehicule_id: "",
  remorque_id: "",
  date_sortie: "",
  heure_depart: "",
  heure_retour: "",
  km_depart: "",
  km_retour: "",
  notes: "",
};

export default function Page() {
  const searchParams = useSearchParams();
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();

  const [sorties, setSorties] = useState<Row[]>([]);
  const [livraisons, setLivraisons] = useState<Row[]>([]);
  const [dossiers, setDossiers] = useState<Row[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Row[]>([]);
  const [vehicules, setVehicules] = useState<Row[]>([]);
  const [remorques, setRemorques] = useState<Row[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [linkedDataNotice, setLinkedDataNotice] = useState("");

  const blocked = !accessLoading && !!user && !hasPermission("terrain");

  function setFeedbackMessage(msg: string, type: "success" | "error") {
    setMessage(msg);
    setMessageType(type);
  }

  function clearMessage() {
    setMessage("");
    setMessageType(null);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    clearMessage();

    const results = await Promise.allSettled([
      supabase.from("sorties_terrain").select("*").order("id", { ascending: false }),
      supabase.from("livraisons_planifiees").select("*").order("id", { ascending: false }),
      supabase.from("dossiers").select("*").order("id", { ascending: false }),
      supabase.from("chauffeurs").select("*").order("id", { ascending: true }),
      supabase.from("vehicules").select("*").order("id", { ascending: true }),
      supabase.from("remorques").select("*").order("id", { ascending: true }),
    ]);

    const notices: string[] = [];
    const sortiesRes = results[0].status === "fulfilled" ? results[0].value : null;
    const livraisonsRes = results[1].status === "fulfilled" ? results[1].value : null;
    const dossiersRes = results[2].status === "fulfilled" ? results[2].value : null;
    const chauffeursRes = results[3].status === "fulfilled" ? results[3].value : null;
    const vehiculesRes = results[4].status === "fulfilled" ? results[4].value : null;
    const remorquesRes = results[5].status === "fulfilled" ? results[5].value : null;

    if (!sortiesRes || sortiesRes.error) {
      setSorties([]);
      setFeedbackMessage("Les sorties terrain ne sont pas accessibles pour le moment.", "error");
    } else {
      setSorties(sortiesRes.data || []);
    }

    if (!livraisonsRes || livraisonsRes.error) {
      setLivraisons([]);
      notices.push("livraisons liees");
    } else {
      setLivraisons(livraisonsRes.data || []);
    }

    if (!dossiersRes || dossiersRes.error) {
      setDossiers([]);
      notices.push("dossiers");
    } else {
      setDossiers(dossiersRes.data || []);
    }

    if (!chauffeursRes || chauffeursRes.error) {
      setChauffeurs([]);
      notices.push("chauffeurs");
    } else {
      setChauffeurs(chauffeursRes.data || []);
    }

    if (!vehiculesRes || vehiculesRes.error) {
      setVehicules([]);
      notices.push("vehicules");
    } else {
      setVehicules(vehiculesRes.data || []);
    }

    if (!remorquesRes || remorquesRes.error) {
      setRemorques([]);
      notices.push("remorques");
    } else {
      setRemorques(remorquesRes.data || []);
    }

    setLinkedDataNotice(notices.length > 0 ? `Certaines tables liees sont limitees sur ce compte : ${notices.join(", ")}.` : "");
    setLoading(false);
  }, []);

  useEffect(() => {
    if (accessLoading || !user || blocked) return;
    const timeout = setTimeout(() => {
      void fetchData();
    }, 0);
    return () => clearTimeout(timeout);
  }, [accessLoading, blocked, fetchData, user]);

  useEffect(() => {
    const livraisonId = searchParams.get("livraison_id");
    if (!livraisonId || livraisons.length === 0) return;
    const livraison = livraisons.find((item) => String(item.id) === livraisonId);
    if (!livraison) return;
    const timeout = setTimeout(() => {
      setForm({
        ...emptyForm,
        livraison_id: livraisonId,
        dossier_id: livraison.dossier_id ? String(livraison.dossier_id) : "",
        chauffeur_id: livraison.chauffeur_id ? String(livraison.chauffeur_id) : "",
        vehicule_id: livraison.vehicule_id ? String(livraison.vehicule_id) : "",
        remorque_id: livraison.remorque_id ? String(livraison.remorque_id) : "",
        date_sortie: typeof livraison.date_livraison === "string" ? livraison.date_livraison : "",
      });
    }, 0);
    return () => clearTimeout(timeout);
  }, [livraisons, searchParams]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function getDossierLabel(item: Row) {
    return item.nom || item.titre || item.reference || item.numero || `Dossier #${item.id}`;
  }

  function getChauffeurLabel(item: Row) {
    return item.nom || item.nom_complet || `Chauffeur #${item.id}`;
  }

  function getVehiculeLabel(item: Row) {
    return [item.nom, item.plaque].filter(Boolean).join(" - ") || `Vehicule #${item.id}`;
  }

  function getRemorqueLabel(item: Row) {
    return [item.nom, item.plaque].filter(Boolean).join(" - ") || `Remorque #${item.id}`;
  }

  function getById(list: Row[], id: unknown) {
    return list.find((item) => String(item.id) === String(id));
  }

  function calculateKmTotal(kmDepart: string, kmRetour: string) {
    const kd = Number(kmDepart);
    const kr = Number(kmRetour);
    if (Number.isNaN(kd) || Number.isNaN(kr)) return null;
    return kr - kd;
  }

  function calculateTempsTotal(heureDepart: string, heureRetour: string) {
    if (!heureDepart || !heureRetour) return "";
    const [hd, md] = heureDepart.split(":").map(Number);
    const [hr, mr] = heureRetour.split(":").map(Number);
    const diff = hr * 60 + mr - (hd * 60 + md);
    if (diff < 0) return "";
    return `${Math.floor(diff / 60)}h ${(diff % 60).toString().padStart(2, "0")}m`;
  }

  const kmTotalPreview = useMemo(() => calculateKmTotal(form.km_depart, form.km_retour), [form.km_depart, form.km_retour]);
  const tempsTotalPreview = useMemo(() => calculateTempsTotal(form.heure_depart, form.heure_retour), [form.heure_depart, form.heure_retour]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!form.date_sortie) {
      setFeedbackMessage("La date de sortie est obligatoire.", "error");
      return;
    }

    setSaving(true);
    clearMessage();

    const payload = {
      livraison_id: form.livraison_id ? Number(form.livraison_id) : null,
      dossier_id: form.dossier_id ? Number(form.dossier_id) : null,
      chauffeur_id: form.chauffeur_id ? Number(form.chauffeur_id) : null,
      vehicule_id: form.vehicule_id ? Number(form.vehicule_id) : null,
      remorque_id: form.remorque_id ? Number(form.remorque_id) : null,
      date_sortie: form.date_sortie || null,
      heure_depart: form.heure_depart || null,
      heure_retour: form.heure_retour || null,
      km_depart: form.km_depart ? Number(form.km_depart) : null,
      km_retour: form.km_retour ? Number(form.km_retour) : null,
      km_total: kmTotalPreview,
      temps_total: tempsTotalPreview || null,
      notes: form.notes.trim() || null,
    };

    const res = editingId
      ? await supabase.from("sorties_terrain").update(payload).eq("id", editingId)
      : await supabase.from("sorties_terrain").insert([payload]);

    if (res.error) {
      setFeedbackMessage(`Erreur sauvegarde: ${res.error.message}`, "error");
      setSaving(false);
      return;
    }

    setFeedbackMessage(editingId ? "Sortie terrain modifiee." : "Sortie terrain ajoutee.", "success");
    resetForm();
    await fetchData();
    setSaving(false);
  }

  function handleEdit(item: Row) {
    setEditingId(Number(item.id));
    setForm({
      livraison_id: item.livraison_id ? String(item.livraison_id) : "",
      dossier_id: item.dossier_id ? String(item.dossier_id) : "",
      chauffeur_id: item.chauffeur_id ? String(item.chauffeur_id) : "",
      vehicule_id: item.vehicule_id ? String(item.vehicule_id) : "",
      remorque_id: item.remorque_id ? String(item.remorque_id) : "",
      date_sortie: typeof item.date_sortie === "string" ? item.date_sortie : "",
      heure_depart: typeof item.heure_depart === "string" ? item.heure_depart : "",
      heure_retour: typeof item.heure_retour === "string" ? item.heure_retour : "",
      km_depart: item.km_depart ? String(item.km_depart) : "",
      km_retour: item.km_retour ? String(item.km_retour) : "",
      notes: typeof item.notes === "string" ? item.notes : "",
    });
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Supprimer cette sortie terrain ?")) return;
    const res = await supabase.from("sorties_terrain").delete().eq("id", id);
    if (res.error) {
      setFeedbackMessage(`Erreur suppression: ${res.error.message}`, "error");
      return;
    }
    setFeedbackMessage("Sortie terrain supprimee.", "success");
    if (editingId === id) resetForm();
    await fetchData();
  }

  if (accessLoading || (!blocked && loading)) {
    return (
      <main className="page-container">
        <HeaderTagora title="Direction sorties terrain" subtitle="Execution reelle, kilometres et temps" />
        <AccessNotice description="Verification des acces terrain et chargement des donnees en cours." />
      </main>
    );
  }

  if (!user) return null;

  if (blocked) {
    return (
      <main className="page-container">
        <HeaderTagora title="Direction sorties terrain" subtitle="Execution reelle, kilometres et temps" />
        <AccessNotice description="La permission terrain n est pas active sur ce compte direction. Le module reste masque tant que cet acces n est pas ouvert." />
      </main>
    );
  }

  return (
    <main className="page-container">
      <HeaderTagora title="Direction sorties terrain" subtitle="Execution reelle d une livraison, kilometres et temps" />

      <div className="tagora-panel" style={{ marginTop: 24 }}>
        <FeedbackMessage message={message} type={messageType} />
        {linkedDataNotice ? <div style={{ marginTop: 12 }}><AccessNotice title="Acces partiel" description={linkedDataNotice} /></div> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 1fr) minmax(0, 1.6fr)", gap: 24, alignItems: "start", marginTop: 24 }}>
        <section className="tagora-panel">
          <h2 className="section-title" style={{ marginBottom: 18 }}>{editingId ? "Modifier une sortie" : "Ajouter une sortie"}</h2>
          <form onSubmit={handleSubmit} className="tagora-form-grid">
            <label className="tagora-field"><span className="tagora-label">Livraison liee</span><select value={form.livraison_id} onChange={(e) => setForm({ ...form, livraison_id: e.target.value })} className="tagora-input"><option value="">Choisir une livraison</option>{livraisons.map((item) => <option key={String(item.id)} value={String(item.id)}>{`Livraison #${String(item.id)}`}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Dossier</span><select value={form.dossier_id} onChange={(e) => setForm({ ...form, dossier_id: e.target.value })} className="tagora-input"><option value="">Choisir un dossier</option>{dossiers.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getDossierLabel(item))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Chauffeur</span><select value={form.chauffeur_id} onChange={(e) => setForm({ ...form, chauffeur_id: e.target.value })} className="tagora-input"><option value="">Choisir un chauffeur</option>{chauffeurs.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getChauffeurLabel(item))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Vehicule</span><select value={form.vehicule_id} onChange={(e) => setForm({ ...form, vehicule_id: e.target.value })} className="tagora-input"><option value="">Choisir un vehicule</option>{vehicules.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getVehiculeLabel(item))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Remorque</span><select value={form.remorque_id} onChange={(e) => setForm({ ...form, remorque_id: e.target.value })} className="tagora-input"><option value="">Choisir une remorque</option>{remorques.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(getRemorqueLabel(item))}</option>)}</select></label>
            <label className="tagora-field"><span className="tagora-label">Date sortie</span><input type="date" value={form.date_sortie} onChange={(e) => setForm({ ...form, date_sortie: e.target.value })} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">Heure depart</span><input type="time" value={form.heure_depart} onChange={(e) => setForm({ ...form, heure_depart: e.target.value })} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">Heure retour</span><input type="time" value={form.heure_retour} onChange={(e) => setForm({ ...form, heure_retour: e.target.value })} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">KM depart</span><input type="number" value={form.km_depart} onChange={(e) => setForm({ ...form, km_depart: e.target.value })} className="tagora-input" /></label>
            <label className="tagora-field"><span className="tagora-label">KM retour</span><input type="number" value={form.km_retour} onChange={(e) => setForm({ ...form, km_retour: e.target.value })} className="tagora-input" /></label>
            <div className="tagora-panel" style={{ margin: 0 }}><div className="tagora-label">KM total calcule</div><div style={{ marginTop: 8, fontWeight: 700 }}>{kmTotalPreview ?? "-"}</div></div>
            <div className="tagora-panel" style={{ margin: 0 }}><div className="tagora-label">Temps total calcule</div><div style={{ marginTop: 8, fontWeight: 700 }}>{tempsTotalPreview || "-"}</div></div>
            <label className="tagora-field" style={{ gridColumn: "1 / -1" }}><span className="tagora-label">Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="tagora-textarea" /></label>
            <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="tagora-dark-action" disabled={saving}>{saving ? "Enregistrement..." : editingId ? "Enregistrer les changements" : "Ajouter"}</button>
              {editingId ? <button type="button" className="tagora-dark-outline-action" onClick={resetForm}>Annuler</button> : null}
            </div>
          </form>
        </section>

        <section className="tagora-panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Liste des sorties</h2>
            <button onClick={() => void fetchData()} className="tagora-dark-outline-action">Actualiser</button>
          </div>

          {sorties.length === 0 ? <p className="tagora-note">Aucune sortie terrain trouvee.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr><th style={thStyle}>ID</th><th style={thStyle}>Livraison liee</th><th style={thStyle}>Dossier</th><th style={thStyle}>Date</th><th style={thStyle}>Chauffeur</th><th style={thStyle}>Vehicule</th><th style={thStyle}>Remorque</th><th style={thStyle}>KM total</th><th style={thStyle}>Temps total</th><th style={thStyle}>Actions</th></tr></thead>
                <tbody>
                  {sorties.map((item) => {
                    const chauffeur = getById(chauffeurs, item.chauffeur_id);
                    const vehicule = getById(vehicules, item.vehicule_id);
                    const remorque = getById(remorques, item.remorque_id);
                    const livraison = getById(livraisons, item.livraison_id);
                    const dossier = livraison ? getById(dossiers, livraison.dossier_id) : getById(dossiers, item.dossier_id);
                    const livraisonLabel = livraison ? `Livraison #${String(livraison.id)}${dossier ? ` - ${String(getDossierLabel(dossier))}` : ""}` : item.livraison_id ? `Livraison #${String(item.livraison_id)}` : "-";
                    const dossierLabel = dossier ? String(getDossierLabel(dossier)) : item.dossier_id ? `Dossier #${String(item.dossier_id)}` : "-";
                    return <tr key={String(item.id)}><td style={tdStyle}>{String(item.id)}</td><td style={tdStyle}>{livraisonLabel}</td><td style={tdStyle}>{dossierLabel}</td><td style={tdStyle}>{typeof item.date_sortie === "string" ? item.date_sortie : "-"}</td><td style={tdStyle}>{chauffeur ? String(getChauffeurLabel(chauffeur)) : item.chauffeur_id ? String(item.chauffeur_id) : "-"}</td><td style={tdStyle}>{vehicule ? String(getVehiculeLabel(vehicule)) : item.vehicule_id ? String(item.vehicule_id) : "-"}</td><td style={tdStyle}>{remorque ? String(getRemorqueLabel(remorque)) : item.remorque_id ? String(item.remorque_id) : "-"}</td><td style={tdStyle}>{item.km_total != null ? String(item.km_total) : "-"}</td><td style={tdStyle}>{typeof item.temps_total === "string" ? item.temps_total : "-"}</td><td style={tdStyle}><div className="actions-row">{livraison ? <Link href="/direction/livraisons" className="tagora-dark-outline-action">Voir livraison</Link> : null}<button onClick={() => handleEdit(item)} className="tagora-dark-outline-action">Modifier</button><button onClick={() => void handleDelete(Number(item.id))} className="tagora-dark-action">Supprimer</button></div></td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 1100 };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "14px 12px", borderBottom: "1px solid #e5e7eb", fontSize: 14, color: "#374151", background: "#f9fafb" };
const tdStyle: React.CSSProperties = { padding: "14px 12px", borderBottom: "1px solid #e5e7eb", fontSize: 14, color: "#111827", verticalAlign: "top" };

