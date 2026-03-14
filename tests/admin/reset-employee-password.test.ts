import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { Request, Response } from "express";

let resetEmployeePassword: typeof import("../../src/modules/admin/admin.controller").resetEmployeePassword;

const poolQuery = vi.fn();
const clientQuery = vi.fn();
const release = vi.fn();
const connect = vi.fn();

vi.mock("../../src/config/database", () => ({
  default: {
    query: poolQuery,
    connect,
  },
}));

beforeAll(async () => {
  ({ resetEmployeePassword } =
    await import("../../src/modules/admin/admin.controller"));
});

const makeRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  return res;
};

beforeEach(() => {
  poolQuery.mockReset();
  clientQuery.mockReset();
  release.mockReset();
  connect.mockReset();
  connect.mockResolvedValue({ query: clientQuery, release });
});

describe("resetEmployeePassword", () => {
  it("resets password and marks must_change_password", async () => {
    const req = {
      params: { employeeId: "5" },
      employee: { employee_id: 1 },
      body: {
        generate_temporary: true,
        require_password_change: true,
        reason: "Forgot password",
      },
    } as unknown as Request;

    poolQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ employee_id: 5, username: "sales" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = makeRes();

    await resetEmployeePassword(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          employee_id: 5,
          username: "sales",
          must_change_password: true,
          temporary_password: expect.any(String),
        }),
      }),
    );
    expect(release).toHaveBeenCalled();
  });

  it("returns 404 when employee does not exist", async () => {
    const req = {
      params: { employeeId: "999" },
      employee: { employee_id: 1 },
      body: {
        generate_temporary: true,
      },
    } as unknown as Request;

    poolQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    const res = makeRes();

    await resetEmployeePassword(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Employee not found",
      }),
    );
  });
});
