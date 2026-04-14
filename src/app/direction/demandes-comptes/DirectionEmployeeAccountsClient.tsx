"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import { accountRequestPermissionOptions } from "@/app/lib/account-request-options";
import { getCompanyLabel, type AccountRequestCompany } from "@/app/lib/account-requests.shared";
import { supabase } from "@/app/lib/supabase/client";

type RequestStatus = "pending" | "invited" | "active" | "refused" | "error";
type RequestRole = "employe" | "direction";
type RequestAction =
  | "approve"
  | "refuse"
  | "update_access"
  | "save_employee_profile"
  | "reset_pending"
  | "resend_invitation"
  | "disable_access"
  | "retry"
  | "delete";

type EmployeeProfile = {
  id: number | null;
  nom: string | null;
  courriel: string | null;
  telephone: string | null;
  actif: boolean | null;
  notes: string | null;
  primary_company: AccountRequestCompany | null;
  taux_base_titan: number | null;
  social_benefits_percent: number | null;
  titan_billable: boolean;
  schedule_start: string | null;
  schedule_end: string | null;
  scheduled_work_days: string[];
  planned_daily_hours: number | null;
  planned_weekly_hours: number | null;
  pause_minutes: number | null;
  expected_breaks_count: number | null;
  break_1_label: string | null;
  break_1_minutes: number | null;
  break_1_paid: boolean;
  break_2_label: string | null;
  break_2_minutes: number | null;
  break_2_paid: boolean;
  break_3_label: string | null;
  break_3_minutes: number | null;
  break_3_paid: boolean;
  break_am_enabled: boolean;
  break_am_time: string | null;
  break_am_minutes: number | null;
  break_am_paid: boolean;
  lunch_enabled: boolean;
  lunch_time: string | null;
  lunch_minutes: number | null;
  lunch_paid: boolean;
  break_pm_enabled: boolean;
  break_pm_time: string | null;
  break_pm_minutes: number | null;
  break_pm_paid: boolean;
  sms_alert_depart_terrain: boolean;
  sms_alert_arrivee_terrain: boolean;
  sms_alert_sortie: boolean;
  sms_alert_retour: boolean;
  sms_alert_pause_debut: boolean;
  sms_alert_pause_fin: boolean;
  sms_alert_dinner_debut: boolean;
  sms_alert_dinner_fin: boolean;
  sms_alert_quart_debut: boolean;
  sms_alert_quart_fin: boolean;
  total_break_minutes: number | null;
  total_unpaid_break_minutes: number | null;
  billable_hourly_cost: number | null;
};

type AccountRequest = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: AccountRequestCompany;
  portal_source: RequestRole;
  requested_role: RequestRole;
  requested_permissions: string[] | null;
  status: RequestStatus;
  assigned_role: RequestRole | null;
  assigned_permissions: string[] | null;
  review_note: string | null;
  created_at: string;
  existing_account?: {
    exists: boolean;
    role: RequestRole | null;
    permissions: string[];
    emailConfirmed: boolean;
    lastSignInAt: string | null;
  } | null;
  review_lock?: { isLocked: boolean; expiresAt: string | null } | null;
  employee_profile?: EmployeeProfile | null;
};

type FormState = {
  id: number | null;
  nom: string;
  courriel: string;
  telephone: string;
  actif: boolean;
  notes: string;
  primary_company: AccountRequestCompany;
  taux_base_titan: string;
  social_benefits_percent: string;
  titan_billable: boolean;
  schedule_start: string;
  schedule_end: string;
  scheduled_work_days: string[];
  planned_daily_hours: string;
  planned_weekly_hours: string;
  pause_minutes: string;
  expected_breaks_count: string;
  break_1_label: string;
  break_1_minutes: string;
  break_1_paid: boolean;
  break_2_label: string;
  break_2_minutes: string;
  break_2_paid: boolean;
  break_3_label: string;
  break_3_minutes: string;
  break_3_paid: boolean;
  break_am_enabled: boolean;
  break_am_time: string;
  break_am_minutes: string;
  break_am_paid: boolean;
  lunch_enabled: boolean;
  lunch_time: string;
  lunch_minutes: string;
  lunch_paid: boolean;
  break_pm_enabled: boolean;
  break_pm_time: string;
  break_pm_minutes: string;
  break_pm_paid: boolean;
  sms_alert_depart_terrain: boolean;
  sms_alert_arrivee_terrain: boolean;
  sms_alert_sortie: boolean;
  sms_alert_retour: boolean;
  sms_alert_pause_debut: boolean;
  sms_alert_pause_fin: boolean;
  sms_alert_dinner_debut: boolean;
  sms_alert_dinner_fin: boolean;
  sms_alert_quart_debut: boolean;
  sms_alert_quart_fin: boolean;
};

