"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import HeaderTagora from "@/app/components/HeaderTagora";
import {
  ACCOUNT_REQUEST_COMPANIES,
  getCompanyLabel,
} from "@/app/lib/account-requests.shared";
import { supabase } from "@/app/lib/supabase/client";
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

type AccountSecurityAction =
  | "reset_password"
  | "send_reset_link"
  | "resend_invitation"
  | "disable_account"
  | "reactivate_account";

type EmployeeAccountSecurity = {
  employeeId: number;
  authUserId: string | null;
  email: string | null;
  accountExists: boolean;
  accountActivated: boolean;
  accessDisabled: boolean;
  status: "no_account" | "invited" | "active" | "disabled";
  statusLabel: string;
  role: "employe" | "direction" | null;
  passwordChangeRequired: boolean;
  activationDate: string | null;
  lastSignInAt: string | null;
  availableActions: {
    resetPassword: boolean;
    sendResetLink: boolean;
    resendInvitation: boolean;
    disableAccount: boolean;
    reactivateAccount: boolean;
  };
  companyDirectoryContext: string | null;
};

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

function SecurityActionButton({
  label,
  description,
  tone = "secondary",
  busy = false,
  disabled = false,
  onClick,
}: {
  label: string;
  description: string;
  tone?: "primary" | "secondary" | "danger";
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const palette =
    tone === "primary"
      ? {
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#ffffff",
          border: "1px solid rgba(15,23,42,0.15)",
        }
      : tone === "danger"
        ? {
            background: "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)",
            color: "#ffffff",
            border: "1px solid rgba(185,28,28,0.2)",
          }
        : {
            background: "#ffffff",
            color: "#0f172a",
            border: "1px solid #cbd5e1",
          };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        textAlign: "left",
        borderRadius: 18,
        padding: "18px 20px",
        display: "grid",
        gap: 6,
        boxShadow:
          tone === "primary"
            ? "0 18px 40px rgba(15,23,42,0.16)"
            : "0 10px 24px rgba(15,23,42,0.08)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease",
        ...palette,
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 800 }}>
        {busy ? "Traitement..." : label}
      </span>
      <span
        style={{
          fontSize: 13,
          lineHeight: 1.45,
          color: tone === "secondary" ? "#475569" : "rgba(255,255,255,0.82)",
        }}
      >
        {description}
      </span>
    </button>
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

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getLastAccountActivity(security: EmployeeAccountSecurity) {
  if (security.lastSignInAt) {
    return {
      label: "Derniere connexion",
      value: formatDateTime(security.lastSignInAt),
    };
  }

  if (security.activationDate) {
    return {
      label: "Derniere activite compte",
      value: formatDateTime(security.activationDate),
    };
  }

  return {
    label: "Derniere activite compte",
    value: "-",
  };
}

function getSecurityStatusPresentation(
  status: EmployeeAccountSecurity["status"]
) {
  if (status === "active") {
    return {
      color: "#166534",
      background: "#dcfce7",
      border: "1px solid rgba(34,197,94,0.25)",
    };
  }

  if (status === "invited") {
    return {
      color: "#1d4ed8",
      background: "#dbeafe",
      border: "1px solid rgba(59,130,246,0.25)",
    };
  }

  if (status === "disabled") {
    return {
      color: "#991b1b",
      background: "#fee2e2",
      border: "1px solid rgba(239,68,68,0.25)",
    };
  }

  return {
    color: "#475569",
    background: "#f8fafc",
    border: "1px solid rgba(148,163,184,0.25)",
  };
}

