// Storage layer for the Hearer Memory API.
//
// Tries better-sqlite3 first; falls back to a JSON-file store if the native
// binding isn't available. Both implementations expose the same Storage
// interface so route handlers don't care which one is active.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type {
  AudioDetectionRecord,
  Commitment,
  ContextEventRecord,
  CueFeedback,
  CueRecord,
  ImportantItem,
  KnownPerson,
  LocationMemory,
  MemorySummary,
  Routine,
  UserProfile,
} from "../../shared/types";

export type StorageKind = "sqlite" | "json";

export interface Storage {
  kind: StorageKind;
  ensureDefaults(): void;
  getProfile(): UserProfile;
  updateProfile(patch: Partial<UserProfile>): UserProfile;
  listPeople(): KnownPerson[];
  upsertPerson(p: KnownPerson): KnownPerson;
  listItems(): ImportantItem[];
  upsertItem(i: ImportantItem): ImportantItem;
  listLocations(): LocationMemory[];
  upsertLocation(l: LocationMemory): LocationMemory;
  listRoutines(): Routine[];
  upsertRoutine(r: Routine): Routine;
  listCommitments(): Commitment[];
  upsertCommitment(c: Commitment): Commitment;
  insertEvent(e: ContextEventRecord): ContextEventRecord;
  listEvents(limit?: number): ContextEventRecord[];
  insertCue(c: CueRecord): CueRecord;
  listCues(limit?: number): CueRecord[];
  setCueFeedback(cueId: string, feedback: CueFeedback): CueRecord | null;
  insertAudioDetection(d: AudioDetectionRecord): AudioDetectionRecord;
  listAudioDetections(limit?: number): AudioDetectionRecord[];
  summary(): MemorySummary;
  reset(): void;
}

