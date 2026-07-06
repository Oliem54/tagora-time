import "server-only";

import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  mapCompensationEventRow,
  mapInsertPayloadToDatabaseRow,
  mapUpdatePayloadToDatabaseRow,
} from "@/app/lib/commissions/compensation-events.mapper.server";
import type { CompensationEventsRepository } from "@/app/lib/commissions/compensation-events.persistence.shared";

export type { CompensationEventListFilters, CompensationEventsRepository } from "@/app/lib/commissions/compensation-events.persistence.shared";

type RepositoryDeps = {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
};

function normalizeLimit(value: number | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return 100;
  return Math.min(Math.trunc(value), 500);
}

export function createCompensationEventsRepository(
  deps: RepositoryDeps
): CompensationEventsRepository {
  const { supabase } = deps;

  return {
    async list(filters = {}) {
      let query = supabase
        .from("compensation_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(normalizeLimit(filters.limit));

      if (filters.chauffeur_id != null && Number.isFinite(filters.chauffeur_id)) {
        query = query.eq("chauffeur_id", Math.trunc(filters.chauffeur_id));
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }
      if (filters.sale_state) {
        query = query.eq("sale_state", filters.sale_state);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((row) =>
        mapCompensationEventRow(row as Record<string, unknown>)
      );
    },

    async getById(id) {
      const { data, error } = await supabase
        .from("compensation_events")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }
      if (!data) return null;

      return mapCompensationEventRow(data as Record<string, unknown>);
    },

    async insert(payload) {
      const { data, error } = await supabase
        .from("compensation_events")
        .insert(mapInsertPayloadToDatabaseRow(payload))
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Insertion compensation event impossible.");
      }

      return mapCompensationEventRow(data as Record<string, unknown>);
    },

    async update(id, payload) {
      const { data, error } = await supabase
        .from("compensation_events")
        .update(mapUpdatePayloadToDatabaseRow(payload))
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }
      if (!data) return null;

      return mapCompensationEventRow(data as Record<string, unknown>);
    },
  };
}

export function createDefaultCompensationEventsRepository() {
  return createCompensationEventsRepository({
    supabase: createAdminSupabaseClient(),
  });
}
