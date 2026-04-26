import { cloneDemoProfile } from "./demoProfile";
import type { Cue, DemoMemory, Task } from "./types";

const STORAGE_KEY = "hearer.memory.v1";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadMemory(): DemoMemory {
  const storage = safeStorage();
  if (storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as DemoMemory;
      } catch {
        // fall through
      }
    }
  }
  return cloneDemoProfile();
}

export function saveMemory(memory: DemoMemory): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota errors in demo
  }
}

export function resetMemory(): DemoMemory {
  const fresh = cloneDemoProfile();
  saveMemory(fresh);
  return fresh;
}

export function recordRecentCue(memory: DemoMemory, cue: Cue): DemoMemory {
  const next: DemoMemory = {
    ...memory,
    recentCues: [cue, ...memory.recentCues].slice(0, 20),
  };
  saveMemory(next);
  return next;
}

export function markTaskDrafted(
  memory: DemoMemory,
  taskId: string
): DemoMemory {
  const openTasks: Task[] = memory.openTasks.map((t) =>
    t.id === taskId ? { ...t, status: "drafted" } : t
  );
  const next = { ...memory, openTasks };
  saveMemory(next);
  return next;
}
