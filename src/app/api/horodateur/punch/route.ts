import { NextRequest, NextResponse } from "next/server";
import { formatIsoDateLocal } from "@/app/api/direction/effectifs/_lib";
import {
  buildHorodateurErrorResponse,
  buildHorodateurValidationErrorResponse,
  isHorodateurEventType,
  normalizeDirectionCompanyContext,
  normalizeEventForApi,
  normalizeNonEmptyString,
  parseOptionalIsoDateTime,
  requireEmployeeHorodateurAccess,
} from "@/app/api/horodateur/_shared";
import {
  getActiveLeaveForEmployeeOnDate,
  insertPunchDuringLongLeaveAlert,
} from "@/app/lib/employee-leave-period.server";
import {
  evaluateQrPunchAttempt,
  insertQrPunchAppAlert,
  resolveWorkCompanyKeyForEvent,
} from "@/app/lib/horodateur-qr-punch.server";
import type { PunchZoneCompanyKey } from "@/app/lib/horodateur-qr-punch.shared";
import {
  createEmployeePunch,
  getEmployeeDashboardSnapshotByAuthUserId,
} from "@/app/lib/horodateur-v1/service";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireEmployeeHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);

    return NextResponse.json({
      success: true,
      employee: snapshot.employee,
      currentState: snapshot.currentState,
      shift: snapshot.todayShift,
      weeklyProjection: snapshot.weeklyProjection,
      pendingExceptions: snapshot.pendingExceptions,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/horodateur/punch",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireEmployeeHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    const body = (await req.json()) as {
      eventType?: unknown;
      occurredAt?: unknown;
      note?: unknown;
      companyContext?: unknown;
      metadata?: unknown;
      relatedEventId?: unknown;
      retroactive?: unknown;
      acknowledgeLongLeavePunch?: unknown;
      qr?: unknown;
    };

    const normalizedEventType =
      body.retroactive === true && !body.eventType
        ? "retroactive_entry"
        : body.eventType;

    if (!isHorodateurEventType(normalizedEventType)) {
      return buildHorodateurValidationErrorResponse({
        error: "Type d evenement invalide.",
        code: "invalid_event_type",
        route: "/api/horodateur/punch",
      });
    }

    const occurredAtValidation = parseOptionalIsoDateTime(body.occurredAt);
    if (!occurredAtValidation.ok) {
      return buildHorodateurValidationErrorResponse({
        error: occurredAtValidation.error,
        code: occurredAtValidation.code,
        route: "/api/horodateur/punch",
      });
    }

    const admin = createAdminSupabaseClient();
    const todayIso = formatIsoDateLocal(new Date());

    const qrBody = body.qr;
    const isQrPunch =
      qrBody &&
      typeof qrBody === "object" &&
      typeof (qrBody as { zoneKey?: unknown }).zoneKey === "string" &&
      typeof (qrBody as { token?: unknown }).token === "string";

    if (isQrPunch) {
      const qr = qrBody as {
        zoneKey: string;
        token: string;
        latitude?: unknown;
        longitude?: unknown;
      };
      const lat =
        typeof qr.latitude === "number" && Number.isFinite(qr.latitude)
          ? qr.latitude
          : null;
      const lng =
        typeof qr.longitude === "number" && Number.isFinite(qr.longitude)
          ? qr.longitude
          : null;

      const evalResult = await evaluateQrPunchAttempt({
        supabase: admin,
        authUserId: auth.user.id,
        zoneKeyRaw: qr.zoneKey,
        tokenRaw: qr.token,
        latitude: lat,
        longitude: lng,
      });

      if (!evalResult.ok) {
        const dedupe = `qr_punch:${auth.user.id}:${evalResult.reason}:${todayIso}`;
        if (evalResult.reason === "no_employee") {
          await insertQrPunchAppAlert(admin, {
            alertType: "employee_not_found_for_qr_punch",
            title: "Tentative de punch non autorisée",
            body: "Utilisateur connecté sans fiche employé liée (punch QR).",
            priority: "high",
            authUserId: auth.user.id,
            dedupeKey: dedupe,
            metadata: { zone_key: qr.zoneKey },
          });
          return NextResponse.json(
            {
              success: false,
              code: "EMPLOYEE_NOT_LINKED",
              error:
                "Votre compte n’est pas lié à une fiche employé. Contactez la direction.",
            },
            { status: 403 }
          );
        }
        if (evalResult.reason === "inactive") {
          await insertQrPunchAppAlert(admin, {
            alertType: "employee_inactive_qr_punch_attempt",
            title: "Tentative de punch QR — employé inactif",
            body: "Compte employé inactif.",
            priority: "high",
            authUserId: auth.user.id,
            dedupeKey: dedupe,
          });
          return NextResponse.json(
            {
              success: false,
              code: "EMPLOYEE_INACTIVE",
              error: "Votre compte employé est inactif. Contactez la direction.",
            },
            { status: 403 }
          );
        }
        if (evalResult.reason === "unauthorized_company") {
          await insertQrPunchAppAlert(admin, {
            alertType: "employee_unauthorized_qr_zone",
            title: "Punch QR — employé non autorisé pour cette zone",
            body: "La zone ne correspond pas aux autorisations de travail de l’employé.",
            priority: "high",
            authUserId: auth.user.id,
            dedupeKey: dedupe,
            metadata: { zone_key: qr.zoneKey },
          });
          return NextResponse.json(
            {
              success: false,
              code: "UNAUTHORIZED_ZONE",
              error: "Vous n’êtes pas autorisé à pointer dans cette zone.",
            },
            { status: 403 }
          );
        }
        if (evalResult.reason === "gps_required") {
          await insertQrPunchAppAlert(admin, {
            alertType: "punch_zone_exception",
            title: "Punch QR — position requise",
            body: "La zone exige la géolocalisation ; coordonnées absentes.",
            priority: "high",
            authUserId: auth.user.id,
            dedupeKey: dedupe,
            metadata: { zone_key: qr.zoneKey },
          });
          return NextResponse.json(
            {
              success: false,
              code: "GPS_REQUIRED",
              error: "Autorisez la localisation pour pointer dans cette zone.",
            },
            { status: 400 }
          );
        }
        if (evalResult.reason === "gps_out_of_bounds") {
          await insertQrPunchAppAlert(admin, {
            alertType: "punch_zone_exception",
            title: "Zone de punch non conforme",
            body: "Employé hors zone autorisée lors du punch QR.",
            priority: "high",
            authUserId: auth.user.id,
            employeeId: evalResult.employeeId ?? null,
            dedupeKey: dedupe,
            metadata: {
              zone_key: evalResult.zone?.zone_key ?? qr.zoneKey,
              reason: "gps_out_of_bounds",
            },
          });
          return NextResponse.json(
            {
              success: false,
              code: "GPS_OUT_OF_ZONE",
              error:
                "Vous semblez être hors de la zone de punch autorisée. Contactez la direction.",
            },
            { status: 403 }
          );
        }
        await insertQrPunchAppAlert(admin, {
          alertType: "invalid_qr_punch_zone",
          title: "Code QR invalide ou zone inactive",
          body: "Punch QR refusé (zone ou jeton).",
          priority: "high",
          authUserId: auth.user.id,
          dedupeKey: dedupe,
          metadata: { zone_key: qr.zoneKey },
        });
        return NextResponse.json(
          {
            success: false,
            code: "INVALID_QR",
            error: "Code QR invalide ou expiré.",
          },
          { status: 403 }
        );
      }

      const chauffeurId = evalResult.profile.employeeId;
      const activeLeave = await getActiveLeaveForEmployeeOnDate(
        admin,
        chauffeurId,
        todayIso
      );
      const acknowledged = body.acknowledgeLongLeavePunch === true;
      if (activeLeave && !acknowledged) {
        return NextResponse.json(
          {
            success: false,
            code: "LONG_LEAVE_CONFIRMATION_REQUIRED",
            error:
              "Vous êtes en congé prolongé. Voulez-vous quand même enregistrer ce pointage ? Contactez la direction si nécessaire.",
          },
          { status: 409 }
        );
      }

      const zoneCk = evalResult.zone.company_key as PunchZoneCompanyKey;
      const workKey = resolveWorkCompanyKeyForEvent(zoneCk);
      const employerKey = evalResult.profile.primaryCompany;

      try {
        const result = await createEmployeePunch({
          actorUserId: auth.user.id,
          eventType: normalizedEventType,
          occurredAt: occurredAtValidation.value,
          note: normalizeNonEmptyString(body.note),
          companyContext: null,
          relatedEventId: normalizeNonEmptyString(body.relatedEventId),
          sourceKind: "qr",
          punchTrace: {
            punchSource: "qr",
            punchZoneKey: evalResult.zone.zone_key,
            punchZoneId: evalResult.zone.id,
            zoneValidated: evalResult.zoneValidated,
            gpsLatitude: evalResult.gpsLatitude,
            gpsLongitude: evalResult.gpsLongitude,
            workCompanyKey: workKey,
            employerCompanyKey: employerKey,
          },
        });

        const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);

        if (activeLeave && acknowledged) {
          await insertPunchDuringLongLeaveAlert(admin, {
            employeeId: chauffeurId,
            employeeName: evalResult.profile.fullName,
          });
        }

        return NextResponse.json({
          success: true,
          insertedEvent: normalizeEventForApi(result.event),
          exception: result.exception,
          employee: snapshot.employee,
          currentState: snapshot.currentState,
          shift: snapshot.todayShift,
          weeklyProjection: snapshot.weeklyProjection,
          pendingExceptions: snapshot.pendingExceptions,
        });
      } catch (punchErr) {
        await insertQrPunchAppAlert(admin, {
          alertType: "qr_punch_save_failed",
          title: "Erreur d’enregistrement punch QR",
          body:
            punchErr instanceof Error ? punchErr.message : "Erreur inconnue lors du punch.",
          priority: "critical",
          authUserId: auth.user.id,
          employeeId: chauffeurId,
          dedupeKey: `qr_punch_err:${chauffeurId}:${todayIso}:${Date.now()}`,
        });
        throw punchErr;
      }
    }

    const { data: chauffeurRow } = await admin
      .from("chauffeurs")
      .select("id, nom")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle();
    const chauffeurId =
      chauffeurRow && typeof (chauffeurRow as { id?: unknown }).id === "number"
        ? (chauffeurRow as { id: number }).id
        : null;
    const activeLeave =
      chauffeurId != null
        ? await getActiveLeaveForEmployeeOnDate(admin, chauffeurId, todayIso)
        : null;
    const acknowledged = body.acknowledgeLongLeavePunch === true;
    if (activeLeave && !acknowledged) {
      return NextResponse.json(
        {
          success: false,
          code: "LONG_LEAVE_CONFIRMATION_REQUIRED",
          error:
            "Vous êtes en congé prolongé. Voulez-vous quand même enregistrer ce pointage ? Contactez la direction si nécessaire.",
        },
        { status: 409 }
      );
    }

    const result = await createEmployeePunch({
      actorUserId: auth.user.id,
      eventType: normalizedEventType,
      occurredAt: occurredAtValidation.value,
      note: normalizeNonEmptyString(body.note),
      companyContext: normalizeDirectionCompanyContext(body.companyContext),
      relatedEventId: normalizeNonEmptyString(body.relatedEventId),
    });

    const snapshot = await getEmployeeDashboardSnapshotByAuthUserId(auth.user.id);

    if (activeLeave && acknowledged && chauffeurId != null) {
      await insertPunchDuringLongLeaveAlert(admin, {
        employeeId: chauffeurId,
        employeeName:
          typeof (chauffeurRow as { nom?: string | null })?.nom === "string"
            ? (chauffeurRow as { nom: string }).nom
            : null,
      });
    }

    return NextResponse.json({
      success: true,
      insertedEvent: normalizeEventForApi(result.event),
      exception: result.exception,
      employee: snapshot.employee,
      currentState: snapshot.currentState,
      shift: snapshot.todayShift,
      weeklyProjection: snapshot.weeklyProjection,
      pendingExceptions: snapshot.pendingExceptions,
    });
  } catch (error) {
    return buildHorodateurErrorResponse(error, {
      route: "/api/horodateur/punch",
    });
  }
}
