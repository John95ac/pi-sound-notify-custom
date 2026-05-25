import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";

// ─── Paths ────────────────────────────────────────────────────────────────────

function getSoundDir(): string {
	return path.join(os.homedir(), ".pi", "agent", "sound");
}

function getSoundConfigPath(): string {
	return path.join(getSoundDir(), "sounds.json");
}

// ─── Config ───────────────────────────────────────────────────────────────────

interface EventSoundConfig {
	mode: "disabled" | "single" | "random" | "sequential";
	sounds: string[];
}

interface SoundConfig {
	enabled: boolean;
	creator?: string;
	album?: string;
	album_emoji?: string;
	album_visible?: boolean;
	events: Record<string, EventSoundConfig>;
}

function loadConfig(): SoundConfig {
	const configPath = getSoundConfigPath();
	if (!fs.existsSync(configPath)) {
		return { enabled: true, events: {} };
	}
	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(raw);

		// Migrate old flat format: { "sounds": { "complete": "file.wav" } }
		if (!parsed.events && parsed.sounds && typeof parsed.sounds === "object") {
			const migrated: SoundConfig = { enabled: parsed.enabled ?? true, events: {} };
			for (const [key, value] of Object.entries(parsed.sounds as Record<string, string>)) {
				migrated.events[key] = { mode: "single", sounds: [value] };
			}
			return migrated;
		}

		return parsed as SoundConfig;
	} catch {
		return { enabled: true, events: {} };
	}
}

function listSoundFiles(): string[] {
	const soundDir = getSoundDir();
	if (!fs.existsSync(soundDir)) return [];
	return fs.readdirSync(soundDir).filter((f) => f.endsWith(".wav"));
}

function listSoundFilesRecursive(dir: string, prefix = ""): string[] {
	const results: string[] = [];
	if (!fs.existsSync(dir)) return results;
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isDirectory()) {
			results.push(`📁 ${prefix}${entry.name}/`);
			results.push(...listSoundFilesRecursive(path.join(dir, entry.name), prefix + entry.name + "/"));
		} else if (entry.name.endsWith(".wav")) {
			results.push(`  🎵 ${prefix}${entry.name}`);
		}
	}
	return results;
}

function listAlbums(): { name: string; path: string }[] {
	const soundDir = getSoundDir();
	if (!fs.existsSync(soundDir)) return [];
	const entries = fs.readdirSync(soundDir, { withFileTypes: true });
	return entries
		.filter((e) => e.isDirectory())
		.map((e) => ({
			name: e.name,
			path: path.join(soundDir, e.name),
		}))
		.filter((a) => fs.existsSync(path.join(a.path, `sounds-${a.name}.json`)));
}

function selectAlbum(albumName: string): { success: boolean; message: string } {
	const soundDir = getSoundDir();
	const albumDir = path.join(soundDir, albumName);
	const albumJson = path.join(albumDir, `sounds-${albumName}.json`);
	const masterJson = getSoundConfigPath();

	if (!fs.existsSync(albumDir)) {
		return { success: false, message: `Album directory not found: ${albumName}` };
	}
	if (!fs.existsSync(albumJson)) {
		return { success: false, message: `Album config not found: sounds-${albumName}.json` };
	}

	try {
		const raw = fs.readFileSync(albumJson, "utf-8");
		const parsed = JSON.parse(raw);
		fs.writeFileSync(masterJson, JSON.stringify(parsed, null, 2), "utf-8");
		return { success: true, message: `Loaded album '${albumName}' → sounds.json` };
	} catch {
		return { success: false, message: `Failed to parse album config: sounds-${albumName}.json` };
	}
}

// ─── Audio playback ───────────────────────────────────────────────────────────

