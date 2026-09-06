import type { SleepWindow, DreamTrigger } from "./types.js";
export declare const buildSleepWindow: (opts: {
    observerId: string;
    from?: string;
    to?: string;
    trigger?: DreamTrigger;
    id?: string;
}) => SleepWindow;
export declare const renderSleepWindow: (w: SleepWindow) => string;
