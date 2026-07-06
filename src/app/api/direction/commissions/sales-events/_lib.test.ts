import { describe, expect, it } from "vitest";
import {
  compensationEventServiceResultToResponse,
  parseSalesEventListFilters,
} from "./_lib";
import {
  COMPENSATION_EVENT_SALE_STATE_DELIVERED,
  COMPENSATION_EVENT_STATUS_ACTIVE,
  COMPENSATION_EVENT_TYPE_SALE,
} from "@/app/lib/commissions/compensation-events.shared";

describe("parseSalesEventListFilters", () => {
  it("parse les filtres valides", () => {
    const filters = parseSalesEventListFilters(
      new URLSearchParams(
        "chauffeur_id=21&status=active&sale_state=delivered&limit=25"
      )
    );

    expect(filters).toEqual({
      chauffeur_id: 21,
      status: COMPENSATION_EVENT_STATUS_ACTIVE,
      sale_state: COMPENSATION_EVENT_SALE_STATE_DELIVERED,
      limit: 25,
    });
  });

  it("ignore les filtres invalides", () => {
    expect(
      parseSalesEventListFilters(new URLSearchParams("status=invalid&sale_state=unknown"))
    ).toEqual({});
  });
});

describe("compensationEventServiceResultToResponse", () => {
  it("mappe un succes liste en 200", async () => {
    const response = compensationEventServiceResultToResponse(
      {
        ok: true,
        value: [{ id: "1", event_type: COMPENSATION_EVENT_TYPE_SALE }],
      },
      { pluralKey: "events" }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events: [{ id: "1", event_type: COMPENSATION_EVENT_TYPE_SALE }],
    });
  });

  it("mappe une validation en 400", async () => {
    const response = compensationEventServiceResultToResponse({
      ok: false,
      code: "VALIDATION",
      errors: ["Montant invalide."],
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Montant invalide.",
      errors: ["Montant invalide."],
    });
  });

  it("mappe un not found en 404", async () => {
    const response = compensationEventServiceResultToResponse({
      ok: false,
      code: "NOT_FOUND",
      errors: ["Compensation event introuvable."],
    });

    expect(response.status).toBe(404);
  });
});
