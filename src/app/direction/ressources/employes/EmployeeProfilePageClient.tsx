"use client";

import Link from "next/link";
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
import EmployeeLongLeaveSection from "./EmployeeLongLeaveSection";
import { locationLabelFromKey } from "@/app/lib/effectifs-departments.shared";
import {
  computeWeeklyPlannedHours,
  countActiveScheduleDays,
  isWeeklyScheduleDetailConfigured,
  recalculateWeeklyScheduleConfig,
  validateWeeklyScheduleForSave,
} from "@/app/lib/weekly-schedule";
import {
  buildEmployeForm,
  buildEmployePayload,
  computeBreakSummary,
  EFFECTIFS_DEPARTMENT_ENTRIES,
  EFFECTIFS_LOCATION_ENTRIES,
  employeeWorkDays,
  formatMoney,
  type EmployeFormState,
  type EmployeProfile,
} from "./employee-profile-shared";
import EmployeeWeeklyScheduleGrid from "./EmployeeWeeklyScheduleGrid";
import TagoraCollapsibleSection from "@/app/components/TagoraCollapsibleSection";
import { cn } from "@/app/components/ui/cn";

type EmployeeProfilePageClientProps = {
  employeeId?: number | null;
  openEffectifsSection?: boolean;
};
type AssignablePortalRole = "employe" | "direction" | "manager" | "admin";

type EmployeeAccordionSection =
  | "identite"
  | "permis"
  | "horaire"
  | "historique_travail"
  | "effectifs"
  | "facturation"
  | "alertes_sms"
  | "actions_admin"
  | null;

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


type ScheduleNotificationResponse = {
  scheduleChanged?: boolean;
  emailStatus?: string;
  smsStatus?: string;
};

function messageAfterEmployeSave(sn: ScheduleNotificationResponse | undefined): string {
  if (!sn?.scheduleChanged) {
    return "Profil employe enregistre.";
  }
  const e = sn.emailStatus;
  const s = sn.smsStatus;
  const anySent = e === "sent" || s === "sent";
  const anyFailed = e === "failed" || s === "failed";
  const skipRecipient =
    e === "skipped_no_recipient" || s === "skipped_no_recipient";

  if (anyFailed && !anySent) {
    return "Horaire enregistré. La notification n'a pas pu être envoyée.";
  }

  if (anySent && skipRecipient) {
    return "Horaire enregistré. L'employé a été avisé. Notification partielle : courriel ou téléphone manquant.";
  }

  if (anySent) {
    return "Horaire enregistré. L'employé a été avisé par courriel et/ou SMS.";
  }

  return "Horaire enregistré. Notification partielle : courriel ou téléphone manquant.";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object" && !Array.isArray(error)) {
    const o = error as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === "string" && msg.trim()) {
      return msg.trim();
    }
  }

  return "Détail d'erreur indisponible.";
}


