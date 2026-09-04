import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const COOKIE = "cz_portal";
const MAX_AGE = 60 * 60 * 24; // 1 day

export type PortalClaims = {
  customerId: string;
  orgId: string;
};

export type PortalPayload = PortalClaims & JWTPayload;

function secret() {
  const s = process.env.JWT_SECRET?.trim();
  if (!s) throw new Error("missing_jwt_secret");
  return new TextEncoder().encode(s);
}

export async function signPortalSession(claims: PortalClaims) {
  return new SignJWT({ customerId: claims.customerId, orgId: claims.orgId, typ: "portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.customerId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifyPortalSession(token: string): Promise<PortalPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== "portal") return null;
    const customerId = String(payload.customerId ?? payload.sub ?? "");
    const orgId = String(payload.orgId ?? "");
    if (!customerId || !orgId) return null;
    return { ...payload, customerId, orgId, sub: customerId } as PortalPayload;
  } catch {
    return null;
  }
}

export function portalSessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`;
}

export function clearPortalSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readPortalSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE) return rest.join("=");
  }
  return null;
}
