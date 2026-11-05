import { createVerify, generateKeyPairSync } from 'node:crypto';

import { readServiceAccount, signedAssertion } from './fcm.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const account = {
  type: 'service_account',
  project_id: 'shelf-test',
  client_email: 'sender@example.com',
  private_key: privateKey,
  token_uri: 'https://oauth2.example.test/token',
};

describe('push key', () => {
  it('is read as its JSON or as that JSON in base64; anything else is not a key', () => {
    const json = JSON.stringify(account);
    expect(readServiceAccount(json)?.project_id).toBe('shelf-test');
    expect(
      readServiceAccount(Buffer.from(json).toString('base64'))?.client_email,
    ).toBe(account.client_email);
    expect(readServiceAccount('not a key')).toBeNull();
    expect(readServiceAccount(JSON.stringify({ project_id: 'x' }))).toBeNull();
  });

  it('asks for an access token with a request signed by the key, for an hour, for messaging only', () => {
    const now = Date.UTC(2026, 10, 5, 12);
    const jwt = signedAssertion(account, now);
    const [header, body, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(body!, 'base64url').toString())).toEqual({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: account.token_uri,
      iat: now / 1000,
      exp: now / 1000 + 3600,
    });
    expect(
      createVerify('RSA-SHA256')
        .update(`${header}.${body}`)
        .verify(publicKey, Buffer.from(signature!, 'base64url')),
    ).toBe(true);
  });
});
