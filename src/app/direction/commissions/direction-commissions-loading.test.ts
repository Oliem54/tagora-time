import { describe, expect, it } from "vitest";
import {
  shouldLoadDirectionSalesBooks,
  shouldShowDirectionCommissionsLoading,
} from "@/app/direction/commissions/direction-commissions-loading.shared";

describe("shouldShowDirectionCommissionsLoading", () => {
  it("affiche le loading pendant le chargement d'accès", () => {
    expect(
      shouldShowDirectionCommissionsLoading({
        accessLoading: true,
        canUseCommissions: false,
        booksLoading: true,
      })
    ).toBe(true);
  });

  it("n'affiche jamais un spinner permanent pour une absence de permission", () => {
    expect(
      shouldShowDirectionCommissionsLoading({
        accessLoading: false,
        canUseCommissions: false,
        booksLoading: true,
      })
    ).toBe(false);
  });

  it("affiche le loading uniquement pendant le fetch des livres autorisés", () => {
    expect(
      shouldShowDirectionCommissionsLoading({
        accessLoading: false,
        canUseCommissions: true,
        booksLoading: true,
      })
    ).toBe(true);
    expect(
      shouldShowDirectionCommissionsLoading({
        accessLoading: false,
        canUseCommissions: true,
        booksLoading: false,
      })
    ).toBe(false);
  });
});

describe("shouldLoadDirectionSalesBooks", () => {
  it("ne charge pas les livres tant que l'accès charge", () => {
    expect(
      shouldLoadDirectionSalesBooks({
        accessLoading: true,
        userPresent: true,
        canUseCommissions: true,
      })
    ).toBe(false);
  });

  it("ne charge pas les livres sans utilisateur", () => {
    expect(
      shouldLoadDirectionSalesBooks({
        accessLoading: false,
        userPresent: false,
        canUseCommissions: true,
      })
    ).toBe(false);
  });

  it("ne charge pas les livres sans permission commissions", () => {
    expect(
      shouldLoadDirectionSalesBooks({
        accessLoading: false,
        userPresent: true,
        canUseCommissions: false,
      })
    ).toBe(false);
  });

  it("charge les livres pour un utilisateur autorisé", () => {
    expect(
      shouldLoadDirectionSalesBooks({
        accessLoading: false,
        userPresent: true,
        canUseCommissions: true,
      })
    ).toBe(true);
  });
});
