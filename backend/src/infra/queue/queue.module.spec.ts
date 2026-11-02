import { redisOptionsFromUrl } from './queue.connection.js';

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
