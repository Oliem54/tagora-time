import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ from }),
}));

import {
  readHororaActorDepartmentKeys,
  readHororaEmployeePerimeterFile,
  readHororaExceptionEmployeeId,
} from "@/app/lib/auth/horora-manager-perimeter.files.server";

function query(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe("HORORA manager perimeter employee-file reads", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("reads the actor departments from the employee file in the membership organization", async () => {
    const builder = query({
      data: [
        {
          organization_id: "org-b",
          effectifs_department_key: "livreur",
          effectifs_secondary_department_keys: ["atelier"],
        },
        {
          organization_id: "org-a",
          effectifs_department_key: "  livreur ",
          effectifs_secondary_department_keys: ["atelier", " ", "atelier"],
        },
      ],
      error: null,
    });
    from.mockReturnValue(builder);

    const result = await readHororaActorDepartmentKeys({
      authUserId: "user-1",
      organizationId: "org-a",
    });

    expect(result).toEqual({ ok: true, departmentKeys: ["livreur", "atelier"] });
    expect(from).toHaveBeenCalledWith("chauffeurs");
    expect(builder.select).toHaveBeenCalledWith(
      "organization_id, effectifs_department_key, effectifs_secondary_department_keys"
    );
    expect(builder.eq).toHaveBeenCalledWith("auth_user_id", "user-1");
    expect(builder.eq).not.toHaveBeenCalledWith("effectifs_department_key", expect.anything());
  });

  it("reads the target organization and effective department by employee id only", async () => {
    const builder = query({
      data: { organization_id: "org-b", effectifs_department_key: "  " },
      error: null,
    });
    from.mockReturnValue(builder);

    const result = await readHororaEmployeePerimeterFile(42);

    expect(result).toEqual({
      ok: true,
      file: { organizationId: "org-b", departmentKey: null },
    });
    expect(builder.eq).toHaveBeenCalledWith("id", 42);
    expect(builder.eq).not.toHaveBeenCalledWith("organization_id", expect.anything());
  });

  it("resolves the exception employee on the server and fails closed when the read fails", async () => {
    const found = query({ data: { employee_id: 42 }, error: null });
    from.mockReturnValueOnce(found);
    await expect(readHororaExceptionEmployeeId("exc-1")).resolves.toEqual({
      ok: true,
      employeeId: 42,
    });
    expect(found.eq).toHaveBeenCalledWith("id", "exc-1");

    from.mockReturnValueOnce(query({ data: null, error: { code: "42703" } }));
    await expect(readHororaExceptionEmployeeId("exc-2")).resolves.toEqual({
      ok: false,
      reason: "lookup_failed",
    });
  });
});
