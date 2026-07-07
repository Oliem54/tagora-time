import "server-only";

import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  mapAccrualInsertPayloadToDatabaseRow,
  mapAccrualRow,
  mapAccrualStatusHistoryInsertPayloadToDatabaseRow,
  mapAccrualStatusHistoryRow,
} from "@/app/lib/commissions/accruals.mapper.server";
import type {
  AccrualStatusHistoryRepository,
  AccrualsRepository,
} from "@/app/lib/commissions/accruals.persistence.shared";

export type {
  AccrualStatusHistoryRepository,
  AccrualsListFilters,
  AccrualsRepository,
} from "@/app/lib/commissions/accruals.persistence.shared";

type RepositoryDeps = {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
};

function normalizeLimit(value: number | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return 100;
  return Math.min(Math.trunc(value), 500);
}

export function createAccrualsRepository(deps: RepositoryDeps): AccrualsRepository {
  const { supabase } = deps;

  return {
    async list(filters = {}) {
      let query = supabase
        .from("compensation_accruals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(normalizeLimit(filters.limit));

      if (filters.compensation_event_id) {
        query = query.eq("compensation_event_id", filters.compensation_event_id);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((row) => mapAccrualRow(row as Record<string, unknown>));
    },

    async listByEventId(compensationEventId) {
      return this.list({ compensation_event_id: compensationEventId });
    },

    async getById(id) {
      const { data, error } = await supabase
        .from("compensation_accruals")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }
      if (!data) return null;

      return mapAccrualRow(data as Record<string, unknown>);
    },

    async insertMany(payloads) {
      if (payloads.length === 0) return [];

      const { data, error } = await supabase
        .from("compensation_accruals")
        .insert(payloads.map((payload) => mapAccrualInsertPayloadToDatabaseRow(payload)))
        .select("*");

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((row) => mapAccrualRow(row as Record<string, unknown>));
    },

    async updateStatus(id, status, audit) {
      const { data, error } = await supabase
        .from("compensation_accruals")
        .update({
          status,
          updated_by: audit?.actorUserId ?? null,
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }
      if (!data) return null;

      return mapAccrualRow(data as Record<string, unknown>);
    },

    async deleteByEventIdAndStatuses(compensationEventId, statuses) {
      if (statuses.length === 0) return 0;

      const { data, error } = await supabase
        .from("compensation_accruals")
        .delete()
        .eq("compensation_event_id", compensationEventId)
        .in("status", statuses)
        .select("id");

      if (error) {
        throw new Error(error.message);
      }

      return data?.length ?? 0;
    },
  };
}

export function createAccrualStatusHistoryRepository(
  deps: RepositoryDeps
): AccrualStatusHistoryRepository {
  const { supabase } = deps;

  return {
    async listByAccrualId(accrualId) {
      const { data, error } = await supabase
        .from("compensation_accrual_status_history")
        .select("*")
        .eq("accrual_id", accrualId)
        .order("changed_at", { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((row) =>
        mapAccrualStatusHistoryRow(row as Record<string, unknown>)
      );
    },

    async append(payload) {
      const { data, error } = await supabase
        .from("compensation_accrual_status_history")
        .insert(mapAccrualStatusHistoryInsertPayloadToDatabaseRow(payload))
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Insertion historique statut impossible.");
      }

      return mapAccrualStatusHistoryRow(data as Record<string, unknown>);
    },
  };
}

export function createDefaultAccrualsRepository() {
  const supabase = createAdminSupabaseClient();
  return createAccrualsRepository({ supabase });
}

export function createDefaultAccrualStatusHistoryRepository() {
  const supabase = createAdminSupabaseClient();
  return createAccrualStatusHistoryRepository({ supabase });
}
