export interface ObserverProjection {
    observerId: string;
    visible: string[];
    hidden: string[];
}
export interface CrossObserverDistortion {
    observers: string[];
    sameReality: {
        visibleUnion: string[];
    };
    disagreement: {
        observerId: string;
        sees: string[];
        misses: string[];
    }[];
}
export declare const compareProjections: (a: ObserverProjection, b: ObserverProjection) => CrossObserverDistortion;
export declare const renderDistortion: (d: CrossObserverDistortion) => string;
