declare module 'lru-cache' {
  export class LRUCache<K, V> {
    constructor(options?: any);
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    has(key: K): boolean;
    delete(key: K): void;
    clear(): void;
    size: number;
    forEach(callback: (value: V, key: K, cache: LRUCache<K, V>) => void, thisArg?: any): void;
    entries(): IterableIterator<[K, V]>;
  }
}
