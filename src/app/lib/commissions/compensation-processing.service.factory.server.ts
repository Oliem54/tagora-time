import "server-only";

import {
  createDefaultAccrualStatusHistoryRepository,
  createDefaultAccrualsRepository,
} from "@/app/lib/commissions/accruals.repository.server";
import { createCompensationEventsService } from "@/app/lib/commissions/compensation-events.service.server";
import { createDefaultCompensationEventsRepository } from "@/app/lib/commissions/compensation-events.repository.server";
import {
  createCompensationProcessingService,
  type CompensationProcessingServiceDeps,
} from "@/app/lib/commissions/compensation-processing.service.server";

export type CompensationProcessingService = ReturnType<typeof createCompensationProcessingService>;

let serviceOverride: CompensationProcessingService | null = null;

function buildDefaultService(): CompensationProcessingService {
  return createCompensationProcessingService({
    eventsService: createCompensationEventsService({
      repository: createDefaultCompensationEventsRepository(),
    }),
    accrualsRepository: createDefaultAccrualsRepository(),
    statusHistoryRepository: createDefaultAccrualStatusHistoryRepository(),
  });
}

export function getCompensationProcessingService(
  deps?: CompensationProcessingServiceDeps
): CompensationProcessingService {
  if (deps) {
    return createCompensationProcessingService(deps);
  }
  if (serviceOverride) {
    return serviceOverride;
  }
  return buildDefaultService();
}

export function setCompensationProcessingServiceForTests(
  service: CompensationProcessingService | null
) {
  serviceOverride = service;
}
