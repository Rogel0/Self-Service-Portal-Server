import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { Request, Response } from "express";

let addMachineForAdmin: typeof import("../../src/modules/machines/machine.controller").addMachineForAdmin;

const query = vi.fn();
const release = vi.fn();
const connect = vi.fn();

vi.mock('../../src/config/database', () => ({
    default: { connect },
}));

beforeAll(async () => {
    ({ addMachineForAdmin } = await import("../../src/modules/machines/machine.controller"));
});

const makeRes = () => {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
    } as unknown as Response;
    return res;
};

beforeEach(() => {
    query.mockReset();
    release.mockReset();
    connect.mockResolvedValue({ query, release });
});

describe("addMachineForAdmin", () => {
    it("creates a machine without ownership details", async () => {
        const req = {
            body: {
                model_number: "MODEL-001",
                product_id: 10,
            },
        } as Request;

        query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ product_id: 10 }] }) // product check
            .mockResolvedValueOnce({
                rows: [
                    {
                        machine_id: 123,
                        customer_id: null,
                        product_id: 10,
                        model_number: "MODEL-001",
                    },
                ],
            }) // insert
            .mockResolvedValueOnce({}); // COMMIT

        const res = makeRes();

        await addMachineForAdmin(req, res);

        expect(query).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
            }),
        );
    });

    it("returns 400 when product_id is invalid", async () => {
        const req = {
            body: {
                model_number: "MODEL-002",
                product_id: 9999,
            },
        } as Request;

        query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // product check (invalid)
            .mockResolvedValueOnce({}); // ROLLBACK

        const res = makeRes();

        await addMachineForAdmin(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: "Invalid product",
            }),
        );
    });
});