import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));

let db: DatabaseSync | undefined;

/**
 * Returns the process-wide SQLite connection, opening it and running
 * migrations on first call. ev-claw is a single Node process with one writer,
 * so a lazily-initialized singleton is sufficient — no connection pool needed.
 */
export function getDb(): DatabaseSync {
  if (db) return db;

  const dbPath = resolve(config.dbPath);
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  runMigrations(db);

  return db;
}

function runMigrations(database: DatabaseSync): void {
  // Migration files live next to this module in both dev (tsx runs src/ directly)
  // and prod (the build script copies *.sql into dist/db/migrations alongside
  // the compiled JS, since tsc doesn't copy non-TS assets on its own).
  const migrationPath = resolve(moduleDir, "migrations/0001_init.sql");
  if (!existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }
  const sql = readFileSync(migrationPath, "utf-8");
  database.exec(sql);
}

/** For tests: reset the singleton so a fresh getDb() call re-opens/re-migrates. */
export function resetDbForTests(): void {
  db?.close();
  db = undefined;
}
