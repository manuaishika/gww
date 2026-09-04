export { CONFIG } from "./config";
export { computeStats } from "./stats";
export { computeSignals, type Signals } from "./signals";
export {
  detectSymbol,
  detectReturnZ,
  detectIdiosyncratic,
  detectVolume,
  detectStructural,
  DETECTORS,
} from "./detectors";
export { dedupeKey, suppressedByCooldown } from "./dedupe";
export type {
  Bar,
  CircuitState,
  DetectContext,
  DetectorEvent,
  DetectorName,
  SymbolStats,
} from "./types";
