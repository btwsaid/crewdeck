import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AccountRegistration } from "./contracts";
import { isRecord } from "./safety";

const ALIAS = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,39}$/u;
const SOURCE_ID = /^(?:claude|codex):[a-z][a-z0-9_-]{1,30}:····[a-f0-9]{4}$/u;

export function validateRegistration(value: unknown): AccountRegistration {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !["alias", "sourceId"].includes(key))
  ) {
    throw new Error("registration must contain only alias and sourceId");
  }
  if (typeof value.alias !== "string" || !ALIAS.test(value.alias.trim())) {
    throw new Error(
      "alias must be 1–40 letters, numbers, spaces, dots, underscores, or hyphens",
    );
  }
  if (typeof value.sourceId !== "string" || !SOURCE_ID.test(value.sourceId)) {
    throw new Error(
      "sourceId must be a masked Claude or Codex profile identifier",
    );
  }
  return { alias: value.alias.trim(), sourceId: value.sourceId };
}

export function providerFromSourceId(sourceId: string): "claude" | "codex" {
  return sourceId.startsWith("claude:") ? "claude" : "codex";
}

export class AccountRegistry {
  constructor(private readonly file: string) {}

  async list(): Promise<AccountRegistration[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if (isRecord(error) && error.code === "ENOENT") return [];
      throw new Error("account registry is unavailable");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("account registry is malformed");
    }
    if (!Array.isArray(parsed))
      throw new Error("account registry is malformed");
    const accounts = parsed.map(validateRegistration);
    if (
      new Set(accounts.map((account) => account.alias.toLocaleLowerCase()))
        .size !== accounts.length
    ) {
      throw new Error("account aliases must be unique");
    }
    if (
      new Set(accounts.map((account) => account.sourceId)).size !==
      accounts.length
    ) {
      throw new Error("account source identifiers must be unique");
    }
    return accounts;
  }

  async register(value: unknown): Promise<AccountRegistration[]> {
    const next = validateRegistration(value);
    const accounts = await this.list();
    if (
      accounts.some(
        (account) =>
          account.alias.toLocaleLowerCase() === next.alias.toLocaleLowerCase(),
      )
    ) {
      throw new Error("alias is already registered");
    }
    if (accounts.some((account) => account.sourceId === next.sourceId)) {
      throw new Error("profile is already registered");
    }
    accounts.push(next);
    await this.persist(accounts);
    return accounts;
  }

  async renameAlias(
    sourceId: string,
    alias: unknown,
  ): Promise<AccountRegistration[]> {
    const accounts = await this.list();
    const found = accounts.find((account) => account.sourceId === sourceId);
    if (!found) throw new Error("account registration not found");
    const next = validateRegistration({ sourceId, alias });
    if (
      accounts.some(
        (account) =>
          account !== found &&
          account.alias.toLocaleLowerCase() === next.alias.toLocaleLowerCase(),
      )
    ) {
      throw new Error("alias is already registered");
    }
    found.alias = next.alias;
    await this.persist(accounts);
    return accounts;
  }

  async disconnect(sourceId: string): Promise<AccountRegistration[]> {
    if (!SOURCE_ID.test(sourceId))
      throw new Error("invalid masked source identifier");
    const accounts = await this.list();
    const next = accounts.filter((account) => account.sourceId !== sourceId);
    if (next.length === accounts.length)
      throw new Error("account registration not found");
    await this.persist(next);
    return next;
  }

  private async persist(accounts: AccountRegistration[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(accounts, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, this.file);
  }
}
