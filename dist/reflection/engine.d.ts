import type { ObservationTrace } from "../core/types.js";
import { type Reflection } from "./types.js";
export interface ReflectOpts {
    id?: string;
    observerId: string;
    period: {
        from: string;
        to: string;
    };
}
export declare const reflectTraces: (traces: Partial<ObservationTrace>[], opts: ReflectOpts) => Reflection;
export declare const reflectOf: (fs: any, ws: string, opts: ReflectOpts) => Promise<Reflection>;
export declare const renderReflection: (r: Reflection) => string;
