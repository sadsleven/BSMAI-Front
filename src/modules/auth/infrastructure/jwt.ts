interface JwtPayload {
  exp?: number;
  iat?: number;
  sub?: string;
  [key: string]: unknown;
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const padded = (input + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded);
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const json = decodeURIComponent(
      base64UrlDecode(payload)
        .split('')
        .map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join(''),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function getJwtExpiryMs(token: string): number | null {
  const payload = decodeJwt(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
}

export function isJwtExpired(token: string, skewMs = 0): boolean {
  const expMs = getJwtExpiryMs(token);
  if (expMs === null) return false;
  return Date.now() >= expMs - skewMs;
}
