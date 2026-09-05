import { describe, expect, it } from "vitest";
import { reconcileQuotes, type SourceQuote } from "./reconcile";

const q = (price: number, source: string, tsMs: number): SourceQuote => ({
  price,
  source,
  exchangeTs: new Date(tsMs),
});

describe("reconcileQuotes", () => {
  it("passes a single source straight through, undisputed", () => {
    const r = reconcileQuotes(q(100, "yahoo", 1000), null);
    expect(r.price).toBe(100);
    expect(r.source).toBe("yahoo");
    expect(r.isDisputed).toBe(false);
    expect(r.disputeNote).toBeNull();
  });

  it("within 0.5% — not disputed, takes the fresher one", () => {
    const r = reconcileQuotes(q(100, "yahoo", 1000), q(100.4, "finnhub", 2000));
    expect(r.isDisputed).toBe(false);
    expect(r.price).toBe(100.4); // finnhub is newer
    expect(r.source).toBe("finnhub");
  });

  it("beyond 0.5% — disputed, shows the newer, logs both", () => {
    const r = reconcileQuotes(q(100, "yahoo", 2000), q(103, "finnhub", 1000));
    expect(r.isDisputed).toBe(true);
    expect(r.price).toBe(100); // yahoo is newer
    expect(r.source).toBe("yahoo");
    expect(r.disputeNote).toContain("yahoo");
    expect(r.disputeNote).toContain("finnhub");
    expect(r.disputeNote).toContain("%");
  });

  it("never silently drops the disagreement — the older price is still named", () => {
    const r = reconcileQuotes(q(100, "yahoo", 2000), q(90, "finnhub", 1000));
    expect(r.disputeNote).toContain("90");
    expect(r.disputeNote).toContain("100");
  });
});
