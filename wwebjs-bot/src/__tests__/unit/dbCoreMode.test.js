"use strict";

const LEGACY_DB_MSG = /DATABASE_URL|legacy/i;

function loadDbWithEnv(envPatch) {
  const keys = ["DATABASE_URL", "USE_CORE_API", "SKIP_MIGRATIONS", "USE_ENV_FILE"];
  const saved = {};
  for (const key of keys) {
    saved[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(envPatch)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  process.env.USE_ENV_FILE = "false";

  let db;
  jest.isolateModules(() => {
    db = require("../../db/index");
  });

  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return db;
}

describe("createCoreModeStub", () => {
  let createCoreModeStub;

  beforeAll(() => {
    ({ createCoreModeStub } = require("../../db/coreModeStub"));
  });

  it("exports adapter with type stub", () => {
    const stub = createCoreModeStub();
    expect(stub.adapter.type).toBe("stub");
  });

  it("close() resolves without error", async () => {
    const stub = createCoreModeStub();
    await expect(stub.close()).resolves.toBeUndefined();
    await expect(stub.adapter.close()).resolves.toBeUndefined();
  });

  it("createDelivery() rejects with legacy/DATABASE_URL message", async () => {
    const stub = createCoreModeStub();
    await expect(stub.createDelivery({})).rejects.toThrow(LEGACY_DB_MSG);
  });

  it("findDeliveryByMessageId() rejects with legacy/DATABASE_URL message", async () => {
    const stub = createCoreModeStub();
    await expect(stub.findDeliveryByMessageId("msg-1")).rejects.toThrow(
      LEGACY_DB_MSG
    );
  });
});

describe("db/index load behavior", () => {
  let exitSpy;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
    jest.resetModules();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    jest.resetModules();
  });

  it("USE_CORE_API=true without DATABASE_URL does not exit and exports stub", () => {
    const db = loadDbWithEnv({
      USE_CORE_API: "true",
      DATABASE_URL: undefined,
    });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(db.adapter.type).toBe("stub");
  });

  it("USE_CORE_API=false without DATABASE_URL calls process.exit(1)", () => {
    loadDbWithEnv({
      USE_CORE_API: "false",
      DATABASE_URL: undefined,
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("DATABASE_URL set exports postgres adapter (mocked pool)", () => {
    jest.doMock("../../db/postgres", () => ({
      createPostgresPool: jest.fn(() => ({})),
    }));
    jest.doMock("../../db/postgres-queries", () => () => ({
      query: jest.fn(),
      close: jest.fn(),
      getRawDb: jest.fn(() => ({})),
      insertDelivery: jest.fn(),
    }));
    jest.doMock("../../../db/migrate", () => ({
      runMigrations: jest.fn(),
    }));

    let db;
    jest.isolateModules(() => {
      process.env.USE_ENV_FILE = "false";
      process.env.DATABASE_URL =
        "postgresql://user:pass@localhost:5432/testdb";
      process.env.USE_CORE_API = "true";
      process.env.SKIP_MIGRATIONS = "true";
      db = require("../../db/index");
    });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(db.adapter.type).toBe("postgres");

    jest.dontMock("../../db/postgres");
    jest.dontMock("../../db/postgres-queries");
    jest.dontMock("../../../db/migrate");
  });
});
