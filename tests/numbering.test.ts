import { describe, expect, it } from "vitest";
import { fiscalYear, formatChallanNumber } from "@/server/stock/challan";

describe("fiscalYear (IST, April–March)", () => {
  it("rolls over at midnight IST on 1 April", () => {
    expect(fiscalYear(new Date("2026-03-31T18:29:59Z"))).toBe("2025-26");
    expect(fiscalYear(new Date("2026-03-31T18:30:00Z"))).toBe("2026-27");
  });

  it("handles the century boundary", () => {
    expect(fiscalYear(new Date("2099-06-01T00:00:00Z"))).toBe("2099-00");
  });
});

describe("formatChallanNumber", () => {
  it("uses CENTER/FY/KIND-#####", () => {
    expect(formatChallanNumber("SKP", "2026-27", "transfer", 42)).toBe("SKP/2026-27/TR-00042");
    expect(formatChallanNumber("SKP", "2026-27", "receipt", 1)).toBe("SKP/2026-27/RC-00001");
  });
});
