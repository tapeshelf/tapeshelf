import { redisOptionsFromUrl } from './queue.connection.js';
import { LOWEST_PRIORITY, fairPriority } from './queue.types.js';

describe('fairPriority', () => {
  it('puts a transcode behind the same person’s waiting ones, so people take turns', () => {
    expect(fairPriority(0)).toBe(1);
    expect(fairPriority(3)).toBe(4);
    expect(fairPriority(-1)).toBe(1);
    expect(fairPriority(10_000_000)).toBe(LOWEST_PRIORITY);
  });
});

describe('redisOptionsFromUrl', () => {
  it('parses host, port and database', () => {
    expect(redisOptionsFromUrl('redis://localhost:6379/1')).toMatchObject({
      host: 'localhost',
      port: 6379,
      db: 1,
      maxRetriesPerRequest: null,
      tls: undefined,
    });
    expect(redisOptionsFromUrl('redis://redis')).toMatchObject({
      host: 'redis',
      port: 6379,
      db: 0,
    });
  });

  it('parses credentials and TLS', () => {
    const o = redisOptionsFromUrl(
      'rediss://user:p%40ss@cache.example.com:6380/2',
    );
    expect(o).toMatchObject({
      host: 'cache.example.com',
      port: 6380,
      db: 2,
      username: 'user',
      password: 'p@ss',
    });
    expect(o.tls).toEqual({});
  });
});
