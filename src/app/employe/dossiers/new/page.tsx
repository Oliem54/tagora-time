"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "../../../lib/supabase/client";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import FormField from "@/app/components/ui/FormField";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";

const INTERVENTION_TYPES = [
  { value: "", label: "Choisir un type" },
  { value: "livraison", label: "Livraison" },
  { value: "ramassage", label: "Ramassage" },
  { value: "incident", label: "Incident / dommage" },
  { value: "depense", label: "Depense employe" },
  { value: "note_interne", label: "Note interne liee a mission" },
] as const;

export default function NewDossierPage() {
  const router = useRouter();
  const { loading: accessLoading, hasPermission } = useCurrentAccess();

  const [typeIntervention, setTypeIntervention] = useState("");
  const [nom, setNom] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [contactNom, setContactNom] = useState("");
  const [dateHeure, setDateHeure] = useState("");
  const [kmDepart, setKmDepart] = useState("");
  const [kmArrivee, setKmArrivee] = useState("");
  const [incidentUrgence, setIncidentUrgence] = useState("moyenne");
  const [depenseMontant, setDepenseMontant] = useState("");
  const [depenseCategorie, setDepenseCategorie] = useState("");
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [selectedOperationId, setSelectedOperationId] = useState("");
  const [operations, setOperations] = useState<
    {
      id: number;
      client: string | null;
      date_livraison: string | null;
      heure_prevue: string | null;
      vehicule: string | null;
      km_depart: number | null;
      km_arrivee: number | null;
      type_operation: string | null;
    }[]
  >([]);
  const [saving, setSaving] = useState(false);

  const isOperationType =
    typeIntervention === "livraison" || typeIntervention === "ramassage";

  const typeOperationFilter = useMemo(() => {
    if (typeIntervention === "livraison") return "livraison_client";
    if (typeIntervention === "ramassage") return "ramassage_client";
    return null;
  }, [typeIntervention]);

  useEffect(() => {
    if (!isOperationType || !typeOperationFilter) {
      const resetTimer = window.setTimeout(() => {
        setOperations([]);
        setSelectedOperationId("");
      }, 0);
      return () => {
        window.clearTimeout(resetTimer);
      };
    }

    let cancelled = false;
    const loadTimer = window.setTimeout(() => {
      void (async () => {
        setOperationsLoading(true);
        const { data, error } = await supabase
          .from("livraisons_planifiees")
          .select(
            "id, client, date_livraison, heure_prevue, vehicule, km_depart, km_arrivee, type_operation, statut"
          )
          .eq("type_operation", typeOperationFilter)
          .in("statut", ["planifiee", "en_cours"])
          .order("date_livraison", { ascending: false })
          .order("heure_prevue", { ascending: false });

        if (!cancelled) {
          if (error) {
            setOperations([]);
          } else {
            setOperations((data as typeof operations) || []);
          }
          setOperationsLoading(false);
        }
      })();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
      cancelled = true;
    };
  }, [isOperationType, typeOperationFilter]);

  useEffect(() => {
    if (!selectedOperationId || !isOperationType) return;
    const operation = operations.find((item) => String(item.id) === selectedOperationId);
    if (!operation) return;
    const hydrateTimer = window.setTimeout(() => {
      if (!nom.trim()) {
        const prefix = typeIntervention === "livraison" ? "LIV" : "RAM";
        setNom(`${prefix}-${operation.id}`);
      }
      if (!client.trim() && operation.client) {
        setClient(operation.client);
      }
      if (!kmDepart.trim() && operation.km_depart != null) {
        setKmDepart(String(operation.km_depart));
      }
      if (!kmArrivee.trim() && operation.km_arrivee != null) {
        setKmArrivee(String(operation.km_arrivee));
      }
      if (!dateHeure.trim() && operation.date_livraison) {
        const heure = (operation.heure_prevue || "00:00").slice(0, 5);
        setDateHeure(`${operation.date_livraison}T${heure}`);
      }
    }, 0);
    return () => {
      window.clearTimeout(hydrateTimer);
    };
  }, [
    selectedOperationId,
    isOperationType,
    operations,
    typeIntervention,
    nom,
    client,
    kmDepart,
    kmArrivee,
    dateHeure,
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!typeIntervention) {
      alert("Choisis un type d intervention");
      return;
    }

    if (!nom.trim()) {
      alert("Entre une reference liee");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      alert("Non connecte");
      router.push("/employe/login");
      return;
    }

    setSaving(true);

    const metadataLines = [
      `type_intervention:${typeIntervention}`,
      `reference_liee:${nom.trim()}`,
      `livraison_id:${selectedOperationId || "-"}`, // Temporary link until PR3 adds structured FK.
      `contact_nom:${contactNom.trim() || "-"}`,
      `date_heure:${dateHeure || "-"}`,
      `km_depart:${kmDepart || "-"}`,
      `km_arrivee:${kmArrivee || "-"}`,
      `incident_urgence:${incidentUrgence || "-"}`,
      `depense_montant:${depenseMontant || "-"}`,
      `depense_categorie:${depenseCategorie.trim() || "-"}`,
    ];
    const descriptionValue = [description.trim(), "---", ...metadataLines]
      .filter(Boolean)
      .join("\n");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch("/api/employe/dossiers", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        nom,
        client,
        description: descriptionValue,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      alert("Erreur : " + (payload?.error ?? res.statusText));
      return;
    }

    alert("Intervention creee");
    router.push("/employe/dashboard");
  };

  if (accessLoading) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Nouvelle intervention" subtitle="Chargement" />
          <SectionCard title="Chargement" subtitle="Acces en cours." />
        </div>
      </main>
    );
  }

  if (!hasPermission("dossiers")) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Nouvelle intervention" subtitle="Creation guidee" />
          <SectionCard title="Acces requis" subtitle="Permission requise." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Nouvelle intervention"
          subtitle="Creation guidee"
        />

        <SectionCard
          title="Creer une intervention"
          subtitle="Type en premier, puis champs adaptes."
        >
          <form className="ui-stack-md" style={{ maxWidth: 920 }} onSubmit={handleSubmit}>
            <FormField label="Type d intervention">
              <select
                value={typeIntervention}
                onChange={(e) => setTypeIntervention(e.target.value)}
                className="tagora-select"
              >
                {INTERVENTION_TYPES.map((item) => (
                  <option key={item.value || "empty"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Reference liee">
              <input
                placeholder="Ex: LIV-2026-041"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="tagora-input"
                readOnly={isOperationType && Boolean(selectedOperationId)}
              />
            </FormField>

            <FormField label="Client">
              <input
                placeholder="Client"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="tagora-input"
                readOnly={isOperationType && Boolean(selectedOperationId) && Boolean(client)}
              />
            </FormField>

            {(typeIntervention === "livraison" || typeIntervention === "ramassage") ? (
              <>
                <FormField
                  label="Operation planifiee"
                  hint="Selectionnez la livraison ou le ramassage deja planifie pour eviter la double saisie."
                >
                  <select
                    className="tagora-select"
                    value={selectedOperationId}
                    onChange={(e) => setSelectedOperationId(e.target.value)}
                  >
                    <option value="">
                      {operationsLoading
                        ? "Chargement des operations..."
                        : "Choisir une operation planifiee"}
                    </option>
                    {operations.map((operation) => (
                      <option key={operation.id} value={String(operation.id)}>
                        #{operation.id} - {operation.client || "Sans client"} -{" "}
                        {operation.date_livraison || "-"} {operation.heure_prevue || ""}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Nom du contact">
                  <input
                    placeholder="Nom du contact"
                    value={contactNom}
                    onChange={(e) => setContactNom(e.target.value)}
                    className="tagora-input"
                  />
                </FormField>
                <FormField label="Date / heure">
                  <input
                    type="datetime-local"
                    value={dateHeure}
                    onChange={(e) => setDateHeure(e.target.value)}
                    className="tagora-input"
                    readOnly={Boolean(selectedOperationId) && Boolean(dateHeure)}
                  />
                </FormField>
                <div className="ui-grid-2">
                  <FormField label="KM depart">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={kmDepart}
                      onChange={(e) => setKmDepart(e.target.value)}
                      className="tagora-input"
                      readOnly={Boolean(selectedOperationId) && Boolean(kmDepart)}
                    />
                  </FormField>
                  <FormField label="KM arrivee">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={kmArrivee}
                      onChange={(e) => setKmArrivee(e.target.value)}
                      className="tagora-input"
                      readOnly={Boolean(selectedOperationId) && Boolean(kmArrivee)}
                    />
                  </FormField>
                </div>
                {selectedOperationId ? (
                  <SectionCard
                    title="Informations reprises automatiquement"
                    subtitle="Donnees recuperees depuis l operation planifiee."
                    tone="muted"
                  >
                    <div className="ui-grid-2">
                      <InfoText label="Operation planifiee" value={`#${selectedOperationId}`} />
                      <InfoText label="Client" value={client || "-"} />
                      <InfoText label="Reference liee" value={nom || "-"} />
                      <InfoText label="Date / heure" value={dateHeure || "-"} />
                      <InfoText label="KM depart / arrivee" value={`${kmDepart || "-"} / ${kmArrivee || "-"}`} />
                    </div>
                  </SectionCard>
                ) : null}
                <SectionCard title="Preuves attendues" subtitle="A valider sur la fiche intervention." tone="muted">
                  <div className="ui-grid-2">
                    <InfoText label="Photos preuve" value="A joindre" />
                    <InfoText label="Signature mobile" value="A joindre" />
                    <InfoText label="Confirmation vocale" value="A joindre" />
                    <InfoText label="Notes" value="Optionnel" />
                  </div>
                </SectionCard>
              </>
            ) : null}

            {typeIntervention === "incident" ? (
              <>
                <FormField label="Niveau d urgence">
                  <select
                    value={incidentUrgence}
                    onChange={(e) => setIncidentUrgence(e.target.value)}
                    className="tagora-select"
                  >
                    <option value="faible">Faible</option>
                    <option value="moyenne">Moyenne</option>
                    <option value="elevee">Elevee</option>
                    <option value="critique">Critique</option>
                  </select>
                </FormField>
                <SectionCard title="Preuves attendues" subtitle="Photos et note incident prioritaires." tone="muted">
                  <div className="ui-grid-2">
                    <InfoText label="Photos" value="Obligatoire terrain" />
                    <InfoText label="Notes" value="Description detaillee" />
                  </div>
                </SectionCard>
              </>
            ) : null}

            {typeIntervention === "depense" ? (
              <>
                <div className="ui-grid-2">
                  <FormField label="Montant">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={depenseMontant}
                      onChange={(e) => setDepenseMontant(e.target.value)}
                      className="tagora-input"
                    />
                  </FormField>
                  <FormField label="Categorie">
                    <input
                      placeholder="Ex: Carburant"
                      value={depenseCategorie}
                      onChange={(e) => setDepenseCategorie(e.target.value)}
                      className="tagora-input"
                    />
                  </FormField>
                </div>
                <SectionCard title="Preuves attendues" subtitle="Recu photo et commentaire depense." tone="muted">
                  <div className="ui-grid-2">
                    <InfoText label="Photo recu" value="A joindre" />
                    <InfoText label="Commentaire" value="A preciser" />
                  </div>
                </SectionCard>
              </>
            ) : null}

            <FormField label="Notes">
              <textarea
                placeholder="Description operationnelle"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="tagora-textarea"
                style={{ minHeight: 160 }}
              />
            </FormField>

            <div style={{ display: "flex", gap: "var(--ui-space-3)", flexWrap: "wrap" }}>
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Creation..." : "Creer l intervention"}
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

function InfoText({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-stack-xs">
      <div className="ui-eyebrow">{label}</div>
      <div>{value}</div>
    </div>
  );
}
