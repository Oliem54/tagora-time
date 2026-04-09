export const HORODATEUR_EVENT_TYPES = [
  "quart_debut",
  "pause_debut",
  "pause_fin",
  "sortie_depart",
  "sortie_retour",
  "quart_fin",
  "anomalie",
] as const;

export type HorodateurEventType = (typeof HORODATEUR_EVENT_TYPES)[number];

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
