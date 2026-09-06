import type { RepresentationGraph } from "../types.js";
import type { RealityClaim } from "../../reality/types.js";
import type { RealityObservation } from "../../reality/types.js";
export declare const explain: (graph: RepresentationGraph | null, subject: string, observations: RealityObservation[], claims: RealityClaim[]) => string;