const permissionLabels = new Map(accountRequestPermissionOptions.map((item) => [item.value, item.label]));
const workDays = [
  ["lundi", "Lun"],
  ["mardi", "Mar"],
  ["mercredi", "Mer"],
  ["jeudi", "Jeu"],
  ["vendredi", "Ven"],
  ["samedi", "Sam"],
  ["dimanche", "Dim"],
] as const;

function formatRole(role: RequestRole | null | undefined) {
  return role === "direction" ? "Direction" : role === "employe" ? "Employe" : "Non defini";
}

function formatDate(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "-";
}

function formatPermissions(values: string[] | null | undefined) {
  return values && values.length > 0
    ? values
        .map((value) => {
          const typedValue = value as (typeof accountRequestPermissionOptions)[number]["value"];
          return permissionLabels.get(typedValue) ?? value;
        })
        .join(", ")
    : "Aucune";
}

function formatMoney(value: number | null | undefined) {
  return value == null ? "-" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(value);
}

function statusPresentation(status: RequestStatus) {
  if (status === "active") return { color: "#166534", background: "#dcfce7", label: "Actif" };
  if (status === "invited") return { color: "#1d4ed8", background: "#dbeafe", label: "Invite" };
  if (status === "refused") return { color: "#991b1b", background: "#fee2e2", label: "Refuse" };
  if (status === "error") return { color: "#b45309", background: "#fef3c7", label: "Erreur" };
  return { color: "#92400e", background: "#fef3c7", label: "En attente" };
}

function primaryAction(status: RequestStatus): RequestAction {
  return status === "active" || status === "invited" ? "update_access" : "save_employee_profile";
}

function secondaryActions(status: RequestStatus): Array<{ action: RequestAction; label: string; tone: "secondary" }> {
  if (status === "pending") return [{ action: "approve", label: "Approuver", tone: "secondary" as const }];
  if (status === "invited") return [{ action: "resend_invitation", label: "Renvoyer l invitation", tone: "secondary" as const }, { action: "reset_pending", label: "Remettre en attente", tone: "secondary" as const }];
  if (status === "active") return [{ action: "disable_access", label: "Desactiver l acces", tone: "secondary" as const }];
  if (status === "refused") return [{ action: "reset_pending", label: "Remettre en attente", tone: "secondary" as const }];
  return [{ action: "retry", label: "Relancer le traitement", tone: "secondary" as const }, { action: "reset_pending", label: "Remettre en attente", tone: "secondary" as const }];
}

function destructiveAction(status: RequestStatus): { action: RequestAction; label: string } | null {
  if (status === "pending") return { action: "refuse" as const, label: "Refuser" };
  if (status === "invited" || status === "active" || status === "refused" || status === "error") return { action: "delete" as const, label: "Supprimer" };
  return null;
}

function buildForm(request: AccountRequest | null): FormState {
  const profile = request?.employee_profile;
  return {
    id: profile?.id ?? null,
    nom: profile?.nom ?? request?.full_name ?? "",
    courriel: profile?.courriel ?? request?.email ?? "",
    telephone: profile?.telephone ?? request?.phone ?? "",
    actif: profile?.actif ?? true,
    notes: profile?.notes ?? "",
    primary_company: profile?.primary_company ?? request?.company ?? "oliem_solutions",
    taux_base_titan: profile?.taux_base_titan != null ? String(profile.taux_base_titan) : "",
    social_benefits_percent: profile?.social_benefits_percent != null ? String(profile.social_benefits_percent) : "15",
    titan_billable: profile?.titan_billable ?? false,
    schedule_start: profile?.schedule_start ?? "",
    schedule_end: profile?.schedule_end ?? "",
    scheduled_work_days: profile?.scheduled_work_days ?? [],
    planned_daily_hours: profile?.planned_daily_hours != null ? String(profile.planned_daily_hours) : "",
    planned_weekly_hours: profile?.planned_weekly_hours != null ? String(profile.planned_weekly_hours) : "",
    pause_minutes: profile?.pause_minutes != null ? String(profile.pause_minutes) : "15",
    expected_breaks_count: profile?.expected_breaks_count != null ? String(profile.expected_breaks_count) : "0",
    break_1_label: profile?.break_1_label ?? "Pause 1",
    break_1_minutes: profile?.break_1_minutes != null ? String(profile.break_1_minutes) : "",
    break_1_paid: profile?.break_1_paid ?? true,
    break_2_label: profile?.break_2_label ?? "Pause 2",
    break_2_minutes: profile?.break_2_minutes != null ? String(profile.break_2_minutes) : "",
    break_2_paid: profile?.break_2_paid ?? true,
    break_3_label: profile?.break_3_label ?? "Pause 3",
    break_3_minutes: profile?.break_3_minutes != null ? String(profile.break_3_minutes) : "",
    break_3_paid: profile?.break_3_paid ?? true,
    break_am_enabled: profile?.break_am_enabled ?? false,
    break_am_time: profile?.break_am_time ?? "",
    break_am_minutes: profile?.break_am_minutes != null ? String(profile.break_am_minutes) : "",
    break_am_paid: profile?.break_am_paid ?? true,
    lunch_enabled: profile?.lunch_enabled ?? false,
    lunch_time: profile?.lunch_time ?? "",
    lunch_minutes: profile?.lunch_minutes != null ? String(profile.lunch_minutes) : "",
    lunch_paid: profile?.lunch_paid ?? false,
    break_pm_enabled: profile?.break_pm_enabled ?? false,
    break_pm_time: profile?.break_pm_time ?? "",
    break_pm_minutes: profile?.break_pm_minutes != null ? String(profile.break_pm_minutes) : "",
    break_pm_paid: profile?.break_pm_paid ?? true,
    sms_alert_depart_terrain: profile?.sms_alert_depart_terrain ?? true,
    sms_alert_arrivee_terrain: profile?.sms_alert_arrivee_terrain ?? true,
    sms_alert_sortie: profile?.sms_alert_sortie ?? true,
    sms_alert_retour: profile?.sms_alert_retour ?? true,
    sms_alert_pause_debut: profile?.sms_alert_pause_debut ?? true,
    sms_alert_pause_fin: profile?.sms_alert_pause_fin ?? true,
    sms_alert_dinner_debut: profile?.sms_alert_dinner_debut ?? true,
    sms_alert_dinner_fin: profile?.sms_alert_dinner_fin ?? true,
    sms_alert_quart_debut: profile?.sms_alert_quart_debut ?? true,
    sms_alert_quart_fin: profile?.sms_alert_quart_fin ?? true,
  };
}

