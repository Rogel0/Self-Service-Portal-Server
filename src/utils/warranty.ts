export type WarrantyStatus = "active" | "expired" | "unknown";

export type WarrantyInfo = {
    warranty_end_date: string | null;
    warranty_days_left: number | null;
    warranty_status: WarrantyStatus;
};

export function computeWarrantyInfo(purchase_date: unknown, now: Date = new Date()): WarrantyInfo {
    let raw: string | null = null;

    if (purchase_date instanceof Date) {
        if (Number.isNaN(purchase_date.getTime())) {
            raw = null;
        } else {
            raw = purchase_date.toISOString();
        }
    } else if (typeof purchase_date === "string") {
        raw = purchase_date.trim() === "" ? null : purchase_date.trim();
    }

    if (!raw) {
        return {
            warranty_end_date: null,
            warranty_days_left: null,
            warranty_status: "unknown",
        };
    }

    const start = new Date(raw);
    if (Number.isNaN(start.getTime())) {
        return {
            warranty_end_date: null,
            warranty_days_left: null,
            warranty_status: "unknown",
        };
    }

    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);

    const msLeft = end.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
    const status: WarrantyStatus = msLeft < 0 ? "expired" : "active";

    return {
        warranty_end_date: end.toISOString(),
        warranty_days_left: daysLeft,
        warranty_status: status,
    };
}