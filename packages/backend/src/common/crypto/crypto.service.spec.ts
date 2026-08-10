import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CryptoService,
        {
          provide: ConfigService,
          useValue: { get: () => 'a-test-secret-that-is-at-least-32-chars-long' },
        },
      ],
    }).compile();

    service = moduleRef.get(CryptoService);
    service.onModuleInit();
  });

  it('round-trips a plaintext string', () => {
    const plaintext = 'EAABsbCS1...a-real-looking-meta-access-token';
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const plaintext = 'same-secret';
    expect(service.encrypt(plaintext)).not.toBe(service.encrypt(plaintext));
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = service.encrypt('secret-value');
    const [iv, tag, data] = encrypted.split(':');
    const tampered = [iv, tag, Buffer.from('tampered').toString('base64')].join(':');
    expect(() => service.decrypt(tampered)).toThrow();
  });
});
