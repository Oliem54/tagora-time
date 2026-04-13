"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Factory,
  MapPin,
  Pencil,
  RefreshCw,
  Route,
  Trash2,
  Warehouse,
} from "lucide-react";
import AppCard from "@/app/components/ui/AppCard";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import FormField from "@/app/components/ui/FormField";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import {
  ACCOUNT_REQUEST_COMPANIES,
  getCompanyLabel,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import {
  findGpsBaseMatches,
  findOfficialGpsBaseMatch,
  getGpsBaseStateLabel,
} from "@/app/lib/gps-base-detection";
import { supabase } from "@/app/lib/supabase/client";

type GpsBaseType = "siege" | "entrepot" | "chantier" | "client" | "autre";

type GpsBaseRow = {
  id: string;
  nom: string;
  adresse: string;
  latitude: number;
  longitude: number;
  rayon_m: number;
  company_context: AccountRequestCompany;
  type_base: GpsBaseType;
  created_at: string;
  updated_at: string;
};

type FormState = {
  nom: string;
  adresse: string;
  latitude: string;
  longitude: string;
  rayon_m: string;
  company_context: AccountRequestCompany;
  type_base: GpsBaseType;
};

const BASE_TYPE_OPTIONS: Array<{
  value: GpsBaseType;
  label: string;
  icon: typeof Building2;
}> = [
  { value: "siege", label: "Siege", icon: Building2 },
  { value: "entrepot", label: "Entrepot", icon: Warehouse },
  { value: "chantier", label: "Chantier", icon: Route },
  { value: "client", label: "Client", icon: MapPin },
  { value: "autre", label: "Autre", icon: Factory },
];

const DEFAULT_FORM: FormState = {
  nom: "",
  adresse: "",
  latitude: "",
  longitude: "",
  rayon_m: "100",
  company_context: "oliem_solutions",
  type_base: "siege",
};

const DEFAULT_TEST_FORM = {
  latitude: "",
  longitude: "",
  company_context: "oliem_solutions" as AccountRequestCompany,
};

function getMapUrl(latitude: number | null, longitude: number | null) {
  if (
    typeof latitude !== "number" ||
    Number.isNaN(latitude) ||
    typeof longitude !== "number" ||
    Number.isNaN(longitude)
  ) {
    return null;
  }

  return `https://www.google.com/maps?q=${latitude},${longitude}&z=14&output=embed`;
}

function normalizeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTypeLabel(type: GpsBaseType) {
  return BASE_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type;
}

function getTypeTone(type: GpsBaseType) {
  if (type === "siege") return "info" as const;
  if (type === "entrepot") return "success" as const;
  if (type === "chantier") return "warning" as const;
  return "default" as const;
}

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function GpsBasesAdminClient() {
  const [bases, setBases] = useState<GpsBaseRow[]>([]);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [testForm, setTestForm] = useState(DEFAULT_TEST_FORM);

  const loadBases = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("gps_bases")
      .select("*")
      .order("nom", { ascending: true });

    if (error) {
      setBases([]);
      setMessage(error.message);
      setMessageType("error");
      setLoading(false);
      return;
    }

    setBases(((data ?? []) as GpsBaseRow[]).map((row) => ({
      ...row,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      rayon_m: Number(row.rayon_m),
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadBases();
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadBases]);

  const previewLatitude = useMemo(() => normalizeNumber(form.latitude), [form.latitude]);
  const previewLongitude = useMemo(() => normalizeNumber(form.longitude), [form.longitude]);
  const previewMapUrl = useMemo(
    () => getMapUrl(previewLatitude, previewLongitude),
    [previewLatitude, previewLongitude]
  );
  const testLatitude = useMemo(() => normalizeNumber(testForm.latitude), [testForm.latitude]);
  const testLongitude = useMemo(() => normalizeNumber(testForm.longitude), [testForm.longitude]);
  const testMapUrl = useMemo(
    () => getMapUrl(testLatitude, testLongitude),
    [testLatitude, testLongitude]
  );
  const testPosition = useMemo(
    () =>
      testLatitude == null || testLongitude == null
        ? null
        : {
            latitude: testLatitude,
            longitude: testLongitude,
            company_context: testForm.company_context,
          },
    [testLatitude, testLongitude, testForm.company_context]
  );
  const testMatch = useMemo(
    () => (testPosition ? findOfficialGpsBaseMatch(testPosition, bases) : null),
    [testPosition, bases]
  );
  const testMatches = useMemo(
    () => (testPosition ? findGpsBaseMatches(testPosition, bases) : []),
    [testPosition, bases]
  );

  function setFeedback(nextMessage: string, nextType: "success" | "error") {
    setMessage(nextMessage);
    setMessageType(nextType);
  }

  function resetForm() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
  }

  function handleEdit(base: GpsBaseRow) {
    setEditingId(base.id);
    setForm({
      nom: base.nom,
      adresse: base.adresse,
      latitude: String(base.latitude),
      longitude: String(base.longitude),
      rayon_m: String(base.rayon_m),
      company_context: base.company_context,
      type_base: base.type_base,
    });
    setMessage("");
  }

  async function handleDelete(base: GpsBaseRow) {
    const confirmed = window.confirm(`Supprimer ${base.nom} ?`);
    if (!confirmed) return;

    setDeletingId(base.id);
    setMessage("");

    const { error } = await supabase.from("gps_bases").delete().eq("id", base.id);

    if (error) {
      setFeedback(error.message, "error");
      setDeletingId(null);
      return;
    }

    if (editingId === base.id) {
      resetForm();
    }

    setFeedback("Base supprimee.", "success");
    await loadBases();
    setDeletingId(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const latitude = normalizeNumber(form.latitude);
    const longitude = normalizeNumber(form.longitude);
    const rayon = normalizeNumber(form.rayon_m);

    if (!form.nom.trim()) {
      setFeedback("Nom requis.", "error");
      return;
    }

    if (!form.adresse.trim()) {
      setFeedback("Adresse requise.", "error");
      return;
    }

    if (latitude == null || latitude < -90 || latitude > 90) {
      setFeedback("Latitude invalide.", "error");
      return;
    }

    if (longitude == null || longitude < -180 || longitude > 180) {
      setFeedback("Longitude invalide.", "error");
      return;
    }

    if (rayon == null || rayon <= 0) {
      setFeedback("Rayon invalide.", "error");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      nom: form.nom.trim(),
      adresse: form.adresse.trim(),
      latitude,
      longitude,
      rayon_m: Math.round(rayon),
      company_context: form.company_context,
      type_base: form.type_base,
      updated_at: new Date().toISOString(),
    };

    const query = editingId
      ? supabase.from("gps_bases").update(payload).eq("id", editingId)
      : supabase.from("gps_bases").insert([payload]);

    const { error } = await query;

    if (error) {
      setFeedback(error.message, "error");
      setSaving(false);
      return;
    }

    setFeedback(editingId ? "Base mise a jour." : "Base ajoutee.", "success");
    resetForm();
    await loadBases();
    setSaving(false);
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Bases GPS"
          subtitle="Depart, retour et presence terrain."
          actions={
            <SecondaryButton onClick={() => void loadBases()}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </SecondaryButton>
          }
        />

        {message ? (
          <AppCard
            tone="muted"
            style={{
              borderColor:
                messageType === "error" ? "rgba(220, 38, 38, 0.22)" : "rgba(59, 130, 246, 0.18)",
              background:
                messageType === "error"
                  ? "linear-gradient(180deg, rgba(254, 242, 242, 0.96) 0%, rgba(255,255,255,0.98) 100%)"
                  : "linear-gradient(180deg, rgba(239, 246, 255, 0.96) 0%, rgba(255,255,255,0.98) 100%)",
            }}
          >
            <p style={{ margin: 0, color: "var(--ui-color-text)" }}>{message}</p>
          </AppCard>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(320px, 0.95fr) minmax(0, 1.2fr)",
            gap: "var(--ui-space-6)",
            alignItems: "start",
          }}
        >
          <SectionCard
            title="Liste des bases"
            subtitle={`${bases.length} base${bases.length > 1 ? "s" : ""}.`}
            actions={
              <SecondaryButton onClick={resetForm}>
                {editingId ? "Nouvelle base" : "Vider"}
              </SecondaryButton>
            }
          >
            {loading ? (
              <p className="ui-text-muted" style={{ margin: 0 }}>
                Chargement...
              </p>
            ) : bases.length === 0 ? (
              <p className="ui-text-muted" style={{ margin: 0 }}>
                Aucune base.
              </p>
            ) : (
              <div className="ui-stack-sm">
                {bases.map((base) => {
                  const Icon = BASE_TYPE_OPTIONS.find(
                    (item) => item.value === base.type_base
                  )?.icon ?? MapPin;

                  return (
                    <AppCard
                      key={base.id}
                      className="ui-stack-sm"
                      style={{
                        borderColor:
                          editingId === base.id ? "var(--ui-color-primary)" : undefined,
                        boxShadow:
                          editingId === base.id ? "var(--ui-shadow-md)" : undefined,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                        }}
                      >
                        <div className="ui-stack-xs">
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 12,
                                display: "grid",
                                placeItems: "center",
                                background:
                                  "linear-gradient(135deg, rgba(59,130,246,0.14) 0%, rgba(15,41,72,0.06) 100%)",
                                color: "var(--ui-color-primary)",
                              }}
                            >
                              <Icon size={18} />
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 18,
                                  fontWeight: 700,
                                  color: "var(--ui-color-primary)",
                                }}
                              >
                                {base.nom}
                              </div>
                              <div className="ui-text-muted">
                                {getCompanyLabel(base.company_context)}
                              </div>
                            </div>
                          </div>
                        </div>
                        <StatusBadge
                          label={getTypeLabel(base.type_base)}
                          tone={getTypeTone(base.type_base)}
                        />
                      </div>

                      <div className="ui-text-muted">{base.adresse}</div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 12,
                        }}
                      >
                        <div>
                          <div className="ui-text-muted">Coordonnees</div>
                          <div>
                            {base.latitude.toFixed(5)}, {base.longitude.toFixed(5)}
                          </div>
                        </div>
                        <div>
                          <div className="ui-text-muted">Rayon</div>
                          <div>{base.rayon_m} m</div>
                        </div>
                      </div>

                      <div className="ui-text-muted">
                        Maj {formatUpdatedAt(base.updated_at)}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <button
                          type="button"
                          className="ui-button ui-button-secondary"
                          onClick={() => handleEdit(base)}
                        >
                          <Pencil size={16} />
                          <span>Modifier</span>
                        </button>
                        <button
                          type="button"
                          className="ui-button ui-button-secondary"
                          onClick={() => void handleDelete(base)}
                          disabled={deletingId === base.id}
                          style={{ color: "#b91c1c" }}
                        >
                          <Trash2 size={16} />
                          <span>
                            {deletingId === base.id ? "Suppression..." : "Supprimer"}
                          </span>
                        </button>
                      </div>
                    </AppCard>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <div className="ui-stack-lg">
            <SectionCard
              title={editingId ? "Modifier la base" : "Creer une base"}
              subtitle="Reference GPS."
            >
              <form onSubmit={handleSubmit} className="ui-stack-md">
                <div className="ui-grid-2">
                  <FormField label="Nom de la base" required>
                    <input
                      className="tagora-input"
                      value={form.nom}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, nom: event.target.value }))
                      }
                      placeholder="Base principale"
                    />
                  </FormField>

                  <FormField label="Compagnie" required>
                    <select
                      className="tagora-input"
                      value={form.company_context}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          company_context: event.target.value as AccountRequestCompany,
                        }))
                      }
                    >
                      {ACCOUNT_REQUEST_COMPANIES.map((company) => (
                        <option key={company.value} value={company.value}>
                          {company.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <FormField label="Adresse" required>
                  <input
                    className="tagora-input"
                    value={form.adresse}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, adresse: event.target.value }))
                    }
                    placeholder="123 rue Exemple, Montreal"
                  />
                </FormField>

                <div className="ui-grid-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                  <FormField label="Latitude" required>
                    <input
                      className="tagora-input"
                      type="number"
                      inputMode="decimal"
                      step="0.000001"
                      value={form.latitude}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, latitude: event.target.value }))
                      }
                      placeholder="45.501690"
                    />
                  </FormField>

                  <FormField label="Longitude" required>
                    <input
                      className="tagora-input"
                      type="number"
                      inputMode="decimal"
                      step="0.000001"
                      value={form.longitude}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, longitude: event.target.value }))
                      }
                      placeholder="-73.567253"
                    />
                  </FormField>

                  <FormField label="Rayon en metres" required>
                    <input
                      className="tagora-input"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={form.rayon_m}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, rayon_m: event.target.value }))
                      }
                      placeholder="100"
                    />
                  </FormField>
                </div>

                <FormField label="Type de base" required>
                  <select
                    className="tagora-input"
                    value={form.type_base}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        type_base: event.target.value as GpsBaseType,
                      }))
                    }
                  >
                    {BASE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <PrimaryButton type="submit" disabled={saving}>
                    {saving ? "Enregistrement..." : "Enregistrer"}
                  </PrimaryButton>
                  <SecondaryButton onClick={resetForm} disabled={saving}>
                    Annuler
                  </SecondaryButton>
                </div>
              </form>
            </SectionCard>

            <SectionCard title="Carte" subtitle="Position de la base.">
              {previewMapUrl ? (
                <iframe
                  src={previewMapUrl}
                  title="Carte base GPS"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{
                    width: "100%",
                    minHeight: 360,
                    border: 0,
                    borderRadius: 18,
                    background: "#e2e8f0",
                  }}
                />
              ) : (
                <AppCard
                  tone="muted"
                  style={{
                    minHeight: 240,
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                  }}
                >
                  <p className="ui-text-muted" style={{ margin: 0 }}>
                    Ajoutez latitude et longitude.
                  </p>
                </AppCard>
              )}
            </SectionCard>

            <SectionCard title="Mode test" subtitle="Verifier si une position tombe dans une base.">
              <div className="ui-stack-md">
                <div className="ui-grid-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                  <FormField label="Latitude" required>
                    <input
                      className="tagora-input"
                      type="number"
                      inputMode="decimal"
                      step="0.000001"
                      value={testForm.latitude}
                      onChange={(event) =>
                        setTestForm((current) => ({
                          ...current,
                          latitude: event.target.value,
                        }))
                      }
                      placeholder="45.501690"
                    />
                  </FormField>

                  <FormField label="Longitude" required>
                    <input
                      className="tagora-input"
                      type="number"
                      inputMode="decimal"
                      step="0.000001"
                      value={testForm.longitude}
                      onChange={(event) =>
                        setTestForm((current) => ({
                          ...current,
                          longitude: event.target.value,
                        }))
                      }
                      placeholder="-73.567253"
                    />
                  </FormField>

                  <FormField label="Compagnie" required>
                    <select
                      className="tagora-input"
                      value={testForm.company_context}
                      onChange={(event) =>
                        setTestForm((current) => ({
                          ...current,
                          company_context: event.target.value as AccountRequestCompany,
                        }))
                      }
                    >
                      {ACCOUNT_REQUEST_COMPANIES.map((company) => (
                        <option key={company.value} value={company.value}>
                          {company.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>

                {!testPosition ? (
                  <AppCard tone="muted">
                    <p className="ui-text-muted" style={{ margin: 0 }}>
                      Entrez une latitude et une longitude pour lancer le test.
                    </p>
                  </AppCard>
                ) : (
                  <AppCard
                    tone="muted"
                    style={{
                      borderColor: testMatch ? "rgba(34, 197, 94, 0.3)" : "rgba(148, 163, 184, 0.28)",
                      background: testMatch
                        ? "linear-gradient(180deg, rgba(240, 253, 244, 0.96) 0%, rgba(255,255,255,0.98) 100%)"
                        : "linear-gradient(180deg, rgba(248,250,252,0.96) 0%, rgba(255,255,255,0.98) 100%)",
                    }}
                  >
                    <div className="ui-stack-sm">
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ui-color-primary)" }}>
                        {getGpsBaseStateLabel(testMatch ? "dans_base" : "hors_base")}
                      </div>
                      <div className="ui-text-muted">
                        {testMatch
                          ? `${testMatch.base.nom} detectee a ${testMatch.distance_m} m pour un rayon de ${testMatch.radius_m} m.`
                          : "Aucune base ne couvre cette position pour la compagnie selectionnee."}
                      </div>
                      <div className="ui-grid-auto">
                        <div>
                          <div className="ui-text-muted">Base officielle</div>
                          <div>{testMatch ? testMatch.base.nom : "-"}</div>
                        </div>
                        <div>
                          <div className="ui-text-muted">Type</div>
                          <div>{testMatch ? getTypeLabel(testMatch.base.type_base) : "-"}</div>
                        </div>
                        <div>
                          <div className="ui-text-muted">Bases candidates</div>
                          <div>{testMatches.length}</div>
                        </div>
                      </div>
                    </div>
                  </AppCard>
                )}

                {testMatches.length > 0 ? (
                  <div className="ui-stack-sm">
                    {testMatches.map((match) => (
                      <AppCard key={match.base.id} tone="muted">
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <strong style={{ color: "var(--ui-color-primary)" }}>{match.base.nom}</strong>
                          <StatusBadge label={getTypeLabel(match.base.type_base)} tone={getTypeTone(match.base.type_base)} />
                        </div>
                        <div className="ui-text-muted">
                          Distance {match.distance_m} m sur un rayon de {match.radius_m} m.
                        </div>
                      </AppCard>
                    ))}
                  </div>
                ) : null}

                <SectionCard title="Carte test" subtitle="Verification visuelle.">
                  {testMapUrl ? (
                    <iframe
                      src={testMapUrl}
                      title="Carte test base GPS"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      style={{
                        width: "100%",
                        minHeight: 260,
                        border: 0,
                        borderRadius: 18,
                        background: "#e2e8f0",
                      }}
                    />
                  ) : (
                    <AppCard
                      tone="muted"
                      style={{
                        minHeight: 180,
                        display: "grid",
                        placeItems: "center",
                        textAlign: "center",
                      }}
                    >
                      <p className="ui-text-muted" style={{ margin: 0 }}>
                        La carte apparaitra ici quand les coordonnees de test seront completes.
                      </p>
                    </AppCard>
                  )}
                </SectionCard>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </main>
  );
}
