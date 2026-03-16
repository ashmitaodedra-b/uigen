import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { getLabel, ToolInvocationBadge } from "../ToolInvocationBadge";

afterEach(() => {
  cleanup();
});

describe("getLabel", () => {
  test("str_replace_editor create returns Creating with filename", () => {
    expect(getLabel("str_replace_editor", { command: "create", path: "/components/Card.jsx" })).toBe("Creating Card.jsx");
  });

  test("str_replace_editor str_replace returns Editing with filename", () => {
    expect(getLabel("str_replace_editor", { command: "str_replace", path: "/App.jsx" })).toBe("Editing App.jsx");
  });

  test("str_replace_editor insert returns Editing with filename", () => {
    expect(getLabel("str_replace_editor", { command: "insert", path: "/App.jsx" })).toBe("Editing App.jsx");
  });

  test("str_replace_editor view returns Reading with filename", () => {
    expect(getLabel("str_replace_editor", { command: "view", path: "/components/Button.tsx" })).toBe("Reading Button.tsx");
  });

  test("str_replace_editor undo_edit returns Undoing edit with filename", () => {
    expect(getLabel("str_replace_editor", { command: "undo_edit", path: "/App.jsx" })).toBe("Undoing edit in App.jsx");
  });

  test("file_manager rename returns Renaming with filename", () => {
    expect(getLabel("file_manager", { command: "rename", path: "/old.jsx" })).toBe("Renaming old.jsx");
  });

  test("file_manager delete returns Deleting with filename", () => {
    expect(getLabel("file_manager", { command: "delete", path: "/components/Unused.jsx" })).toBe("Deleting Unused.jsx");
  });

  test("falls back to friendly label when no path provided", () => {
    expect(getLabel("str_replace_editor", { command: "create" })).toBe("Creating file");
    expect(getLabel("str_replace_editor", { command: "str_replace" })).toBe("Editing file");
    expect(getLabel("file_manager", { command: "delete" })).toBe("Deleting file");
  });

  test("falls back to tool name for unknown tool", () => {
    expect(getLabel("unknown_tool", {})).toBe("unknown_tool");
  });

  test("extracts filename from nested path", () => {
    expect(getLabel("str_replace_editor", { command: "create", path: "/src/components/ui/Button.tsx" })).toBe("Creating Button.tsx");
  });
});

describe("ToolInvocationBadge", () => {
  test("shows spinner when tool is in progress", () => {
    const { container } = render(
      <ToolInvocationBadge
        toolInvocation={{ state: "call", toolCallId: "1", toolName: "str_replace_editor", args: { command: "create", path: "/App.jsx" } }}
      />
    );
    expect(container.querySelector(".animate-spin")).toBeDefined();
  });

  test("shows green dot when tool call is complete", () => {
    const { container } = render(
      <ToolInvocationBadge
        toolInvocation={{ state: "result", toolCallId: "1", toolName: "str_replace_editor", args: { command: "create", path: "/App.jsx" }, result: "ok" }}
      />
    );
    expect(container.querySelector(".bg-emerald-500")).toBeDefined();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  test("displays friendly label for str_replace_editor create", () => {
    render(
      <ToolInvocationBadge
        toolInvocation={{ state: "result", toolCallId: "1", toolName: "str_replace_editor", args: { command: "create", path: "/components/Card.jsx" }, result: "ok" }}
      />
    );
    expect(screen.getByText("Creating Card.jsx")).toBeDefined();
  });

  test("displays friendly label for str_replace_editor str_replace", () => {
    render(
      <ToolInvocationBadge
        toolInvocation={{ state: "call", toolCallId: "1", toolName: "str_replace_editor", args: { command: "str_replace", path: "/App.jsx" } }}
      />
    );
    expect(screen.getByText("Editing App.jsx")).toBeDefined();
  });

  test("displays friendly label for file_manager delete", () => {
    render(
      <ToolInvocationBadge
        toolInvocation={{ state: "call", toolCallId: "1", toolName: "file_manager", args: { command: "delete", path: "/old.jsx" } }}
      />
    );
    expect(screen.getByText("Deleting old.jsx")).toBeDefined();
  });
});
