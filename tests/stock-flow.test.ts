import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { fiscalYear } from "@/server/stock/challan";
import { callerFor, fixture, flushDeferred, makeUser, qtyOf, resetDb } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
const FY = fiscalYear();

beforeEach(async () => {
  await resetDb();
  f = await fixture();
});

afterAll(async () => {
  await flushDeferred();
  await db.$client.end();
});

describe("receiving stock", () => {
  it("issues a receipt invoice with line amounts and a total", async () => {
    const api = callerFor(f.lngManager);
    const doc = await api.inventory.bulkIntake({
      departmentId: f.lng.id,
      partyName: "Sharma Traders",
      partyRef: "B-881",
      lines: [
        { itemId: f.glass.id, quantity: 20, rate: 35.5 },
        { itemId: f.chair.id, quantity: 3, rate: 410 },
      ],
    });
    expect(doc.number).toBe(`SKP/${FY}/RC-00001`);
    expect(await qtyOf(f.lng.id, f.glass.id)).toBe(120);
    expect(await qtyOf(f.lng.id, f.chair.id)).toBe(3);

    const detail = await api.challans.byId({ id: doc.id });
    expect(detail.totalAmount).toBe("1940.00");
    expect(detail.lines.map((l) => l.amount)).toEqual(["710.00", "1230.00"]);
    expect(detail.acknowledgeable).toBe(false);
  });

  it("numbers concurrent receipts without gaps or duplicates", async () => {
    const api = callerFor(f.lngManager);
    const docs = await Promise.all(
      Array.from({ length: 15 }, () =>
        api.inventory.bulkIntake({
          departmentId: f.lng.id,
          partyName: "Donor",
          lines: [{ itemId: f.glass.id, quantity: 1, rate: 0 }],
        }),
      ),
    );
    const numbers = docs.map((d) => Number(d.number.slice(-5))).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(await qtyOf(f.lng.id, f.glass.id)).toBe(115);
  });

  it("replays with the same clientMutationId return the same Rahdari once", async () => {
    const api = callerFor(f.lngManager);
    const input = {
      departmentId: f.lng.id,
      partyName: "Offline donor",
      clientMutationId: randomUUID(),
      lines: [{ itemId: f.glass.id, quantity: 5, rate: 0 }],
    };
    const [a, b] = await Promise.all([api.inventory.bulkIntake(input), api.inventory.bulkIntake(input)]);
    const c = await api.inventory.bulkIntake(input);
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    expect(await qtyOf(f.lng.id, f.glass.id)).toBe(105);
  });

  it("is limited to managers of the department", async () => {
    const input = {
      departmentId: f.lng.id,
      partyName: "X",
      lines: [{ itemId: f.glass.id, quantity: 1, rate: 0 }],
    };
    await expect(callerFor(f.tntManager).inventory.bulkIntake(input)).rejects.toThrow(/not a manager/);
    await expect(callerFor(f.tntViewer).inventory.bulkIntake(input)).rejects.toThrow(/not a manager/);
    await expect(callerFor(null).inventory.bulkIntake(input)).rejects.toThrow(/UNAUTHORIZED/);
  });
});

describe("issue and adjustment", () => {
  it("rolls the number back when the movement fails", async () => {
    const api = callerFor(f.lngManager);
    await expect(
      api.inventory.issue({
        departmentId: f.lng.id,
        recipient: "Satsang Sunday",
        lines: [{ itemId: f.glass.id, quantity: 500 }],
      }),
    ).rejects.toThrow(/only 100 available/);
    const ok = await api.inventory.issue({
      departmentId: f.lng.id,
      recipient: "Satsang Sunday",
      lines: [{ itemId: f.glass.id, quantity: 40 }],
    });
    expect(ok.number).toBe(`SKP/${FY}/IS-00001`);
    expect(await qtyOf(f.lng.id, f.glass.id)).toBe(60);
  });

  it("adjusts with a mandatory reason and never goes negative", async () => {
    const api = callerFor(f.lngManager);
    await expect(
      api.inventory.adjust({ departmentId: f.lng.id, itemId: f.glass.id, delta: -101, reason: "count" }),
    ).rejects.toThrow(/only 100 available/);
    await expect(
      api.inventory.adjust({ departmentId: f.lng.id, itemId: f.glass.id, delta: -1, reason: "" }),
    ).rejects.toThrow();
    const doc = await api.inventory.adjust({
      departmentId: f.lng.id,
      itemId: f.glass.id,
      delta: -4,
      reason: "Broken in wash",
    });
    expect(doc.number).toBe(`SKP/${FY}/AD-00001`);
    expect(await qtyOf(f.lng.id, f.glass.id)).toBe(96);
  });
});

