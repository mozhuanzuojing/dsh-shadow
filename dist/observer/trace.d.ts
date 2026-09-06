import type { ObservationTrace } from "../core/types.js";
export declare const recordObservationTrace: (fs: any, ws: string, trace: Omit<ObservationTrace, "id"> & {
    id?: string;
}) => Promise<void>;
export declare const renderObservationTrace: (tr: ObservationTrace) => string;
