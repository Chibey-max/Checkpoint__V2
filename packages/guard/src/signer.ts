import {
  parseSecretKey,
  signBasketHash,
  toBase58,
  toHex,
  type Ed25519KeyPair,
} from '@checkpoint/shared';

/**
 * Holds the Guard ed25519 key. The seed lives in a private field and never
 * appears in toJSON, String() or inspection output (FR-R05).
 */
export class GuardSigner {
  readonly #seed: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly publicKeyB58: string;
  readonly publicKeyHex: string;
  /** Strings the logger must scrub if they ever show up in output. */
  readonly secretForms: string[];

  constructor(pair: Ed25519KeyPair, rawSecret?: string) {
    this.#seed = pair.seed;
    this.publicKey = pair.publicKey;
    this.publicKeyB58 = toBase58(pair.publicKey);
    this.publicKeyHex = toHex(pair.publicKey);
    this.secretForms = [
      toBase58(pair.seed),
      toHex(pair.seed),
      ...(rawSecret ? [rawSecret.trim()] : []),
    ];
  }

  static fromEnv(secret: string | undefined): GuardSigner {
    if (!secret)
      throw new Error('GUARD_SECRET_KEY is not set (generate one with: pnpm guard keygen)');
    return new GuardSigner(parseSecretKey(secret), secret);
  }

  sign(hash: Uint8Array): Uint8Array {
    return signBasketHash(hash, this.#seed);
  }

  toJSON(): { publicKey: string } {
    return { publicKey: this.publicKeyB58 };
  }

  toString(): string {
    return `GuardSigner(${this.publicKeyB58})`;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }
}