export default function EmployeeProfilePageClient({
  employeeId = null,
}: EmployeeProfilePageClientProps) {
  const router = useRouter();
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
  const [accountSecurity, setAccountSecurity] =
    useState<EmployeeAccountSecurity | null>(null);
  const [accountSecurityLoading, setAccountSecurityLoading] = useState(false);
  const [accountSecurityError, setAccountSecurityError] = useState("");
  const [securityAction, setSecurityAction] =
    useState<AccountSecurityAction | null>(null);
  const [openSection, setOpenSection] =
    useState<EmployeeAccordionSection>("identite");

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
  const accountActivity = useMemo(
    () => (accountSecurity ? getLastAccountActivity(accountSecurity) : null),
    [accountSecurity]
  );

  const getAuthenticatedHeaders = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      throw new Error("Session admin introuvable.");
    }

    return {
      Authorization: `Bearer ${accessToken}`,
      "x-account-requests-client": "browser-authenticated",
      "Cache-Control": "no-store",
    };
  }, []);

  const loadAccountSecurity = useCallback(async (targetId: number) => {
    setAccountSecurityLoading(true);
    setAccountSecurityError("");

    try {
      const response = await fetch(`/api/employees/${targetId}/account-security`, {
        headers: await getAuthenticatedHeaders(),
      });
      const payload = (await response.json()) as {
        error?: string;
        security?: EmployeeAccountSecurity;
      };

      if (!response.ok || !payload.security) {
        throw new Error(payload.error || "Chargement du compte impossible.");
      }

      setAccountSecurity(payload.security);
    } catch (error) {
      setAccountSecurity(null);
      setAccountSecurityError(getErrorMessage(error));
    } finally {
      setAccountSecurityLoading(false);
    }
  }, [getAuthenticatedHeaders]);

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
    await loadAccountSecurity(targetId);
    setLoading(false);
  }, [loadAccountSecurity]);

  useEffect(() => {
    if (isCreating) {
      setLoading(false);
      setOriginalProfile(null);
      setForm(buildEmployeForm(null));
      setIsEditing(true);
      setAccountSecurity(null);
      setAccountSecurityError("");
      return;
    }

    if (!employeeId || !Number.isFinite(employeeId)) {
      setLoading(false);
      setMessage("Identifiant employe invalide.");
      setMessageType("error");
      setAccountSecurity(null);
      setAccountSecurityError("");
      return;
    }

    void loadEmployeProfile(employeeId);
  }, [employeeId, isCreating, loadEmployeProfile]);

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
      await loadAccountSecurity(employeeId as number);
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

  async function runAccountSecurityAction(action: AccountSecurityAction) {
    if (!employeeId || isCreating) {
      return;
    }

    const targetEmail =
      accountSecurity?.email || form.courriel || originalProfile?.courriel || "";
    const confirmationLabel =
      action === "reset_password"
        ? `Envoyer un lien de reinitialisation a ${targetEmail || "ce compte"} et forcer la reinitialisation du mot de passe ?`
        : action === "send_reset_link"
          ? `Envoyer le lien de reinitialisation a ${targetEmail || "ce compte"} ?`
          : action === "resend_invitation"
            ? `Renvoyer l invitation a ${targetEmail || "ce compte"} ?`
            : action === "disable_account"
              ? "Desactiver l acces de ce compte ?"
              : "Reactiver l acces de ce compte ?";

    if (!window.confirm(confirmationLabel)) {
      return;
    }

    setSecurityAction(action);
    setMessage("");
    setMessageType(null);

    try {
      const response = await fetch(`/api/employees/${employeeId}/account-security`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthenticatedHeaders()),
        },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        security?: EmployeeAccountSecurity;
      };

      if (!response.ok || !payload.security) {
        throw new Error(payload.error || "Action impossible.");
      }

      setAccountSecurity(payload.security);
      setAccountSecurityError("");
      setMessage(payload.message || "Action admin terminee.");
      setMessageType("success");
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      setAccountSecurityError(errorMessage);
      setMessage(errorMessage);
      setMessageType("error");
    } finally {
      setSecurityAction(null);
    }
  }

  async function handleDelete() {
    if (isCreating || !employeeId) {
      return;
    }

    const confirmed = window.confirm(
      "Supprimer cet employe ? Cette action est definitive."
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setMessage("");
    setMessageType(null);

    const { error } = await supabase.from("chauffeurs").delete().eq("id", employeeId);

    if (error) {
      setMessage(`Erreur suppression: ${error.message}`);
      setMessageType("error");
      setDeleting(false);
      return;
    }

    router.push("/direction/ressources/employes");
  }

  const topActions = (
    <div className="tagora-actions">
      {!isCreating && accountSecurity?.availableActions.resetPassword ? (
        <button
          type="button"
          className="tagora-dark-action"
          onClick={() => void runAccountSecurityAction("reset_password")}
          disabled={loading || saving || deleting || Boolean(securityAction)}
          style={{ minWidth: 240 }}
        >
          {securityAction === "reset_password"
            ? "Envoi..."
            : "Reinitialiser mot de passe"}
        </button>
      ) : null}
      {!isEditing ? (
        <button
          type="button"
          className="tagora-dark-action"
          onClick={() => setIsEditing(true)}
          disabled={loading || saving || deleting || Boolean(securityAction)}
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
              uploadingVerso ||
              Boolean(securityAction)
            }
          >
            {saving ? "Enregistrement..." : isCreating ? "Creer" : "Enregistrer"}
          </button>
          <button
            type="button"
            className="tagora-dark-outline-action"
            onClick={handleCancel}
            disabled={saving || deleting || Boolean(securityAction)}
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

              {!isCreating ? (
                <section
                  className="tagora-panel ui-stack-md"
                  style={{
                    border: "1px solid #cbd5e1",
                    boxShadow: "0 24px 60px rgba(15,23,42,0.08)",
                  }}
                >
                  <div
                    className="tagora-panel-muted"
                    style={{
                      padding: 20,
                      border: "1px solid #dbeafe",
                      background:
                        "linear-gradient(135deg, rgba(239,246,255,0.95) 0%, rgba(248,250,252,1) 100%)",
                    }}
                  >
                    <div className="ui-stack-xs">
                      <div className="ui-eyebrow">Administration du compte</div>
                      <h2 className="section-title" style={{ marginBottom: 0 }}>
                        Compte et securite
                      </h2>
                      <p className="tagora-note" style={{ margin: 0 }}>
                        Gere le mot de passe, l invitation et l acces employe
                        directement depuis cette fiche.
                      </p>
                    </div>
                  </div>

                  {accountSecurityLoading ? (
                    <div className="tagora-panel-muted">
                      <p className="tagora-note" style={{ margin: 0 }}>
                        Chargement du compte...
                      </p>
                    </div>
                  ) : accountSecurityError ? (
                    <div className="tagora-panel-muted">
                      <p className="tagora-note" style={{ margin: 0, color: "#991b1b" }}>
                        {accountSecurityError}
                      </p>
                    </div>
                  ) : accountSecurity ? (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                          gap: 16,
                        }}
                      >
                        <div
                          className="tagora-panel"
                          style={{
                            margin: 0,
                            padding: "18px 20px",
                            borderRadius: 18,
                            boxShadow: "none",
                            ...getSecurityStatusPresentation(accountSecurity.status),
                          }}
                        >
                          <div className="tagora-label">Statut du compte</div>
                          <div
                            style={{
                              marginTop: 8,
                              fontWeight: 800,
                              fontSize: 20,
                              color: getSecurityStatusPresentation(accountSecurity.status)
                                .color,
                            }}
                          >
                            {accountSecurity.statusLabel}
                          </div>
                          <p className="tagora-note" style={{ margin: "8px 0 0 0" }}>
                            Compte Auth{" "}
                            {accountSecurity.accountExists ? "present" : "absent"}.
                          </p>
                        </div>

                        <div className="tagora-panel-muted" style={{ padding: 16 }}>
                          <div className="tagora-label">Statut employe</div>
                          <div
                            style={{
                              marginTop: 8,
                              fontWeight: 800,
                              fontSize: 18,
                              color: form.actif ? "#166534" : "#475569",
                            }}
                          >
                            {form.actif ? "Employe actif" : "Employe inactif"}
                          </div>
                          <p className="tagora-note" style={{ margin: "8px 0 0 0" }}>
                            Statut RH de la fiche. Il ne definit pas a lui seul
                            l acces au compte Auth.
                          </p>
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
                          label="Email de connexion"
                          value={accountSecurity.email || "-"}
                        />
                        <SummaryItem
                          label="Date d activation"
                          value={formatDateTime(accountSecurity.activationDate)}
                        />
                        <SummaryItem
                          label={accountActivity?.label || "Derniere activite compte"}
                          value={accountActivity?.value || "-"}
                        />
                        <SummaryItem
                          label="Etat de l acces"
                          value={
                            accountSecurity.accessDisabled
                              ? "Desactive"
                              : accountSecurity.accountExists
                                ? "Autorise"
                                : "Aucun acces"
                          }
                        />
                      </div>

                      {accountSecurity.passwordChangeRequired ? (
                        <div
                          className="tagora-panel-muted"
                          style={{ border: "1px solid #fde68a", background: "#fffbeb" }}
                        >
                          <p className="tagora-note" style={{ margin: 0, color: "#92400e" }}>
                            Une reinitialisation ou un changement de mot de passe
                            est deja exige pour ce compte.
                          </p>
                        </div>
                      ) : null}

                      <div className="ui-stack-xs">
                        <div className="tagora-label">Actions de securite</div>
                        <p className="tagora-note" style={{ margin: 0 }}>
                          Les actions ci-dessous sont basees sur le vrai statut du
                          compte Auth, pas sur le seul statut employe.
                        </p>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                          gap: 16,
                        }}
                      >
                        {accountSecurity.availableActions.resetPassword ? (
                          <SecurityActionButton
                            label="Reinitialiser le mot de passe"
                            description="Disponible des qu un compte Auth existe. Envoie immediatement un vrai lien de reinitialisation."
                            tone="primary"
                            busy={securityAction === "reset_password"}
                            disabled={Boolean(securityAction) || saving || deleting}
                            onClick={() => void runAccountSecurityAction("reset_password")}
                          />
                        ) : null}

                        {accountSecurity.availableActions.sendResetLink ? (
                          <SecurityActionButton
                            label="Envoyer le lien de reinitialisation"
                            description="Renvoye un lien de reinitialisation sans changer le reste du profil."
                            busy={securityAction === "send_reset_link"}
                            disabled={Boolean(securityAction) || saving || deleting}
                            onClick={() => void runAccountSecurityAction("send_reset_link")}
                          />
                        ) : null}

                        {accountSecurity.availableActions.resendInvitation ? (
                          <SecurityActionButton
                            label={
                              accountSecurity.accountExists
                                ? "Renvoyer l invitation"
                                : "Creer une invitation"
                            }
                            description={
                              accountSecurity.accountExists
                                ? "Renvoie un nouvel email d acces pour un compte deja cree mais non encore active."
                                : "Cree le compte Auth puis envoie le premier email d invitation."
                            }
                            busy={securityAction === "resend_invitation"}
                            disabled={Boolean(securityAction) || saving || deleting}
                            onClick={() => void runAccountSecurityAction("resend_invitation")}
                          />
                        ) : null}

                        {accountSecurity.availableActions.disableAccount ? (
                          <SecurityActionButton
                            label="Desactiver le compte"
                            description="Coupe l acces sans supprimer la fiche employe."
                            tone="danger"
                            busy={securityAction === "disable_account"}
                            disabled={Boolean(securityAction) || saving || deleting}
                            onClick={() => void runAccountSecurityAction("disable_account")}
                          />
                        ) : null}

                        {accountSecurity.availableActions.reactivateAccount ? (
                          <SecurityActionButton
                            label="Reactiver le compte"
                            description="Restaure l acces du compte sans casser le profil employe."
                            busy={securityAction === "reactivate_account"}
                            disabled={Boolean(securityAction) || saving || deleting}
                            onClick={() => void runAccountSecurityAction("reactivate_account")}
                          />
                        ) : null}

                        <SecurityActionButton
                          label="Actualiser le statut du compte"
                          description="Recharge les informations d activation, de connexion et les actions disponibles."
                          busy={accountSecurityLoading}
                          disabled={accountSecurityLoading || Boolean(securityAction)}
                          onClick={() => void loadAccountSecurity(employeeId as number)}
                        />
                      </div>

                      <div
                        className="tagora-panel-muted"
                        style={{ border: "1px solid #dbe4f0", background: "#f8fafc" }}
                      >
                        <p className="tagora-note" style={{ margin: 0 }}>
                          {accountSecurity.availableActions.reactivateAccount
                            ? "Le compte est desactive. Vous pouvez le reactiver, et la reinitialisation du mot de passe reste disponible tant que le compte Auth existe."
                            : accountSecurity.accountExists
                              ? "Le compte Auth existe. Reinitialiser le mot de passe reste toujours disponible, meme si le compte est encore invite."
                              : "Aucun compte Auth n existe encore pour cet employe. L action disponible cree l invitation initiale."}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="tagora-panel-muted">
                      <p className="tagora-note" style={{ margin: 0 }}>
                        Aucun etat de compte disponible.
                      </p>
                    </div>
                  )}
                </section>
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
                description="Activez ou coupez chaque alerte."
                open={openSection === "alertes_sms"}
                onToggle={() => setOpenSection("alertes_sms")}
              >
                <div className="ui-stack-sm">
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

                  {!isEditing ? (
                    <button
                      type="button"
                      className="tagora-dark-action"
                      onClick={() => setIsEditing(true)}
                      disabled={saving || deleting || Boolean(securityAction)}
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
                          uploadingVerso ||
                          Boolean(securityAction)
                        }
                      >
                        {saving ? "Enregistrement..." : "Enregistrer"}
                      </button>
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
                        onClick={handleCancel}
                        disabled={saving || deleting || Boolean(securityAction)}
                      >
                        Annuler
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className="tagora-btn-danger"
                    onClick={() => void handleDelete()}
                    disabled={saving || deleting || Boolean(securityAction)}
                  >
                    {deleting ? "Suppression..." : "Supprimer"}
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
