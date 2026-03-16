import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockSign,
  mockSetProtectedHeader,
  mockSetExpirationTime,
  mockSetIssuedAt,
  mockCookieSet,
  mockCookieGet,
  mockCookieDelete,
} = vi.hoisted(() => ({
  mockSign: vi.fn().mockResolvedValue("mock-jwt-token"),
  mockSetProtectedHeader: vi.fn().mockReturnThis(),
  mockSetExpirationTime: vi.fn().mockReturnThis(),
  mockSetIssuedAt: vi.fn().mockReturnThis(),
  mockCookieSet: vi.fn(),
  mockCookieGet: vi.fn(),
  mockCookieDelete: vi.fn(),
}));

vi.mock("jose", () => ({
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: mockSetProtectedHeader,
    setExpirationTime: mockSetExpirationTime,
    setIssuedAt: mockSetIssuedAt,
    sign: mockSign,
  })),
  jwtVerify: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookieSet, get: mockCookieGet, delete: mockCookieDelete }),
}));

import { SignJWT, jwtVerify } from "jose";
import { createSession, getSession, deleteSession, verifySession } from "../auth";
import { NextRequest } from "next/server";

function makeRequest(token?: string): NextRequest {
  return {
    cookies: { get: vi.fn().mockReturnValue(token ? { value: token } : undefined) },
  } as unknown as NextRequest;
}

describe("createSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSign.mockResolvedValue("mock-jwt-token");
    mockSetProtectedHeader.mockReturnThis();
    mockSetExpirationTime.mockReturnThis();
    mockSetIssuedAt.mockReturnThis();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("constructs JWT with correct payload", async () => {
    const before = Date.now();
    await createSession("user-123", "user@example.com");
    const after = Date.now();

    const [payload] = (SignJWT as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload.userId).toBe("user-123");
    expect(payload.email).toBe("user@example.com");

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expiresMs = new Date(payload.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  test("sets JWT protected header with HS256 algorithm", async () => {
    await createSession("user-123", "user@example.com");
    expect(mockSetProtectedHeader).toHaveBeenCalledWith({ alg: "HS256" });
  });

  test("sets expiration time to 7d", async () => {
    await createSession("user-123", "user@example.com");
    expect(mockSetExpirationTime).toHaveBeenCalledWith("7d");
  });

  test("signs with a Uint8Array secret", async () => {
    await createSession("user-123", "user@example.com");
    const [secret] = mockSign.mock.calls[0];
    expect(secret.constructor.name).toBe("Uint8Array");
  });

  test("sets cookie with correct name and token value", async () => {
    await createSession("user-123", "user@example.com");
    expect(mockCookieSet.mock.calls[0][0]).toBe("auth-token");
    expect(mockCookieSet.mock.calls[0][1]).toBe("mock-jwt-token");
  });

  test("sets cookie with httpOnly, sameSite, and path options", async () => {
    await createSession("user-123", "user@example.com");
    const options = mockCookieSet.mock.calls[0][2];
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  test("secure is false outside production", async () => {
    await createSession("user-123", "user@example.com");
    const options = mockCookieSet.mock.calls[0][2];
    expect(options.secure).toBe(false);
  });

  test("secure is true in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createSession("user-123", "user@example.com");
    const options = mockCookieSet.mock.calls[0][2];
    expect(options.secure).toBe(true);
  });

  test("cookie expires approximately 7 days from now", async () => {
    const before = Date.now();
    await createSession("user-123", "user@example.com");
    const after = Date.now();

    const options = mockCookieSet.mock.calls[0][2];
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(options.expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(options.expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });
});

describe("deleteSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("deletes the auth-token cookie", async () => {
    await deleteSession();
    expect(mockCookieDelete).toHaveBeenCalledWith("auth-token");
  });

  test("only deletes once per call", async () => {
    await deleteSession();
    expect(mockCookieDelete).toHaveBeenCalledTimes(1);
  });
});

describe("verifySession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns null when no auth-token cookie exists", async () => {
    expect(await verifySession(makeRequest())).toBeNull();
  });

  test("returns the JWT payload when token is valid", async () => {
    const payload = { userId: "user-123", email: "user@example.com", expiresAt: new Date() };
    vi.mocked(jwtVerify).mockResolvedValue({ payload } as any);

    expect(await verifySession(makeRequest("valid-token"))).toEqual(payload);
  });

  test("calls jwtVerify with the cookie token and a Uint8Array secret", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({ payload: {} } as any);

    await verifySession(makeRequest("my-token"));

    const [token, secret] = vi.mocked(jwtVerify).mock.calls[0];
    expect(token).toBe("my-token");
    expect(secret.constructor.name).toBe("Uint8Array");
  });

  test("returns null when jwtVerify throws", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("signature verification failed"));

    expect(await verifySession(makeRequest("bad-token"))).toBeNull();
  });

  test("reads from request cookies not next/headers", async () => {
    const request = makeRequest("req-token");
    vi.mocked(jwtVerify).mockResolvedValue({ payload: {} } as any);

    await verifySession(request);

    expect(request.cookies.get).toHaveBeenCalledWith("auth-token");
  });
});

describe("getSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns null when no auth-token cookie exists", async () => {
    mockCookieGet.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
  });

  test("returns the JWT payload when token is valid", async () => {
    const payload = { userId: "user-123", email: "user@example.com", expiresAt: new Date() };
    mockCookieGet.mockReturnValue({ value: "valid-token" });
    vi.mocked(jwtVerify).mockResolvedValue({ payload } as any);

    expect(await getSession()).toEqual(payload);
  });

  test("calls jwtVerify with the cookie token and a Uint8Array secret", async () => {
    mockCookieGet.mockReturnValue({ value: "my-token" });
    vi.mocked(jwtVerify).mockResolvedValue({ payload: {} } as any);

    await getSession();

    const [token, secret] = vi.mocked(jwtVerify).mock.calls[0];
    expect(token).toBe("my-token");
    expect(secret.constructor.name).toBe("Uint8Array");
  });

  test("returns null when jwtVerify throws", async () => {
    mockCookieGet.mockReturnValue({ value: "expired-token" });
    vi.mocked(jwtVerify).mockRejectedValue(new Error("signature verification failed"));

    expect(await getSession()).toBeNull();
  });
});
