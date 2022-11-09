interface Data {
    l: number;
    t: number;
    v: any;
}
export declare class DataCache {
    config: any;
    checkInterval: number;
    data: {
        [key: string]: Data;
    };
    queue: {
        [key: string]: any[];
    };
    constructor(config: any);
    get(key: string, retrieve: (retrieved: (key: string, value: any, ttl: number) => void) => void, callback: (value: any) => void): void;
    getNocache(key: string, retrieve: (retrieved: (key: string, value: any, ttl: number) => void) => void, callback: (value: any) => void): void;
    _retrieved: (key: string, value: any, ttl: number) => void;
    _checkData: () => void;
}
export {};
