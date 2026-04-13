"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import HeaderTagora from "@/app/components/HeaderTagora";
import TitanBillingSection from "@/app/components/admin/TitanBillingSection";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import {
  ACCOUNT_REQUEST_COMPANIES,
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import {
  buildTitanHoursByEmployee,
  getTitanSettings,
  type TitanSortieRow,
  type TitanTempsRow,
} from "@/app/lib/titan-billing";
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
  titan_enabled?: boolean | null;
  titan_mode_timeclock?: boolean | null;
  titan_mode_sorties?: boolean | null;
  titan_hourly_rate?: number | null;
  social_benefits_percent?: number | null;
  primary_company?: AccountRequestCompany | null;
  can_work_for_oliem_solutions?: boolean | null;
  can_work_for_titan_produits_industriels?: boolean | null;
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
  titan_enabled: false,
  titan_mode_timeclock: true,
  titan_mode_sorties: true,
  titan_hourly_rate: "",
  social_benefits_percent: "15",
  primary_company: "oliem_solutions" as AccountRequestCompany,
  can_work_for_oliem_solutions: true,
  can_work_for_titan_produits_industriels: false,
};

export default function Page() {
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingRecto, setUploadingRecto] = useState(false);
  const [uploadingVerso, setUploadingVerso] = useState(false);
  const [titanHoursByEmployee, setTitanHoursByEmployee] = useState<Map<string, number>>(
    new Map()
  );
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

    const [chauffeursRes, tempsTitanRes, sortiesTitanRes] = await Promise.all([
      supabase.from("chauffeurs").select("*").order("id", { ascending: true }),
      supabase
        .from("temps_titan")
        .select(
          "id, employe_id, employe_nom, date_travail, duree_heures, payable_minutes, facturable_minutes, temps_presence, temps_payable, temps_non_payable, type_travail, livraison, statut_paiement_titan, company_context"
        ),
      supabase
        .from("sorties_terrain")
        .select(
          "id, chauffeur_id, livraison_id, date_sortie, temps_total, payable_minutes, facturable_minutes, temps_payable, temps_non_payable, company_context"
        )
        .eq("company_context", "titan_produits_industriels"),
    ]);

    if (chauffeursRes.error) {
      setFeedbackMessage(`Erreur chargement: ${chauffeursRes.error.message}`, "error");
      setEmployes([]);
      setTitanHoursByEmployee(new Map());
      setLoading(false);
      return;
    }

    const nextEmployes = (chauffeursRes.data as Employe[]) || [];
    setEmployes(nextEmployes);
    setTitanHoursByEmployee(
      buildTitanHoursByEmployee({
        employes: nextEmployes,
        tempsTitan: ((tempsTitanRes.data ?? []) as TitanTempsRow[]) || [],
        sortiesTitan: ((sortiesTitanRes.data ?? []) as TitanSortieRow[]) || [],
      })
    );
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
      titan_enabled: Boolean(form.titan_enabled),
      titan_mode_timeclock: Boolean(form.titan_mode_timeclock),
      titan_mode_sorties: Boolean(form.titan_mode_sorties),
      titan_hourly_rate: form.titan_hourly_rate ? Number(form.titan_hourly_rate) : null,
      taux_base_titan: form.titan_hourly_rate ? Number(form.titan_hourly_rate) : null,
      social_benefits_percent: form.social_benefits_percent
        ? Number(form.social_benefits_percent)
        : 15,
      primary_company: form.primary_company || null,
      can_work_for_oliem_solutions: Boolean(form.can_work_for_oliem_solutions),
      can_work_for_titan_produits_industriels: Boolean(
        form.can_work_for_titan_produits_industriels
      ) || Boolean(form.titan_enabled),
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
      titan_enabled: item.titan_enabled ?? false,
      titan_mode_timeclock: item.titan_mode_timeclock ?? true,
      titan_mode_sorties: item.titan_mode_sorties ?? true,
      titan_hourly_rate:
        item.titan_hourly_rate != null
          ? String(item.titan_hourly_rate)
          : item.taux_base_titan != null
            ? String(item.taux_base_titan)
            : "",
      social_benefits_percent:
        item.social_benefits_percent != null
          ? String(item.social_benefits_percent)
          : "15",
      primary_company: item.primary_company || "oliem_solutions",
      can_work_for_oliem_solutions: item.can_work_for_oliem_solutions ?? true,
      can_work_for_titan_produits_industriels:
        item.can_work_for_titan_produits_industriels ?? false,
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
              Retour
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
                  <label style={labelStyle}>Compagnie principale</label>
                  <select
                    value={form.primary_company}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        primary_company: e.target.value as AccountRequestCompany,
                      })
                    }
                    style={inputStyle}
                  >
                    {ACCOUNT_REQUEST_COMPANIES.map((company) => (
                      <option key={company.value} value={company.value}>
                        {company.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <TitanBillingSection
                    title="Titan"
                    enabled={Boolean(form.titan_enabled)}
                    modeTimeclock={Boolean(form.titan_mode_timeclock)}
                    modeSorties={Boolean(form.titan_mode_sorties)}
                    hourlyRate={form.titan_hourly_rate}
                    benefitsPercent={form.social_benefits_percent}
                    titanHoursText={
                      editingId
                        ? `${(titanHoursByEmployee.get(String(editingId)) ?? 0).toFixed(2)} h`
                        : "0.00 h"
                    }
                    onEnabledChange={(value) =>
                      setForm({ ...form, titan_enabled: value })
                    }
                    onModeTimeclockChange={(value) =>
                      setForm({ ...form, titan_mode_timeclock: value })
                    }
                    onModeSortiesChange={(value) =>
                      setForm({ ...form, titan_mode_sorties: value })
                    }
                    onHourlyRateChange={(value) =>
                      setForm({ ...form, titan_hourly_rate: value })
                    }
                    onBenefitsPercentChange={(value) =>
                      setForm({ ...form, social_benefits_percent: value })
                    }
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

                <label style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.can_work_for_oliem_solutions)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        can_work_for_oliem_solutions: e.target.checked,
                      })
                    }
                  />
                  <span>Peut travailler pour Oliem Solutions</span>
                </label>

                <label style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.can_work_for_titan_produits_industriels)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        can_work_for_titan_produits_industriels: e.target.checked,
                      })
                    }
                  />
                  <span>Peut travailler pour Titan Produits Industriels</span>
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
                    ? editingId
                      ? "Application..."
                      : "Creation..."
                    : editingId
                    ? "Appliquer les changements"
                    : "Creer"}
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
                      <th style={thStyle}>Compagnie principale</th>
                      <th style={thStyle}>Compagnies permises</th>
                      <th style={thStyle}>Titan</th>
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
                        <td style={tdStyle}>
                          {item.primary_company
                            ? getCompanyLabel(item.primary_company)
                            : "-"}
                        </td>
                        <td style={tdStyle}>
                          {[
                            item.can_work_for_oliem_solutions
                              ? getCompanyLabel("oliem_solutions")
                              : null,
                            item.can_work_for_titan_produits_industriels
                              ? getCompanyLabel("titan_produits_industriels")
                              : null,
                          ]
                            .filter(Boolean)
                            .join(", ") || "-"}
                        </td>
                        <td style={tdStyle}>
                          {(() => {
                            const settings = getTitanSettings(item);
                            const titanHours =
                              titanHoursByEmployee.get(String(item.id)) ?? 0;
                            if (!settings.enabled) return "Desactive";
                            const modes = [
                              settings.modeTimeclock ? "Horodateur" : null,
                              settings.modeSorties ? "Sorties" : null,
                            ]
                              .filter(Boolean)
                              .join(", ");
                            return `${settings.hourlyRate.toFixed(2)} $/h | ${titanHours.toFixed(
                              2
                            )} h | ${modes || "Aucun mode"}`;
                          })()}
                        </td>
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
                              Appliquer les changements
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
