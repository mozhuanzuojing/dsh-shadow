import type { RealityObservation } from "./types.js";
export declare const registerObservation: (fs: any, ws: string, ro: RealityObservation) => Promise<RealityObservation>;
export declare const readObservations: (fs: any, ws: string, subjectRef?: string) => Promise<RealityObservation[]>;
