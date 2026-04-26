// Factory: prefer the API client when the server is reachable, fall back to local.

import { createHearerApiClient } from "../api/hearerApi";
import { ApiMemoryClient } from "./apiMemoryClient";
import { LocalMemoryClient } from "./localMemoryClient";
import type { MemoryClient, MemoryStatus } from "./memoryClient";

export interface MemoryClientHandle {
  client: MemoryClient;
  status: MemoryStatus;
  baseUrl: string;
}

export async function createMemoryClient(opts?: {
  baseUrl?: string;
}): Promise<MemoryClientHandle> {
  const api = createHearerApiClient({ baseUrl: opts?.baseUrl });
  try {
    const health = await api.health();
    if (health.ok) {
      const client = new ApiMemoryClient(api);
      await client.refresh();
      return { client, status: "api", baseUrl: api.baseUrl };
    }
  } catch {
    // fall through
  }
  const local = new LocalMemoryClient();
  await local.refresh();
  return { client: local, status: "local", baseUrl: api.baseUrl };
}