describe("borrowing", () => {
  async function requestChairs(qty = 30) {
    return callerFor(f.lngManager).borrows.request({
      fromDepartmentId: f.tnt.id,
      toDepartmentId: f.lng.id,
      dueDate: "2026-11-01",
      lines: [{ itemId: f.chair.id, quantity: qty }],
    });
  }

  it("only the lender's managers can approve, and approval issues a transfer", async () => {
    const b = await requestChairs();
    await expect(callerFor(f.lngManager).borrows.approve({ id: b.id })).rejects.toThrow(/not a manager/);
    await expect(callerFor(f.tntViewer).borrows.approve({ id: b.id })).rejects.toThrow(/not a manager/);

    const doc = await callerFor(f.tntManager).borrows.approve({ id: b.id });
    expect(doc.number).toBe(`SKP/${FY}/TR-00001`);
    expect(await qtyOf(f.tnt.id, f.chair.id)).toBe(20);
    expect(await qtyOf(f.lng.id, f.chair.id)).toBe(30);

    const detail = await callerFor(f.lngManager).borrows.byId({ id: b.id });
    expect(detail.status).toBe("approved");
    expect(detail.challans.map((c) => c.kind)).toEqual(["transfer"]);
    expect(detail.can.recordReturn).toBe(true);
  });

  it("cannot approve the same request twice, even concurrently", async () => {
    const b = await requestChairs(30);
    const api = callerFor(f.tntManager);
    const results = await Promise.allSettled([api.borrows.approve({ id: b.id }), api.borrows.approve({ id: b.id })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await qtyOf(f.tnt.id, f.chair.id)).toBe(20);
  });

  it("each partial return gets its own Rahdari until fully returned", async () => {
    const b = await requestChairs(30);
    await callerFor(f.tntManager).borrows.approve({ id: b.id });
    const lineId = (await callerFor(f.lngManager).borrows.byId({ id: b.id })).lines[0].id;

    const r1 = await callerFor(f.lngManager).borrows.recordReturn({
      id: b.id,
      lines: [{ borrowItemId: lineId, quantity: 10 }],
    });
    expect(r1.number).toBe(`SKP/${FY}/RT-00001`);
    expect((await callerFor(f.lngManager).borrows.byId({ id: b.id })).status).toBe("partially_returned");

    await expect(
      callerFor(f.lngManager).borrows.recordReturn({ id: b.id, lines: [{ borrowItemId: lineId, quantity: 21 }] }),
    ).rejects.toThrow(/exceeds remaining \(20\)/);

    const r2 = await callerFor(f.tntManager).borrows.recordReturn({
      id: b.id,
      lines: [{ borrowItemId: lineId, quantity: 20 }],
    });
    expect(r2.number).toBe(`SKP/${FY}/RT-00002`);
    expect((await callerFor(f.lngManager).borrows.byId({ id: b.id })).status).toBe("returned");
    expect(await qtyOf(f.tnt.id, f.chair.id)).toBe(50);
    expect(await qtyOf(f.lng.id, f.chair.id)).toBe(0);
  });

  it("refuses approval when the lender doesn't have enough", async () => {
    const b = await requestChairs(80);
    await expect(callerFor(f.tntManager).borrows.approve({ id: b.id })).rejects.toThrow(/only 50 available/);
    expect((await callerFor(f.tntManager).borrows.byId({ id: b.id })).status).toBe("pending");
  });
});

describe("acknowledgement", () => {
  it("anyone with the QR link can confirm once, with no login", async () => {
    const b = await callerFor(f.lngManager).borrows.request({
      fromDepartmentId: f.tnt.id,
      toDepartmentId: f.lng.id,
      lines: [{ itemId: f.chair.id, quantity: 5 }],
    });
    const doc = await callerFor(f.tntManager).borrows.approve({ id: b.id });
    const { publicToken } = await callerFor(f.admin).challans.byId({ id: doc.id });

    const anon = callerFor(null);
    const view = await anon.challans.publicByToken({ token: publicToken });
    expect(view).not.toHaveProperty("issuedBy");
    expect(view.acknowledgeable).toBe(true);

    await anon.challans.acknowledgeByToken({ token: publicToken, name: "Ramesh", phone: "98765 43210" });
    await expect(
      anon.challans.acknowledgeByToken({ token: publicToken, name: "Someone else" }),
    ).rejects.toThrow(/Already acknowledged/);

    const after = await callerFor(f.admin).challans.byId({ id: doc.id });
    expect(after.status).toBe("acknowledged");
    expect(after.acknowledgedByName).toBe("Ramesh");
  });

  it("rate-limits public acknowledgement attempts per IP", async () => {
    const anon = callerFor(null, "10.0.0.99");
    const tries = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        anon.challans.acknowledgeByToken({ token: "x".repeat(24), name: "Bot" }),
      ),
    );
    const limited = tries.filter((t) => t.status === "rejected" && /Too many/.test(String(t.reason)));
    expect(limited.length).toBe(2);
  });
});

