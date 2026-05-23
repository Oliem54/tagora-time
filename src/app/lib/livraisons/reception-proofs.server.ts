import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assessReceptionProofs,
  getReceptionProofBlockMessage,
  type OperationProofModuleSource,
  type ReceptionProofAssessment,
} from "@/app/lib/livraisons/reception-proofs.shared";

export async function fetchReceptionProofAssessment(
  supabase: SupabaseClient,
  params: {
    moduleSource: OperationProofModuleSource;
    sourceId: number;
  }
): Promise<ReceptionProofAssessment> {
  const { data, error } = await supabase
    .from("operation_proofs")
    .select("type_preuve")
    .eq("module_source", params.moduleSource)
    .eq("source_id", String(params.sourceId));

  if (error) {
    throw error;
  }

  return assessReceptionProofs((data ?? []) as { type_preuve: string | null }[]);
}

export async function assertReceptionProofsForCompletion(
  supabase: SupabaseClient,
  params: {
    moduleSource: OperationProofModuleSource;
    sourceId: number;
  }
): Promise<
  | { ok: true; assessment: ReceptionProofAssessment }
  | { ok: false; message: string; assessment: ReceptionProofAssessment }
> {
  const assessment = await fetchReceptionProofAssessment(supabase, params);
  if (assessment.isComplete) {
    return { ok: true, assessment };
  }
  return {
    ok: false,
    message: getReceptionProofBlockMessage(params.moduleSource),
    assessment,
  };
}
