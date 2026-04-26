// Even Hub bridge client.
//
// We intentionally avoid a hard dependency on `@evenrealities/even_hub_sdk`.
// Hearer must run in a normal browser dev environment with no SDK present.
// When the SDK *is* present (the app is loaded inside the Even Hub runtime),
// this client uses it transparently.
//
// The client is read-mostly: it looks up the bridge once, caches the
// availability result, and forwards events.
//
// Public surface is intentionally tiny so the rest of the app can rely on
// shape stability across SDK versions.

export type EvenHubEventListener = (event: unknown) => void;

export interface EvenHubBridgeLike {
  audioControl(enable: boolean): Promise<void> | void;
  onEvenHubEvent(listener: EvenHubEventListener): () => void;
  // Optional rendering primitives used by the HUD adapter. Different SDK
  // versions ship different surfaces; we treat all as optional.
  showText?(text: string, opts?: { ttlMs?: number }): Promise<void> | void;
  updateText?(text: string, opts?: { ttlMs?: number }): Promise<void> | void;
  clearDisplay?(): Promise<void> | void;
  // Container/page-style APIs used by some SDK versions.
  ensureCuePage?(): Promise<void> | void;
  setCuePageText?(text: string): Promise<void> | void;
}

export interface EvenHubBridgeProbeResult {
  available: boolean;
  bridge: EvenHubBridgeLike | null;
  reason: string;
}

const PROBE_TIMEOUT_MS = 1500;

let probeMemo: Promise<EvenHubBridgeProbeResult> | null = null;

/**
 * Probe for an Even Hub SDK and return a bridge handle if present.
 *
 * - In a normal browser dev environment this resolves to "not available"
 *   quickly without throwing.
 * - When loaded inside the Even Hub runtime it returns the live bridge.
 * - Multiple callers share a memoised probe so we don't import the SDK
 *   repeatedly.
 */
export function probeEvenHubBridge(
  options: { timeoutMs?: number } = {}
): Promise<EvenHubBridgeProbeResult> {
  if (probeMemo) return probeMemo;
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;

  probeMemo = (async (): Promise<EvenHubBridgeProbeResult> => {
    if (typeof window === "undefined") {
      return {
        available: false,
        bridge: null,
        reason: "Not running in a browser/Even Hub runtime.",
      };
    }

    // 1. Direct global injection — older bridge versions add this.
    const w = window as unknown as Record<string, unknown>;
    const directGlobal = w.evenAppBridge ?? w.EvenAppBridge ?? w.__evenHubBridge;
    if (isBridgeLike(directGlobal)) {
      return {
        available: true,
        bridge: directGlobal,
        reason: "Detected global Even Hub bridge.",
      };
    }

    // 2. Optional SDK module via dynamic import. We use a non-statically
    // analyzable specifier so Vite/Rollup don't try to resolve it at build
    // time when the package isn't installed.
    try {
      const dynImport = (specifier: string) =>
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        new Function("s", "return import(s);")(specifier) as Promise<unknown>;
      const modPromise = dynImport("@evenrealities/even_hub_sdk");
      const mod = (await Promise.race([
        modPromise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Even Hub SDK probe timed out")),
            timeoutMs
          )
        ),
      ])) as Record<string, unknown> | undefined;
      if (mod && typeof mod === "object") {
        const waitFor = mod.waitForEvenAppBridge as
          | (() => Promise<EvenHubBridgeLike>)
          | undefined;
        if (typeof waitFor === "function") {
          const bridge = await Promise.race([
            waitFor(),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), timeoutMs)
            ),
          ]);
          if (bridge && isBridgeLike(bridge)) {
            return {
              available: true,
              bridge,
              reason: "Connected via Even Hub SDK.",
            };
          }
        }
      }
    } catch (err) {
      // Swallow — the SDK simply isn't installed in this build.
      void err;
    }

    return {
      available: false,
      bridge: null,
      reason:
        "Even Hub bridge not available — using simulator/fallback input.",
    };
  })();

  return probeMemo;
}

function isBridgeLike(x: unknown): x is EvenHubBridgeLike {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.audioControl === "function" &&
    typeof o.onEvenHubEvent === "function"
  );
}

// For tests: lets us reset the memoised probe between scenarios.
export function __resetEvenHubProbeForTests(): void {
  probeMemo = null;
}
