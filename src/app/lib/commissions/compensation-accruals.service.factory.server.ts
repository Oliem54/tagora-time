import "server-only";

import {
  createDefaultAccrualStatusHistoryRepository,
  createDefaultAccrualsRepository,
} from "@/app/lib/commissions/accruals.repository.server";
import { createCompensationCalculationServiceFromEventsDeps } from "@/app/lib/commissions/compensation-calculation.service.server";
import { createDefaultCompensationEventsRepository } from "@/app/lib/commissions/compensation-events.repository.server";
import {
  createCompensationAccrualsService,
  type CompensationAccrualsServiceDeps,
} from "@/app/lib/commissions/compensation-accruals.service.server";

export type CompensationAccrualsService = ReturnType<typeof createCompensationAccrualsService>;

let serviceOverride: CompensationAccrualsService | null = null;

function buildDefaultService(): CompensationAccrualsService {
  return createCompensationAccrualsService({
    accrualsRepository: createDefaultAccrualsRepository(),
    statusHistoryRepository: createDefaultAccrualStatusHistoryRepository(),
    calculationService: createCompensationCalculationServiceFromEventsDeps({
      repository: createDefaultCompensationEventsRepository(),
    }),
  });
}

export function getCompensationAccrualsService(
  deps?: CompensationAccrualsServiceDeps
): CompensationAccrualsService {
  if (deps) {
    return createCompensationAccrualsService(deps);
  }
  if (serviceOverride) {
    return serviceOverride;
  }
  return buildDefaultService();
}

export function setCompensationAccrualsServiceForTests(service: CompensationAccrualsService | null) {
  serviceOverride = service;
}
