import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Hoist mock references so they can be used in vi.mock factories
const {
  mockSignIn,
  mockSignUp,
  mockGetAnonWorkData,
  mockClearAnonWork,
  mockGetProjects,
  mockCreateProject,
  mockRouterPush,
} = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
  mockGetAnonWorkData: vi.fn(),
  mockClearAnonWork: vi.fn(),
  mockGetProjects: vi.fn(),
  mockCreateProject: vi.fn(),
  mockRouterPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("@/actions", () => ({
  signIn: mockSignIn,
  signUp: mockSignUp,
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: mockGetAnonWorkData,
  clearAnonWork: mockClearAnonWork,
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: mockGetProjects,
}));

vi.mock("@/actions/create-project", () => ({
  createProject: mockCreateProject,
}));

import { useAuth } from "@/hooks/use-auth";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no anonymous work, no existing projects
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
  mockCreateProject.mockResolvedValue({ id: "new-project-id" });
});

// ---------------------------------------------------------------------------
// signIn
// ---------------------------------------------------------------------------

describe("signIn", () => {
  test("calls signInAction with email and password", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "secret");
    });

    expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "secret");
  });

  test("returns the result from signInAction", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Bad password" });

    const { result } = renderHook(() => useAuth());
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.signIn("a@b.com", "pw");
    });

    expect(returnValue).toEqual({ success: false, error: "Bad password" });
  });

  test("sets isLoading to true during sign-in and false after", async () => {
    let resolveSignIn!: (v: unknown) => void;
    mockSignIn.mockReturnValue(new Promise((res) => { resolveSignIn = res; }));
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "x" });

    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);

    let signInPromise!: Promise<unknown>;
    act(() => {
      signInPromise = result.current.signIn("a@b.com", "pw");
    });
    // isLoading should be true while sign-in is in-flight
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignIn({ success: false });
      await signInPromise;
    });
    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false even when signInAction throws", async () => {
    mockSignIn.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "pw").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("does not call handlePostSignIn when sign-in fails", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Wrong password" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "pw");
    });

    expect(mockGetAnonWorkData).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  test("redirects to anon project when sign-in succeeds and anon work exists", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "hello" }],
      fileSystemData: { "/App.jsx": "export default () => <div/>" },
    });
    mockCreateProject.mockResolvedValue({ id: "anon-project-id" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "pw");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: expect.any(Array) })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith("/anon-project-id");
    // Should not fall through to getProjects
    expect(mockGetProjects).not.toHaveBeenCalled();
  });

  test("does not use anon work when messages array is empty", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
    mockGetProjects.mockResolvedValue([{ id: "existing-id" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "pw");
    });

    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockClearAnonWork).not.toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith("/existing-id");
  });

  test("redirects to most recent existing project when sign-in succeeds with no anon work", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([{ id: "first" }, { id: "second" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "pw");
    });

    expect(mockRouterPush).toHaveBeenCalledWith("/first");
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  test("creates a new project and redirects when no existing projects found", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "brand-new" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "pw");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockRouterPush).toHaveBeenCalledWith("/brand-new");
  });
});

// ---------------------------------------------------------------------------
// signUp
// ---------------------------------------------------------------------------

describe("signUp", () => {
  test("calls signUpAction with email and password", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email taken" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockSignUp).toHaveBeenCalledWith("new@example.com", "password123");
  });

  test("returns the result from signUpAction", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email taken" });

    const { result } = renderHook(() => useAuth());
    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.signUp("new@example.com", "pw");
    });

    expect(returnValue).toEqual({ success: false, error: "Email taken" });
  });

  test("sets isLoading to true during sign-up and false after", async () => {
    let resolveSignUp!: (v: unknown) => void;
    mockSignUp.mockReturnValue(new Promise((res) => { resolveSignUp = res; }));
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "x" });

    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);

    let signUpPromise!: Promise<unknown>;
    act(() => {
      signUpPromise = result.current.signUp("a@b.com", "pw");
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignUp({ success: false });
      await signUpPromise;
    });
    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false even when signUpAction throws", async () => {
    mockSignUp.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("a@b.com", "pw").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("does not call handlePostSignIn when sign-up fails", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email taken" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("a@b.com", "pw");
    });

    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockGetAnonWorkData).not.toHaveBeenCalled();
  });

  test("runs handlePostSignIn after successful sign-up", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([{ id: "after-signup" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("a@b.com", "pw");
    });

    expect(mockRouterPush).toHaveBeenCalledWith("/after-signup");
  });

  test("migrates anon work after successful sign-up", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "build me a form" }],
      fileSystemData: { "/App.jsx": "…" },
    });
    mockCreateProject.mockResolvedValue({ id: "migrated-id" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("a@b.com", "pw");
    });

    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith("/migrated-id");
  });
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("initial state", () => {
  test("isLoading starts as false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("returns signIn and signUp functions", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
  });
});
