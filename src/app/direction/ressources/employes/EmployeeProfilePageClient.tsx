"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import HeaderTagora from "@/app/components/HeaderTagora";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  ACCOUNT_REQUEST_COMPANIES,
  getCompanyLabel,
} from "@/app/lib/account-requests.shared";
import type { AppRole } from "@/app/lib/auth/roles";
import { supabase } from "@/app/lib/supabase/client";
import AdminImprovementNotificationsAccountSection from "./AdminImprovementNotificationsAccountSection";
import {
  buildEmployeForm,
  buildEmployePayload,
  computeBreakSummary,
  employeeWorkDays,
  formatMoney,
  type EmployeFormState,
  type EmployeProfile,
} from "./employee-profile-shared";

type EmployeeProfilePageClientProps = {
  employeeId?: number | null;
};
type AssignablePortalRole = "employe" | "direction" | "manager" | "admin";

type EmployeeAccordionSection =
  | "identite"
  | "permis"
  | "horaire"
  | "facturation"
  | "alertes_sms";

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="tagora-panel-muted" style={{ padding: 16 }}>
      <div className="tagora-label">{label}</div>
      <div style={{ marginTop: 8, fontWeight: 700, color: "#0f172a" }}>{value}</div>
    </div>
  );
}


function AccordionSection({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="tagora-panel ui-stack-md">
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          padding: 0,
          border: "none",
          background: "transparent",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div className="ui-stack-xs">
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            {title}
          </h2>
          <p className="tagora-note" style={{ margin: 0 }}>
            {description}
          </p>
        </div>

        <div
          className="tagora-panel-muted"
          style={{
            minWidth: 52,
            padding: "10px 14px",
            borderRadius: 14,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          {open ? "−" : "+"}
        </div>
      </button>

      {open ? children : null}
    </section>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Erreur inconnue.";
}


export default function EmployeeProfilePageClient({
  employeeId = null,
}: EmployeeProfilePageClientProps) {
  const router = useRouter();
  const { role: viewerRole, loading: accessLoading } = useCurrentAccess();
  /** Section « notifications améliorations » : jamais pour direction / employé, ni pendant le chargement du rôle. */
  const viewerIsAppAdmin = !accessLoading && viewerRole === "admin";
  const isCreating = employeeId == null;
  const [loading, setLoading] = useState(!isCreating);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingRecto, setUploadingRecto] = useState(false);
  const [uploadingVerso, setUploadingVerso] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(
    null
  );
  const [originalProfile, setOriginalProfile] = useState<EmployeProfile | null>(
    null
  );
  const [form, setForm] = useState<EmployeFormState>(buildEmployeForm(null));
  const [isEditing, setIsEditing] = useState(isCreating);
  const [openSection, setOpenSection] =
    useState<EmployeeAccordionSection>("identite");
  const [accountAccessToken, setAccountAccessToken] = useState<string | null>(null);
  const [portalAccount, setPortalAccount] = useState<{
    authUserId: string | null;
    portalRole: AssignablePortalRole | AppRole | null;
  } | null>(null);
  const [portalRoleValue, setPortalRoleValue] = useState<AssignablePortalRole>("employe");
  const [portalRoleReason, setPortalRoleReason] = useState("");
  const [portalRoleSaving, setPortalRoleSaving] = useState(false);

  const breakSummary = useMemo(() => computeBreakSummary(form), [form]);
  const computedCost = useMemo(() => {
    const rate = Number(form.taux_base_titan);
    const benefits = Number(form.social_benefits_percent || "15");

    if (!Number.isFinite(rate)) {
      return null;
    }

    return Number(
      (rate * (1 + (Number.isFinite(benefits) ? benefits : 15) / 100)).toFixed(2)
    );
  }, [form.social_benefits_percent, form.taux_base_titan]);

  const readOnlyFieldStyle = isEditing
    ? undefined
    : {
        background: "#f8fafc",
        borderColor: "#dbe4f0",
        color: "#0f172a",
        boxShadow: "none",
      };

  const loadEmployeProfile = useCallback(async (targetId: number) => {
    setLoading(true);

    const { data, error } = await supabase
      .from("chauffeurs")
      .select("*")
      .eq("id", targetId)
      .maybeSingle();

    if (error) {
      setMessage(`Erreur chargement: ${error.message}`);
      setMessageType("error");
      setOriginalProfile(null);
      setLoading(false);
      return;
    }

    if (!data) {
      setMessage("Employe introuvable.");
      setMessageType("error");
      setOriginalProfile(null);
      setLoading(false);
      return;
    }

    const nextProfile = data as EmployeProfile;
    setOriginalProfile(nextProfile);
    setForm(buildEmployeForm(nextProfile));
    setMessage("");
    setMessageType(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isCreating) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      setOriginalProfile(null);
      setForm(buildEmployeForm(null));
      setIsEditing(true);
      return;
    }

    if (!employeeId || !Number.isFinite(employeeId)) {
      setLoading(false);
      setMessage("Identifiant employe invalide.");
      setMessageType("error");
      return;
    }

    void loadEmployeProfile(employeeId);
  }, [employeeId, isCreating, loadEmployeProfile]);

  useEffect(() => {
    if (accessLoading) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        setAccountAccessToken(session?.access_token ?? null);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setAccountAccessToken(session?.access_token ?? null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [accessLoading]);

  useEffect(() => {
    let cancelled = false;

    async function loadPortalAccount() {
      if (!viewerIsAppAdmin || isCreating || loading || !employeeId || !Number.isFinite(employeeId)) {
        if (!cancelled) {
          setPortalAccount(null);
        }
        return;
      }

      const token = accountAccessToken;
      if (!token) {
        if (!cancelled) {
          setPortalAccount(null);
        }
        return;
      }

      const response = await fetch(`/api/admin/employes/${employeeId}/portal-account`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (!cancelled) {
          setPortalAccount(null);
        }
        return;
      }

      const payload = (await response.json()) as {
        authUserId?: string | null;
        portalRole?: AssignablePortalRole | AppRole | null;
      };

      if (!cancelled) {
        const nextRole = (payload.portalRole ?? "employe") as AssignablePortalRole;
        setPortalAccount({
          authUserId: typeof payload.authUserId === "string" ? payload.authUserId : null,
          portalRole: payload.portalRole ?? null,
        });
        setPortalRoleValue(nextRole);
        setPortalRoleReason("");
      }
    }

    void loadPortalAccount();

    return () => {
      cancelled = true;
    };
  }, [viewerIsAppAdmin, isCreating, loading, employeeId, accountAccessToken]);

  async function handlePortalRoleSave() {
    if (!viewerIsAppAdmin || !employeeId || !Number.isFinite(employeeId) || !accountAccessToken) {
      return;
    }
    setPortalRoleSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const response = await fetch(`/api/admin/employes/${employeeId}/portal-account`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accountAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: portalRoleValue,
          reason: portalRoleReason.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Modification de role refusee.");
      }
      setPortalAccount((current) =>
        current
          ? {
              ...current,
              portalRole: portalRoleValue,
            }
          : current
      );
      setMessage("Role portail mis a jour.");
      setMessageType("success");
      setPortalRoleReason("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de modifier le role.");
      setMessageType("error");
    } finally {
      setPortalRoleSaving(false);
    }
  }

  async function uploadPermisFile(file: File, side: "recto" | "verso") {
    const safeName = (form.nom.trim() || `chauffeur-${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const extension = file.name.split(".").pop() || "jpg";
    const fileName = `${safeName}-${side}-${Date.now()}.${extension}`;
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
      setMessage("");
      setMessageType(null);
      const url = await uploadPermisFile(file, "recto");
      setForm((current) => ({ ...current, photo_permis_recto_url: url }));
      setMessage("Photo recto televersee.");
      setMessageType("success");
    } catch (error) {
      setMessage(`Erreur upload recto: ${getErrorMessage(error)}`);
      setMessageType("error");
    } finally {
      setUploadingRecto(false);
    }
  }

  async function handleVersoUpload(file: File | null) {
    if (!file) return;

    try {
      setUploadingVerso(true);
      setMessage("");
      setMessageType(null);
      const url = await uploadPermisFile(file, "verso");
      setForm((current) => ({ ...current, photo_permis_verso_url: url }));
      setMessage("Photo verso televersee.");
      setMessageType("success");
    } catch (error) {
      setMessage(`Erreur upload verso: ${getErrorMessage(error)}`);
      setMessageType("error");
    } finally {
      setUploadingVerso(false);
    }
  }

  function toggleDay(day: string) {
    if (!isEditing) {
      return;
    }

    setForm((current) => ({
      ...current,
      scheduled_work_days: current.scheduled_work_days.includes(day)
        ? current.scheduled_work_days.filter((item) => item !== day)
        : [...current.scheduled_work_days, day],
    }));
  }

  function handleCancel() {
    if (isCreating) {
      router.push("/direction/ressources/employes");
      return;
    }

    if (!originalProfile) {
      return;
    }

    setForm(buildEmployeForm(originalProfile));
    setIsEditing(false);
    setMessage("");
    setMessageType(null);
  }

  function activateEditing() {
    setIsEditing(true);
  }

  async function handleSave() {
    if (!form.nom.trim()) {
      setMessage("Le nom est obligatoire.");
      setMessageType("error");
      return;
    }

    setSaving(true);
    setMessage("");
    setMessageType(null);

    const payload = buildEmployePayload(form);

    try {
      if (isCreating) {
        const { data, error } = await supabase
          .from("chauffeurs")
          .insert([payload])
          .select("id")
          .single();

        if (error) {
          throw error;
        }

        router.push(`/direction/ressources/employes/${data.id}`);
        return;
      }

      const { error } = await supabase
        .from("chauffeurs")
        .update(payload)
        .eq("id", employeeId);

      if (error) {
        throw error;
      }

      const nextProfile = {
        ...(originalProfile ?? ({ id: employeeId } as EmployeProfile)),
        id: employeeId as number,
        ...payload,
      } as EmployeProfile;

      setOriginalProfile(nextProfile);
      setForm(buildEmployeForm(nextProfile));
      setIsEditing(false);
      setMessage("Profil employe enregistre.");
      setMessageType("success");
    } catch (error) {
      setMessage(`Erreur sauvegarde: ${getErrorMessage(error)}`);
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (isCreating || !employeeId) {
      return;
    }

    const confirmed = window.confirm(
      "Desactiver cet employe ? Son historique sera conserve."
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setMessage("");
    setMessageType(null);

    const { error } = await supabase
      .from("chauffeurs")
      .update({ actif: false })
      .eq("id", employeeId);

    if (error) {
      if (error.code === "23503") {
        const fallback = await supabase
          .from("chauffeurs")
          .update({ actif: false })
          .eq("id", employeeId);
        if (!fallback.error) {
          setMessage(
            "Impossible de supprimer cet employe, car il possede deja un historique. Il a ete desactive a la place."
          );
          setMessageType("success");
          setDeleting(false);
          setForm((current) => ({ ...current, actif: false }));
          setOriginalProfile((current) =>
            current ? ({ ...current, actif: false } as EmployeProfile) : current
          );
          setIsEditing(false);
          return;
        }
      }
      setMessage(`Erreur suppression: ${error.message}`);
      setMessageType("error");
      setDeleting(false);
      return;
    }

    setMessage("Employe desactive. Son historique est conserve.");
    setMessageType("success");
    setDeleting(false);
    setForm((current) => ({ ...current, actif: false }));
    setOriginalProfile((current) =>
      current ? ({ ...current, actif: false } as EmployeProfile) : current
    );
    setIsEditing(false);
  }

  const topActions = (
    <div className="tagora-actions">
      {!isEditing ? (
        <button
          type="button"
          className="tagora-dark-action"
          onPointerUp={(event) => {
            event.preventDefault();
            activateEditing();
          }}
          onClick={activateEditing}
          disabled={loading || saving || deleting}
        >
          Modifier
        </button>
      ) : (
        <>
          <button
            type="button"
            className="tagora-dark-action"
            onClick={() => void handleSave()}
            disabled={
              saving ||
              uploadingRecto ||
              uploadingVerso
            }
          >
            {saving ? "Enregistrement..." : isCreating ? "Creer" : "Enregistrer"}
          </button>
          <button
            type="button"
            className="tagora-dark-outline-action"
            onClick={handleCancel}
            disabled={saving || deleting}
          >
            Annuler
          </button>
        </>
      )}
    </div>
  );

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg" style={{ maxWidth: 1320 }}>
        <HeaderTagora
          title={isCreating ? "Nouvel employe" : "Profil employe"}
          subtitle={
            isCreating
              ? "Creez une fiche employee structuree."
              : "Consultez la fiche employee puis passez en mode edition au besoin."
          }
          actions={topActions}
        />

        <FeedbackMessage message={message} type={messageType} />

        {loading ? (
          <section className="tagora-panel">
            <p className="tagora-note" style={{ margin: 0 }}>
              Chargement du profil...
            </p>
          </section>
        ) : !isCreating && !originalProfile ? (
          <section className="tagora-panel ui-stack-md">
            <div className="tagora-panel-muted">
              <p className="tagora-note" style={{ margin: 0 }}>
                Cette fiche n a pas pu etre chargee.
              </p>
            </div>
          </section>
        ) : (
          <div className="tagora-split">
            <div className="tagora-stack">
              <section className="tagora-panel ui-stack-md">
                <div
                  className="tagora-panel-muted"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                    alignItems: "center",
                    border: isEditing ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
                  }}
                >
                  <div className="ui-stack-xs">
                    <div className="ui-eyebrow">
                      {isCreating ? "Creation" : "Consultation"}
                    </div>
                    <h2 className="section-title" style={{ marginBottom: 0 }}>
                      {form.nom || "Employe sans nom"}
                    </h2>
                    <p className="tagora-note" style={{ margin: 0 }}>
                      {form.courriel || "Courriel non renseigne"}
                    </p>
                  </div>

                  <div className="tagora-actions" style={{ justifyContent: "flex-end" }}>
                    <div
                      className="tagora-panel"
                      style={{
                        margin: 0,
                        padding: "12px 16px",
                        borderRadius: 16,
                        boxShadow: "none",
                        border:
                          form.actif
                            ? "1px solid rgba(34,197,94,0.2)"
                            : "1px solid rgba(148,163,184,0.3)",
                        background: form.actif ? "#ecfdf5" : "#f8fafc",
                      }}
                    >
                      <div className="tagora-label">Statut</div>
                      <div
                        style={{
                          marginTop: 6,
                          fontWeight: 800,
                          color: form.actif ? "#166534" : "#475569",
                        }}
                      >
                        {form.actif ? "Actif" : "Inactif"}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 16,
                  }}
                >
                  <SummaryItem
                    label="Identifiant"
                    value={isCreating ? "Nouvelle fiche" : `#${String(employeeId)}`}
                  />
                  <SummaryItem
                    label="Compagnie principale"
                    value={getCompanyLabel(form.primary_company)}
                  />
                  <SummaryItem
                    label="Telephone"
                    value={form.telephone || "-"}
                  />
                  <SummaryItem
                    label="Permis"
                    value={form.numero_permis || "-"}
                  />
                </div>
              </section>

              {!isCreating &&
              viewerIsAppAdmin &&
              portalAccount?.portalRole === "admin" ? (
                <AdminImprovementNotificationsAccountSection
                  accessToken={accountAccessToken}
                  invitedUserId={portalAccount.authUserId}
                  viewerIsAdmin={viewerIsAppAdmin}
                />
              ) : null}

              <AccordionSection
                title="Identite"
                description="Informations principales de l employe."
                open={openSection === "identite"}
                onToggle={() => setOpenSection("identite")}
              >
                <div className="tagora-form-grid">
                  <div className="tagora-form-grid-2">
                    <label className="tagora-field">
                      <span className="tagora-label">Nom</span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        value={form.nom}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            nom: event.target.value,
                          }))
                        }
                        readOnly={!isEditing}
                      />
                    </label>

                    <label className="tagora-field">
                      <span className="tagora-label">Courriel</span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        type="email"
                        value={form.courriel}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            courriel: event.target.value,
                          }))
                        }
                        readOnly={!isEditing}
                      />
                    </label>
                  </div>

                  <div className="tagora-form-grid-2">
                    <label className="tagora-field">
                      <span className="tagora-label">Telephone</span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        value={form.telephone}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            telephone: event.target.value,
                          }))
                        }
                        readOnly={!isEditing}
                      />
                    </label>

                    <label className="tagora-field">
                      <span className="tagora-label">Compagnie principale</span>
                      <select
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        value={form.primary_company}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            primary_company:
                              event.target.value as EmployeFormState["primary_company"],
                          }))
                        }
                        disabled={!isEditing}
                      >
                        {ACCOUNT_REQUEST_COMPANIES.map((company) => (
                          <option key={company.value} value={company.value}>
                            {company.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div
                    className="tagora-panel-muted"
                    style={{ display: "grid", gap: 12 }}
                  >
                    <label className="account-requests-permission-option">
                      <input
                        type="checkbox"
                        checked={form.actif}
                        disabled={!isEditing}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            actif: event.target.checked,
                          }))
                        }
                      />
                      <span>Employe actif</span>
                    </label>

                    <label className="account-requests-permission-option">
                      <input
                        type="checkbox"
                        checked={form.can_work_for_oliem_solutions}
                        disabled={!isEditing}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            can_work_for_oliem_solutions: event.target.checked,
                          }))
                        }
                      />
                      <span>Peut travailler pour Oliem Solutions</span>
                    </label>

                    <label className="account-requests-permission-option">
                      <input
                        type="checkbox"
                        checked={form.can_work_for_titan_produits_industriels}
                        disabled={!isEditing}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            can_work_for_titan_produits_industriels:
                              event.target.checked,
                          }))
                        }
                      />
                      <span>Peut travailler pour Titan Produits Industriels</span>
                    </label>
                  </div>

                  <label className="tagora-field">
                    <span className="tagora-label">Notes internes</span>
                    <textarea
                      className="tagora-textarea"
                      style={readOnlyFieldStyle}
                      value={form.notes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                    />
                  </label>
                </div>
              </AccordionSection>

              <AccordionSection
                title="Permis"
                description="Information legale et pieces jointes."
                open={openSection === "permis"}
                onToggle={() => setOpenSection("permis")}
              >
                <div className="tagora-form-grid">
                  <div className="tagora-form-grid-2">
                    <label className="tagora-field">
                      <span className="tagora-label">Numero de permis</span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        value={form.numero_permis}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            numero_permis: event.target.value,
                          }))
                        }
                        readOnly={!isEditing}
                      />
                    </label>

                    <label className="tagora-field">
                      <span className="tagora-label">Classe de permis</span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        value={form.classe_permis}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            classe_permis: event.target.value,
                          }))
                        }
                        readOnly={!isEditing}
                      />
                    </label>
                  </div>

                  <div className="tagora-form-grid-2">
                    <label className="tagora-field">
                      <span className="tagora-label">Expiration du permis</span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        type="date"
                        value={form.expiration_permis}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            expiration_permis: event.target.value,
                          }))
                        }
                        readOnly={!isEditing}
                      />
                    </label>

                    <label className="tagora-field">
                      <span className="tagora-label">Restrictions</span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        value={form.restrictions_permis}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            restrictions_permis: event.target.value,
                          }))
                        }
                        readOnly={!isEditing}
                      />
                    </label>
                  </div>

                  <div className="tagora-form-grid-2">
                    <div className="tagora-panel-muted ui-stack-sm">
                      <div className="tagora-label">Permis recto</div>
                      {isEditing ? (
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) =>
                            void handleRectoUpload(event.target.files?.[0] || null)
                          }
                        />
                      ) : null}
                      {uploadingRecto ? (
                        <span className="tagora-note">Televersement...</span>
                      ) : null}
                      {form.photo_permis_recto_url ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={form.photo_permis_recto_url}
                            alt="Permis recto"
                            style={previewImageStyle}
                          />
                          <a
                            href={form.photo_permis_recto_url}
                            target="_blank"
                            rel="noreferrer"
                            className="tagora-dark-outline-action"
                          >
                            Ouvrir le recto
                          </a>
                        </>
                      ) : (
                        <span className="tagora-note">Aucun fichier.</span>
                      )}
                    </div>

                    <div className="tagora-panel-muted ui-stack-sm">
                      <div className="tagora-label">Permis verso</div>
                      {isEditing ? (
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) =>
                            void handleVersoUpload(event.target.files?.[0] || null)
                          }
                        />
                      ) : null}
                      {uploadingVerso ? (
                        <span className="tagora-note">Televersement...</span>
                      ) : null}
                      {form.photo_permis_verso_url ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={form.photo_permis_verso_url}
                            alt="Permis verso"
                            style={previewImageStyle}
                          />
                          <a
                            href={form.photo_permis_verso_url}
                            target="_blank"
                            rel="noreferrer"
                            className="tagora-dark-outline-action"
                          >
                            Ouvrir le verso
                          </a>
                        </>
                      ) : (
                        <span className="tagora-note">Aucun fichier.</span>
                      )}
                    </div>
                  </div>
                </div>
              </AccordionSection>

              <AccordionSection
                title="Horaire"
                description="Horaires, pauses et jours travailles."
                open={openSection === "horaire"}
                onToggle={() => setOpenSection("horaire")}
              >
                <div className="tagora-form-grid">
                  <div className="tagora-form-grid-2">
                    <label className="tagora-field">
                      <span className="tagora-label">Heure de debut</span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        type="time"
                        value={form.schedule_start}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            schedule_start: event.target.value,
                          }))
                        }
                        readOnly={!isEditing}
                      />
                    </label>

                    <label className="tagora-field">
                      <span className="tagora-label">Heure de fin</span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        type="time"
                        value={form.schedule_end}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            schedule_end: event.target.value,
                          }))
                        }
                        readOnly={!isEditing}
                      />
                    </label>
                  </div>

                  <div className="tagora-form-grid-2">
                    <label className="tagora-field">
                      <span className="tagora-label">Heures par jour</span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        type="number"
                        min="0"
                        step="0.25"
                        value={form.planned_daily_hours}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            planned_daily_hours: event.target.value,
                          }))
                        }
                        readOnly={!isEditing}
                      />
                    </label>

                    <label className="tagora-field">
                      <span className="tagora-label">Heures hebdo</span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        type="number"
                        min="0"
                        step="0.25"
                        value={form.planned_weekly_hours}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            planned_weekly_hours: event.target.value,
                          }))
                        }
                        readOnly={!isEditing}
                      />
                    </label>
                  </div>

                  <label className="tagora-field">
                    <span className="tagora-label">Jours travailles</span>
                    <div
                      className="tagora-panel-muted"
                      style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
                    >
                      {employeeWorkDays.map(([value, label]) => (
                        <label
                          key={value}
                          className="account-requests-permission-option"
                        >
                          <input
                            type="checkbox"
                            checked={form.scheduled_work_days.includes(value)}
                            onChange={() => toggleDay(value)}
                            disabled={!isEditing}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </label>

                  <label className="tagora-field">
                    <span className="tagora-label">Pause par defaut (min)</span>
                    <input
                      className="tagora-input"
                      style={readOnlyFieldStyle}
                      type="number"
                      min="0"
                      step="1"
                      value={form.pause_minutes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          pause_minutes: event.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                    />
                  </label>
                </div>

                <div className="ui-stack-sm">
                  <div className="tagora-label">Pauses et diner</div>
                  {[
                    {
                      key: "break_am",
                      label: "Pause AM",
                      enabled: form.break_am_enabled,
                      time: form.break_am_time,
                      minutes: form.break_am_minutes,
                      paid: form.break_am_paid,
                    },
                    {
                      key: "lunch",
                      label: "Diner",
                      enabled: form.lunch_enabled,
                      time: form.lunch_time,
                      minutes: form.lunch_minutes,
                      paid: form.lunch_paid,
                    },
                    {
                      key: "break_pm",
                      label: "Pause PM",
                      enabled: form.break_pm_enabled,
                      time: form.break_pm_time,
                      minutes: form.break_pm_minutes,
                      paid: form.break_pm_paid,
                    },
                  ].map((row) => (
                    <div
                      key={row.key}
                      className="tagora-panel-muted"
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(120px, 1.1fr) 100px 140px 120px 150px",
                        gap: 12,
                        alignItems: "center",
                        padding: 16,
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        {row.label}
                      </div>

                      <label className="account-requests-permission-option">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          disabled={!isEditing}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              ...(row.key === "break_am"
                                ? { break_am_enabled: event.target.checked }
                                : {}),
                              ...(row.key === "lunch"
                                ? { lunch_enabled: event.target.checked }
                                : {}),
                              ...(row.key === "break_pm"
                                ? { break_pm_enabled: event.target.checked }
                                : {}),
                            }))
                          }
                        />
                        <span>Actif</span>
                      </label>

                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        type="time"
                        value={row.time}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            ...(row.key === "break_am"
                              ? { break_am_time: event.target.value }
                              : {}),
                            ...(row.key === "lunch"
                              ? { lunch_time: event.target.value }
                              : {}),
                            ...(row.key === "break_pm"
                              ? { break_pm_time: event.target.value }
                              : {}),
                          }))
                        }
                        readOnly={!isEditing}
                      />

                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        type="number"
                        min="0"
                        step="1"
                        value={row.minutes}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            ...(row.key === "break_am"
                              ? { break_am_minutes: event.target.value }
                              : {}),
                            ...(row.key === "lunch"
                              ? { lunch_minutes: event.target.value }
                              : {}),
                            ...(row.key === "break_pm"
                              ? { break_pm_minutes: event.target.value }
                              : {}),
                          }))
                        }
                        readOnly={!isEditing}
                      />

                      <select
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        value={row.paid ? "paid" : "unpaid"}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            ...(row.key === "break_am"
                              ? { break_am_paid: event.target.value === "paid" }
                              : {}),
                            ...(row.key === "lunch"
                              ? { lunch_paid: event.target.value === "paid" }
                              : {}),
                            ...(row.key === "break_pm"
                              ? { break_pm_paid: event.target.value === "paid" }
                              : {}),
                          }))
                        }
                        disabled={!isEditing}
                      >
                        <option value="paid">Payee</option>
                        <option value="unpaid">Non payee</option>
                      </select>
                    </div>
                  ))}
                </div>
              </AccordionSection>
            </div>

            <aside className="tagora-stack">
              <AccordionSection
                title="Facturation"
                description="Donnees Titan, cout refacturable et resume pauses."
                open={openSection === "facturation"}
                onToggle={() => setOpenSection("facturation")}
              >
                <div className="tagora-form-grid">
                  <label className="tagora-field">
                    <span className="tagora-label">Taux de base Titan</span>
                    <input
                      className="tagora-input"
                      style={readOnlyFieldStyle}
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.taux_base_titan}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          taux_base_titan: event.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                    />
                  </label>

                  <label className="tagora-field">
                    <span className="tagora-label">Avantages sociaux %</span>
                    <input
                      className="tagora-input"
                      style={readOnlyFieldStyle}
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.social_benefits_percent}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          social_benefits_percent: event.target.value,
                        }))
                      }
                      readOnly={!isEditing}
                    />
                  </label>

                  <label className="account-requests-permission-option">
                    <input
                      type="checkbox"
                      checked={form.titan_billable}
                      disabled={!isEditing}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          titan_billable: event.target.checked,
                        }))
                      }
                    />
                    <span>Refacturable a Titan</span>
                  </label>

                  <SummaryItem
                    label="Cout refacturable"
                    value={formatMoney(computedCost)}
                  />
                </div>

                <div className="ui-grid-auto">
                  <SummaryItem
                    label="Elements actifs"
                    value={String(breakSummary.count)}
                  />
                  <SummaryItem
                    label="Total pauses"
                    value={`${String(breakSummary.total)} min`}
                  />
                  <SummaryItem
                    label="Total paye"
                    value={`${String(breakSummary.paid)} min`}
                  />
                  <SummaryItem
                    label="Total non paye"
                    value={`${String(breakSummary.unpaid)} min`}
                  />
                </div>
              </AccordionSection>

              <AccordionSection
                title="Alertes SMS"
                description="Activez ou coupez les alertes SMS et les destinataires direction."
                open={openSection === "alertes_sms"}
                onToggle={() => setOpenSection("alertes_sms")}
              >
                <div className="ui-stack-sm">
                  <div className="tagora-panel-muted" style={{ display: "grid", gap: 12, padding: 16 }}>
                    <label className="account-requests-permission-option">
                      <input
                        type="checkbox"
                        checked={form.alert_email_enabled}
                        disabled={!isEditing}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            alert_email_enabled: event.target.checked,
                          }))
                        }
                      />
                      <span>Recevoir alertes courriel</span>
                    </label>
                    <label className="account-requests-permission-option">
                      <input
                        type="checkbox"
                        checked={form.alert_sms_enabled}
                        disabled={!isEditing}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            alert_sms_enabled: event.target.checked,
                          }))
                        }
                      />
                      <span>Recevoir alertes texto</span>
                    </label>
                    <label className="account-requests-permission-option">
                      <input
                        type="checkbox"
                        checked={form.is_direction_alert_recipient}
                        disabled={!isEditing}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            is_direction_alert_recipient: event.target.checked,
                          }))
                        }
                      />
                      <span>Alerte direction</span>
                    </label>
                    <label className="account-requests-permission-option">
                      <input
                        type="checkbox"
                        checked={form.receive_pickup_reminder_email_alerts}
                        disabled={!isEditing}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            receive_pickup_reminder_email_alerts: event.target.checked,
                          }))
                        }
                      />
                      <span>Recevoir les alertes courriel de ramassage oublié</span>
                    </label>
                  </div>
                  {[
                    ["sms_alert_depart_terrain", "Depart terrain"],
                    ["sms_alert_arrivee_terrain", "Arrivee terrain"],
                    ["sms_alert_sortie", "Sortie"],
                    ["sms_alert_retour", "Retour"],
                    ["sms_alert_pause_debut", "Pause debut"],
                    ["sms_alert_pause_fin", "Pause fin"],
                    ["sms_alert_dinner_debut", "Diner debut"],
                    ["sms_alert_dinner_fin", "Diner fin"],
                    ["sms_alert_quart_debut", "Quart debut"],
                    ["sms_alert_quart_fin", "Quart fin"],
                  ].map(([key, label]) => (
                    <div
                      key={key}
                      className="tagora-panel-muted"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        alignItems: "center",
                        padding: 16,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{label}</div>
                      <label className="account-requests-permission-option">
                        <input
                          type="checkbox"
                          checked={Boolean(form[key as keyof EmployeFormState])}
                          disabled={!isEditing}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              [key]: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          {Boolean(form[key as keyof EmployeFormState]) ? "Oui" : "Non"}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </AccordionSection>

              {!isCreating ? (
                <section className="tagora-panel ui-stack-md">
                  <div className="ui-stack-xs">
                    <h2 className="section-title" style={{ marginBottom: 0 }}>
                      Actions admin
                    </h2>
                    <p className="tagora-note" style={{ margin: 0 }}>
                      Gestion directe de la fiche.
                    </p>
                  </div>

                  {viewerIsAppAdmin && portalAccount?.authUserId ? (
                    <div
                      className="tagora-panel-muted"
                      style={{ display: "grid", gap: 12, padding: 16 }}
                    >
                      <div className="tagora-label">Role portail</div>
                      <div
                        style={{
                          display: "grid",
                          gap: 12,
                          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        }}
                      >
                        <label className="tagora-field" style={{ marginBottom: 0 }}>
                          <span className="tagora-label">Nouveau role</span>
                          <select
                            className="tagora-input"
                            value={portalRoleValue}
                            onChange={(event) =>
                              setPortalRoleValue(event.target.value as AssignablePortalRole)
                            }
                            disabled={portalRoleSaving}
                          >
                            <option value="employe">Employe</option>
                            <option value="direction">Direction</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        </label>
                        <label className="tagora-field" style={{ marginBottom: 0 }}>
                          <span className="tagora-label">Raison (optionnel)</span>
                          <input
                            className="tagora-input"
                            value={portalRoleReason}
                            onChange={(event) => setPortalRoleReason(event.target.value)}
                            disabled={portalRoleSaving}
                            placeholder="Motif de changement"
                          />
                        </label>
                      </div>
                      <div className="tagora-actions">
                        <button
                          type="button"
                          className="tagora-dark-outline-action"
                          onClick={() => void handlePortalRoleSave()}
                          disabled={portalRoleSaving}
                        >
                          {portalRoleSaving ? "Mise a jour..." : "Mettre a jour le role"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!isEditing ? (
                    <button
                      type="button"
                      className="tagora-dark-action"
                      onPointerUp={(event) => {
                        event.preventDefault();
                        activateEditing();
                      }}
                      onClick={activateEditing}
                      disabled={saving || deleting}
                    >
                      Modifier
                    </button>
                  ) : (
                    <div className="tagora-actions">
                      <button
                        type="button"
                        className="tagora-dark-action"
                        onClick={() => void handleSave()}
                        disabled={
                          saving ||
                          uploadingRecto ||
                          uploadingVerso
                        }
                      >
                        {saving ? "Enregistrement..." : "Enregistrer"}
                      </button>
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        onClick={handleCancel}
                        disabled={saving || deleting}
                      >
                        Annuler
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className="tagora-btn-danger"
                    onClick={() => void handleDelete()}
                    disabled={saving || deleting}
                  >
                    {deleting ? "Desactivation..." : "Desactiver"}
                  </button>
                </section>
              ) : null}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

const previewImageStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 320,
  borderRadius: 14,
  border: "1px solid #d1d5db",
  objectFit: "cover",
};
