export const HORODATEUR_EVENT_TYPES = [
  "quart_debut",
  "quart_fin",
  "pause_debut",
  "pause_fin",
  "dinner_debut",
  "dinner_fin",
  "sortie_depart",
  "sortie_retour",
  "terrain_start",
  "terrain_end",
  "zone_entry",
  "zone_exit",
  "auto_stop",
  "auto_restart",
  "authorization_requested",
  "authorization_approved",
  "authorization_refused",
  "anomalie",
] as const;

export type HorodateurEventType = (typeof HORODATEUR_EVENT_TYPES)[number];

export type HorodateurPunchState =
  | "hors_quart"
  | "en_quart"
  | "en_pause"
  | "en_diner"
  | "en_sortie"
  | "termine";

export type HorodateurEventLike = {
  event_type: HorodateurEventType;
  occurred_at: string;
  entered_by_admin?: boolean | null;
};

export function getHorodateurEventLabel(type: HorodateurEventType) {
  if (type === "quart_debut") return "Debut de quart";
  if (type === "quart_fin") return "Fin de quart";
  if (type === "pause_debut") return "Debut de pause";
  if (type === "pause_fin") return "Fin de pause";
  if (type === "dinner_debut") return "Debut du diner";
  if (type === "dinner_fin") return "Fin du diner";
  if (type === "sortie_depart") return "Depart sortie";
  if (type === "sortie_retour") return "Retour sortie";
  if (type === "terrain_start") return "Debut terrain";
  if (type === "terrain_end") return "Fin terrain";
  if (type === "zone_entry") return "Entree de zone";
  if (type === "zone_exit") return "Sortie de zone";
  if (type === "auto_stop") return "Arret automatique";
  if (type === "auto_restart") return "Redemarrage automatique";
  if (type === "authorization_requested") return "Autorisation demandee";
  if (type === "authorization_approved") return "Autorisation approuvee";
  if (type === "authorization_refused") return "Autorisation refusee";
  return "Anomalie";
}

export function getHorodateurActorLabel(enteredByAdmin: boolean | null | undefined) {
  return enteredByAdmin ? "Admin" : "Employe";
}

export function computeHorodateurState(events: HorodateurEventLike[]) {
  let state: HorodateurPunchState = "hors_quart";

  for (const event of events) {
    if (event.event_type === "quart_debut") {
      state = "en_quart";
      continue;
    }

    if (event.event_type === "pause_debut" && state === "en_quart") {
      state = "en_pause";
      continue;
    }

    if (event.event_type === "pause_fin" && state === "en_pause") {
      state = "en_quart";
      continue;
    }

    if (event.event_type === "dinner_debut" && state === "en_quart") {
      state = "en_diner";
      continue;
    }

    if (event.event_type === "dinner_fin" && state === "en_diner") {
      state = "en_quart";
      continue;
    }

    if (event.event_type === "sortie_depart" && state === "en_quart") {
      state = "en_sortie";
      continue;
    }

    if (event.event_type === "sortie_retour" && state === "en_sortie") {
      state = "en_quart";
      continue;
    }

    if (
      event.event_type === "quart_fin" ||
      event.event_type === "terrain_end" ||
      event.event_type === "auto_stop"
    ) {
      state = "termine";
    }
  }

  return state;
}

function diffMinutes(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.max(0, Math.floor((b - a) / 60000));
}

export function computeWorkedMinutes(events: HorodateurEventLike[]) {
  const nowIso = new Date().toISOString();
  let activeStartAt: string | null = null;
  let totalMinutes = 0;

  for (const event of events) {
    if (event.event_type === "quart_debut" && !activeStartAt) {
      activeStartAt = event.occurred_at;
      continue;
    }

    if (
      (event.event_type === "pause_debut" || event.event_type === "dinner_debut") &&
      activeStartAt
    ) {
      totalMinutes += diffMinutes(activeStartAt, event.occurred_at);
      activeStartAt = null;
      continue;
    }

    if (
      (event.event_type === "pause_fin" || event.event_type === "dinner_fin") &&
      !activeStartAt
    ) {
      activeStartAt = event.occurred_at;
      continue;
    }

    if (event.event_type === "quart_fin" && activeStartAt) {
      totalMinutes += diffMinutes(activeStartAt, event.occurred_at);
      activeStartAt = null;
    }
  }

  if (activeStartAt) {
    totalMinutes += diffMinutes(activeStartAt, nowIso);
  }

  return totalMinutes;
}

export function getHorodateurStateLabel(state: HorodateurPunchState) {
  if (state === "en_quart") return "En quart";
  if (state === "en_pause") return "En pause";
  if (state === "en_diner") return "En diner";
  if (state === "en_sortie") return "En sortie";
  if (state === "termine") return "Quart termine";
  return "Hors quart";
}

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function normalizeErrorText(error: SupabaseLikeError | null | undefined) {
  return [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function buildHorodateurLoadError(
  error: SupabaseLikeError | null | undefined,
  audience: "employe" | "direction"
) {
  const code = error?.code ?? "";
  const text = normalizeErrorText(error);

  if (code === "42P01" || text.includes("horodateur_events") && text.includes("does not exist")) {
    return audience === "direction"
      ? "La table horodateur_events est absente en base. Appliquez le SQL du module horodateur avant de lancer la supervision."
      : "Le module horodateur n est pas encore active en base. Appliquez le SQL du module horodateur, puis rechargez la page.";
  }

  if (code === "42703") {
    return "La structure de la table horodateur_events est incomplete. Une colonne attendue par la V1 manque en base.";
  }

  if (code === "42501" || text.includes("row-level security") || text.includes("permission denied")) {
    return audience === "direction"
      ? "La supervision horodateur est bloquee par les permissions Supabase ou les policies RLS. Verifiez la permission terrain et les policies horodateur."
      : "Vos droits Supabase ne permettent pas encore de lire l horodateur. Verifiez les policies RLS du module et la permission terrain si les sorties sont utilisees.";
  }

  return audience === "direction"
    ? "Impossible de charger la supervision horodateur. Verifiez la table, les colonnes et les policies RLS du module."
    : "Impossible de charger votre horodateur. Verifiez la table horodateur_events et les permissions associees.";
}
