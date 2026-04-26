// HUD output adapter boundary.
//
// Hearer's compressed cue is the only thing that should ever leave the brain
// for the glasses. This interface lets us swap targets — the in-app
// simulator HUD today, an Even G2 / Even Hub bridge later — without
// touching the engine layer.

import type { Cue } from "../engine/types";

export interface HudOutputAdapter {
  id: string;
  label: string;
  isConnected(): boolean;
  sendCue(cue: Cue): Promise<void> | void;
  clearCue?(): Promise<void> | void;
}
