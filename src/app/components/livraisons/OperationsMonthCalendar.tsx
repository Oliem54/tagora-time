"use client";

import Link from "next/link";
import {
  buildMonthGridDays,
  formatOperationsCalendarIsoDate,
  formatOperationsCalendarMonthLabel,
  OPERATIONS_CALENDAR_WEEKDAYS,
  type OperationsCalendarEvent,
} from "@/app/lib/livraisons/operations-calendar.shared";
import {
  formatTodayOperationCount,
  formatTodayOperationCountShort,
} from "@/app/lib/livraisons/today-operations.shared";

export type OperationsMonthCalendarProps = {
  mode: "livraison" | "ramassage";
  calendarDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  dayHref: (isoDate: string) => string;
  eventsByDate: Record<string, OperationsCalendarEvent[]>;
  navAriaLabel?: string;
};

export default function OperationsMonthCalendar({
  mode,
  calendarDate,
  onPrevMonth,
  onNextMonth,
  dayHref,
  eventsByDate,
  navAriaLabel = "Navigation calendrier",
}: OperationsMonthCalendarProps) {
  const days = buildMonthGridDays(calendarDate);
  const dayBadgeClass =
    mode === "livraison"
      ? "livraison-cal-day-badge livraison-cal-day-badge--livraison"
      : "livraison-cal-day-badge livraison-cal-day-badge--ramassage";

  return (
    <>
      <div className="livraison-cal-nav" aria-label={navAriaLabel}>
        <button type="button" onClick={onPrevMonth} className="livraison-cal-nav-btn">
          ← Mois prec
        </button>
        <h3 className="livraison-cal-month">{formatOperationsCalendarMonthLabel(calendarDate)}</h3>
        <button type="button" onClick={onNextMonth} className="livraison-cal-nav-btn">
          Mois suiv →
        </button>
      </div>
      <div className="livraison-cal-weekdays">
        {OPERATIONS_CALENDAR_WEEKDAYS.map((weekday) => (
          <div key={weekday} className="livraison-cal-weekday">
            {weekday}
          </div>
        ))}
      </div>
      <div className="livraison-cal-grid">
        {days.map((day, idx) => {
          const dateStr = day ? formatOperationsCalendarIsoDate(calendarDate, day) : "";
          const eventsForDay = day ? eventsByDate[dateStr] ?? [] : [];
          return (
            <div
              key={idx}
              className={day ? "livraison-cal-cell" : "livraison-cal-cell livraison-cal-cell--empty"}
            >
              {day ? (
                <Link href={dayHref(dateStr)} className="livraison-cal-daynum">
                  {day}
                </Link>
              ) : null}
              {eventsForDay.length > 0 ? (
                <Link href={dayHref(dateStr)} className={dayBadgeClass}>
                  <span className="livraison-cal-day-badge__full">
                    {formatTodayOperationCount(mode, eventsForDay.length)}
                  </span>
                  <span className="livraison-cal-day-badge__short">
                    {formatTodayOperationCountShort(mode, eventsForDay.length)}
                  </span>
                </Link>
              ) : null}
              <div className="livraison-cal-events livraison-cal-events--desktop">
                {eventsForDay.slice(0, 3).map((event) => (
                  <Link key={event.id} href={event.href} className={event.eventClassName}>
                    {event.label}
                  </Link>
                ))}
                {eventsForDay.length > 3 ? (
                  <div className="livraison-cal-more">+{eventsForDay.length - 3} autre(s)</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