function playSound(soundPath: string): void {
	const platform = process.platform;
	if (platform === "win32") {
		// Windows: PowerShell SoundPlayer
		const safePath = soundPath.replace(/'/g, "''");
		const logPath = path.join(getSoundDir(), "audio-error.log");
		const ps = spawn(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-WindowStyle", "Hidden",
				"-Command",
				`try { $p = New-Object System.Media.SoundPlayer '${safePath}'; $p.PlaySync() } catch { $_.Exception.Message | Out-File -Append -FilePath '${logPath.replace(/'/g, "''")}' }`,
			],
			{ stdio: "ignore", windowsHide: true }
		);
		ps.unref();
	} else if (platform === "linux") {
		// Linux/WSL: aplay (ALSA) or paplay (PulseAudio)
		const aplay = spawn("aplay", [soundPath], { stdio: "ignore" });
		aplay.on("error", () => {
			// Fallback to paplay
			spawn("paplay", [soundPath], { stdio: "ignore" }).unref();
		});
		aplay.unref();
	} else if (platform === "darwin") {
		// macOS: afplay
		spawn("afplay", [soundPath], { stdio: "ignore" }).unref();
	}
}

function getPlatformName(): string {
	const p = process.platform;
	if (p === "win32") return "Windows";
	if (p === "linux") return "Linux";
	if (p === "darwin") return "macOS";
	return p;
}

function playSoundFileRelative(fileName: string): void {
	const soundPath = path.join(getSoundDir(), fileName);
	if (!fs.existsSync(soundPath)) return;
	playSound(soundPath);
}

// ─── Sound picker ─────────────────────────────────────────────────────────────

function pickSound(
	eventConfig: EventSoundConfig,
	eventCounters: Map<string, number>
): string | null {
	if (eventConfig.mode === "disabled" || eventConfig.sounds.length === 0) return null;
	const sounds = eventConfig.sounds;
	if (sounds.length === 1 || eventConfig.mode === "single") return sounds[0];
	if (eventConfig.mode === "random") {
		const idx = Math.floor(Math.random() * sounds.length);
		return sounds[idx];
	}
	if (eventConfig.mode === "sequential") {
		const count = eventCounters.get(eventConfig.mode) || 0;
		eventCounters.set(eventConfig.mode, count + 1);
		return sounds[count % sounds.length];
	}
	return null;
}

// ─── All Pi events ───────────────────────────────────────────────────────────

const EVENT_NAMES = [
	"session_start",
	"agent_end",
	"tool_execution_error",
	"session_shutdown",
	"session_before_switch",
	"session_switch",
	"session_before_fork",
	"session_before_compact",
	"session_compact",
	"session_tree",
	"resources_discover",
	"input",
	"user_bash",
	"before_agent_start",
	"agent_start",
	"turn_start",
	"turn_end",
	"message_start",
	"message_update",
	"message_end",
	"context",
	"before_provider_request",
	"after_provider_response",
	"tool_call",
	"tool_result",
	"tool_execution_start",
	"tool_execution_update",
	"model_select",
	"thinking_level_select",
];

// ─── Active Album Detection ───────────────────────────────────────────────────

function detectActiveAlbum(): string | null {
	const soundDir = getSoundDir();
	if (!fs.existsSync(soundDir)) return null;
	
	const masterPath = path.join(soundDir, "sounds.json");
	if (!fs.existsSync(masterPath)) return null;
	
	let masterConfig: SoundConfig;
	try {
		masterConfig = JSON.parse(fs.readFileSync(masterPath, "utf-8"));
	} catch {
		return null;
	}
	
	return masterConfig.album || "Custom";
}

