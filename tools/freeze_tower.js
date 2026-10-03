"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const base = path.resolve(__dirname, "../assets/js/game/tower");
const config = fs.readFileSync(path.join(base, "config.js"), "utf8");
const version = config.match(/var VERSION = "(v\d+\.\d+)"/)[1];
const revision = Number((config.match(/var REVISION = (\d+)/) || [0, 0])[1]);
const dir = path.join(base, revision ? "patches" : "versions", version + (revision ? "-r" + revision : ""));
if (fs.existsSync(dir)) throw new Error("Frozen version already exists: " + version);
const manifest = { version, frozenAt: new Date().toISOString().slice(0, 10), files: {} };
if (revision) manifest.revision = revision;
fs.mkdirSync(dir, { recursive: true });
for (const name of ["config", "grid", "enemies", "towers", "engine", "render"]) {
  const file = name + ".js", bytes = fs.readFileSync(path.join(base, file));
  fs.writeFileSync(path.join(dir, file), bytes);
  manifest.files[file] = crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}
fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Frozen " + version);
