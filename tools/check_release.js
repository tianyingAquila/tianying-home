"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const tower = path.join(root, "assets/js/game/tower");
const version = fs.readFileSync(path.join(tower, "config.js"), "utf8").match(/var VERSION = "(v\d+\.\d+)"/)[1];
const engineFiles = ["config", "grid", "enemies", "towers", "engine", "render"].map(name => name + ".js");
if (!fs.existsSync(path.join(tower, "versions", version, "manifest.json"))) throw new Error("Current frozen version missing");
if (!fs.readFileSync(path.join(root, "api.php"), "utf8").includes("const TD_CURRENT_VERSION = '" + version + "'")) throw new Error("API version mismatch");
for (const dir of fs.readdirSync(path.join(tower, "versions"))) {
  const manifest = JSON.parse(fs.readFileSync(path.join(tower, "versions", dir, "manifest.json")));
  if (manifest.version !== dir || engineFiles.some(file => !manifest.files[file]) || Object.keys(manifest.files).length !== engineFiles.length) throw new Error("Incomplete frozen manifest: " + dir);
  for (const [file, hash] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(tower, "versions", dir, file));
    if (crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase() !== hash) throw new Error("Frozen file changed: " + dir + "/" + file);
    if (dir === version && !bytes.equals(fs.readFileSync(path.join(tower, file)))) throw new Error("Current engine differs from frozen version");
  }
}
const html = fs.readFileSync(path.join(root, "tower.html"), "utf8");
for (const file of engineFiles) {
  if (!html.includes('src="assets/js/game/tower/versions/' + version + '/' + file + '"')) throw new Error("HTML version mismatch: " + file);
}
console.log("Release validated: " + version);
