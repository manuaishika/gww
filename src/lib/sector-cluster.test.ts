import { describe, expect, it } from "vitest";
import { clusterSectorMoves, type ClusterableEvent } from "./sector-cluster";

const SECTORS: Record<string, string> = {
  TCS: "IT",
  INFY: "IT",
  WIPRO: "IT",
  HCLTECH: "IT",
  RELIANCE: "Energy",
};
const sectorOf = (s: string) => SECTORS[s];

function ev(
  id: string,
  symbol: string,
  sessionDate: string,
  score: number,
  detector = "idio_z",
): ClusterableEvent {
  return { id, symbol, sessionDate, detector, score };
}

describe("clusterSectorMoves", () => {
  it("groups the real IT-sector example found in the seed data (2026-02-12)", () => {
    // TCS, INFY, WIPRO, HCLTECH all fired idio_z the same real session —
    // genuine data, not fabricated (see DECISIONS.md).
    const events = [
      ev("tcs1", "TCS", "2026-02-12", 94.2),
      ev("infy1", "INFY", "2026-02-12", 94.6),
      ev("wipro1", "WIPRO", "2026-02-12", 97.0),
      ev("hcl1", "HCLTECH", "2026-02-12", 82.2),
    ];
    const { clusterByRepresentativeId, suppressedEventIds } = clusterSectorMoves(
      events,
      sectorOf,
    );

    // highest score (WIPRO, 97.0) is the representative
    expect(clusterByRepresentativeId.has("wipro1")).toBe(true);
    const cluster = clusterByRepresentativeId.get("wipro1")!;
    expect(cluster.sector).toBe("IT");
    expect(new Set(cluster.symbols)).toEqual(new Set(["TCS", "INFY", "WIPRO", "HCLTECH"]));

    // the other three are suppressed, not double-counted as separate stories
    expect(suppressedEventIds).toEqual(new Set(["tcs1", "infy1", "hcl1"]));
    expect(suppressedEventIds.has("wipro1")).toBe(false);
  });

  it("does not cluster below the minimum size", () => {
    const events = [ev("a", "TCS", "2026-02-12", 90), ev("b", "INFY", "2026-02-12", 88)];
    const { clusterByRepresentativeId, suppressedEventIds } = clusterSectorMoves(
      events,
      sectorOf,
    );
    expect(clusterByRepresentativeId.size).toBe(0);
    expect(suppressedEventIds.size).toBe(0);
  });

  it("does not cluster across different sessions or different sectors", () => {
    const events = [
      ev("a", "TCS", "2026-02-12", 90),
      ev("b", "INFY", "2026-02-13", 88), // different day
      ev("c", "WIPRO", "2026-02-12", 85),
      ev("d", "RELIANCE", "2026-02-12", 99), // different sector
    ];
    const { clusterByRepresentativeId } = clusterSectorMoves(events, sectorOf);
    expect(clusterByRepresentativeId.size).toBe(0);
  });

  it("only clusters idio_z — a shared volume spike isn't the same claim", () => {
    const events = [
      ev("a", "TCS", "2026-02-12", 90, "volume_z"),
      ev("b", "INFY", "2026-02-12", 88, "volume_z"),
      ev("c", "WIPRO", "2026-02-12", 85, "volume_z"),
    ];
    const { clusterByRepresentativeId } = clusterSectorMoves(events, sectorOf);
    expect(clusterByRepresentativeId.size).toBe(0);
  });

  it("leaves an unrelated solo event for the same symbol untouched", () => {
    const events = [
      ev("tcs-cluster", "TCS", "2026-02-12", 90),
      ev("infy-cluster", "INFY", "2026-02-12", 88),
      ev("wipro-cluster", "WIPRO", "2026-02-12", 85),
      ev("tcs-solo", "TCS", "2026-05-01", 99), // TCS's own later, unrelated story
    ];
    const { clusterByRepresentativeId, suppressedEventIds } = clusterSectorMoves(
      events,
      sectorOf,
    );
    expect(clusterByRepresentativeId.has("tcs-cluster")).toBe(true);
    expect(suppressedEventIds.has("tcs-solo")).toBe(false); // not swept up
  });
});
