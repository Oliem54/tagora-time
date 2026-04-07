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
      <div
        style={{
          minHeight: "100vh",
          background: "#f5f7fb",
          padding: "30px 40px",
          color: "#0f172a",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <HeaderTagora title="Nouveau dossier" subtitle="Chargement des acces" />
        <AccessNotice description="Verification de vos autorisations en cours." />
      </div>
    );
  }

  if (!hasPermission("dossiers")) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f5f7fb",
          padding: "30px 40px",
          color: "#0f172a",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <HeaderTagora
          title="Nouveau dossier"
          subtitle="Creation d un dossier terrain"
        />
        <AccessNotice description="La permission dossiers est necessaire pour creer un nouveau dossier terrain." />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: "30px 40px",
        color: "#0f172a",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <HeaderTagora
        title="Nouveau dossier"
        subtitle="Création d’un dossier terrain"
      />

      <div
        style={{
          background: "white",
          borderRadius: 20,
          padding: 28,
          border: "1px solid #e5e7eb",
          boxShadow: "0 16px 36px rgba(15, 23, 42, 0.08)",
          maxWidth: 900,
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: 22,
            fontSize: 28,
            color: "#17376b",
          }}
        >
          Créer un dossier
        </h2>

        <div style={{ marginBottom: 18 }}>
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
            onFocus={(e) => {
              e.currentTarget.style.border = "1px solid #17376b";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px rgba(23, 55, 107, 0.15)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.border = "1px solid #cbd5e1";
              e.currentTarget.style.boxShadow = "none";
            }}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              fontSize: 16,
              boxSizing: "border-box",
              outline: "none",
              transition: "all 0.2s ease",
            }}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
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
            onFocus={(e) => {
              e.currentTarget.style.border = "1px solid #17376b";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px rgba(23, 55, 107, 0.15)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.border = "1px solid #cbd5e1";
              e.currentTarget.style.boxShadow = "none";
            }}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              fontSize: 16,
              boxSizing: "border-box",
              outline: "none",
              transition: "all 0.2s ease",
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
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
            onFocus={(e) => {
              e.currentTarget.style.border = "1px solid #17376b";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px rgba(23, 55, 107, 0.15)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.border = "1px solid #cbd5e1";
              e.currentTarget.style.boxShadow = "none";
            }}
            style={{
              width: "100%",
              height: 130,
              padding: 14,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              fontSize: 16,
              resize: "none",
              boxSizing: "border-box",
              outline: "none",
              transition: "all 0.2s ease",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={handleSubmit}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
            disabled={saving}
            style={{
              padding: "12px 20px",
              border: "none",
              borderRadius: 12,
              background: "#d6b21f",
              color: "#1e293b",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 16,
              transition: "all 0.15s ease",
            }}
          >
            {saving ? "Enregistrement..." : "Créer le dossier"}
          </button>

          <button
            onClick={() => router.push("/employe/dashboard")}
            style={{
              padding: "12px 20px",
              border: "none",
              borderRadius: 12,
              background: "#17376b",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            Retour au dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