// ─── Extension entrypoint ─────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let config = loadConfig();
	const eventCounters = new Map<string, number>();

	fs.watchFile(getSoundConfigPath(), () => {
		config = loadConfig();
	});

	function handleEvent(eventName: string): void {
		if (!config.enabled) return;
		const eventConfig = config.events[eventName];
		if (!eventConfig) return;
		const soundFile = pickSound(eventConfig, eventCounters);
		if (soundFile) {
			playSoundFileRelative(soundFile);
		}
	}

	function updateAlbumStatus(ctx: any): void {
		if (config.album_visible === false) {
			ctx.ui.setStatus("audio-album", "");
			return;
		}
		const album = detectActiveAlbum();
		if (album) {
			const emoji = config.album_emoji || "🎵";
			ctx.ui.setStatus("audio-album", `\x1b[32m${emoji} ${album}\x1b[0m`);
		}
	}

	for (const eventName of EVENT_NAMES) {
		if (eventName === "tool_execution_error") {
			pi.on("tool_execution_end", async (event: any, _ctx: any) => {
				if (!event.isError) return;
				handleEvent("tool_execution_error");
			});
			continue;
		}
		if (eventName === "session_start") {
			pi.on("session_start", async (_event: any, ctx: any) => {
				handleEvent("session_start");
				updateAlbumStatus(ctx);
			});
			continue;
		}
		pi.on(eventName as any, async (_event: any, _ctx: any) => {
			handleEvent(eventName);
		});
	}

	// ── Tools ────────────────────────────────────────────────────────────────

	pi.registerTool({
		name: "sound_play",
		label: "Sound Play",
		description: "Play a .wav sound file from the sound directory. Supports subfolders.",
		parameters: Type.Object({
			file: Type.String({ description: "Sound filename, supports subfolders (e.g. 'folder/file.wav')" }),
		}),
		async execute(_toolCallId, params: { file: string }, _signal, _onUpdate) {
			const soundPath = path.join(getSoundDir(), params.file);
			if (!fs.existsSync(soundPath)) {
				return {
					content: [{ type: "text", text: `Sound file not found: ${params.file}` }],
					isError: true,
				};
			}
			playSound(soundPath);
			return {
				content: [{ type: "text", text: `Playing: ${params.file}` }],
			};
		},
	});

	pi.registerTool({
		name: "sound_list",
		label: "Sound List",
		description: "List all available .wav sound files in the sound directory.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate) {
			const files = listSoundFiles();
			return {
				content: [{ type: "text", text: files.length ? files.join("\n") : "No sound files found." }],
			};
		},
	});

	pi.registerTool({
		name: "sound_config",
		label: "Sound Config",
		description: "Show or update sounds configuration.",
		parameters: Type.Object({
			action: Type.Optional(Type.String({ description: "'show' or 'update'" })),
			event: Type.Optional(Type.String({ description: "Event name (e.g. 'session_start')" })),
			value: Type.Optional(Type.String({ description: "JSON string of {mode,sounds} or legacy filename" })),
		}),
		async execute(
			_toolCallId,
			params: { action?: string; event?: string; value?: string },
			_signal,
			_onUpdate,
		) {
			const configPath = getSoundConfigPath();

			if (params.action === "show" || (!params.action && !params.event)) {
				const current = loadConfig();
				return {
					content: [{ type: "text", text: JSON.stringify(current, null, 2) }],
				};
			}

			if (params.action === "update" && params.event && params.value !== undefined) {
				let parsedValue: EventSoundConfig;
				try {
					parsedValue = JSON.parse(params.value);
					if (!parsedValue.mode || !Array.isArray(parsedValue.sounds)) {
						throw new Error("Invalid format");
					}
				} catch {
					parsedValue = { mode: "single", sounds: [params.value] };
				}
				const current = loadConfig();
				current.events[params.event] = parsedValue;
				fs.writeFileSync(configPath, JSON.stringify(current, null, 2), "utf-8");
				try { config = loadConfig(); } catch {}
				return {
					content: [{ type: "text", text: `Updated ${params.event}: ${JSON.stringify(parsedValue)}` }],
				};
			}

			return {
				content: [
					{
						type: "text",
						text: "Usage: sound_config show | update <event> '{\"mode\":\"single|random|sequential|disabled\",\"sounds\":[\"file.wav\"]}'",
					},
				],
			};
		},
	});

	pi.registerTool({
		name: "sound_album_select",
		label: "Sound Album Select",
		description: "List or select a sound album. No args lists all albums, passing an album name selects it.",
		parameters: Type.Object({
			album: Type.Optional(Type.String({ description: "Album name to select (omit to list all)" })),
		}),
		async execute(_toolCallId, params: { album?: string }, _signal, _onUpdate) {
			if (!params.album) {
				const albums = listAlbums();
				if (!albums.length) {
					return {
						content: [{ type: "text", text: "No albums found. Albums are folders with a sounds-{name}.json file\." }],
						isError: true,
					};
				}
				const lines = albums.map((a, i) => `${i + 1}. ${a.name}`);
				return {
					content: [{ type: "text", text: `Available albums:\n${lines.join("\n")}` }],
				};
			}
			const result = selectAlbum(params.album);
			try { config = loadConfig(); } catch {}
			return {
				content: [{ type: "text", text: result.message }],
				isError: !result.success,
			};
		},
	});

	// ── Commands ─────────────────────────────────────────────────────────────
	pi.registerCommand("sound-play", {
		description: "List and Play any Sound: /sound-play [filename]",
		handler: async (args, ctx) => {
			const file = args.trim();
			if (file) {
				const soundPath = path.join(getSoundDir(), file);
				if (!fs.existsSync(soundPath)) {
					ctx.ui.notify(`File not found: ${file}`, "error");
					return;
				}
				playSound(soundPath);
				ctx.ui.notify(`Playing: ${file}`, "info");
				return;
			}

			const soundDir = getSoundDir();
			const options: string[] = [];
			const fileMap: Record<string, string> = {};

			function scan(dir: string, prefix: string) {
				if (!fs.existsSync(dir)) return;
				const entries = fs.readdirSync(dir, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isDirectory()) {
						scan(path.join(dir, entry.name), prefix + entry.name + "/");
					} else if (entry.name.endsWith(".wav")) {
						const display = prefix + entry.name;
						options.push(display);
						fileMap[display] = path.join(dir, entry.name);
					}
				}
			}
			scan(soundDir, "");

			if (!options.length) {
				ctx.ui.notify("No sounds found in sound directory.", "error");
				return;
			}

			while (true) {
				const selected = await ctx.ui.select("Select a sound to play (Enter = play, Esc = exit)", options);
				if (!selected) break;
				const soundPath = fileMap[selected];
				if (soundPath) {
					playSound(soundPath);
					ctx.ui.notify(`Playing: ${selected}`, "info");
				}
			}
		},
	});

	pi.registerCommand("sound-hub-banner", {
		description: "Toggle album banner visibility: /sound-hub-banner",
		handler: async (_args, ctx) => {
			const current = loadConfig();
			const selected = await ctx.ui.select("Album banner visibility", ["Show", "Hide"]);
			if (!selected) return;
			current.album_visible = selected === "Show";
			fs.writeFileSync(getSoundConfigPath(), JSON.stringify(current, null, 2), "utf-8");
			try { config = loadConfig(); } catch {}
			updateAlbumStatus(ctx);
			ctx.ui.notify(current.album_visible ? "Album banner visible" : "Album banner hidden", "info");
		},
	});

	pi.registerCommand("sound-config", {
		description: "Toggle sound plugin: /sound-config",
		handler: async (_args, ctx) => {
			ctx.ui.notify(`Current OS: ${getPlatformName()}`, "info");
			const current = loadConfig();
			const selected = await ctx.ui.select("Sound plugin state", ["Enable", "Disable"]);
			if (!selected) return;
			current.enabled = selected === "Enable";
			current.album_visible = selected === "Enable";
			fs.writeFileSync(getSoundConfigPath(), JSON.stringify(current, null, 2), "utf-8");
			try { config = loadConfig(); } catch {}
			updateAlbumStatus(ctx);
			ctx.ui.notify(current.enabled ? "Sound plugin enabled" : "Sound plugin disabled", "info");
		},
	});

	pi.registerCommand("sound-album-select", {
		description: "List albums or select one: /sound-album-select [album_name]",
		handler: async (args, ctx) => {
			const name = args.trim();
			if (!name) {
				const albums = listAlbums();
				if (!albums.length) {
					ctx.ui.notify("No albums found. Create folders with a sounds-{name}.json file.", "info");
					return;
				}
				const selected = await ctx.ui.select(
					"Select a sound album",
					albums.map((a) => a.name)
				);
				if (!selected) return;
				const result = selectAlbum(selected);
				try { config = loadConfig(); } catch {}
				// Play agent_end sound to confirm album selection
				const albumSoundDir = path.join(getSoundDir(), selected);
				try {
					const albumConfig = JSON.parse(fs.readFileSync(path.join(albumSoundDir, `sounds-${selected}.json`), "utf-8"));
					if (albumConfig.events?.agent_end?.mode !== "disabled" && albumConfig.events?.agent_end?.sounds?.length) {
						const agentEndFile = albumConfig.events.agent_end.sounds[0];
						const agentEndPath = path.join(albumSoundDir, agentEndFile);
						if (fs.existsSync(agentEndPath)) playSound(agentEndPath);
					}
				} catch {}
				ctx.ui.notify(result.message, result.success ? "info" : "error");
				updateAlbumStatus(ctx);
				return;
			}
			const result = selectAlbum(name);
			try { config = loadConfig(); } catch {}
			// Play agent_end sound to confirm album selection
			const albumSoundDir = path.join(getSoundDir(), name);
			try {
				const albumConfig = JSON.parse(fs.readFileSync(path.join(albumSoundDir, `sounds-${name}.json`), "utf-8"));
				if (albumConfig.events?.agent_end?.mode !== "disabled" && albumConfig.events?.agent_end?.sounds?.length) {
					const agentEndFile = albumConfig.events.agent_end.sounds[0];
					const agentEndPath = path.join(albumSoundDir, agentEndFile);
					if (fs.existsSync(agentEndPath)) playSound(agentEndPath);
				}
			} catch {}
			ctx.ui.notify(result.message, result.success ? "info" : "error");
			updateAlbumStatus(ctx);
		},
	});

	pi.registerCommand("sound-help", {
		description: "Show complete sound system help: /sound-help",
		handler: async (_args, ctx) => {
			const help = `🎵 Sound System Help

EVENTS (29 total)
Active by default:
  • session_start — plays when Pi session starts
  • agent_end — plays when I finish responding
  • tool_execution_error — plays only when a tool fails

Available but disabled:
  session_shutdown, session_before_switch, session_switch,
  session_before_fork, session_before_compact, session_compact,
  session_tree, resources_discover, input, user_bash,
  before_agent_start, agent_start, turn_start, turn_end,
  message_start, message_update, message_end, context,
  before_provider_request, after_provider_response,
  tool_call, tool_result, tool_execution_start,
  tool_execution_update, model_select, thinking_level_select

MODES
  single — always plays the first sound
  random — picks one randomly from the list
  sequential — rotates through the list in order
  disabled — silent, no sound plays

ALBUMS (subfolders)
Create folders inside ~/.pi/agent/sound/
Reference them as "folder/file.wav" in sounds.json

PLATFORM SUPPORT
  Windows — PowerShell SoundPlayer
  Linux   — aplay (ALSA) or paplay (PulseAudio)
  macOS   — afplay

COMMANDS
  /sound-play <file>         — test-play a specific sound file
  /sound-play                — interactive selector (Esc to cancel)
  /sound-hub-banner          — toggle album banner visibility
  /sound-config              — enable/disable the sound plugin
  /sound-album-select        — list available albums
  /sound-album-select <name> — switch to album config
  /sound-help                — show this message

ALBUMS
Create folders with a sounds-{name}.json file.
Example: mkdir ~/.pi/agent/sound/Metal
         cp sounds-Metal.json ~/.pi/agent/sound/Metal/
Use /sound-album-select to switch configs instantly.

FILE FORMAT
Only .wav files are accepted. No mp3, ogg, flac.

CONFIG FILE
~/.pi/agent/sound/sounds.json`;
			ctx.ui.notify(help, "info");
		},
	});
}
