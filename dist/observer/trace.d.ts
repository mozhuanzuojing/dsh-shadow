import type { ObservationTrace } from "../core/types.js";
export declare const recordObservationTrace: (fs: any, ws: string, trace: Omit<ObservationTrace, "id"> & {
    id?: string;
}) => Promise<void>;
export declare const renderObservationTrace: (tr: ObservationTrace) => string;
export declare const parseObservationTrace: (text: string) => Partial<ObservationTrace> | null;
export declare const readObservationTraces: (fs: any, ws: string) => Promise<Partial<ObservationTrace>[]>;
