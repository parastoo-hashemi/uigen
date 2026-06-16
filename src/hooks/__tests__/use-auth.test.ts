import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "../use-auth";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

const mockedSignIn = vi.mocked(signInAction);
const mockedSignUp = vi.mocked(signUpAction);
const mockedGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockedClearAnonWork = vi.mocked(clearAnonWork);
const mockedGetProjects = vi.mocked(getProjects);
const mockedCreateProject = vi.mocked(createProject);

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAnonWorkData.mockReturnValue(null);
    mockedGetProjects.mockResolvedValue([]);
    mockedCreateProject.mockResolvedValue({ id: "new-id" } as any);
  });

  test("starts with isLoading false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  describe("signIn", () => {
    test("returns the result from the action", async () => {
      mockedSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

      const { result } = renderHook(() => useAuth());
      let returnValue: any;

      await act(async () => {
        returnValue = await result.current.signIn("test@example.com", "wrongpass");
      });

      expect(returnValue).toEqual({ success: false, error: "Invalid credentials" });
    });

    test("isLoading is true while the action is pending", async () => {
      let resolveSignIn!: (v: any) => void;
      mockedSignIn.mockReturnValue(new Promise((r) => { resolveSignIn = r; }));

      const { result } = renderHook(() => useAuth());
      let signInPromise!: Promise<any>;

      act(() => {
        signInPromise = result.current.signIn("test@example.com", "pass");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignIn({ success: false });
        await signInPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("isLoading resets to false even when action rejects", async () => {
      mockedSignIn.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "pass").catch(() => {});
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("does not navigate when authentication fails", async () => {
      mockedSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "wrongpass");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    test("creates project from anon work and navigates when anon messages exist", async () => {
      mockedSignIn.mockResolvedValue({ success: true });
      mockedGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "Hello" }],
        fileSystemData: { "/App.jsx": { content: "export default () => <div/>" } },
      });
      mockedCreateProject.mockResolvedValue({ id: "anon-project" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password123");
      });

      expect(mockedCreateProject).toHaveBeenCalledWith({
        name: expect.stringContaining("Design from"),
        messages: [{ role: "user", content: "Hello" }],
        data: { "/App.jsx": { content: "export default () => <div/>" } },
      });
      expect(mockedClearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/anon-project");
      expect(mockedGetProjects).not.toHaveBeenCalled();
    });

    test("ignores anon work when messages array is empty", async () => {
      mockedSignIn.mockResolvedValue({ success: true });
      mockedGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
      mockedGetProjects.mockResolvedValue([{ id: "existing-project" }] as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password123");
      });

      expect(mockedClearAnonWork).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/existing-project");
    });

    test("navigates to the most recent project when there is no anon work", async () => {
      mockedSignIn.mockResolvedValue({ success: true });
      mockedGetProjects.mockResolvedValue([
        { id: "recent-project" },
        { id: "older-project" },
      ] as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password123");
      });

      expect(mockPush).toHaveBeenCalledWith("/recent-project");
      expect(mockedCreateProject).not.toHaveBeenCalled();
    });

    test("creates a new project and navigates when the user has no existing projects", async () => {
      mockedSignIn.mockResolvedValue({ success: true });
      mockedGetProjects.mockResolvedValue([]);
      mockedCreateProject.mockResolvedValue({ id: "brand-new" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password123");
      });

      expect(mockedCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringMatching(/^New Design #\d+$/),
          messages: [],
          data: {},
        })
      );
      expect(mockPush).toHaveBeenCalledWith("/brand-new");
    });
  });

  describe("signUp", () => {
    test("returns the result from the action", async () => {
      mockedSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

      const { result } = renderHook(() => useAuth());
      let returnValue: any;

      await act(async () => {
        returnValue = await result.current.signUp("existing@example.com", "password123");
      });

      expect(returnValue).toEqual({ success: false, error: "Email already registered" });
    });

    test("does not navigate when sign-up fails", async () => {
      mockedSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("existing@example.com", "password123");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    test("navigates after successful sign-up", async () => {
      mockedSignUp.mockResolvedValue({ success: true });
      mockedGetProjects.mockResolvedValue([{ id: "first-project" }] as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("newuser@example.com", "password123");
      });

      expect(mockPush).toHaveBeenCalledWith("/first-project");
    });

    test("isLoading resets to false after sign-up completes", async () => {
      mockedSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("existing@example.com", "password123");
      });

      expect(result.current.isLoading).toBe(false);
    });
  });
});
