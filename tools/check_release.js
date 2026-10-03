"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const tower = path.join(root, "assets/js/game/tower");
const config = fs.readFileSync(path.join(tower, "config.js"), "utf8");
const version = config.match(/var VERSION = "(v\d+\.\d+)"/)[1];
const revision = Number((config.match(/var REVISION = (\d+)/) || [0, 0])[1]);
const current = (revision ? "patches/" : "versions/") + version + (revision ? "-r" + revision : "");
const engineFiles = ["config", "grid", "enemies", "towers", "engine", "render"].map(name => name + ".js");
if (!fs.existsSync(path.join(tower, current, "manifest.json"))) throw new Error("Current frozen version missing");
if (!fs.readFileSync(path.join(root, "api.php"), "utf8").includes("const TD_CURRENT_VERSION = '" + version + "'")) throw new Error("API version mismatch");
if (revision && !fs.readFileSync(path.join(root, "api.php"), "utf8").includes("const TD_CURRENT_REVISION = " + revision + ";")) throw new Error("API revision mismatch");
const dirs = fs.readdirSync(path.join(tower, "versions")).map(dir => "versions/" + dir);
if (fs.existsSync(path.join(tower, "patches"))) dirs.push(...fs.readdirSync(path.join(tower, "patches")).map(dir => "patches/" + dir));
for (const dir of dirs) {
  const manifest = JSON.parse(fs.readFileSync(path.join(tower, dir, "manifest.json")));
  const expected = (manifest.revision ? "patches/" : "versions/") + manifest.version + (manifest.revision ? "-r" + manifest.revision : "");
  if (expected !== dir || engineFiles.some(file => !manifest.files[file]) || Object.keys(manifest.files).length !== engineFiles.length) throw new Error("Incomplete frozen manifest: " + dir);
  for (const [file, hash] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(tower, dir, file));
    if (crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase() !== hash) throw new Error("Frozen file changed: " + dir + "/" + file);
    if (dir === current && !bytes.equals(fs.readFileSync(path.join(tower, file)))) throw new Error("Current engine differs from frozen version");
  }
}
const html = fs.readFileSync(path.join(root, "tower.html"), "utf8");
for (const file of engineFiles) {
  if (!html.includes('src="assets/js/game/tower/' + current + '/' + file + '"')) throw new Error("HTML version mismatch: " + file);
}
console.log("Release validated: " + version);
