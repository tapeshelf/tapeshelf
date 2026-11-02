import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';

/**
 * A passkey in software for the API's tests: it answers WebAuthn's creation and request
 * options the way a browser with a key would ("none" attestation, a counter that grows).
 */
export class SoftPasskey {
  private readonly keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  readonly id = randomBytes(16).toString('base64url');
  private counter = 0;

  constructor(private readonly origin: string) {}

  /** The answer to `navigator.credentials.create()`. */
  create(options: { challenge: string }) {
    const jwk = this.keys.publicKey.export({ format: 'jwk' });
    const cose = cbor(
      new Map<number, unknown>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv:
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ]),
    );
    const credentialId = Buffer.from(this.id, 'base64url');
    const length = Buffer.alloc(2);
    length.writeUInt16BE(credentialId.length);
    const authData = Buffer.concat([
      this.rpIdHash(),
      Buffer.from([0x45]), // user present, verified, credential data attached
      this.count(),
      Buffer.alloc(16), // aaguid
      length,
      credentialId,
      cose,
    ]);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: this.clientData('webauthn.create', options.challenge),
        attestationObject: cbor(
          new Map<string, unknown>([
            ['fmt', 'none'],
            ['attStmt', new Map()],
            ['authData', authData],
          ]),
        ).toString('base64url'),
        transports: ['internal'],
      },
    };
  }

  /** The answer to `navigator.credentials.get()`. */
  get(options: { challenge: string }) {
    this.counter += 1;
    const authData = Buffer.concat([
      this.rpIdHash(),
      Buffer.from([0x05]), // user present, verified
      this.count(),
    ]);
    const clientDataJSON = this.clientData('webauthn.get', options.challenge);
    const signature = sign(
      'sha256',
      Buffer.concat([
        authData,
        createHash('sha256')
          .update(Buffer.from(clientDataJSON, 'base64url'))
          .digest(),
      ]),
      this.keys.privateKey,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON,
        authenticatorData: authData.toString('base64url'),
        signature: signature.toString('base64url'),
      },
    };
  }

  private rpIdHash(): Buffer {
    return createHash('sha256').update(new URL(this.origin).hostname).digest();
  }

  private count(): Buffer {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(this.counter);
    return b;
  }

  private clientData(type: string, challenge: string): string {
    return Buffer.from(
      JSON.stringify({
        type,
        challenge,
        origin: this.origin,
        crossOrigin: false,
      }),
    ).toString('base64url');
  }
}

/** The little CBOR WebAuthn needs: small ints, byte and text strings, maps. */
function cbor(value: unknown): Buffer {
  const head = (major: number, n: number): Buffer => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 0x100) return Buffer.from([(major << 5) | 24, n]);
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(n, 1);
    return b;
  };
  if (typeof value === 'number')
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (Buffer.isBuffer(value))
    return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') {
    const text = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, text.length), text]);
  }
  if (value instanceof Map)
    return Buffer.concat([
      head(5, value.size),
      ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)]),
    ]);
  throw new Error(`cbor: ${typeof value}`);
}
