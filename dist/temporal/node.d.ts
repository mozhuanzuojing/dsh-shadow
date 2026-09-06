import type { TemporalNode } from "./types.js";
import type { ObservationTrace } from "../core/types.js";
export declare const buildNode: (trace: Partial<ObservationTrace>, identityVersion: string, lens?: string) => TemporalNode;
