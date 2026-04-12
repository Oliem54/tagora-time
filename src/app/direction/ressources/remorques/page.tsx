"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import HeaderTagora from "@/app/components/HeaderTagora";
import { supabase } from "@/app/lib/supabase/client";

type Remorque = {
  id: number;
  nom?: string | null;
  plaque?: string | null;
  description?: string | null;
  actif?: boolean | null;
};

const emptyForm = {
  nom: "",
  plaque: "",
  description: "",
  actif: true,
};

export default function Page() {
  const [remorques, setRemorques] = useState<Remorque[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const fetchRemorques = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const res = await supabase
      .from("remorques")
      .select("*")
      .order("id", { ascending: true });

    if (res.error) {
      setMessage(`Erreur chargement: ${res.error.message}`);
      setRemorques([]);
      setLoading(false);
      return;
    }

    setRemorques((res.data as Remorque[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function loadInitialRemorques() {
      await fetchRemorques();
    }

    void loadInitialRemorques();
  }, [fetchRemorques]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.nom.trim()) {
      setMessage("Le nom est obligatoire.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      nom: form.nom.trim(),
      plaque: form.plaque.trim() || null,
      description: form.description.trim() || null,
      actif: form.actif,
    };

    let res;

    if (editingId) {
      res = await supabase.from("remorques").update(payload).eq("id", editingId);
    } else {
      res = await supabase.from("remorques").insert([payload]);
    }

    if (res.error) {
      setMessage(`Erreur sauvegarde: ${res.error.message}`);
      setSaving(false);
      return;
    }

    setMessage(editingId ? "Remorque modifiée." : "Remorque ajoutée.");
    resetForm();
    await fetchRemorques();
    setSaving(false);
  }

  function handleEdit(item: Remorque) {
    setEditingId(item.id);
    setForm({
      nom: item.nom || "",
      plaque: item.plaque || "",
      description: item.description || "",
      actif: item.actif ?? true,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: number) {
    const ok = window.confirm("Supprimer cette remorque ?");
    if (!ok) return;

    setMessage("");

    const res = await supabase.from("remorques").delete().eq("id", id);

    if (res.error) {
      setMessage(`Erreur suppression: ${res.error.message}`);
      return;
    }

    setMessage("Remorque supprimée.");

    if (editingId === id) {
      resetForm();
    }

    await fetchRemorques();
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f7" }}>
      <HeaderTagora />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "30px 20px 60px" }}>
        <div style={cardHeaderStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <h1 style={titleStyle}>Direction - Remorques</h1>
              <p style={subtitleStyle}>
                Ajoute, modifie et gère les remorques.
              </p>
            </div>

            <Link href="/direction/ressources" style={backButtonStyle}>
              Retour
            </Link>
          </div>

          {message && <div style={messageStyle}>{message}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 24 }}>
          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>
              {editingId ? "Modifier" : "Ajouter"} une remorque
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gap: 12 }}>
                <input
                  placeholder="Nom"
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  style={inputStyle}
                />

                <input
                  placeholder="Plaque"
                  value={form.plaque}
                  onChange={(e) => setForm({ ...form, plaque: e.target.value })}
                  style={inputStyle}
                />

                <input
                  placeholder="Description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  style={inputStyle}
                />

                <label>
                  <input
                    type="checkbox"
                    checked={form.actif}
                    onChange={(e) => setForm({ ...form, actif: e.target.checked })}
                  />{" "}
                  Actif
                </label>
              </div>

              <div style={{ marginTop: 16 }}>
                <button className="tagora-dark-action" style={primaryButtonStyle} disabled={saving}>
                  {editingId ? "Appliquer les changements" : "Creer"}
                </button>

                {editingId && (
                  <button type="button" onClick={resetForm} style={secondaryButtonStyle}>
                    Annuler
                  </button>
                )}
              </div>
            </form>
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>Liste des remorques</h2>

            {loading ? (
              <p>Chargement...</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nom</th>
                    <th>Plaque</th>
                    <th>Actif</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {remorques.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{r.nom}</td>
                      <td>{r.plaque}</td>
                      <td>{r.actif ? "Oui" : "Non"}</td>
                      <td>
                        <button onClick={() => handleEdit(r)}>Appliquer les changements</button>
                        <button onClick={() => handleDelete(r.id)}>Supprimer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

const cardStyle = {
  background: "#fff",
  padding: 20,
  borderRadius: 12,
};

const cardHeaderStyle = {
  background: "#fff",
  padding: 20,
  borderRadius: 12,
  marginBottom: 20,
};

const titleStyle = { fontSize: 28 };
const subtitleStyle = { color: "#666" };
const sectionTitleStyle = { marginBottom: 12 };
const inputStyle = { padding: 10, borderRadius: 8, border: "1px solid #ccc" };

const primaryButtonStyle = {
  padding: "10px 16px",
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  marginRight: 10,
};

const secondaryButtonStyle = {
  padding: "10px 16px",
  background: "#eee",
  border: "none",
  borderRadius: 8,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const messageStyle = {
  marginTop: 10,
  color: "#2563eb",
};

const backButtonStyle = {
  padding: "10px 16px",
  border: "1px solid #ccc",
  borderRadius: 8,
  textDecoration: "none",
};
