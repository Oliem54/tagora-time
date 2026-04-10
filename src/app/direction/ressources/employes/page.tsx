"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import { supabase } from "@/app/lib/supabase/client";

type Employe = {
  id: number;
  nom?: string | null;
  telephone?: string | null;
  courriel?: string | null;
  numero_permis?: string | null;
  classe_permis?: string | null;
  expiration_permis?: string | null;
  restrictions_permis?: string | null;
  actif?: boolean | null;
  notes?: string | null;
  photo_permis_recto_url?: string | null;
  photo_permis_verso_url?: string | null;
  taux_base_titan?: number | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Erreur inconnue";
}

const emptyForm = {
  nom: "",
  telephone: "",
  courriel: "",
  numero_permis: "",
  classe_permis: "",
  expiration_permis: "",
  restrictions_permis: "",
  actif: true,
  notes: "",
  photo_permis_recto_url: "",
  photo_permis_verso_url: "",
  taux_base_titan: "",
};

export default function Page() {
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingRecto, setUploadingRecto] = useState(false);
  const [uploadingVerso, setUploadingVerso] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  function setFeedbackMessage(msg: string, type: "success" | "error") {
    setMessage(msg);
    setMessageType(type);
  }

  function clearMessage() {
    setMessage("");
    setMessageType(null);
  }

  const fetchEmployes = useCallback(async () => {
    setLoading(true);
    clearMessage();

    const res = await supabase
      .from("chauffeurs")
      .select("*")
      .order("id", { ascending: true });

    if (res.error) {
      setFeedbackMessage(`Erreur chargement: ${res.error.message}`, "error");
      setEmployes([]);
      setLoading(false);
      return;
    }

    setEmployes((res.data as Employe[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function loadInitialEmployes() {
      await fetchEmployes();
    }

    void loadInitialEmployes();
  }, [fetchEmployes]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function uploadPermisFile(file: File, side: "recto" | "verso") {
    const safeName = form.nom?.trim() || `chauffeur-${Date.now()}`;
    const extension = file.name.split(".").pop() || "jpg";
    const fileName = `${safeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}-${side}-${Date.now()}.${extension}`;

    const path = `permis/${fileName}`;

    const uploadRes = await supabase.storage
      .from("chauffeurs-documents")
      .upload(path, file, {
        upsert: true,
      });

    if (uploadRes.error) {
      throw new Error(uploadRes.error.message);
    }

    const publicUrlRes = supabase.storage
      .from("chauffeurs-documents")
      .getPublicUrl(path);

    return publicUrlRes.data.publicUrl;
  }

  async function handleRectoUpload(file: File | null) {
    if (!file) return;

    try {
      setUploadingRecto(true);
      clearMessage();
      const url = await uploadPermisFile(file, "recto");
      setForm((prev) => ({ ...prev, photo_permis_recto_url: url }));
      setFeedbackMessage("Photo recto téléversée.", "success");
    } catch (error: unknown) {
      setFeedbackMessage(`Erreur upload recto: ${getErrorMessage(error)}`, "error");
    } finally {
      setUploadingRecto(false);
    }
  }

  async function handleVersoUpload(file: File | null) {
    if (!file) return;

    try {
      setUploadingVerso(true);
      clearMessage();
      const url = await uploadPermisFile(file, "verso");
      setForm((prev) => ({ ...prev, photo_permis_verso_url: url }));
      setFeedbackMessage("Photo verso téléversée.", "success");
    } catch (error: unknown) {
      setFeedbackMessage(`Erreur upload verso: ${getErrorMessage(error)}`, "error");
    } finally {
      setUploadingVerso(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.nom.trim()) {
      setFeedbackMessage("Le nom est obligatoire.", "error");
      return;
    }

    setSaving(true);
    clearMessage();

    const payload = {
      nom: form.nom.trim(),
      telephone: form.telephone.trim() || null,
      courriel: form.courriel.trim() || null,
      numero_permis: form.numero_permis.trim() || null,
      classe_permis: form.classe_permis.trim() || null,
      expiration_permis: form.expiration_permis || null,
      restrictions_permis: form.restrictions_permis.trim() || null,
      actif: form.actif,
      notes: form.notes.trim() || null,
      photo_permis_recto_url: form.photo_permis_recto_url || null,
      photo_permis_verso_url: form.photo_permis_verso_url || null,
      taux_base_titan: form.taux_base_titan ? Number(form.taux_base_titan) : null,
    };

    let res;

    if (editingId) {
      res = await supabase.from("chauffeurs").update(payload).eq("id", editingId);
    } else {
      res = await supabase.from("chauffeurs").insert([payload]);
    }

    if (res.error) {
      setFeedbackMessage(`Erreur sauvegarde: ${res.error.message}`, "error");
      setSaving(false);
      return;
    }

    setFeedbackMessage(editingId ? "Employé modifié." : "Employé ajouté.", "success");
    resetForm();
    await fetchEmployes();
    setSaving(false);
  }

  function handleEdit(item: Employe) {
    setEditingId(item.id);
    setForm({
      nom: item.nom || "",
      telephone: item.telephone || "",
      courriel: item.courriel || "",
      numero_permis: item.numero_permis || "",
      classe_permis: item.classe_permis || "",
      expiration_permis: item.expiration_permis || "",
      restrictions_permis: item.restrictions_permis || "",
      actif: item.actif ?? true,
      notes: item.notes || "",
      photo_permis_recto_url: item.photo_permis_recto_url || "",
      photo_permis_verso_url: item.photo_permis_verso_url || "",
      taux_base_titan: item.taux_base_titan ? String(item.taux_base_titan) : "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: number) {
    const ok = window.confirm("Supprimer cet employé ?");
    if (!ok) return;

    clearMessage();

    const res = await supabase.from("chauffeurs").delete().eq("id", id);

    if (res.error) {
      setFeedbackMessage(`Erreur suppression: ${res.error.message}`, "error");
      return;
    }

    setFeedbackMessage("Employé supprimé.", "success");

    if (editingId === id) {
      resetForm();
    }

    await fetchEmployes();
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f7" }}>
      <HeaderTagora />

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "30px 20px 60px" }}>
        <div
          style={{
            background: "#ffffff",
            borderRadius: 18,
            padding: 24,
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 32, color: "#111827" }}>
                Direction - Employés / Chauffeurs
              </h1>
              <p style={{ marginTop: 10, marginBottom: 0, color: "#4b5563", fontSize: 16 }}>
                Ajoute, modifie et gère les chauffeurs avec les informations de permis.
              </p>
            </div>

            <Link href="/direction/ressources" style={backButtonStyle}>
              Retour aux ressources
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
          <section
            style={{
              background: "#ffffff",
              borderRadius: 18,
              padding: 24,
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 24, color: "#111827" }}>
              {editingId ? "Modifier un employé" : "Ajouter un employé"}
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nom</label>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={(e) => setForm({ ...form, nom: e.target.value })}
                    style={inputStyle}
                    placeholder="Ex.: Billy Paquet"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input
                    type="text"
                    value={form.telephone}
                    onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                    style={inputStyle}
                    placeholder="Ex.: 418-555-1234"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Courriel</label>
                  <input
                    type="email"
                    value={form.courriel}
                    onChange={(e) => setForm({ ...form, courriel: e.target.value })}
                    style={inputStyle}
                    placeholder="Ex.: nom@entreprise.com"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Numéro de permis</label>
                  <input
                    type="text"
                    value={form.numero_permis}
                    onChange={(e) => setForm({ ...form, numero_permis: e.target.value })}
                    style={inputStyle}
                    placeholder="Ex.: P1234-567890-12"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Classe de permis</label>
                  <input
                    type="text"
                    value={form.classe_permis}
                    onChange={(e) => setForm({ ...form, classe_permis: e.target.value })}
                    style={inputStyle}
                    placeholder="Ex.: Classe 5"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Expiration du permis</label>
                  <input
                    type="date"
                    value={form.expiration_permis}
                    onChange={(e) => setForm({ ...form, expiration_permis: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Restrictions permis</label>
                  <input
                    type="text"
                    value={form.restrictions_permis}
                    onChange={(e) =>
                      setForm({ ...form, restrictions_permis: e.target.value })
                    }
                    style={inputStyle}
                    placeholder="Ex.: Lunettes obligatoires"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Taux de base Titan ($/h)</label>
                  <input
                    type="number"
                    value={form.taux_base_titan}
                    onChange={(e) =>
                      setForm({ ...form, taux_base_titan: e.target.value })
                    }
                    style={inputStyle}
                    placeholder="Ex.: 25.50"
                    step="0.01"
                    min="0"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Photo permis recto</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleRectoUpload(e.target.files?.[0] || null)}
                    style={fileInputStyle}
                  />
                  {uploadingRecto ? (
                    <p style={helperTextStyle}>Téléversement recto...</p>
                  ) : null}
                  {form.photo_permis_recto_url ? (
                    <div style={{ marginTop: 10 }}>
                      <img
                        src={form.photo_permis_recto_url}
                        alt="Permis recto"
                        style={previewImageStyle}
                      />
                    </div>
                  ) : null}
                </div>

                <div>
                  <label style={labelStyle}>Photo permis verso</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleVersoUpload(e.target.files?.[0] || null)}
                    style={fileInputStyle}
                  />
                  {uploadingVerso ? (
                    <p style={helperTextStyle}>Téléversement verso...</p>
                  ) : null}
                  {form.photo_permis_verso_url ? (
                    <div style={{ marginTop: 10 }}>
                      <img
                        src={form.photo_permis_verso_url}
                        alt="Permis verso"
                        style={previewImageStyle}
                      />
                    </div>
                  ) : null}
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    style={textareaStyle}
                    placeholder="Notes internes"
                  />
                </div>

                <label style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={form.actif}
                    onChange={(e) => setForm({ ...form, actif: e.target.checked })}
                  />
                  <span>Employé actif</span>
                </label>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                <button
                  type="submit"
                  className="tagora-dark-action"
                  style={primaryButtonStyle}
                  disabled={saving || uploadingRecto || uploadingVerso}
                >
                  {saving
                    ? "Enregistrement..."
                    : editingId
                    ? "Enregistrer les changements"
                    : "Ajouter"}
                </button>

                {editingId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    style={secondaryButtonStyle}
                  >
                    Annuler
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section
            style={{
              background: "#ffffff",
              borderRadius: 18,
              padding: 24,
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 24, color: "#111827" }}>
                Liste des employés
              </h2>

              <button onClick={fetchEmployes} style={secondaryButtonStyle}>
                Actualiser
              </button>
            </div>

            {loading ? (
              <p style={{ color: "#6b7280" }}>Chargement...</p>
            ) : employes.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Aucun employé trouvé.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>ID</th>
                      <th style={thStyle}>Nom</th>
                      <th style={thStyle}>Téléphone</th>
                      <th style={thStyle}>Permis</th>
                      <th style={thStyle}>Classe</th>
                      <th style={thStyle}>Expiration</th>
                      <th style={thStyle}>Taux Titan</th>
                      <th style={thStyle}>Actif</th>
                      <th style={thStyle}>Photos</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employes.map((item) => (
                      <tr key={item.id}>
                        <td style={tdStyle}>{item.id}</td>
                        <td style={tdStyle}>{item.nom || ""}</td>
                        <td style={tdStyle}>{item.telephone || ""}</td>
                        <td style={tdStyle}>{item.numero_permis || ""}</td>
                        <td style={tdStyle}>{item.classe_permis || ""}</td>
                        <td style={tdStyle}>{item.expiration_permis || ""}</td>
                        <td style={tdStyle}>{item.taux_base_titan ? `${item.taux_base_titan.toFixed(2)} $/h` : "-"}</td>
                        <td style={tdStyle}>{item.actif ? "Oui" : "Non"}</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {item.photo_permis_recto_url ? (
                              <a
                                href={item.photo_permis_recto_url}
                                target="_blank"
                                rel="noreferrer"
                                style={linkStyle}
                              >
                                Recto
                              </a>
                            ) : (
                              <span style={mutedTextStyle}>Recto -</span>
                            )}

                            {item.photo_permis_verso_url ? (
                              <a
                                href={item.photo_permis_verso_url}
                                target="_blank"
                                rel="noreferrer"
                                style={linkStyle}
                              >
                                Verso
                              </a>
                            ) : (
                              <span style={mutedTextStyle}>Verso -</span>
                            )}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              onClick={() => handleEdit(item)}
                              style={smallButtonStyle}
                            >
                              Modifier
                            </button>

                            <button
                              onClick={() => handleDelete(item.id)}
                              style={dangerButtonStyle}
                            >
                              Supprimer
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
      </div>
    </main>
  );
}

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

const fileInputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 14,
  color: "#111827",
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

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 14,
  color: "#374151",
};

const helperTextStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  color: "#6b7280",
};

const previewImageStyle: React.CSSProperties = {
  maxWidth: "100%",
  width: 220,
  borderRadius: 12,
  border: "1px solid #d1d5db",
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

const linkStyle: React.CSSProperties = {
  color: "#2563eb",
  textDecoration: "none",
  fontSize: 14,
};

const mutedTextStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 14,
};
