import "server-only";

import { createCompensationEventsService } from "@/app/lib/commissions/compensation-events.service.server";
import { createDefaultCompensationEventsRepository } from "@/app/lib/commissions/compensation-events.repository.server";
import type { CompensationEventsServiceDeps } from "@/app/lib/commissions/compensation-events.service.server";

export type CompensationEventsService = ReturnType<typeof createCompensationEventsService>;

let serviceOverride: CompensationEventsService | null = null;

export function getCompensationEventsService(
  deps?: CompensationEventsServiceDeps
): CompensationEventsService {
  if (deps) {
    return createCompensationEventsService(deps);
  }
  if (serviceOverride) {
    return serviceOverride;
  }
  return createCompensationEventsService({
    repository: createDefaultCompensationEventsRepository(),
  });
}

export function setCompensationEventsServiceForTests(service: CompensationEventsService | null) {
  serviceOverride = service;
}
