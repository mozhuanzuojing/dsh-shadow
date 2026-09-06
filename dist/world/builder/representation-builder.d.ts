import type { RealityClaim } from "../../reality/types.js";
import type { RepresentationGraph } from "../types.js";
export declare const buildRepresentationGraph: (claims: RealityClaim[], validations: {
    id: string;
}[]) => RepresentationGraph;