function summary(label: string, value: string) {
  return (
    <div className="account-requests-summary-item">
      <span className="account-requests-card-meta-label">{label}</span>
      <span className="account-requests-summary-value">{value}</span>
    </div>
  );
}

function actionClass(tone: "primary" | "secondary" | "danger") {
  if (tone === "danger") return "tagora-btn-danger";
  if (tone === "secondary") return "tagora-dark-outline-action";
  return "tagora-dark-action";
}

function successLabel(action: RequestAction) {
  if (action === "update_access") return "Compte et fiche mis a jour.";
  if (action === "save_employee_profile") return "Fiche employe mise a jour.";
  if (action === "approve") return "Compte approuve.";
  if (action === "refuse") return "Compte refuse.";
  if (action === "reset_pending") return "Compte remis en attente.";
  if (action === "resend_invitation") return "Invitation renvoyee.";
  if (action === "disable_access") return "Acces desactive.";
  if (action === "retry") return "Traitement relance.";
  return "Compte supprime.";
}

export default function DirectionEmployeeAccountsClient() {
  const router = useRouter();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignedRole, setAssignedRole] = useState<RequestRole>("employe");
  const [assignedPermissions, setAssignedPermissions] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [confirmOverwriteExistingAccount, setConfirmOverwriteExistingAccount] = useState(false);
  const [form, setForm] = useState<FormState>(buildForm(null));
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [savingAction, setSavingAction] = useState<RequestAction | null>(null);
  const [permissionOptions, setPermissionOptions] = useState<Array<{ value: string; label: string }>>([...accountRequestPermissionOptions]);

  const sortedRequests = useMemo(() => [...requests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [requests]);
  const selectedRequest = useMemo(() => sortedRequests.find((item) => item.id === selectedId) ?? null, [selectedId, sortedRequests]);
  const counts = useMemo(() => ({
    pending: sortedRequests.filter((item) => item.status === "pending").length,
    invited: sortedRequests.filter((item) => item.status === "invited").length,
    active: sortedRequests.filter((item) => item.status === "active").length,
    refused: sortedRequests.filter((item) => item.status === "refused").length,
    error: sortedRequests.filter((item) => item.status === "error").length,
  }), [sortedRequests]);
  const computedCost = useMemo(() => {
    const rate = Number(form.taux_base_titan);
    const benefits = Number(form.social_benefits_percent || "15");
    return Number.isFinite(rate) ? Number((rate * (1 + (Number.isFinite(benefits) ? benefits : 15) / 100)).toFixed(2)) : null;
  }, [form.social_benefits_percent, form.taux_base_titan]);
  const breakSummary = useMemo(() => {
    const items = [
      { enabled: form.break_am_enabled, minutes: Number(form.break_am_minutes), paid: form.break_am_paid },
      { enabled: form.lunch_enabled, minutes: Number(form.lunch_minutes), paid: form.lunch_paid },
      { enabled: form.break_pm_enabled, minutes: Number(form.break_pm_minutes), paid: form.break_pm_paid },
    ];
    const total = items.reduce((sum, item) => sum + (item.enabled && Number.isFinite(item.minutes) && item.minutes > 0 ? item.minutes : 0), 0);
    const unpaid = items.reduce((sum, item) => sum + (item.enabled && Number.isFinite(item.minutes) && item.minutes > 0 && !item.paid ? item.minutes : 0), 0);
    const count = items.filter((item) => item.enabled).length;
    const paid = total - unpaid;
    return { total, unpaid, paid, count };
  }, [form.break_am_enabled, form.break_am_minutes, form.break_am_paid, form.lunch_enabled, form.lunch_minutes, form.lunch_paid, form.break_pm_enabled, form.break_pm_minutes, form.break_pm_paid]);
  const scheduleRows = useMemo(() => ([
    { key: "break_am" as const, label: "Pause AM", enabled: form.break_am_enabled, time: form.break_am_time, minutes: form.break_am_minutes, paid: form.break_am_paid },
    { key: "lunch" as const, label: "Diner", enabled: form.lunch_enabled, time: form.lunch_time, minutes: form.lunch_minutes, paid: form.lunch_paid },
    { key: "break_pm" as const, label: "Pause PM", enabled: form.break_pm_enabled, time: form.break_pm_time, minutes: form.break_pm_minutes, paid: form.break_pm_paid },
  ]), [form.break_am_enabled, form.break_am_time, form.break_am_minutes, form.break_am_paid, form.lunch_enabled, form.lunch_time, form.lunch_minutes, form.lunch_paid, form.break_pm_enabled, form.break_pm_time, form.break_pm_minutes, form.break_pm_paid]);
  const smsAlertRows = useMemo(() => ([
    { key: "sms_alert_depart_terrain" as const, label: "Depart terrain", enabled: form.sms_alert_depart_terrain },
    { key: "sms_alert_arrivee_terrain" as const, label: "Arrivee terrain", enabled: form.sms_alert_arrivee_terrain },
    { key: "sms_alert_sortie" as const, label: "Sortie", enabled: form.sms_alert_sortie },
    { key: "sms_alert_retour" as const, label: "Retour", enabled: form.sms_alert_retour },
    { key: "sms_alert_pause_debut" as const, label: "Pause debut", enabled: form.sms_alert_pause_debut },
    { key: "sms_alert_pause_fin" as const, label: "Pause fin", enabled: form.sms_alert_pause_fin },
    { key: "sms_alert_dinner_debut" as const, label: "Diner debut", enabled: form.sms_alert_dinner_debut },
    { key: "sms_alert_dinner_fin" as const, label: "Diner fin", enabled: form.sms_alert_dinner_fin },
    { key: "sms_alert_quart_debut" as const, label: "Quart debut", enabled: form.sms_alert_quart_debut },
    { key: "sms_alert_quart_fin" as const, label: "Quart fin", enabled: form.sms_alert_quart_fin },
  ]), [form.sms_alert_arrivee_terrain, form.sms_alert_depart_terrain, form.sms_alert_dinner_debut, form.sms_alert_dinner_fin, form.sms_alert_pause_debut, form.sms_alert_pause_fin, form.sms_alert_quart_debut, form.sms_alert_quart_fin, form.sms_alert_retour, form.sms_alert_sortie]);

  const fetchRequests = useCallback(async (targetId?: string | null) => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const response = await fetch("/api/account-requests", { headers: { Authorization: `Bearer ${accessToken}`, "x-account-requests-client": "browser-authenticated", "Cache-Control": "no-store" } });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Chargement impossible.");
      const nextRequests = Array.isArray(payload.requests) ? payload.requests : [];
      setRequests(nextRequests);
      setSelectedId(nextRequests.find((item: AccountRequest) => item.id === targetId)?.id ?? nextRequests[0]?.id ?? null);
      setMessage("");
      setMessageType(null);
    } catch (error) {
      setRequests([]);
      setMessage(error instanceof Error ? error.message : "Chargement impossible.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      setAccessToken(data.session?.access_token ?? null);
    })();
  }, []);

  useEffect(() => {
    if (accessToken) void fetchRequests();
  }, [accessToken, fetchRequests]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/permissions");
        const payload = await response.json();
        if (response.ok && Array.isArray(payload.permissions) && payload.permissions.length > 0) {
          setPermissionOptions(payload.permissions);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!selectedRequest) return;
    setAssignedRole(selectedRequest.assigned_role ?? selectedRequest.requested_role ?? "employe");
    setAssignedPermissions(selectedRequest.assigned_permissions ?? selectedRequest.requested_permissions ?? []);
    setReviewNote(selectedRequest.review_note ?? "");
    setForm(buildForm(selectedRequest));
    setConfirmOverwriteExistingAccount(false);
  }, [selectedRequest]);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  function togglePermission(permission: string) {
    setAssignedPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

  function toggleDay(day: string) {
    setForm((current) => ({
      ...current,
      scheduled_work_days: current.scheduled_work_days.includes(day) ? current.scheduled_work_days.filter((item) => item !== day) : [...current.scheduled_work_days, day],
    }));
  }

  async function runAction(action: RequestAction) {
    if (!selectedRequest || !accessToken) return;
    setSavingAction(action);
    setMessage("");
    setMessageType(null);
    try {
      const response = await fetch(`/api/account-requests/${selectedRequest.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-account-requests-client": "browser-authenticated",
          "x-account-requests-page": "direction-demandes-comptes",
        },
        ...(action === "delete" ? {} : {
          body: JSON.stringify({
            action,
            assignedRole,
            assignedPermissions,
            reviewNote,
            confirmOverwriteExistingAccount,
            employeeProfile: {
              ...form,
              expected_breaks_count: String(breakSummary.count),
              break_1_label: "Pause AM",
              break_1_minutes: form.break_am_minutes,
              break_1_paid: form.break_am_paid,
              break_2_label: "Diner",
              break_2_minutes: form.lunch_minutes,
              break_2_paid: form.lunch_paid,
              break_3_label: "Pause PM",
              break_3_minutes: form.break_pm_minutes,
              break_3_paid: form.break_pm_paid,
            },
          }),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Le traitement a echoue.");
      const successMessage =
        action === "approve"
          ? "Employe active avec succes"
          : successLabel(action);
      setMessage(successMessage);
      setMessageType("success");
      if (action === "approve") {
        setToastMessage("Employe active avec succes");
        if (redirectTimeoutRef.current) {
          clearTimeout(redirectTimeoutRef.current);
        }
        redirectTimeoutRef.current = setTimeout(() => {
          router.push("/direction/ressources/employes");
        }, 1200);
      }
      await fetchRequests(action === "delete" ? null : selectedRequest.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Le traitement a echoue.");
      setMessageType("error");
    } finally {
      setSavingAction(null);
    }
  }

  return (
    <main className="tagora-app-shell account-requests-page">
      {toastMessage ? (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 60,
            padding: "14px 18px",
            borderRadius: 16,
            background: "rgba(15, 23, 42, 0.96)",
            color: "#ffffff",
            boxShadow: "0 20px 45px rgba(15, 23, 42, 0.24)",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {toastMessage}
        </div>
      ) : null}
      <div className="tagora-app-content" style={{ maxWidth: 1520 }}>
        <HeaderTagora title="Gestion des comptes employe" subtitle="Comptes, emploi et refacturation" />
        <div className="tagora-stat-grid account-requests-stats">
          <div className="tagora-stat-card"><div className="tagora-stat-label">En attente</div><div className="tagora-stat-value">{counts.pending}</div></div>
          <div className="tagora-stat-card"><div className="tagora-stat-label">Invites</div><div className="tagora-stat-value">{counts.invited}</div></div>
          <div className="tagora-stat-card"><div className="tagora-stat-label">Actifs</div><div className="tagora-stat-value">{counts.active}</div></div>
          <div className="tagora-stat-card"><div className="tagora-stat-label">Refuses</div><div className="tagora-stat-value">{counts.refused}</div></div>
          <div className="tagora-stat-card"><div className="tagora-stat-label">Erreurs</div><div className="tagora-stat-value">{counts.error}</div></div>
        </div>
        <FeedbackMessage message={message} type={messageType} />

        <div className="tagora-split" style={{ gridTemplateColumns: "minmax(320px, 0.92fr) minmax(0, 1.6fr)", gap: 28 }}>
          <section className="tagora-panel">
            <div className="account-requests-section-head">
              <div><h2 className="section-title account-requests-section-title">Comptes employe</h2><p className="tagora-note account-requests-section-note">Selectionnez une fiche.</p></div>
              <Link href="/direction/dashboard" className="tagora-dark-outline-action">Retour</Link>
            </div>
            {loading ? <div className="tagora-panel-muted account-requests-empty"><p className="tagora-note">Chargement...</p></div> : sortedRequests.length === 0 ? <div className="tagora-panel-muted account-requests-empty"><p className="tagora-note">Aucun compte.</p></div> : <div className="account-requests-list">{sortedRequests.map((request) => {
              const profile = request.employee_profile;
              const status = statusPresentation(request.status);
              return (
                <button key={request.id} type="button" onClick={() => setSelectedId(request.id)} className={`account-requests-card${selectedId === request.id ? " is-selected" : ""}`}>
                  <div className="account-requests-card-head">
                    <div className="account-requests-card-identity">
                      <h3 className="account-requests-card-title">{profile?.nom || request.full_name}</h3>
                      <div className="account-requests-card-contact"><span className="account-requests-card-email">{profile?.courriel || request.email}</span><span className="account-requests-card-secondary">{profile?.telephone || request.phone || "Telephone non fourni"}</span></div>
                    </div>
                    <span className="account-requests-status-badge" style={{ color: status.color, background: status.background }}>{status.label}</span>
                  </div>
                  <div className="account-requests-card-meta">
                    <div className="account-requests-card-meta-item"><span className="account-requests-card-meta-label">Compagnie</span><span className="account-requests-card-meta-value">{getCompanyLabel(profile?.primary_company ?? request.company)}</span></div>
                    <div className="account-requests-card-meta-item"><span className="account-requests-card-meta-label">Role</span><span className="account-requests-card-meta-value">{formatRole(request.assigned_role ?? request.requested_role)}</span></div>
                    <div className="account-requests-card-meta-item"><span className="account-requests-card-meta-label">Emploi</span><span className="account-requests-card-meta-value">{profile?.actif === false ? "Inactif" : "Actif"}</span></div>
                    <div className="account-requests-card-meta-item"><span className="account-requests-card-meta-label">Titan</span><span className="account-requests-card-meta-value">{profile?.titan_billable ? "Oui" : "Non"}</span></div>
                  </div>
                </button>
              );
            })}</div>}
          </section>

          <aside className="ui-stack-md">
            {!selectedRequest ? <div className="tagora-panel"><div className="tagora-panel-muted account-requests-empty"><p className="tagora-note">Selection requise.</p></div></div> : <>
              <section className="tagora-panel ui-stack-md">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div className="ui-stack-xs"><h2 className="section-title" style={{ marginBottom: 0 }}>{form.nom || selectedRequest.full_name}</h2><p className="tagora-note" style={{ margin: 0 }}>{form.courriel || selectedRequest.email}</p></div>
                  <span className="account-requests-status-badge" style={{ color: statusPresentation(selectedRequest.status).color, background: statusPresentation(selectedRequest.status).background }}>{statusPresentation(selectedRequest.status).label}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 }}>
                  {summary("Portail", formatRole(selectedRequest.portal_source))}
                  {summary("Compte", selectedRequest.existing_account?.exists ? "Existant" : "A creer")}
                  {summary("Creation", formatDate(selectedRequest.created_at))}
                  {summary("Derniere connexion", formatDate(selectedRequest.existing_account?.lastSignInAt))}
                </div>
              </section>

              <section className="tagora-panel ui-stack-md">
                <div className="ui-stack-xs"><h2 className="section-title" style={{ marginBottom: 0 }}>Compte</h2><p className="tagora-note" style={{ margin: 0 }}>Acces et administration.</p></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
                  {summary("Nom", selectedRequest.full_name)}
                  {summary("Courriel", selectedRequest.email)}
                  {summary("Telephone", selectedRequest.phone || "-")}
                  {summary("Compagnie", getCompanyLabel(selectedRequest.company))}
                  {summary("Role demande", formatRole(selectedRequest.requested_role))}
                  {summary("Permissions demandees", formatPermissions(selectedRequest.requested_permissions))}
                  {summary("Role actuel", formatRole(selectedRequest.existing_account?.role))}
                  {summary("Permissions actuelles", formatPermissions(selectedRequest.existing_account?.permissions))}
                </div>
                <div className="tagora-form-grid">
                  <label className="tagora-field"><span className="tagora-label">Role</span><select className="tagora-input" value={assignedRole} onChange={(e) => setAssignedRole(e.target.value === "direction" ? "direction" : "employe")}><option value="employe">Employe</option><option value="direction">Direction</option></select></label>
                  <label className="tagora-field" style={{ gridColumn: "1 / -1" }}><span className="tagora-label">Note admin</span><textarea className="tagora-textarea" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Note admin" /></label>
                </div>
                <div className="tagora-panel-muted account-requests-permissions">{permissionOptions.map((option) => <label key={option.value} className="account-requests-permission-option"><input type="checkbox" checked={assignedPermissions.includes(option.value)} onChange={() => togglePermission(option.value)} /><span>{option.label}</span></label>)}</div>
              </section>

              <section className="tagora-panel ui-stack-md">
                <div className="ui-stack-xs"><h2 className="section-title" style={{ marginBottom: 0 }}>Emploi</h2><p className="tagora-note" style={{ margin: 0 }}>Fiche employe.</p></div>
                <div className="tagora-form-grid">
                  <label className="tagora-field"><span className="tagora-label">Nom</span><input className="tagora-input" value={form.nom} onChange={(e) => setForm((c) => ({ ...c, nom: e.target.value }))} /></label>
                  <label className="tagora-field"><span className="tagora-label">Courriel</span><input className="tagora-input" type="email" value={form.courriel} onChange={(e) => setForm((c) => ({ ...c, courriel: e.target.value }))} /></label>
                  <label className="tagora-field"><span className="tagora-label">Telephone</span><input className="tagora-input" value={form.telephone} onChange={(e) => setForm((c) => ({ ...c, telephone: e.target.value }))} /></label>
                  <label className="tagora-field"><span className="tagora-label">Compagnie de rattachement</span><select className="tagora-input" value={form.primary_company} onChange={(e) => setForm((c) => ({ ...c, primary_company: e.target.value as AccountRequestCompany }))}><option value="oliem_solutions">{getCompanyLabel("oliem_solutions")}</option><option value="titan_produits_industriels">{getCompanyLabel("titan_produits_industriels")}</option></select></label>
                  <label className="account-requests-permission-option"><input type="checkbox" checked={form.actif} onChange={(e) => setForm((c) => ({ ...c, actif: e.target.checked }))} /><span>Employe actif</span></label>
                  <label className="tagora-field" style={{ gridColumn: "1 / -1" }}><span className="tagora-label">Note employe</span><textarea className="tagora-textarea" value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Note interne" /></label>
                </div>
              </section>

              <section className="tagora-panel ui-stack-md">
                <div className="ui-stack-xs"><h2 className="section-title" style={{ marginBottom: 0 }}>Horaire prevu</h2><p className="tagora-note" style={{ margin: 0 }}>Base horodateur.</p></div>
                <div className="tagora-form-grid">
                  <label className="tagora-field"><span className="tagora-label">Heure de debut</span><input className="tagora-input" type="time" value={form.schedule_start} onChange={(e) => setForm((c) => ({ ...c, schedule_start: e.target.value }))} /></label>
                  <label className="tagora-field"><span className="tagora-label">Heure de fin</span><input className="tagora-input" type="time" value={form.schedule_end} onChange={(e) => setForm((c) => ({ ...c, schedule_end: e.target.value }))} /></label>
                  <label className="tagora-field"><span className="tagora-label">Heures par jour</span><input className="tagora-input" type="number" min="0" step="0.25" value={form.planned_daily_hours} onChange={(e) => setForm((c) => ({ ...c, planned_daily_hours: e.target.value }))} /></label>
                  <label className="tagora-field"><span className="tagora-label">Heures hebdo</span><input className="tagora-input" type="number" min="0" step="0.25" value={form.planned_weekly_hours} onChange={(e) => setForm((c) => ({ ...c, planned_weekly_hours: e.target.value }))} /></label>
                  <div className="tagora-field" style={{ gridColumn: "1 / -1" }}><span className="tagora-label">Jours travailles</span><div className="tagora-panel-muted" style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: 16 }}>{workDays.map(([value, label]) => <label key={value} className="account-requests-permission-option"><input type="checkbox" checked={form.scheduled_work_days.includes(value)} onChange={() => toggleDay(value)} /><span>{label}</span></label>)}</div></div>
                </div>
                <div className="ui-stack-sm">
                  <div className="tagora-label">Pauses et diner</div>
                  <div className="ui-stack-sm">
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1.2fr) 96px 140px 120px 150px", gap: 12, padding: "0 6px", color: "#6b7280", fontSize: 12, fontWeight: 700 }}>
                      <div>Element</div>
                      <div>Actif</div>
                      <div>Heure</div>
                      <div>Duree</div>
                      <div>Statut</div>
                    </div>
                    {scheduleRows.map((row) => (
                      <div key={row.key} className="tagora-panel-muted" style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1.2fr) 96px 140px 120px 150px", gap: 12, alignItems: "center", padding: 16 }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{row.label}</div>
                        <label className="account-requests-permission-option" style={{ margin: 0 }}>
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            onChange={(e) =>
                              setForm((c) => ({
                                ...c,
                                ...(row.key === "break_am" ? { break_am_enabled: e.target.checked } : {}),
                                ...(row.key === "lunch" ? { lunch_enabled: e.target.checked } : {}),
                                ...(row.key === "break_pm" ? { break_pm_enabled: e.target.checked } : {}),
                              }))
                            }
                          />
                          <span>Oui</span>
                        </label>
                        <input
                          className="tagora-input"
                          type="time"
                          value={row.time}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              ...(row.key === "break_am" ? { break_am_time: e.target.value } : {}),
                              ...(row.key === "lunch" ? { lunch_time: e.target.value } : {}),
                              ...(row.key === "break_pm" ? { break_pm_time: e.target.value } : {}),
                            }))
                          }
                        />
                        <input
                          className="tagora-input"
                          type="number"
                          min="0"
                          step="1"
                          value={row.minutes}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              ...(row.key === "break_am" ? { break_am_minutes: e.target.value } : {}),
                              ...(row.key === "lunch" ? { lunch_minutes: e.target.value } : {}),
                              ...(row.key === "break_pm" ? { break_pm_minutes: e.target.value } : {}),
                            }))
                          }
                        />
                        <select
                          className="tagora-input"
                          value={row.paid ? "paid" : "unpaid"}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              ...(row.key === "break_am" ? { break_am_paid: e.target.value === "paid" } : {}),
                              ...(row.key === "lunch" ? { lunch_paid: e.target.value === "paid" } : {}),
                              ...(row.key === "break_pm" ? { break_pm_paid: e.target.value === "paid" } : {}),
                            }))
                          }
                        >
                          <option value="paid">Payee</option>
                          <option value="unpaid">Non payee</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
                    <div className="tagora-panel-muted" style={{ padding: 16 }}><div className="tagora-label">Elements actifs</div><div style={{ marginTop: 8, fontWeight: 700 }}>{breakSummary.count}</div></div>
                    <div className="tagora-panel-muted" style={{ padding: 16 }}><div className="tagora-label">Total pauses</div><div style={{ marginTop: 8, fontWeight: 700 }}>{breakSummary.total} min</div></div>
                    <div className="tagora-panel-muted" style={{ padding: 16 }}><div className="tagora-label">Total paye</div><div style={{ marginTop: 8, fontWeight: 700 }}>{breakSummary.paid} min</div></div>
                    <div className="tagora-panel-muted" style={{ padding: 16 }}><div className="tagora-label">Total non paye</div><div style={{ marginTop: 8, fontWeight: 700 }}>{breakSummary.unpaid} min</div></div>
                  </div>
                </div>
              </section>

              <section className="tagora-panel ui-stack-md">
                <div className="ui-stack-xs"><h2 className="section-title" style={{ marginBottom: 0 }}>Alertes texto</h2><p className="tagora-note" style={{ margin: 0 }}>Activer ou couper chaque alerte.</p></div>
                <div className="ui-stack-sm">
                  {smsAlertRows.map((row) => (
                    <div key={row.key} className="tagora-panel-muted" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", padding: 16 }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{row.label}</div>
                      <label className="account-requests-permission-option" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              [row.key]: e.target.checked,
                            }))
                          }
                        />
                        <span>{row.enabled ? "Oui" : "Non"}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </section>

              <section className="tagora-panel ui-stack-md">
                <div className="ui-stack-xs"><h2 className="section-title" style={{ marginBottom: 0 }}>Refacturation Titan</h2><p className="tagora-note" style={{ margin: 0 }}>Cout employe calcule.</p></div>
                <div className="tagora-form-grid">
                  <label className="tagora-field"><span className="tagora-label">Taux horaire</span><input className="tagora-input" type="number" min="0" step="0.01" value={form.taux_base_titan} onChange={(e) => setForm((c) => ({ ...c, taux_base_titan: e.target.value }))} /></label>
                  <label className="tagora-field"><span className="tagora-label">Avantages sociaux %</span><input className="tagora-input" type="number" min="0" step="0.01" value={form.social_benefits_percent} onChange={(e) => setForm((c) => ({ ...c, social_benefits_percent: e.target.value }))} /></label>
                  <div className="tagora-panel-muted" style={{ padding: 18 }}><div className="tagora-label">Cout refacturable</div><div style={{ marginTop: 8, fontWeight: 700, fontSize: 20 }}>{formatMoney(computedCost)}</div></div>
                  <label className="account-requests-permission-option"><input type="checkbox" checked={form.titan_billable} onChange={(e) => setForm((c) => ({ ...c, titan_billable: e.target.checked }))} /><span>Refacturable a Titan</span></label>
                </div>
              </section>

              <section className="tagora-panel ui-stack-md">
                <div className="ui-stack-xs"><h2 className="section-title" style={{ marginBottom: 0 }}>Actions admin</h2><p className="tagora-note" style={{ margin: 0 }}>Acces et invitation.</p></div>
                {selectedRequest.existing_account?.exists ? <label className="account-requests-permission-option"><input type="checkbox" checked={confirmOverwriteExistingAccount} onChange={() => setConfirmOverwriteExistingAccount((current) => !current)} /><span>Autoriser le remplacement des acces existants</span></label> : null}
                {selectedRequest.review_lock?.isLocked ? <div className="account-requests-lock">Traitement verrouille jusqu au {formatDate(selectedRequest.review_lock.expiresAt)}.</div> : null}
                <div className="account-requests-actions"><button type="button" className="tagora-dark-action" onClick={() => void runAction(primaryAction(selectedRequest.status))} disabled={Boolean(savingAction)}>{savingAction === primaryAction(selectedRequest.status) ? "Traitement..." : "Appliquer les changements"}</button></div>
                <div className="account-requests-actions">{secondaryActions(selectedRequest.status).map((item) => <button key={item.action} type="button" className={actionClass(item.tone)} onClick={() => void runAction(item.action)} disabled={Boolean(savingAction)}>{savingAction === item.action ? "Traitement..." : item.label}</button>)}</div>
                {destructiveAction(selectedRequest.status) ? <div className="account-requests-actions"><button type="button" className="tagora-btn-danger" onClick={() => void runAction(destructiveAction(selectedRequest.status)!.action)} disabled={Boolean(savingAction)}>{savingAction === destructiveAction(selectedRequest.status)!.action ? "Traitement..." : destructiveAction(selectedRequest.status)!.label}</button></div> : null}
              </section>
            </>}
          </aside>
        </div>
      </div>
    </main>
  );
}
