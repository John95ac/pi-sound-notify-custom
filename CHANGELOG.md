# Changelog

## [1.0.0] - 2026-05-21

### Added
- Cross-platform audio playback: Windows (PowerShell SoundPlayer), Linux (aplay/paplay), macOS (afplay)
- Album system with subfolder support (`album/sound.wav`)
- Interactive album selector (`/sound-album-select`)
- Album banner toggle (`/sound-hub-banner`)
- Plugin enable/disable toggle (`/sound-config`)
- Interactive sound player (`/sound-play`)
- Auto-reload config via `fs.watchFile` on `sounds.json`
- 29 Pi events supported
- 4 sound modes: single, random, sequential, disabled
- Metadata fields: `creator`, `album`, `album_emoji`, `album_visible`
- Postinstall script for automatic setup
- SKILL.md v3.0.0 documentation

### Changed
- Renamed from `pi-audio-notify-custom` to `pi-sound-notify-custom`
- `/sound-config` simplified to Enable/Disable toggle
- `/sound-list` removed (replaced by `/sound-play` interactive selector)
- `tool_execution_end` → `tool_execution_error` (correct event name)

### Fixed
- Album detection uses `json.album` field
- Stale config after `selectAlbum()` — now reloads from disk
- Fall-through bug in `/sound-album-select` interactive selector
