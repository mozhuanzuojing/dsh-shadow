import type { FederatedObservationPacket, ExchangeableKind } from "./types.js";
export declare const packetOf: (opts: {
    sourceObserverId: string;
    observationClaim: string;
    lens?: string;
    visible?: string[];
    hidden?: string[];
    distortion?: string[];
    hypothesisId?: string;
    validationId?: string;
    outcome?: any;
}) => FederatedObservationPacket;
export declare const renderPacket: (p: FederatedObservationPacket) => string;
export declare const isExchangeable: (kind: ExchangeableKind) => boolean;
export declare const assertPacketBarrier: (p: FederatedObservationPacket) => {
    ok: boolean;
    reasons: string[];
};