const DEFAULT_PROFILE = (): UserProfile => ({
  id: "default",
  displayName: "Mihir",
  alertStyle: "minimal",
  interruptionMode: "normal",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

interface JsonShape {
  profile: UserProfile;
  people: KnownPerson[];
  items: ImportantItem[];
  locations: LocationMemory[];
  routines: Routine[];
  commitments: Commitment[];
  events: ContextEventRecord[];
  cues: CueRecord[];
  audioDetections: AudioDetectionRecord[];
}

function emptyShape(): JsonShape {
  return {
    profile: DEFAULT_PROFILE(),
    people: [],
    items: [],
    locations: [],
    routines: [],
    commitments: [],
    events: [],
    cues: [],
    audioDetections: [],
  };
}

class JsonStorage implements Storage {
  kind: StorageKind = "json";
  private path: string;
  private state: JsonShape;

  constructor(path: string) {
    this.path = path;
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8");
        this.state = { ...emptyShape(), ...JSON.parse(raw) };
      } catch {
        this.state = emptyShape();
      }
    } else {
      mkdirSync(dirname(path), { recursive: true });
      this.state = emptyShape();
      this.persist();
    }
  }

  private persist(): void {
    writeFileSync(this.path, JSON.stringify(this.state, null, 2), "utf-8");
  }

  ensureDefaults(): void {
    if (!this.state.profile) {
      this.state.profile = DEFAULT_PROFILE();
      this.persist();
    }
  }

  getProfile(): UserProfile {
    return this.state.profile;
  }

  updateProfile(patch: Partial<UserProfile>): UserProfile {
    this.state.profile = {
      ...this.state.profile,
      ...patch,
      id: this.state.profile.id,
      createdAt: this.state.profile.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.state.profile;
  }

  listPeople(): KnownPerson[] {
    return [...this.state.people];
  }

  upsertPerson(p: KnownPerson): KnownPerson {
    const existing = this.state.people.findIndex((x) => x.id === p.id);
    if (existing >= 0) this.state.people[existing] = p;
    else this.state.people.push(p);
    this.persist();
    return p;
  }

  listItems(): ImportantItem[] {
    return [...this.state.items];
  }

  upsertItem(i: ImportantItem): ImportantItem {
    const existing = this.state.items.findIndex((x) => x.id === i.id);
    if (existing >= 0) this.state.items[existing] = i;
    else this.state.items.push(i);
    this.persist();
    return i;
  }

  listLocations(): LocationMemory[] {
    return [...this.state.locations];
  }

  upsertLocation(l: LocationMemory): LocationMemory {
    const existing = this.state.locations.findIndex((x) => x.id === l.id);
    if (existing >= 0) this.state.locations[existing] = l;
    else this.state.locations.push(l);
    this.persist();
    return l;
  }

  listRoutines(): Routine[] {
    return [...this.state.routines];
  }

  upsertRoutine(r: Routine): Routine {
    const existing = this.state.routines.findIndex((x) => x.id === r.id);
    if (existing >= 0) this.state.routines[existing] = r;
    else this.state.routines.push(r);
    this.persist();
    return r;
  }

  listCommitments(): Commitment[] {
    return [...this.state.commitments];
  }

  upsertCommitment(c: Commitment): Commitment {
    const existing = this.state.commitments.findIndex((x) => x.id === c.id);
    if (existing >= 0) this.state.commitments[existing] = c;
    else this.state.commitments.push(c);
    this.persist();
    return c;
  }

  insertEvent(e: ContextEventRecord): ContextEventRecord {
    this.state.events.push(e);
    if (this.state.events.length > 1000) {
      this.state.events.splice(0, this.state.events.length - 1000);
    }
    this.persist();
    return e;
  }

  listEvents(limit = 50): ContextEventRecord[] {
    return this.state.events.slice(-limit).reverse();
  }

  insertCue(c: CueRecord): CueRecord {
    this.state.cues.push(c);
    if (this.state.cues.length > 500) {
      this.state.cues.splice(0, this.state.cues.length - 500);
    }
    this.persist();
    return c;
  }

  listCues(limit = 30): CueRecord[] {
    return this.state.cues.slice(-limit).reverse();
  }

  setCueFeedback(cueId: string, feedback: CueFeedback): CueRecord | null {
    const idx = this.state.cues.findIndex((c) => c.id === cueId);
    if (idx < 0) return null;
    this.state.cues[idx] = {
      ...this.state.cues[idx],
      userFeedback: feedback,
      feedbackAt: new Date().toISOString(),
    };
    this.persist();
    return this.state.cues[idx];
  }

  insertAudioDetection(d: AudioDetectionRecord): AudioDetectionRecord {
    this.state.audioDetections.push(d);
    if (this.state.audioDetections.length > 500) {
      this.state.audioDetections.splice(
        0,
        this.state.audioDetections.length - 500
      );
    }
    this.persist();
    return d;
  }

  listAudioDetections(limit = 30): AudioDetectionRecord[] {
    return this.state.audioDetections.slice(-limit).reverse();
  }

  summary(): MemorySummary {
    return {
      userProfile: this.state.profile,
      knownPeople: this.listPeople(),
      importantItems: this.listItems(),
      routines: this.listRoutines(),
      commitments: this.listCommitments(),
      locations: this.listLocations(),
      recentCues: this.listCues(10),
    };
  }

  reset(): void {
    this.state = emptyShape();
    this.persist();
  }
}

interface SqliteDatabase {
  prepare(sql: string): {
    run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    all(...args: unknown[]): unknown[];
    get(...args: unknown[]): unknown;
  };
  exec(sql: string): unknown;
  close(): unknown;
}

class SqliteStorage implements Storage {
  kind: StorageKind = "sqlite";
  private db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profile (
        id TEXT PRIMARY KEY,
        displayName TEXT NOT NULL,
        alertStyle TEXT NOT NULL,
        interruptionMode TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        aliases TEXT NOT NULL,
        importance TEXT NOT NULL,
        relationship TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        contexts TEXT NOT NULL,
        priority TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        type TEXT NOT NULL,
        cuesOnArrival TEXT NOT NULL,
        cuesOnExit TEXT NOT NULL,
        relevantSounds TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS routines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        triggerType TEXT NOT NULL,
        triggerDescription TEXT NOT NULL,
        actionType TEXT NOT NULL,
        actionLabel TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        confidence REAL NOT NULL,
        source TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commitments (
        id TEXT PRIMARY KEY,
        person TEXT,
        task TEXT NOT NULL,
        deadlineText TEXT,
        deadlineIso TEXT,
        actionType TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        payload TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cues (
        id TEXT PRIMARY KEY,
        cueText TEXT NOT NULL,
        priority TEXT NOT NULL,
        actionType TEXT NOT NULL,
        sourceEventId TEXT,
        wasShown INTEGER NOT NULL,
        userFeedback TEXT,
        feedbackAt TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audio_detections (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        confidence REAL NOT NULL,
        source TEXT NOT NULL,
        contextSnapshot TEXT,
        routedCueId TEXT,
        createdAt TEXT NOT NULL
      );
    `);
  }

  ensureDefaults(): void {
    const row = this.db.prepare("SELECT * FROM profile WHERE id = 'default'").get();
    if (!row) {
      const p = DEFAULT_PROFILE();
      this.db
        .prepare(
          "INSERT INTO profile (id, displayName, alertStyle, interruptionMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          p.id,
          p.displayName,
          p.alertStyle,
          p.interruptionMode,
          p.createdAt,
          p.updatedAt
        );
    }
  }

  getProfile(): UserProfile {
    const row = this.db.prepare("SELECT * FROM profile WHERE id = 'default'").get();
    if (!row) {
      this.ensureDefaults();
      return DEFAULT_PROFILE();
    }
    return row as UserProfile;
  }

  updateProfile(patch: Partial<UserProfile>): UserProfile {
    const cur = this.getProfile();
    const next: UserProfile = {
      ...cur,
      ...patch,
      id: cur.id,
      createdAt: cur.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        "UPDATE profile SET displayName=?, alertStyle=?, interruptionMode=?, updatedAt=? WHERE id=?"
      )
      .run(
        next.displayName,
        next.alertStyle,
        next.interruptionMode,
        next.updatedAt,
        next.id
      );
    return next;
  }

  listPeople(): KnownPerson[] {
    const rows = this.db
      .prepare("SELECT * FROM people ORDER BY createdAt ASC")
      .all() as Array<KnownPerson & { aliases: string }>;
    return rows.map((r) => ({ ...r, aliases: JSON.parse(r.aliases) }));
  }

  upsertPerson(p: KnownPerson): KnownPerson {
    this.db
      .prepare(
        `INSERT INTO people (id, name, aliases, importance, relationship, createdAt) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, aliases=excluded.aliases, importance=excluded.importance, relationship=excluded.relationship`
      )
      .run(
        p.id,
        p.name,
        JSON.stringify(p.aliases),
        p.importance,
        p.relationship ?? null,
        p.createdAt
      );
    return p;
  }

  listItems(): ImportantItem[] {
    const rows = this.db
      .prepare("SELECT * FROM items ORDER BY createdAt ASC")
      .all() as Array<ImportantItem & { contexts: string }>;
    return rows.map((r) => ({ ...r, contexts: JSON.parse(r.contexts) }));
  }

  upsertItem(i: ImportantItem): ImportantItem {
    this.db
      .prepare(
        `INSERT INTO items (id, label, contexts, priority, createdAt) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET label=excluded.label, contexts=excluded.contexts, priority=excluded.priority`
      )
      .run(i.id, i.label, JSON.stringify(i.contexts), i.priority, i.createdAt);
    return i;
  }

  listLocations(): LocationMemory[] {
    const rows = this.db
      .prepare("SELECT * FROM locations ORDER BY createdAt ASC")
      .all() as Array<
      LocationMemory & {
        cuesOnArrival: string;
        cuesOnExit: string;
        relevantSounds: string;
      }
    >;
    return rows.map((r) => ({
      ...r,
      cuesOnArrival: JSON.parse(r.cuesOnArrival),
      cuesOnExit: JSON.parse(r.cuesOnExit),
      relevantSounds: JSON.parse(r.relevantSounds),
    }));
  }

  upsertLocation(l: LocationMemory): LocationMemory {
    this.db
      .prepare(
        `INSERT INTO locations (id, label, type, cuesOnArrival, cuesOnExit, relevantSounds, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET label=excluded.label, type=excluded.type, cuesOnArrival=excluded.cuesOnArrival, cuesOnExit=excluded.cuesOnExit, relevantSounds=excluded.relevantSounds`
      )
      .run(
        l.id,
        l.label,
        l.type,
        JSON.stringify(l.cuesOnArrival),
        JSON.stringify(l.cuesOnExit),
        JSON.stringify(l.relevantSounds),
        l.createdAt
      );
    return l;
  }

  listRoutines(): Routine[] {
    const rows = this.db
      .prepare("SELECT * FROM routines ORDER BY createdAt ASC")
      .all() as Array<Routine & { enabled: number }>;
    return rows.map((r) => ({ ...r, enabled: !!r.enabled }));
  }

  upsertRoutine(r: Routine): Routine {
    this.db
      .prepare(
        `INSERT INTO routines (id, name, triggerType, triggerDescription, actionType, actionLabel, enabled, confidence, source, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           triggerType=excluded.triggerType,
           triggerDescription=excluded.triggerDescription,
           actionType=excluded.actionType,
           actionLabel=excluded.actionLabel,
           enabled=excluded.enabled,
           confidence=excluded.confidence,
           source=excluded.source,
           updatedAt=excluded.updatedAt`
      )
      .run(
        r.id,
        r.name,
        r.triggerType,
        r.triggerDescription,
        r.actionType,
        r.actionLabel,
        r.enabled ? 1 : 0,
        r.confidence,
        r.source,
        r.createdAt,
        r.updatedAt
      );
    return r;
  }

  listCommitments(): Commitment[] {
    const rows = this.db
      .prepare("SELECT * FROM commitments ORDER BY createdAt ASC")
      .all() as Commitment[];
    return rows;
  }

  upsertCommitment(c: Commitment): Commitment {
    this.db
      .prepare(
        `INSERT INTO commitments (id, person, task, deadlineText, deadlineIso, actionType, status, source, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           person=excluded.person,
           task=excluded.task,
           deadlineText=excluded.deadlineText,
           deadlineIso=excluded.deadlineIso,
           actionType=excluded.actionType,
           status=excluded.status,
           updatedAt=excluded.updatedAt`
      )
      .run(
        c.id,
        c.person ?? null,
        c.task,
        c.deadlineText ?? null,
        c.deadlineIso ?? null,
        c.actionType,
        c.status,
        c.source,
        c.createdAt,
        c.updatedAt
      );
    return c;
  }

  insertEvent(e: ContextEventRecord): ContextEventRecord {
    this.db
      .prepare(
        "INSERT INTO events (id, source, payload, createdAt) VALUES (?, ?, ?, ?)"
      )
      .run(e.id, e.source, JSON.stringify(e.payload), e.createdAt);
    return e;
  }

  listEvents(limit = 50): ContextEventRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM events ORDER BY createdAt DESC LIMIT ?")
      .all(limit) as Array<ContextEventRecord & { payload: string }>;
    return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  }

  insertCue(c: CueRecord): CueRecord {
    this.db
      .prepare(
        `INSERT INTO cues (id, cueText, priority, actionType, sourceEventId, wasShown, userFeedback, feedbackAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        c.id,
        c.cueText,
        c.priority,
        c.actionType,
        c.sourceEventId ?? null,
        c.wasShown ? 1 : 0,
        c.userFeedback ?? null,
        c.feedbackAt ?? null,
        c.createdAt
      );
    return c;
  }

  listCues(limit = 30): CueRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM cues ORDER BY createdAt DESC LIMIT ?")
      .all(limit) as Array<CueRecord & { wasShown: number }>;
    return rows.map((r) => ({ ...r, wasShown: !!r.wasShown }));
  }

  setCueFeedback(cueId: string, feedback: CueFeedback): CueRecord | null {
    this.db
      .prepare(
        "UPDATE cues SET userFeedback=?, feedbackAt=? WHERE id=?"
      )
      .run(feedback, new Date().toISOString(), cueId);
    const row = this.db
      .prepare("SELECT * FROM cues WHERE id=?")
      .get(cueId) as (CueRecord & { wasShown: number }) | undefined;
    if (!row) return null;
    return { ...row, wasShown: !!row.wasShown };
  }

  insertAudioDetection(d: AudioDetectionRecord): AudioDetectionRecord {
    this.db
      .prepare(
        `INSERT INTO audio_detections (id, label, confidence, source, contextSnapshot, routedCueId, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        d.id,
        d.label,
        d.confidence,
        d.source,
        d.contextSnapshot ? JSON.stringify(d.contextSnapshot) : null,
        d.routedCueId ?? null,
        d.createdAt
      );
    return d;
  }

  listAudioDetections(limit = 30): AudioDetectionRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM audio_detections ORDER BY createdAt DESC LIMIT ?"
      )
      .all(limit) as Array<
      AudioDetectionRecord & { contextSnapshot: string | null }
    >;
    return rows.map((r) => ({
      ...r,
      contextSnapshot: r.contextSnapshot ? JSON.parse(r.contextSnapshot) : undefined,
    }));
  }

  summary(): MemorySummary {
    return {
      userProfile: this.getProfile(),
      knownPeople: this.listPeople(),
      importantItems: this.listItems(),
      routines: this.listRoutines(),
      commitments: this.listCommitments(),
      locations: this.listLocations(),
      recentCues: this.listCues(10),
    };
  }

  reset(): void {
    this.db.exec(`
      DELETE FROM people;
      DELETE FROM items;
      DELETE FROM locations;
      DELETE FROM routines;
      DELETE FROM commitments;
      DELETE FROM events;
      DELETE FROM cues;
      DELETE FROM audio_detections;
      DELETE FROM profile;
    `);
    this.ensureDefaults();
  }
}

export interface OpenStorageOptions {
  dataDir?: string;
  preferJson?: boolean;
}

export async function openStorage(
  opts: OpenStorageOptions = {}
): Promise<Storage> {
  const dataDir = resolve(opts.dataDir ?? "server/data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  if (!opts.preferJson) {
    try {
      const mod = await import("better-sqlite3");
      const Ctor = (mod as unknown as { default: new (path: string) => SqliteDatabase }).default;
      const dbPath = resolve(dataDir, "hearer.sqlite");
      const db = new Ctor(dbPath);
      const storage = new SqliteStorage(db);
      storage.ensureDefaults();
      return storage;
    } catch {
      // Fall back to JSON if the native binding isn't available.
    }
  }

  const jsonPath = resolve(dataDir, "hearer.memory.json");
  const storage = new JsonStorage(jsonPath);
  storage.ensureDefaults();
  return storage;
}
