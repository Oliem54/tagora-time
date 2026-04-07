"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import { supabase } from "@/app/lib/supabase/client";

type Row = Record<string, any>;

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

  const searchParams = useSearchParams();

  function setFeedbackMessage(msg: string, type: "success" | "error") {
    setMessage(msg);
    setMessageType(type);
  }

  function clearMessage() {
    setMessage("");
    setMessageType(null);
  }

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const livraisonId = searchParams.get("livraison_id");
    if (livraisonId && livraisons.length > 0) {
      const livraison = livraisons.find((l) => String(l.id) === livraisonId);
      if (livraison) {
        setForm({
          ...emptyForm,
          livraison_id: livraisonId,
          dossier_id: livraison.dossier_id ? String(livraison.dossier_id) : "",
          chauffeur_id: livraison.chauffeur_id ? String(livraison.chauffeur_id) : "",
          vehicule_id: livraison.vehicule_id ? String(livraison.vehicule_id) : "",
          remorque_id: livraison.remorque_id ? String(livraison.remorque_id) : "",
          date_sortie: livraison.date_livraison || "",
        });
      }
    }
  }, [searchParams, livraisons]);

  async function fetchData() {
    setLoading(true);
    clearMessage();

    const [
      sortiesRes,
      livraisonsRes,
      dossiersRes,
      chauffeursRes,
      vehiculesRes,
      remorquesRes,
    ] = await Promise.all([
      supabase.from("sorties_terrain").select("*").order("id", { ascending: false }),
      supabase.from("livraisons_planifiees").select("*").order("id", { ascending: false }),
      supabase.from("dossiers").select("*").order("id", { ascending: false }),
      supabase.from("chauffeurs").select("*").order("id", { ascending: true }),
      supabase.from("vehicules").select("*").order("id", { ascending: true }),
      supabase.from("remorques").select("*").order("id", { ascending: true }),
    ]);

    const errors: string[] = [];
    if (sortiesRes.error) errors.push(`Sorties: ${sortiesRes.error.message}`);
    if (livraisonsRes.error) errors.push(`Livraisons: ${livraisonsRes.error.message}`);
    if (dossiersRes.error) errors.push(`Dossiers: ${dossiersRes.error.message}`);
    if (chauffeursRes.error) errors.push(`Chauffeurs: ${chauffeursRes.error.message}`);
    if (vehiculesRes.error) errors.push(`Véhicules: ${vehiculesRes.error.message}`);
    if (remorquesRes.error) errors.push(`Remorques: ${remorquesRes.error.message}`);

    if (errors.length > 0) {
      setFeedbackMessage(errors.join(" | "), "error");
    }

    setSorties(sortiesRes.data || []);
    setLivraisons(livraisonsRes.data || []);
    setDossiers(dossiersRes.data || []);
    setChauffeurs(chauffeursRes.data || []);
    setVehicules(vehiculesRes.data || []);
    setRemorques(remorquesRes.data || []);
    setLoading(false);
  }

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
    return [item.nom, item.plaque].filter(Boolean).join(" - ") || `Véhicule #${item.id}`;
  }

  function getRemorqueLabel(item: Row) {
    return [item.nom, item.plaque].filter(Boolean).join(" - ") || `Remorque #${item.id}`;
  }

  function getById(list: Row[], id: any) {
    return list.find((x) => String(x.id) === String(id));
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

    const departMinutes = hd * 60 + md;
    const retourMinutes = hr * 60 + mr;
    const diff = retourMinutes - departMinutes;

    if (diff < 0) return "";

    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;

    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  const kmTotalPreview = useMemo(
    () => calculateKmTotal(form.km_depart, form.km_retour),
    [form.km_depart, form.km_retour]
  );

  const tempsTotalPreview = useMemo(
    () => calculateTempsTotal(form.heure_depart, form.heure_retour),
    [form.heure_depart, form.heure_retour]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.date_sortie) {
      setFeedbackMessage("La date de sortie est obligatoire.", "error");
      return;
    }

    // Validation des km
    if (form.km_depart && form.km_retour) {
      const kmDepart = Number(form.km_depart);
      const kmRetour = Number(form.km_retour);
      if (!Number.isNaN(kmDepart) && !Number.isNaN(kmRetour) && kmRetour < kmDepart) {
        setFeedbackMessage("Erreur: Le kilométrage de retour ne peut pas être inférieur au kilométrage de départ.", "error");
        return;
      }
    }

    // Validation des heures
    if (form.heure_depart && form.heure_retour) {
      const [hd, md] = form.heure_depart.split(":").map(Number);
      const [hr, mr] = form.heure_retour.split(":").map(Number);
      const departMinutes = hd * 60 + md;
      const retourMinutes = hr * 60 + mr;
      if (retourMinutes < departMinutes) {
        setFeedbackMessage("Erreur: L'heure de retour ne peut pas être antérieure à l'heure de départ.", "error");
        return;
      }
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

    let res;

    if (editingId) {
      res = await supabase.from("sorties_terrain").update(payload).eq("id", editingId);
    } else {
      res = await supabase.from("sorties_terrain").insert([payload]);
    }

    if (res.error) {
      setFeedbackMessage(`Erreur sauvegarde: ${res.error.message}`, "error");
      setSaving(false);
      return;
    }

    setFeedbackMessage(editingId ? "Sortie terrain modifiée." : "Sortie terrain ajoutée.", "success");
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
      date_sortie: item.date_sortie || "",
      heure_depart: item.heure_depart || "",
      heure_retour: item.heure_retour || "",
      km_depart: item.km_depart ? String(item.km_depart) : "",
      km_retour: item.km_retour ? String(item.km_retour) : "",
      notes: item.notes || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: number) {
    const ok = window.confirm("Supprimer cette sortie terrain ?");
    if (!ok) return;

    clearMessage();
    const res = await supabase.from("sorties_terrain").delete().eq("id", id);

    if (res.error) {
      setFeedbackMessage(`Erreur suppression: ${res.error.message}`, "error");
      return;
    }

    setFeedbackMessage("Sortie terrain supprimée.", "success");
    if (editingId === id) resetForm();
    await fetchData();
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f7" }}>
      <HeaderTagora />

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "30px 20px 60px" }}>
        <div style={headerCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32, color: "#111827" }}>
                Direction - Sorties terrain
              </h1>
              <p style={{ marginTop: 10, marginBottom: 0, color: "#4b5563", fontSize: 16 }}>
                Documente l’exécution réelle d’une livraison et calcule km et temps.
              </p>
            </div>

            <Link href="/direction/dashboard" style={backButtonStyle}>
              Retour dashboard
            </Link>
          </div>

          <FeedbackMessage message={message} type={messageType} />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.6fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 24, color: "#111827" }}>
              {editingId ? "Modifier une sortie" : "Ajouter une sortie"}
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Livraison liée</label>
                  <select
                    value={form.livraison_id}
                    onChange={(e) => setForm({ ...form, livraison_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Choisir une livraison</option>
                    {livraisons.map((item) => (
                      <option key={item.id} value={item.id}>
                        {`Livraison #${item.id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Dossier</label>
                  <select
                    value={form.dossier_id}
                    onChange={(e) => setForm({ ...form, dossier_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Choisir un dossier</option>
                    {dossiers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {getDossierLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Chauffeur</label>
                  <select
                    value={form.chauffeur_id}
                    onChange={(e) => setForm({ ...form, chauffeur_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Choisir un chauffeur</option>
                    {chauffeurs.map((item) => (
                      <option key={item.id} value={item.id}>
                        {getChauffeurLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Véhicule</label>
                  <select
                    value={form.vehicule_id}
                    onChange={(e) => setForm({ ...form, vehicule_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Choisir un véhicule</option>
                    {vehicules.map((item) => (
                      <option key={item.id} value={item.id}>
                        {getVehiculeLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Remorque</label>
                  <select
                    value={form.remorque_id}
                    onChange={(e) => setForm({ ...form, remorque_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Choisir une remorque</option>
                    {remorques.map((item) => (
                      <option key={item.id} value={item.id}>
                        {getRemorqueLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Date sortie</label>
                  <input
                    type="date"
                    value={form.date_sortie}
                    onChange={(e) => setForm({ ...form, date_sortie: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Heure départ</label>
                    <input
                      type="time"
                      value={form.heure_depart}
                      onChange={(e) => setForm({ ...form, heure_depart: e.target.value })}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Heure retour</label>
                    <input
                      type="time"
                      value={form.heure_retour}
                      onChange={(e) => setForm({ ...form, heure_retour: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>KM départ</label>
                    <input
                      type="number"
                      value={form.km_depart}
                      onChange={(e) => setForm({ ...form, km_depart: e.target.value })}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>KM retour</label>
                    <input
                      type="number"
                      value={form.km_retour}
                      onChange={(e) => setForm({ ...form, km_retour: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>KM total calculé</label>
                    <div style={previewBoxStyle}>{kmTotalPreview ?? ""}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>Temps total calculé</label>
                    <div style={previewBoxStyle}>{tempsTotalPreview}</div>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    style={textareaStyle}
                    placeholder="Notes de terrain"
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                <button type="submit" style={primaryButtonStyle} disabled={saving}>
                  {saving ? "Enregistrement..." : editingId ? "Enregistrer les changements" : "Ajouter"}
                </button>

                {editingId ? (
                  <button type="button" onClick={resetForm} style={secondaryButtonStyle}>
                    Annuler
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 24, color: "#111827" }}>
                Liste des sorties
              </h2>

              <button onClick={fetchData} style={secondaryButtonStyle}>
                Actualiser
              </button>
            </div>

            {loading ? (
              <p style={{ color: "#6b7280" }}>Chargement...</p>
            ) : sorties.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Aucune sortie terrain trouvée.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>ID</th>
                      <th style={thStyle}>Livraison liée</th>
                      <th style={thStyle}>Dossier</th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Chauffeur</th>
                      <th style={thStyle}>Véhicule</th>
                      <th style={thStyle}>Remorque</th>
                      <th style={thStyle}>KM total</th>
                      <th style={thStyle}>Temps total</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorties.map((item) => {
                      const chauffeur = getById(chauffeurs, item.chauffeur_id);
                      const vehicule = getById(vehicules, item.vehicule_id);
                      const remorque = getById(remorques, item.remorque_id);
                      const livraison = getById(livraisons, item.livraison_id);
                      const dossier = livraison ? getById(dossiers, livraison.dossier_id) : getById(dossiers, item.dossier_id);

                      const livraisonLabel = livraison ? `Livraison #${livraison.id}${dossier ? ` - ${getDossierLabel(dossier)}` : ""}` : "-";
                      const dossierLabel = dossier ? getDossierLabel(dossier) : "-";

                      return (
                        <tr key={item.id}>
                          <td style={tdStyle}>{item.id}</td>
                          <td style={tdStyle}>{livraisonLabel}</td>
                          <td style={tdStyle}>{dossierLabel}</td>
                          <td style={tdStyle}>{item.date_sortie || ""}</td>
                          <td style={tdStyle}>{chauffeur ? getChauffeurLabel(chauffeur) : ""}</td>
                          <td style={tdStyle}>{vehicule ? getVehiculeLabel(vehicule) : ""}</td>
                          <td style={tdStyle}>{remorque ? getRemorqueLabel(remorque) : ""}</td>
                          <td style={tdStyle}>{item.km_total ?? ""}</td>
                          <td style={tdStyle}>{item.temps_total || ""}</td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {livraison && (
                                <Link
                                  href="/direction/livraisons"
                                  style={smallButtonStyle}
                                >
                                  Voir livraison
                                </Link>
                              )}
                              <button onClick={() => handleEdit(item)} style={smallButtonStyle}>
                                Modifier
                              </button>
                              <button onClick={() => handleDelete(Number(item.id))} style={dangerButtonStyle}>
                                Supprimer
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

const headerCardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 18,
  padding: 24,
  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  marginBottom: 24,
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 18,
  padding: 24,
  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 14,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "0 14px",
  fontSize: 15,
  background: "#ffffff",
  color: "#111827",
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 100,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "12px 14px",
  fontSize: 15,
  background: "#ffffff",
  color: "#111827",
  outline: "none",
  resize: "vertical",
};

const previewBoxStyle: React.CSSProperties = {
  minHeight: 46,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "12px 14px",
  fontSize: 15,
  background: "#f9fafb",
  color: "#111827",
  display: "flex",
  alignItems: "center",
};

const primaryButtonStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 12,
  border: "none",
  padding: "0 18px",
  fontSize: 15,
  cursor: "pointer",
  background: "#111827",
  color: "#ffffff",
};

const secondaryButtonStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "0 18px",
  fontSize: 15,
  cursor: "pointer",
  background: "#ffffff",
  color: "#111827",
};

const smallButtonStyle: React.CSSProperties = {
  height: 36,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  padding: "0 12px",
  fontSize: 14,
  cursor: "pointer",
  background: "#ffffff",
  color: "#111827",
};

const dangerButtonStyle: React.CSSProperties = {
  height: 36,
  borderRadius: 10,
  border: "none",
  padding: "0 12px",
  fontSize: 14,
  cursor: "pointer",
  background: "#dc2626",
  color: "#ffffff",
};

const backButtonStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "0 18px",
  fontSize: 15,
  cursor: "pointer",
  background: "#ffffff",
  color: "#111827",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1100,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#374151",
  background: "#f9fafb",
};

const tdStyle: React.CSSProperties = {
  padding: "14px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 14,
  color: "#111827",
  verticalAlign: "top",
};

const messageStyle: React.CSSProperties = {
  marginTop: 18,
  padding: "12px 14px",
  borderRadius: 12,
  background: "#eef6ff",
  color: "#0f172a",
  fontSize: 14,
};