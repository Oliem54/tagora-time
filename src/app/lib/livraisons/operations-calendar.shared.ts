export const OPERATIONS_CALENDAR_WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

export type OperationsCalendarEvent = {
  id: string | number;
  label: string;
  href: string;
  eventClassName: string;
};

export function buildMonthGridDays(calendarDate: Date): Array<number | null> {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = (firstDay.getDay() + 6) % 7;

  const days: Array<number | null> = [];
  for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

export function formatOperationsCalendarMonthLabel(
  calendarDate: Date,
  locale = "fr-FR"
): string {
  return calendarDate.toLocaleString(locale, { month: "long", year: "numeric" });
}

export function formatOperationsCalendarIsoDate(calendarDate: Date, day: number): string {
  const year = calendarDate.getFullYear();
  const month = String(calendarDate.getMonth() + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${month}-${d}`;
}

export function shiftOperationsCalendarMonth(calendarDate: Date, delta: -1 | 1): Date {
  return new Date(calendarDate.getFullYear(), calendarDate.getMonth() + delta, 1);
}

export function livraisonCalendarEventStatusClass(statut: string | null | undefined): string {
  const raw = String(statut || "").toLowerCase();
  if (raw === "en_cours") return "livraison-cal-event livraison-cal-event--en_cours";
  if (raw === "livree" || raw === "ramassee" || raw === "ramasse") {
    return "livraison-cal-event livraison-cal-event--livree";
  }
  if (raw === "probleme") return "livraison-cal-event livraison-cal-event--probleme";
  if (raw === "pret_a_ramasser") return "livraison-cal-event livraison-cal-event--en_cours";
  if (raw === "non_ramasse" || raw === "non_ramassee" || raw === "a_replanifier") {
    return "livraison-cal-event livraison-cal-event--probleme";
  }
  return "livraison-cal-event livraison-cal-event--planifiee";
}

export type RamassagePickupStatus =
  | "pret_a_ramasser"
  | "planifie"
  | "en_cours"
  | "ramasse"
  | "non_ramasse"
  | "a_replanifier";

export function ramassageCalendarEventClass(status: RamassagePickupStatus): string {
  if (status === "ramasse") return "livraison-cal-event livraison-cal-event--livree";
  if (status === "en_cours" || status === "pret_a_ramasser") {
    return "livraison-cal-event livraison-cal-event--en_cours";
  }
  if (status === "non_ramasse" || status === "a_replanifier") {
    return "livraison-cal-event livraison-cal-event--probleme";
  }
  return "livraison-cal-event livraison-cal-event--planifiee";
}
