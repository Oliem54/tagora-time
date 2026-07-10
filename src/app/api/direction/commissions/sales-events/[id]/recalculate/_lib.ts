import {
  parseProcessRequestBody,
  processingServiceResultToResponse,
  requireProcessRouteAuth,
} from "@/app/api/direction/commissions/sales-events/[id]/process/_lib";
import type { ProcessingResponseMeta } from "@/app/lib/commissions/compensation-processing-api.shared";
import type { CompensationProcessingResult } from "@/app/lib/commissions/compensation-processing.shared";

export {
  parseProcessRequestBody as parseRecalculateRequestBody,
  requireProcessRouteAuth as requireRecalculateRouteAuth,
};

export function recalculateServiceResultToResponse(
  result: CompensationProcessingResult,
  meta: Omit<ProcessingResponseMeta, "executionType">
) {
  return processingServiceResultToResponse(result, {
    ...meta,
    executionType: "recalculate",
  });
}