describe("void", () => {
  it("admin void of a receipt reverses stock and keeps the number", async () => {
    const doc = await callerFor(f.lngManager).inventory.bulkIntake({
      departmentId: f.lng.id,
      partyName: "Wrong vendor",
      lines: [{ itemId: f.glass.id, quantity: 10, rate: 1 }],
    });
    await expect(callerFor(f.lngManager).challans.void({ id: doc.id, reason: "typo" })).rejects.toThrow(/FORBIDDEN|Requires/);
    await callerFor(f.admin).challans.void({ id: doc.id, reason: "Entered twice" });
    expect(await qtyOf(f.lng.id, f.glass.id)).toBe(100);
    const after = await callerFor(f.admin).challans.byId({ id: doc.id });
    expect(after.status).toBe("void");
    expect(after.number).toBe(doc.number);
  });

  it("refuses to void a receipt whose stock is already gone", async () => {
    const doc = await callerFor(f.lngManager).inventory.bulkIntake({
      departmentId: f.lng.id,
      partyName: "Vendor",
      lines: [{ itemId: f.chair.id, quantity: 5, rate: 1 }],
    });
    await callerFor(f.lngManager).inventory.issue({
      departmentId: f.lng.id,
      recipient: "Event",
      lines: [{ itemId: f.chair.id, quantity: 5 }],
    });
    await expect(callerFor(f.admin).challans.void({ id: doc.id, reason: "late" })).rejects.toThrow(/Not enough/);
  });
});

describe("scanner lookup", () => {
  it("finds items by barcode, item QR label, or SKU", async () => {
    const api = callerFor(f.tntViewer);
    expect((await api.items.byCode({ code: "8901234567890" }))?.id).toBe(f.glass.id);
    expect((await api.items.byCode({ code: "STOCK:ITEM:CHR" }))?.id).toBe(f.chair.id);
    expect((await api.items.byCode({ code: "CHR" }))?.id).toBe(f.chair.id);
    expect(await api.items.byCode({ code: "nope" })).toBeNull();
  });
});

describe("review regressions", () => {
  async function approvedChairs(qty: number) {
    const b = await callerFor(f.lngManager).borrows.request({
      fromDepartmentId: f.tnt.id,
      toDepartmentId: f.lng.id,
      lines: [{ itemId: f.chair.id, quantity: qty }],
    });
    await callerFor(f.tntManager).borrows.approve({ id: b.id });
    const lineId = (await callerFor(f.lngManager).borrows.byId({ id: b.id })).lines[0].id;
    return { id: b.id, lineId };
  }

  it("merges repeated return lines so they can't exceed what was lent", async () => {
    const { id, lineId } = await approvedChairs(10);
    await expect(
      callerFor(f.lngManager).borrows.recordReturn({
        id,
        lines: [
          { borrowItemId: lineId, quantity: 10 },
          { borrowItemId: lineId, quantity: 10 },
        ],
      }),
    ).rejects.toThrow(/exceeds remaining \(10\)/);
    expect(await qtyOf(f.tnt.id, f.chair.id)).toBe(40);
  });

  it("accepts an exact fractional return (no float drift)", async () => {
    const b = await callerFor(f.lngManager).borrows.request({
      fromDepartmentId: f.tnt.id,
      toDepartmentId: f.lng.id,
      lines: [{ itemId: f.chair.id, quantity: 0.3 }],
    });
    await callerFor(f.tntManager).borrows.approve({ id: b.id });
    const lineId = (await callerFor(f.lngManager).borrows.byId({ id: b.id })).lines[0].id;
    await callerFor(f.lngManager).borrows.recordReturn({ id: b.id, lines: [{ borrowItemId: lineId, quantity: 0.2 }] });
    await callerFor(f.lngManager).borrows.recordReturn({ id: b.id, lines: [{ borrowItemId: lineId, quantity: 0.1 }] });
    expect((await callerFor(f.lngManager).borrows.byId({ id: b.id })).status).toBe("returned");
  });

  it("hides other departments' Rahdari and borrows from non-members", async () => {
    const doc = await callerFor(f.lngManager).inventory.bulkIntake({
      departmentId: f.lng.id,
      partyName: "Vendor",
      lines: [{ itemId: f.glass.id, quantity: 1, rate: 99 }],
    });
    const outsider = callerFor(f.tntViewer);
    await expect(outsider.challans.byId({ id: doc.id })).rejects.toThrow(/Not one of your departments/);
    await expect(outsider.challans.list({ departmentId: f.lng.id })).rejects.toThrow(/Not one of your departments/);
    expect((await outsider.challans.list({})).rows.map((r) => r.id)).not.toContain(doc.id);

    const { id } = await approvedChairs(5);
    const sound = await makeUser("SoundOnly", "viewer", []);
    await expect(callerFor(sound).borrows.byId({ id })).rejects.toThrow(/Not one of your departments/);
    expect(await callerFor(sound).borrows.list()).toEqual([]);
    // Both sides of the borrow can see it.
    expect((await callerFor(f.tntViewer).borrows.byId({ id })).id).toBe(id);
  });

  it("closes public sign-up over HTTP", async () => {
    const { auth } = await import("@/lib/auth");
    const res = await auth.handler(
      new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ email: "x@y.z", password: "password123", name: "X" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
