const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const pkgRoot = path.resolve(__dirname, "..");
const homeDir = os.homedir();

const soundDestDir = path.join(homeDir, ".pi", "agent", "sound");
const basicDestDir = path.join(soundDestDir, "Basic");
const skillDestDir = path.join(homeDir, ".pi", "agent", "skills", "sound-notify-custom");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[pi-sound-notify-custom] Created directory: ${dir}`);
  }
}

function copyIfMissing(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
    console.log(`[pi-sound-notify-custom] Copied: ${path.relative(pkgRoot, src)} → ${dest}`);
  }
}

function copyDirIfMissing(srcDir, destDir) {
  ensureDir(destDir);
  const items = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const item of items) {
    const srcPath = path.join(srcDir, item.name);
    const destPath = path.join(destDir, item.name);
    if (item.isDirectory()) {
      copyDirIfMissing(srcPath, destPath);
    } else {
      copyIfMissing(srcPath, destPath);
    }
  }
}

// ─── 1. Copiar sonidos ───────────────────────────────────────────────────────

const soundSrcDir = path.join(pkgRoot, "sound");
if (fs.existsSync(soundSrcDir)) {
  ensureDir(soundDestDir);

  // Copiar sounds.json destino raíz de ~/.pi/agent/sound/
  const soundsJsonSrc = path.join(soundSrcDir, "sounds.json");
  const soundsJsonDest = path.join(soundDestDir, "sounds.json");
  if (fs.existsSync(soundsJsonSrc)) {
    copyIfMissing(soundsJsonSrc, soundsJsonDest);
  }

  // Copiar carpeta Basic/ completa
  const basicSrcDir = path.join(soundSrcDir, "Basic");
  if (fs.existsSync(basicSrcDir)) {
    copyDirIfMissing(basicSrcDir, basicDestDir);
  }
}

// ─── 2. Fallback: garantizar skill ───────────────────────────────────────────

const skillSrcDir = path.join(pkgRoot, "skills");
const skillMdSrc = path.join(skillSrcDir, "SKILL.md");
if (fs.existsSync(skillMdSrc)) {
  ensureDir(skillDestDir);
  const skillMdDest = path.join(skillDestDir, "SKILL.md");
  copyIfMissing(skillMdSrc, skillMdDest);
}

console.log("[pi-sound-notify-custom] Postinstall complete.");
