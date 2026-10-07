import { LruCache } from './lru-cache.js';

describe('LruCache', () => {
  it('evicts the least recently used entry above the capacity', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);

    cache.set('c', 3);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('peeks without refreshing the entry', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.peek('a')).toBe(1);

    cache.set('c', 3);

    expect(cache.peek('a')).toBeUndefined();
    expect(cache.peek('b')).toBe(2);
  });

  it('replaces the value of an existing key', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('a', 5);

    expect(cache.get('a')).toBe(5);
    expect(cache.size).toBe(1);
  });
});
