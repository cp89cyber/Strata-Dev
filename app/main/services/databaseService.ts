import path from 'node:path';

import Database from 'better-sqlite3';

import type { AppSettings, ChangeSetStatus, ChatMessage, CodeChangeSet, CommandOutputEvent, PersistedSession } from '../../shared/contracts';
import { DEFAULT_SETTINGS } from '../../shared/contracts';

import { toAppError } from './errors';

export class DatabaseService {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  static resolveDbPath(userDataPath: string): string {
    return path.join(userDataPath, 'strata.sqlite3');
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_session
      ON chat_messages (session_id, created_at);

      CREATE TABLE IF NOT EXISTS change_sets (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_change_sets_session
      ON change_sets (session_id, created_at);

      CREATE TABLE IF NOT EXISTS command_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS command_outputs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  getSettings(): AppSettings {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('app_settings') as { value: string } | undefined;

    if (!row) {
      return DEFAULT_SETTINGS;
    }

    try {
      const parsed = JSON.parse(row.value) as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  updateSettings(partial: Partial<AppSettings>): AppSettings {
    const merged = {
      ...this.getSettings(),
      ...partial
    };

    this.db
      .prepare(
        `INSERT INTO settings (key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run('app_settings', JSON.stringify(merged));

    return merged;
  }

  saveMessage(message: ChatMessage): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO chat_messages (id, session_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(message.id, message.sessionId, message.role, message.content, message.createdAt);

    this.db
      .prepare(
        `INSERT INTO settings (key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run('last_session_id', message.sessionId);
  }

  getLastSessionId(): string | null {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('last_session_id') as { value: string } | undefined;

    return row?.value ?? null;
  }

  listMessages(sessionId: string): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, role, content, created_at
         FROM chat_messages
         WHERE session_id = ?
         ORDER BY created_at ASC`
      )
      .all(sessionId) as Array<{ id: string; session_id: string; role: ChatMessage['role']; content: string; created_at: string }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at
    }));
  }

  saveChangeSet(changeSet: CodeChangeSet): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO change_sets (id, session_id, payload, status, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(changeSet.id, changeSet.sessionId, JSON.stringify(changeSet), changeSet.status, changeSet.createdAt);
  }

  updateChangeSetStatus(changeSetId: string, status: ChangeSetStatus): void {
    const row = this.db
      .prepare('SELECT payload FROM change_sets WHERE id = ?')
      .get(changeSetId) as { payload: string } | undefined;

    if (!row) {
      return;
    }

    const payload = JSON.parse(row.payload) as CodeChangeSet;
    payload.status = status;

    this.db
      .prepare('UPDATE change_sets SET status = ?, payload = ? WHERE id = ?')
      .run(status, JSON.stringify(payload), changeSetId);
  }

  listPendingChangeSets(sessionId: string): CodeChangeSet[] {
    const rows = this.db
      .prepare(
        `SELECT payload
         FROM change_sets
         WHERE session_id = ? AND status = 'pending'
         ORDER BY created_at DESC`
      )
      .all(sessionId) as Array<{ payload: string }>;

    return rows.map((row) => JSON.parse(row.payload) as CodeChangeSet);
  }

  saveCommandRun(runId: string, sessionId: string, payload: unknown): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO command_runs (id, session_id, payload, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(runId, sessionId, JSON.stringify(payload), new Date().toISOString());
  }

  saveCommandOutput(sessionId: string, event: CommandOutputEvent): void {
    this.db
      .prepare(
        `INSERT INTO command_outputs (run_id, session_id, payload, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(event.runId, sessionId, JSON.stringify(event), event.timestamp);
  }

  loadSession(sessionId: string): PersistedSession {
    return {
      sessionId,
      messages: this.listMessages(sessionId),
      pendingChangeSets: this.listPendingChangeSets(sessionId)
    };
  }

  close(): void {
    this.db.close();
  }

  safeCall<T>(callback: () => T): T {
    try {
      return callback();
    } catch (error) {
      throw toAppError(error, 'DATABASE_ERROR');
    }
  }
}
