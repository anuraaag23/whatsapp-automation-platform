import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Symmetric encryption for secrets at rest (WhatsApp access tokens, etc.),
 * keyed by SECRETS_ENCRYPTION_KEY. Ciphertext is stored as
 * base64(iv):base64(authTag):base64(ciphertext) so it's a single string
 * column-friendly value. Swap this for a KMS-backed implementation in
 * production; the call sites don't need to change.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const secret = this.config.get<string>('SECRETS_ENCRYPTION_KEY');
    if (!secret || secret.length < 32) {
      const diagnosis =
        secret === undefined
          ? 'the environment variable is not set at all (undefined)'
          : secret === ''
            ? 'the environment variable is set but empty'
            : `the environment variable is only ${secret.length} characters long (needs 32+)`;
      throw new Error(
        `SECRETS_ENCRYPTION_KEY must be set to a string of at least 32 characters (see .env.example). ` +
          `Diagnosis: ${diagnosis}.`,
      );
    }
    this.key = crypto.createHash('sha256').update(secret).digest();
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Malformed encrypted payload');
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