export default function EmployeeProfilePageClient({
  employeeId = null,
  openEffectifsSection = false,
}: EmployeeProfilePageClientProps) {
  const router = useRouter();
  const { role: viewerRole, loading: accessLoading, hasPermission } = useCurrentAccess();
  const canEditEffectifs =
    viewerRole === "direction" || viewerRole === "admin";
  const canOpenRegistreFromProfile =
    !accessLoading &&
    (viewerRole === "direction" || viewerRole === "admin") &&
    hasPermission("terrain");
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
  const [openSection, setOpenSection] = useState<EmployeeAccordionSection>(() =>
    openEffectifsSection ? "effectifs" : "identite"
  );
  const [legacyScheduleOpen, setLegacyScheduleOpen] = useState(false);
  const [accountAccessToken, setAccountAccessToken] = useState<string | null>(null);
  const [portalAccount, setPortalAccount] = useState<{
    authUserId: string | null;
    portalRole: AssignablePortalRole | AppRole | null;
  } | null>(null);
  const [portalRoleValue, setPortalRoleValue] = useState<AssignablePortalRole>("employe");
  const [portalRoleReason, setPortalRoleReason] = useState("");
  const [portalRoleSaving, setPortalRoleSaving] = useState(false);

  const breakSummary = useMemo(() => computeBreakSummary(form), [form]);
  const weeklyScheduleSummary = useMemo(() => {
    const w = recalculateWeeklyScheduleConfig(form.weeklySchedule);
    return {
      totalHours: computeWeeklyPlannedHours(w),
      activeDays: countActiveScheduleDays(w),
      detailConfigured: isWeeklyScheduleDetailConfigured(w),
    };
  }, [form.weeklySchedule]);
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
    if (openEffectifsSection) {
      setOpenSection("effectifs");
    }
  }, [openEffectifsSection]);

  useEffect(() => {
    if (!openEffectifsSection || loading) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      document
        .getElementById("affectation-effectifs")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [openEffectifsSection, loading]);

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

    const payload = buildEmployePayload(form, {
      includeEffectifsAssignment: canEditEffectifs,
    });
    if (canEditEffectifs && !isCreating) {
      delete (payload as Record<string, unknown>).actif;
    }

    const weeklyCheck = validateWeeklyScheduleForSave(
      recalculateWeeklyScheduleConfig(form.weeklySchedule)
    );
    if (!weeklyCheck.ok) {
      setMessage(`Erreur sauvegarde : ${weeklyCheck.message}`);
      setMessageType("error");
      setSaving(false);
      return;
    }

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

      if (!employeeId || !Number.isFinite(employeeId)) {
        setMessage("Erreur sauvegarde : Identifiant employé invalide.");
        setMessageType("error");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setMessage("Erreur sauvegarde : Session expirée. Reconnectez-vous.");
        setMessageType("error");
        return;
      }

      const response = await fetch(
        `/api/direction/ressources/employes/${employeeId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        profile?: EmployeProfile;
        scheduleNotification?: ScheduleNotificationResponse;
      };

      if (!response.ok || json.success === false) {
        const errText =
          (typeof json.error === "string" && json.error.trim()) ||
          response.statusText ||
          `HTTP ${response.status}`;
        setMessage(`Erreur sauvegarde : ${errText}`);
        setMessageType("error");
        return;
      }

      if (json.profile) {
        const next = json.profile as EmployeProfile;
        setOriginalProfile(next);
        setForm(buildEmployeForm(next));
      } else {
        await loadEmployeProfile(employeeId);
      }
      setIsEditing(false);
      setMessage(messageAfterEmployeSave(json.scheduleNotification));
      setMessageType("success");
    } catch (error) {
      setMessage(`Erreur sauvegarde : ${getErrorMessage(error)}`);
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function getSessionToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  function applyProfileFromActivation(profile: EmployeProfile) {
    setOriginalProfile(profile);
    setForm(buildEmployeForm(profile));
    setIsEditing(false);
  }

  async function callActivationApi(action: "activate" | "deactivate") {
    if (isCreating || !employeeId) return;
    const token = await getSessionToken();
    if (!token) {
      setMessage("Session expirée. Reconnectez-vous.");
      setMessageType("error");
      return;
    }

    setDeleting(true);
    setMessage("");
    setMessageType(null);

    const res = await fetch(
      `/api/direction/ressources/employes/${employeeId}/activation`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      }
    );

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      error?: string;
      profile?: EmployeProfile;
    };

    setDeleting(false);

    if (!res.ok || json.success === false) {
      setMessage(
        typeof json.error === "string" ? json.error : "Action impossible."
      );
      setMessageType("error");
      return;
    }

    if (json.profile) {
      applyProfileFromActivation(json.profile as EmployeProfile);
    } else {
      await loadEmployeProfile(employeeId);
    }

    setMessage(
      typeof json.message === "string"
        ? json.message
        : action === "activate"
          ? "Compte réactivé."
          : "Compte désactivé. L'historique est conservé."
    );
    setMessageType("success");
  }

  function handleDeactivateProfile() {
    if (isCreating || !employeeId) return;
    const ok = window.confirm(
      "Désactiver cet employé ? Il ne pourra plus utiliser le portail, mais son historique sera conservé."
    );
    if (!ok) return;
    void callActivationApi("deactivate");
  }

  function handleReactivateProfile() {
    if (isCreating || !employeeId) return;
    void callActivationApi("activate");
  }

  async function handleDeleteOrArchive() {
    if (isCreating || !employeeId) return;
    const ok = window.confirm(
      "Supprimer définitivement cet employé ? S'il existe des données liées, le compte sera uniquement désactivé."
    );
    if (!ok) return;

    const token = await getSessionToken();
    if (!token) {
      setMessage("Session expirée.");
      setMessageType("error");
      return;
    }

    setDeleting(true);
    setMessage("");
    setMessageType(null);

    const res = await fetch(`/api/direction/ressources/employes/${employeeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      error?: string;
      softDeleted?: boolean;
    };

    setDeleting(false);

    if (!res.ok || json.success === false) {
      setMessage(typeof json.error === "string" ? json.error : "Action impossible.");
      setMessageType("error");
      return;
    }

    if (json.softDeleted) {
      await loadEmployeProfile(employeeId);
    } else {
      router.push("/direction/ressources/employes");
      return;
    }

    setMessage(
      typeof json.message === "string"
        ? json.message
        : "Opération effectuée."
    );
    setMessageType("success");
  }

  const topActions = (
    <div className="tagora-actions">
      <Link href="/direction/ressources/employes" className="tagora-dark-outline-action">
        Retour
      </Link>
      <Link href="/direction/dashboard" className="tagora-dark-action">
        Tableau de bord direction
      </Link>
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
              uploadingVerso ||
              accessLoading
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
          subtitle=""
          showNavigation={false}
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

              <TagoraCollapsibleSection
                title="Identite"
                subtitle="Informations principales de l employe."
                open={openSection === "identite"}
                onOpenChange={(v) => setOpenSection(v ? "identite" : null)}
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
                        disabled={!isEditing || (canEditEffectifs && !isCreating)}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            actif: event.target.checked,
                          }))
                        }
                      />
                      <span>Employe actif</span>
                    </label>
                    {canEditEffectifs ? (
                      <p className="tagora-note" style={{ margin: 0 }}>
                        L activation et la desactivation se font via la section « Actions admin »
                        (compte portail et historique).
                      </p>
                    ) : null}

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
              </TagoraCollapsibleSection>

              <TagoraCollapsibleSection
                title="Permis"
                subtitle="Information legale et pieces jointes."
                open={openSection === "permis"}
                onOpenChange={(v) => setOpenSection(v ? "permis" : null)}
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
              </TagoraCollapsibleSection>

              <TagoraCollapsibleSection
                title="Horaire"
                subtitle="Grille hebdomadaire jour par jour (JSON weekly_schedule_config). Les champs planchers classiques sont synchronises a l'enregistrement."
                open={openSection === "horaire"}
                onOpenChange={(v) => setOpenSection(v ? "horaire" : null)}
              >
                <div
                  className="tagora-panel-muted ui-stack-sm"
                  style={{
                    borderRadius: 16,
                    padding: 16,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 12,
                  }}
                >
                  <div>
                    <div className="tagora-label">Heures hebdo prevues</div>
                    <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#0f172a" }}>
                      {weeklyScheduleSummary.totalHours > 0
                        ? `${weeklyScheduleSummary.totalHours} h`
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="tagora-label">Jours actifs</div>
                    <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#0f172a" }}>
                      {weeklyScheduleSummary.activeDays}
                    </div>
                  </div>
                  <div>
                    <div className="tagora-label">Horaire detaille</div>
                    <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a" }}>
                      {weeklyScheduleSummary.detailConfigured
                        ? "Active"
                        : "Non configure (fallback legacy)"}
                    </div>
                  </div>
                </div>

                <EmployeeWeeklyScheduleGrid
                  form={form}
                  setForm={setForm}
                  disabled={!isEditing}
                />

                <TagoraCollapsibleSection
                  title="Horaire plancher (generation & compatibilite)"
                  subtitle="Sert au bouton « Generer l'horaire detaille » et aux systemes qui lisent encore les colonnes historiques. A l'enregistrement, si la grille contient au moins un jour actif avec debut/fin, ces champs sont derives de la grille."
                  open={legacyScheduleOpen}
                  onOpenChange={setLegacyScheduleOpen}
                  className="tagora-collapsible-nested-section"
                >
                  <div className="tagora-form-grid" style={{ marginTop: 12 }}>
                    <div className="tagora-form-grid-2">
                      <label className="tagora-field">
                        <span className="tagora-label">Heure de debut (modele)</span>
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
                        <span className="tagora-label">Heure de fin (modele)</span>
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
                        <span className="tagora-label">Heures par jour (legacy)</span>
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
                        <span className="tagora-label">Heures hebdo (legacy)</span>
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
                      <span className="tagora-label">Jours travailles (modele)</span>
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

                  <div className="ui-stack-sm" style={{ marginTop: 16 }}>
                    <div className="tagora-label">Pauses et diner (modele global)</div>
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
                </TagoraCollapsibleSection>
              </TagoraCollapsibleSection>

              {canOpenRegistreFromProfile && !isCreating && employeeId ? (
                <TagoraCollapsibleSection
                  title="Historique de travail"
                  subtitle="Consulter les heures travaillées, punchs, exceptions et écarts dans le registre des heures."
                  open={openSection === "historique_travail"}
                  onOpenChange={(v) => setOpenSection(v ? "historique_travail" : null)}
                >
                  <p className="tagora-note" style={{ margin: "0 0 16px" }}>
                    Le registre des heures est la vue officielle : soldes, exceptions,
                    corrections et écarts y sont calculés de façon centralisée. Ouvrez-le
                    ci-dessous avec l&apos;employé déjà sélectionné.
                  </p>
                  <div
                    className="tagora-panel-muted"
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                      alignItems: "center",
                      padding: 16,
                      borderRadius: 16,
                    }}
                  >
                    <Link
                      href={`/direction/horodateur/registre?employeeId=${employeeId}&period=currentWeek`}
                      className={cn("ui-button", "ui-button-primary")}
                      style={{ textDecoration: "none" }}
                    >
                      Cette semaine
                    </Link>
                    <Link
                      href={`/direction/horodateur/registre?employeeId=${employeeId}&period=currentMonth`}
                      className={cn("ui-button", "ui-button-secondary")}
                      style={{ textDecoration: "none" }}
                    >
                      Ce mois
                    </Link>
                    <Link
                      href={`/direction/horodateur/registre?employeeId=${employeeId}`}
                      className={cn("ui-button", "ui-button-secondary")}
                      style={{ textDecoration: "none" }}
                    >
                      Ouvrir dans le registre des heures
                    </Link>
                  </div>
                </TagoraCollapsibleSection>
              ) : null}

              {!isCreating && employeeId != null && canEditEffectifs ? (
                <EmployeeLongLeaveSection employeeId={employeeId} />
              ) : null}

              <TagoraCollapsibleSection
                  sectionId="affectation-effectifs"
                  title="Affectation effectifs"
                  subtitle="Departements, emplacements et parametres pour la page direction / effectifs (modifiable par direction ou admin uniquement)."
                  open={openSection === "effectifs"}
                  onOpenChange={(v) => setOpenSection(v ? "effectifs" : null)}
                >
                  <div className="tagora-form-grid">
                    {!canEditEffectifs ? (
                      <p className="tagora-note" style={{ margin: 0 }}>
                        Lecture seule. Contactez la direction pour modifier
                        l&apos;affectation effectifs.
                      </p>
                    ) : null}

                    <label className="tagora-field">
                      <span className="tagora-label">Departement principal</span>
                      <select
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        value={form.effectifsDepartmentKey}
                        onChange={(event) => {
                          const v = event.target.value;
                          setForm((current) => ({
                            ...current,
                            effectifsDepartmentKey: v,
                            effectifsSecondaryDepartmentKeys:
                              current.effectifsSecondaryDepartmentKeys.filter(
                                (k) => k !== v
                              ),
                          }));
                        }}
                        disabled={!isEditing || !canEditEffectifs}
                      >
                        <option value="">Non assigne</option>
                        {EFFECTIFS_DEPARTMENT_ENTRIES.map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="tagora-field">
                      <span className="tagora-label">Departements secondaires</span>
                      <div
                        className="tagora-panel-muted"
                        style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
                      >
                        {EFFECTIFS_DEPARTMENT_ENTRIES.map((d) => {
                          if (d.key === form.effectifsDepartmentKey) {
                            return null;
                          }
                          return (
                            <label
                              key={d.key}
                              className="account-requests-permission-option"
                            >
                              <input
                                type="checkbox"
                                checked={form.effectifsSecondaryDepartmentKeys.includes(
                                  d.key
                                )}
                                disabled={!isEditing || !canEditEffectifs}
                                onChange={(event) => {
                                  const on = event.target.checked;
                                  setForm((current) => ({
                                    ...current,
                                    effectifsSecondaryDepartmentKeys: on
                                      ? [...current.effectifsSecondaryDepartmentKeys, d.key]
                                      : current.effectifsSecondaryDepartmentKeys.filter(
                                          (k) => k !== d.key
                                        ),
                                  }));
                                }}
                              />
                              <span>{d.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <label className="tagora-field">
                      <span className="tagora-label">Emplacement principal</span>
                      <select
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        value={form.effectifsPrimaryLocation}
                        onChange={(event) => {
                          const v = event.target.value;
                          setForm((current) => ({
                            ...current,
                            effectifsPrimaryLocation: v,
                            effectifsSecondaryLocations:
                              current.effectifsSecondaryLocations.filter(
                                (loc) => loc !== v
                              ),
                          }));
                        }}
                        disabled={!isEditing || !canEditEffectifs}
                      >
                        <option value="">Non renseigne</option>
                        {EFFECTIFS_LOCATION_ENTRIES.map((loc) => (
                          <option key={loc.key} value={loc.key}>
                            {loc.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="tagora-field">
                      <span className="tagora-label">Emplacements secondaires</span>
                      <div
                        className="tagora-panel-muted"
                        style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
                      >
                        {EFFECTIFS_LOCATION_ENTRIES.map((loc) => {
                          if (loc.key === form.effectifsPrimaryLocation) {
                            return null;
                          }
                          return (
                            <label
                              key={loc.key}
                              className="account-requests-permission-option"
                            >
                              <input
                                type="checkbox"
                                checked={form.effectifsSecondaryLocations.includes(
                                  loc.key
                                )}
                                disabled={!isEditing || !canEditEffectifs}
                                onChange={(event) => {
                                  const on = event.target.checked;
                                  setForm((current) => ({
                                    ...current,
                                    effectifsSecondaryLocations: on
                                      ? [...current.effectifsSecondaryLocations, loc.key]
                                      : current.effectifsSecondaryLocations.filter(
                                          (k) => k !== loc.key
                                        ),
                                  }));
                                }}
                              />
                              <span>{loc.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <label className="account-requests-permission-option">
                      <input
                        type="checkbox"
                        checked={form.canDeliver}
                        disabled={!isEditing || !canEditEffectifs}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            canDeliver: event.target.checked,
                          }))
                        }
                      />
                      <span>Peut faire des livraisons</span>
                    </label>

                    <label className="tagora-field">
                      <span className="tagora-label">
                        Heures hebdomadaires prevues (effectifs)
                      </span>
                      <input
                        className="tagora-input"
                        style={readOnlyFieldStyle}
                        type="number"
                        min="0"
                        step="0.25"
                        value={form.defaultWeeklyHours}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            defaultWeeklyHours: event.target.value,
                          }))
                        }
                        readOnly={!isEditing || !canEditEffectifs}
                      />
                    </label>

                    <label className="account-requests-permission-option">
                      <input
                        type="checkbox"
                        checked={form.scheduleActive}
                        disabled={!isEditing || !canEditEffectifs}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            scheduleActive: event.target.checked,
                          }))
                        }
                      />
                      <span>Horaire actif pour planification / couverture</span>
                    </label>

                    {!isEditing || !canEditEffectifs ? (
                      <div
                        className="tagora-panel-muted ui-stack-xs"
                        style={{ fontSize: "0.9rem" }}
                      >
                        <div>
                          <span className="tagora-label">Synthese emplacements</span>
                          <div style={{ marginTop: 6 }}>
                            Principal :{" "}
                            {form.effectifsPrimaryLocation
                              ? locationLabelFromKey(form.effectifsPrimaryLocation)
                              : "—"}
                            {form.effectifsSecondaryLocations.length > 0
                              ? ` · Secondaires : ${form.effectifsSecondaryLocations.map((k) => locationLabelFromKey(k)).join(", ")}`
                              : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </TagoraCollapsibleSection>
            </div>

            <aside className="tagora-stack">
              <TagoraCollapsibleSection
                title="Facturation"
                subtitle="Donnees Titan, cout refacturable et resume pauses."
                open={openSection === "facturation"}
                onOpenChange={(v) => setOpenSection(v ? "facturation" : null)}
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
              </TagoraCollapsibleSection>

              <TagoraCollapsibleSection
                title="Alertes SMS"
                subtitle="Activez ou coupez les alertes SMS et les destinataires direction."
                open={openSection === "alertes_sms"}
                onOpenChange={(v) => setOpenSection(v ? "alertes_sms" : null)}
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
              </TagoraCollapsibleSection>

              {!isCreating && canEditEffectifs ? (
                <TagoraCollapsibleSection
                  title="Actions admin"
                  subtitle="Activer, desactiver ou retirer un employe (direction / admin uniquement)."
                  open={openSection === "actions_admin"}
                  onOpenChange={(v) => setOpenSection(v ? "actions_admin" : null)}
                >
                  <div
                    className="tagora-panel-muted"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      padding: 16,
                      marginBottom: 12,
                    }}
                  >
                    {form.actif ? (
                      <button
                        type="button"
                        className="tagora-dark-action"
                        onClick={() => handleDeactivateProfile()}
                        disabled={saving || deleting}
                        style={{ justifyContent: "center" }}
                      >
                        {deleting ? "Traitement..." : "Desactiver"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="tagora-dark-action"
                        onClick={() => handleReactivateProfile()}
                        disabled={saving || deleting}
                        style={{ justifyContent: "center" }}
                      >
                        {deleting ? "Traitement..." : "Reactiver"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="tagora-dark-outline-action"
                      onClick={() => void handleDeleteOrArchive()}
                      disabled={saving || deleting}
                      style={{ justifyContent: "center" }}
                    >
                      {deleting ? "Traitement..." : "Supprimer / Archiver"}
                    </button>
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

                </TagoraCollapsibleSection>
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
