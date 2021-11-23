export declare class PriorityQueue {
    _heap: number[];
    _comparator: (a: any, b: any) => boolean;
    constructor(comparator?: (a: number, b: number) => boolean);
    size(): number;
    isEmpty(): boolean;
    peek(): any;
    push(...values: any[]): number;
    pop(): any;
    replace(value: any): any;
    _greater(i: number, j: number): boolean;
    _swap(i: number, j: number): void;
    _siftUp(): void;
    _siftDown(): void;
}
