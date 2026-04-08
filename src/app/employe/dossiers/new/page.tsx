"use client";

import AccessNotice from "@/app/components/AccessNotice";
import HeaderTagora from "../../../components/HeaderTagora";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "../../../lib/supabase/client";

export default function NewDossierPage() {
  const router = useRouter();
  const { loading: accessLoading, hasPermission } = useCurrentAccess();

  const [nom, setNom] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!nom.trim()) {
      alert("Entre un nom de dossier");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      alert("Non connecté");
      router.push("/employe/login");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("dossiers").insert([
      {
        nom,
        client,
        description,
        statut: "Nouveau",
        user_id: userData.user.id,
      },
    ]);

    setSaving(false);

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    alert("Dossier créé");
    router.push("/employe/dashboard");
  };

  if (accessLoading) {
    return (
      <div className="page-container">
        <HeaderTagora title="Nouveau dossier" subtitle="Chargement des acces" />
        <AccessNotice description="Verification de vos autorisations en cours." />
      </div>
    );
  }

  if (!hasPermission("dossiers")) {
    return (
      <div className="page-container">
        <HeaderTagora
          title="Nouveau dossier"
          subtitle="Creation d un dossier terrain"
        />
        <AccessNotice description="La permission dossiers est necessaire pour creer un nouveau dossier terrain." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <HeaderTagora
        title="Nouveau dossier"
        subtitle="Création d’un dossier terrain"
      />

      <div
        style={{
          background: "white",
          borderRadius: 20,
          padding: 28,
          marginTop: 24,
          border: "1px solid #e5e7eb",
          boxShadow: "0 16px 36px rgba(15, 23, 42, 0.08)",
          maxWidth: 900,
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: 18,
            fontSize: 24,
            color: "#17376b",
          }}
        >
          Créer un dossier
        </h2>

        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              marginBottom: 8,
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            Nom du dossier
          </div>

          <input
            placeholder="Nom du dossier"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="tagora-input"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              marginBottom: 8,
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            Client
          </div>

          <input
            placeholder="Client"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className="tagora-input"
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              marginBottom: 8,
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            Description
          </div>

          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="tagora-textarea"
            style={{ height: 130, resize: "none" }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button onClick={handleSubmit} disabled={saving} className="tagora-dark-action">
            {saving ? "Enregistrement..." : "Creer le dossier"}
          </button>

          <button onClick={() => router.push("/employe/dashboard")} className="tagora-dark-outline-action">
            Retour au dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
