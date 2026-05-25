---
skill: sound-notify-custom
version: 3.0.0
scope: project
read_only: false
limit: 32768
description: Complete guide for the pi-sound-notify-custom sound notification system for Pi
---

# Sound Notify Custom

Extension `pi-sound-notify-custom.ts` that plays `.wav` sounds for 29 Pi events with interactive album support, cross-platform sound playback, and real-time configuration.

---

## Zero Rule: WAV Only

> **The system ONLY accepts `.wav` files.**
> Any other format (mp3, ogg, flac) is silently ignored.
> If a user provides an .mp3, convert it first or ask for .wav.

---

## Important Paths

| Resource | Path |
|----------|------|
| Extension | `~/.pi/agent/extensions/pi-sound-notify-custom.ts` |
| Sound folder | `~/.pi/agent/sound/` |
| Master config | `~/.pi/agent/sound/sounds.json` |
| Albums | `~/.pi/agent/sound/{name}/` |
| Error log | `~/.pi/agent/sound/sound-error.log` |

---

## sounds.json Master Schema

```json
{
  "enabled": true,
  "creator": "YourName",
  "album": "Basic",
  "album_emoji": "🎵",
  "album_visible": true,
  "events": {
    "event_name": {
      "mode": "single|random|sequential|disabled",
      "sounds": ["Basic/file.wav", "Ylva/file.wav"]
    }
  }
}
```

### Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Master switch — false = entire plugin silent |
| `creator` | string? | Who created this config |
| `album` | string | Currently active album name |
| `album_emoji` | string | Emoji shown in status bar |
| `album_visible` | boolean | true = show album in status bar, false = hidden |

### Sound Modes

| Mode | Behavior |
|------|----------|
| `single` | Always plays the first sound in the list |
| `random` | Picks one randomly every time |
| `sequential` | Rotates in order (1,2,3,1,2,3...) |
| `disabled` | Complete silence — nothing plays |

---

## Active Events by Default

```json
{
  "session_start":        { "mode": "random",  "sounds": ["Basic/miau-PDA.wav", "Basic/finger-snap.wav"] },
  "agent_end":            { "mode": "single",  "sounds": ["Basic/ding-small-bell-sfx.wav"] },
  "tool_execution_error": { "mode": "single",  "sounds": ["Basic/robot_talk.wav"] }
}
```

**When they fire:**
- `session_start` → When Pi session starts or reloads
- `agent_end` → When the agent finishes responding
- `tool_execution_error` → Only when a tool fails (`isError === true`)

The other 26 events are `disabled` by default. Enable them by editing `sounds.json`.

---

## Albums

An album is a subfolder inside `~/.pi/agent/sound/` that contains `.wav` files and its own JSON:

```
sound/
  sounds.json                    ← master config (what the plugin reads)
  Basic/
    miau-PDA.wav
    ding-small-bell-sfx.wav
    sounds-Basic.json            ← album config
  Ylva/
    ylva-theme.wav
    sounds-Ylva.json             ← album config
```

### Album JSON naming
Always `sounds-{folder-name}.json`:
- `Basic/sounds-Basic.json`
- `Ylva/sounds-Ylva.json`

### Switching albums
```
/sound-album-select
```
Opens an interactive selector. The chosen album overwrites the **entire** master `sounds.json` including `creator`, `album`, `album_emoji`, `album_visible`, and `events`.

When you select an album, it **plays the album's `agent_end` sound** to confirm the switch.

### Status bar
Shows `🎵 Basic` (green) when `album_visible` is `true`. Hidden when `false`.

---

## Commands

| Command | Description |
|---------|-------------|
| `/sound-play [file.wav]` | Play a specific file, or open interactive selector if no arg |
| `/sound-hub-banner` | Toggle album banner Show/Hide in status bar |
| `/sound-config` | Enable or Disable the entire sound plugin (shows current OS) |
| `/sound-album-select` | Interactive album selector (plays confirm sound) |
| `/sound-album-select <name>` | Switch directly to named album |
| `/sound-help` | Show complete help |

### /sound-play (interactive mode)
Without arguments, opens a persistent selector:
- **↑/↓** Navigate sounds (listed as `AlbumName/file.wav`)
- **Enter** Play the selected sound
- **Esc** Exit the selector
- After playing, the selector **stays open** so you can keep testing sounds

### /sound-config
```
Current OS: Windows
Select: [Enable] [Disable]
```
Shows your operating system and lets you toggle the plugin. When disabled, both `enabled` and `album_visible` become `false`. When enabled, both become `true`.

---

## Cross-Platform Sound

The plugin auto-detects your OS:

| OS | Sound Method |
|----|-------------|
| Windows | PowerShell `System.Media.SoundPlayer` |
| Linux / WSL | `aplay` (ALSA) with fallback to `paplay` (PulseAudio) |
| macOS | `afplay` |

Everything else (JSON, file system, Pi API) is already cross-platform via Node.js.

---

## Auto-Reload

The plugin watches `sounds.json` with `fs.watchFile`. If you edit the file manually, changes reflect immediately without `/reload`.

---

## Working with Users

1. User says: "I want to add a sound"
2. Ask: Which event? (show the 29 options)
3. Check if the event already has sounds configured
4. If yes: Replace or append to the list?
5. Accept file path or drag-and-drop
6. Copy to `~/.pi/agent/sound/` (or subfolder for album)
7. Update `sounds.json` with the event, mode, and sound
8. Confirm by showing the modified JSON section

---

## Recommendations

- **Don't overwhelm:** Keep most events `disabled`. 29 simultaneous sounds is chaos.
- **Use albums:** Organize sounds into folders. `Basic` is the default starter album.
- **Debug:** If a `.wav` doesn't play, check `sound-error.log`.

---

*Last updated: 2026-05-20*
*Skill: sound-notify-custom v3.0.0*
