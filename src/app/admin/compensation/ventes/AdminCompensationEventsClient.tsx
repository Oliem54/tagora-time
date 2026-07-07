"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AdminCompensationNavigation from "@/app/components/admin/compensation/AdminCompensationNavigation";
import CompensationEventFiltersBar, {
  emptyCompensationEventFilters,
  type CompensationEventFilters,
} from "@/app/components/admin/compensation/CompensationEventFiltersBar";
import CompensationEventsTable from "@/app/components/admin/compensation/CompensationEventsTable";
import CompensationSummaryCards from "@/app/components/admin/compensation/CompensationSummaryCards";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { fetchCompensationSaleEvents } from "@/app/lib/commissions/compensation-engine-api.client";
import type { CompensationSaleEvent } from "@/app/lib/commissions/compensation-engine-api.client";

function buildSearchParams(filters: CompensationEventFilters) {
  const params = new URLSearchParams();
  if (filters.chauffeur_id.trim()) {
    params.set("chauffeur_id", filters.chauffeur_id.trim());
  }
  if (filters.sale_state) params.set("sale_state", filters.sale_state);
  if (filters.status) params.set("status", filters.status);
  params.set("limit", "100");
  return params;
}

export default function AdminCompensationEventsClient() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CompensationSaleEvent[]>([]);
  const [filters, setFilters] = useState<CompensationEventFilters>(() =>
    emptyCompensationEventFilters()
  );
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  const loadEvents = useCallback(async (nextFilters: CompensationEventFilters) => {
    setLoading(true);
    setMessage("");
    setMessageType(null);

    try {
      const loaded = await fetchCompensationSaleEvents(buildSearchParams(nextFilters));
      setEvents(loaded);
    } catch (error) {
      setEvents([]);
      setMessage(error instanceof Error ? error.message : "Impossible de charger les ventes.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents(filters);
  }, [filters, loadEvents]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filters.eligibility === "eligible" && !event.eligibility.is_eligible) return false;
      if (filters.eligibility === "ineligible" && event.eligibility.is_eligible) return false;
      if (filters.company_context.trim()) {
        const needle = filters.company_context.trim().toLowerCase();
        const haystack = (event.company_context ?? "").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [events, filters.company_context, filters.eligibility]);

  if (loading && events.length === 0) {
    return (
      <TagoraLoadingScreen
        isLoading
        message="Chargement des ventes compensation..."
        fullScreen={false}
      />
    );
  }

  return (
    <main className="page-container compensation-admin-page">
      <AdminCompensationNavigation variant="list" />

      <AuthenticatedPageHeader
        title="Compensation — Ventes"
        subtitle="Consultation et validation finance des Compensation Events et accruals."
        className="ui-page-header-premium-2027"
      />

      <p className="tagora-note compensation-admin-note">
        Module Compensation Engine V1 — lecture seule sur les ventes. Legacy objectifs disponible
        sous Commissions & objectifs.
      </p>

      <CompensationSummaryCards events={filteredEvents} />

      <CompensationEventFiltersBar
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(emptyCompensationEventFilters())}
      />

      {loading ? (
        <TagoraLoadingScreen isLoading message="Actualisation..." fullScreen={false} />
      ) : (
        <CompensationEventsTable events={filteredEvents} />
      )}

      <FeedbackMessage message={message} type={messageType} />

      <p className="compensation-mobile-note">
        Validation finance optimisee pour desktop et tablette landscape.
      </p>
    </main>
  );
}
