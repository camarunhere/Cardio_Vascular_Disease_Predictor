// Copies all data from the local MongoDB (data/mongo, port 27017) to a target
// MongoDB — typically your Atlas cluster. Safe to re-run: documents are
// upserted by _id, so existing records are updated rather than duplicated.
//
// Usage:
//   npm run migrate:atlas -- "mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net"
//   (or set MONGODB_URI in server/.env and run: npm run migrate:atlas)
//
// The local app must have been started at least once so the local DB exists.
// Note: the local mongod must be running (start the app, or it will be
// unreachable) — the script tells you if it can't connect.
import mongoose from "mongoose";

const SOURCE_URI = process.env.MIGRATE_SOURCE_URI || "mongodb://127.0.0.1:27017";
const TARGET_URI = process.argv[2] || process.env.MONGODB_URI;
const DB_NAME = "cvd";

if (!TARGET_URI) {
  console.error(
    "No target MongoDB URI.\n" +
    "  npm run migrate:atlas -- \"mongodb+srv://user:pass@cluster.xxxxx.mongodb.net\"\n" +
    "  (or set MONGODB_URI in server/.env)"
  );
  process.exit(1);
}
if (TARGET_URI.includes("<user>") || TARGET_URI.includes("<password>")) {
  console.error("Replace <user> and <password> in the connection string with your Atlas credentials.");
  process.exit(1);
}

const src = mongoose.createConnection(SOURCE_URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 5000 });
const dst = mongoose.createConnection(TARGET_URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 20000 });

try {
  await src.asPromise().catch(() => {
    throw new Error(
      `Could not reach the local MongoDB at ${SOURCE_URI}. Start the app first ('npm start' in another terminal) so the local DB is running, then re-run this script.`
    );
  });
  await dst.asPromise().catch((e) => {
    throw new Error(
      `Could not connect to the target MongoDB: ${e.message}\n` +
      "Check the connection string, and that your IP is allowed in Atlas → Network Access."
    );
  });

  const collections = (await src.db.listCollections().toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith("system."));

  console.log(`Migrating ${collections.length} collections from local → target…\n`);
  let totalDocs = 0;

  for (const name of collections) {
    const docs = await src.db.collection(name).find({}).toArray();
    if (!docs.length) {
      console.log(`  ${name.padEnd(26)} 0 documents (skipped)`);
      continue;
    }
    const ops = docs.map((d) => ({
      replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true },
    }));
    const res = await dst.db.collection(name).bulkWrite(ops, { ordered: false });
    totalDocs += docs.length;
    console.log(`  ${name.padEnd(26)} ${docs.length} documents (${res.upsertedCount} new, ${res.modifiedCount} updated)`);
  }

  console.log(`\nDone — ${totalDocs} documents migrated to '${DB_NAME}' on the target cluster.`);
  console.log("Now put the same connection string in server/.env as MONGODB_URI and restart the app.");
} catch (err) {
  console.error(`\nMigration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await src.close().catch(() => {});
  await dst.close().catch(() => {});
}
