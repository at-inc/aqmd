/**
 * db.ts - Cross-runtime SQLite compatibility layer
 *
 * Provides a unified Database export that works under both Bun (bun:sqlite)
 * and Node.js (node:sqlite). The APIs are nearly identical — the main
 * difference is the import path.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const isBun = "Bun" in globalThis;

const isMacOS = process.platform === "darwin";
const moduleDir = dirname(fileURLToPath(import.meta.url));
const vendoredSQLiteRelativePath = "../vendor/macos/libsqlite3.dylib";

let _Database: any;
let _sqliteVecLoad: (db: any) => void;
let _openDatabase: (path: string) => Database;

function getVendoredSQLitePath(): string | null {
  const override = process.env.AQMD_VENDORED_SQLITE_PATH;
  if (override && existsSync(override)) return override;
  const candidate = resolve(moduleDir, vendoredSQLiteRelativePath);
  return existsSync(candidate) ? candidate : null;
}

function prepareMacOSSQLiteRuntime(): string | null {
  if (!isMacOS) return null;
  const vendoredPath = getVendoredSQLitePath();
  if (!vendoredPath) return null;
  const vendoredDir = dirname(vendoredPath);
  process.env.AQMD_VENDORED_SQLITE_PATH = vendoredPath;
  for (const key of ["DYLD_LIBRARY_PATH", "DYLD_FALLBACK_LIBRARY_PATH"]) {
    const current = process.env[key];
    const parts = current ? current.split(":").filter(Boolean) : [];
    if (!parts.includes(vendoredDir)) {
      process.env[key] = parts.length > 0 ? `${vendoredDir}:${parts.join(":")}` : vendoredDir;
    }
  }
  return vendoredPath;
}

if (isBun) {
  // Dynamic string prevents tsc from resolving bun:sqlite on Node.js builds
  const bunSqlite = "bun:" + "sqlite";
  _Database = (await import(/* @vite-ignore */ bunSqlite)).Database;
  _openDatabase = (path: string) => new _Database(path) as Database;
  const vendoredSQLitePath = prepareMacOSSQLiteRuntime();
  if (vendoredSQLitePath && typeof _Database.setCustomSQLite === "function") {
    _Database.setCustomSQLite(vendoredSQLitePath);
  }
  const { getLoadablePath } = await import("sqlite-vec");
  _sqliteVecLoad = (db: any) => db.loadExtension(getLoadablePath());
} else {
  prepareMacOSSQLiteRuntime();
  _Database = (await import("node:sqlite")).DatabaseSync;
  _openDatabase = (path: string) => new _Database(path, { allowExtension: true }) as Database;
  const sqliteVec = await import("sqlite-vec");
  _sqliteVecLoad = (db: any) => sqliteVec.load(db);
}

/**
 * Open a SQLite database. Works with both bun:sqlite and node:sqlite.
 */
export function openDatabase(path: string): Database {
  return _openDatabase(path);
}

/**
 * Common subset of the Database interface used throughout QMD.
 */
export interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  loadExtension(path: string): void;
  close(): void;
}

export interface Statement {
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

/**
 * Load the sqlite-vec extension into a database.
 */
export function loadSqliteVec(db: Database): void {
  _sqliteVecLoad(db);
}
