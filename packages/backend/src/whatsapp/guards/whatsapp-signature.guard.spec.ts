import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { WhatsappSignatureGuard } from './whatsapp-signature.guard';

const APP_SECRET = 'test_app_secret_123';

function createContext(headers: Record<string, string>, rawBody?: Buffer): ExecutionContext {
  const request = { headers, rawBody };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function sign(body: Buffer, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('WhatsappSignatureGuard', () => {
  let guard: WhatsappSignatureGuard;
  let configGet: jest.Mock;

  beforeEach(() => {
    configGet = jest.fn((key: string) => (key === 'WHATSAPP_APP_SECRET' ? APP_SECRET : undefined));
    const config = { get: configGet } as unknown as ConfigService;
    guard = new WhatsappSignatureGuard(config);
  });

  it('accepts a request with a valid signature computed over the raw body', () => {
    const body = Buffer.from(JSON.stringify({ entry: [] }));
    const context = createContext({ 'x-hub-signature-256': sign(body) }, body);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a request with no signature header at all', () => {
    const body = Buffer.from(JSON.stringify({ entry: [] }));
    const context = createContext({}, body);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a request with a well-formed but incorrect signature', () => {
    const body = Buffer.from(JSON.stringify({ entry: [] }));
    const wrongBody = Buffer.from(JSON.stringify({ entry: [{ tampered: true }] }));
    const context = createContext({ 'x-hub-signature-256': sign(wrongBody) }, body);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a request signed with the wrong secret', () => {
    const body = Buffer.from(JSON.stringify({ entry: [] }));
    const context = createContext({ 'x-hub-signature-256': sign(body, 'someone_elses_secret') }, body);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects when the raw body was not captured (rawBody: true misconfigured)', () => {
    const body = Buffer.from(JSON.stringify({ entry: [] }));
    const context = createContext({ 'x-hub-signature-256': sign(body) }, undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('fails closed when WHATSAPP_APP_SECRET is not configured, even with a signature header present', () => {
    configGet.mockReturnValue(undefined);
    const body = Buffer.from(JSON.stringify({ entry: [] }));
    const context = createContext({ 'x-hub-signature-256': sign(body) }, body);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
