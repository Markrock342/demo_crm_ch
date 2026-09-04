import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const COOKIE = "cz_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type SessionClaims = {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  orgId: string;
};

export type SessionPayload = SessionClaims & JWTPayload;

function secret() {
  const s = process.env.JWT_SECRET?.trim();
  if (!s) throw new Error("missing_jwt_secret");
  return new TextEncoder().encode(s);
}

export async function signSession(claims: SessionClaims) {
  const { sub, email, roles, permissions, orgId } = claims;
  return new SignJWT({ email, roles, permissions, orgId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return { ...payload, sub: String(payload.sub) } as SessionPayload;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE) return rest.join("=");
  }
  return null;
}

export { COOKIE, MAX_AGE };
