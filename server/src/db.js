// MongoDB connection. Uses MONGODB_URI when provided (real MongoDB / Atlas);
// otherwise starts a local mongod via mongodb-memory-server with persistent
// storage under data/mongo so data survives restarts.
import { mkdirSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const LOCAL_URI = "mongodb://127.0.0.1:27017";

async function tryConnect(uri, timeoutMs = 3000) {
  await mongoose.connect(uri, { dbName: "cvd", serverSelectionTimeoutMS: timeoutMs });
}

export async function connectDb() {
  const envUri = process.env.MONGODB_URI;
  if (envUri) {
    await tryConnect(envUri, 15000);
    console.log("[db] Connected to MongoDB (MONGODB_URI)");
    return;
  }

  // If a previous run's mongod is still alive on 27017 (it serves the same
  // persistent data directory), just reuse it instead of failing with
  // "port already in use".
  try {
    await tryConnect(LOCAL_URI);
    console.log("[db] Reusing MongoDB already running on 27017");
    return;
  } catch { /* nothing running — start our own */ }

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const dbPath = path.resolve(process.cwd(), "..", "data", "mongo");
  mkdirSync(dbPath, { recursive: true });

  let mongod;
  try {
    mongod = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: "wiredTiger", port: 27017, launchTimeout: 120000 },
    });
  } catch {
    // Port race (another process grabbed 27017 between our check and launch):
    // retry once on a random free port — data still lives in the same dbPath.
    console.warn("[db] Port 27017 unavailable — starting MongoDB on a random port.");
    mongod = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: "wiredTiger", launchTimeout: 120000 },
    });
  }

  await tryConnect(mongod.getUri(), 15000);
  console.log(`[db] Local MongoDB started (persistent at ${dbPath})`);
}
