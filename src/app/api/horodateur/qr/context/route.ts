import { NextRequest, NextResponse } from "next/server";
import { formatIsoDateLocal } from "@/app/api/direction/effectifs/_lib";
import { requireEmployeeHorodateurAccess } from "@/app/api/horodateur/_shared";
import {
  insertQrPunchAppAlert,
  loadQrContextState,
} from "@/app/lib/horodateur-qr-punch.server";
import {
  punchZoneCompanyLabelFr,
  isPunchZoneCompanyKey,
} from "@/app/lib/horodateur-qr-punch.shared";
import { getEmployeeDashboardSnapshotByAuthUserId } from "@/app/lib/horodateur-v1/service";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = await requireEmployeeHorodateurAccess(req);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(req.url);
  const zoneKey = (url.searchParams.get("zone") ?? "").trim();
  const token = (url.searchParams.get("token") ?? "").trim();

  const admin = createAdminSupabaseClient();
  const today = formatIsoDateLocal(new Date());

  const state = await loadQrContextState({
    supabase: admin,
    authUserId: auth.user.id,
    zoneKeyRaw: zoneKey,
    tokenRaw: token,
  });

  if (!state.ok) {
    const dedupe = `invalid_qr_ctx:${auth.user.id}:${zoneKey}:${today}`;
    if (state.block === "no_employee") {
      await insertQrPunchAppAlert(admin, {
        alertType: "employee_not_found_for_qr_punch",
        title: "Tentative de punch non autorisée",
        body: "Utilisateur connecté sans fiche employé liée (punch QR).",
        priority: "high",
        authUserId: auth.user.id,
        dedupeKey: dedupe,
        metadata: { zone_key: zoneKey },
      });
      return NextResponse.json({
        ok: false,
        message:
          "Votre compte n’est pas lié à une fiche employé. Contactez la direction.",
        code: "EMPLOYEE_NOT_LINKED",
      });
    }
    if (state.block === "inactive") {
      await insertQrPunchAppAlert(admin, {
        alertType: "employee_inactive_qr_punch_attempt",
        title: "Tentative de punch QR — employé inactif",
        body: "Compte employé inactif.",
        priority: "high",
        authUserId: auth.user.id,
        employeeId: null,
        dedupeKey: dedupe,
        metadata: { zone_key: zoneKey },
      });
      return NextResponse.json({
        ok: false,
        message: "Votre compte employé est inactif. Contactez la direction.",
        code: "EMPLOYEE_INACTIVE",
      });
    }
    if (state.block === "unauthorized_company") {
      await insertQrPunchAppAlert(admin, {
        alertType: "employee_unauthorized_qr_zone",
        title: "Punch QR — employé non autorisé pour cette zone",
        body: "La zone ne correspond pas aux autorisations de travail de l’employé.",
        priority: "high",
        authUserId: auth.user.id,
        dedupeKey: dedupe,
        metadata: { zone_key: zoneKey },
      });
      return NextResponse.json({
        ok: false,
        message: "Vous n’êtes pas autorisé à pointer dans cette zone.",
        code: "UNAUTHORIZED_ZONE",
      });
    }
    await insertQrPunchAppAlert(admin, {
      alertType: "invalid_qr_punch_zone",
      title: "Code QR invalide ou zone inactive",
      body: "Scan QR refusé (zone ou jeton).",
      priority: "high",
      authUserId: auth.user.id,
      dedupeKey: dedupe,
      metadata: { zone_key: zoneKey },
    });
    return NextResponse.json({
      ok: false,
      message: "Code QR invalide ou expiré.",
      code: "INVALID_QR",
    });
  }

  const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);
  const ck = state.zone.company_key;
  const companyLabel = isPunchZoneCompanyKey(ck) ? punchZoneCompanyLabelFr(ck) : ck;

  return NextResponse.json({
    ok: true,
    zone: {
      label: state.zone.label,
      zoneKey: state.zone.zone_key,
      companyKey: state.zone.company_key,
      companyLabel,
      locationKey: state.zone.location_key,
      requiresGps: state.requiresGps,
    },
    employee: {
      fullName: state.profile.fullName,
    },
    currentState: snapshot.currentState,
    shift: snapshot.todayShift,
  });
}
