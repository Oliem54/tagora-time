"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "../../../lib/supabase/client";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import FormField from "@/app/components/ui/FormField";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";

export default function NewDossierPage() {
  const router = useRouter();
  const { loading: accessLoading, hasPermission } = useCurrentAccess();

  const [nom, setNom] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!nom.trim()) {
      alert("Entre un nom de dossier");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      alert("Non connecte");
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

    alert("Dossier cree");
    router.push("/employe/dashboard");
  };

  if (accessLoading) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Nouveau dossier" subtitle="Chargement" />
          <SectionCard title="Chargement" subtitle="Acces en cours." />
        </div>
      </main>
    );
  }

  if (!hasPermission("dossiers")) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Nouveau dossier" subtitle="Creation" />
          <SectionCard title="Acces requis" subtitle="Permission requise." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Nouveau dossier"
          subtitle="Creation"
        />

        <SectionCard
          title="Creer un dossier"
          subtitle="Informations principales."
        >
          <form className="ui-stack-md" style={{ maxWidth: 920 }} onSubmit={handleSubmit}>
            <FormField label="Nom du dossier">
              <input
                placeholder="Nom du dossier"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="tagora-input"
              />
            </FormField>

            <FormField label="Client">
              <input
                placeholder="Client"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="tagora-input"
              />
            </FormField>

            <FormField label="Description">
              <textarea
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="tagora-textarea"
                style={{ minHeight: 160 }}
              />
            </FormField>

            <div style={{ display: "flex", gap: "var(--ui-space-3)", flexWrap: "wrap" }}>
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Creation..." : "Creer"}
              </PrimaryButton>
              <SecondaryButton type="button" onClick={() => router.push("/employe/dashboard")}>
                Retour
              </SecondaryButton>
            </div>
          </form>
        </SectionCard>
      </div>
    </main>
  );
}
