"use client";

import type { ToolInvocation } from "ai";
import { Loader2 } from "lucide-react";

export function getLabel(toolName: string, args: Record<string, unknown>): string {
  const path = typeof args?.path === "string" ? args.path : null;
  const filename = path ? path.split("/").filter(Boolean).pop() ?? path : null;

  if (toolName === "str_replace_editor") {
    switch (args?.command) {
      case "create":
        return filename ? `Creating ${filename}` : "Creating file";
      case "str_replace":
      case "insert":
        return filename ? `Editing ${filename}` : "Editing file";
      case "view":
        return filename ? `Reading ${filename}` : "Reading file";
      case "undo_edit":
        return filename ? `Undoing edit in ${filename}` : "Undoing edit";
    }
  }

  if (toolName === "file_manager") {
    switch (args?.command) {
      case "rename":
        return filename ? `Renaming ${filename}` : "Renaming file";
      case "delete":
        return filename ? `Deleting ${filename}` : "Deleting file";
    }
  }

  return toolName;
}

interface Props {
  toolInvocation: ToolInvocation;
}

export function ToolInvocationBadge({ toolInvocation }: Props) {
  const label = getLabel(toolInvocation.toolName, toolInvocation.args as Record<string, unknown>);
  const isDone = toolInvocation.state === "result";

  return (
    <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-neutral-50 rounded-lg text-xs font-mono border border-neutral-200">
      {isDone ? (
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
      ) : (
        <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
      )}
      <span className="text-neutral-700">{label}</span>
    </div>
  );
}
