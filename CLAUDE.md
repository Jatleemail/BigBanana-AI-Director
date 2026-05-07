# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BigBanana AI Director is an industrial AI motion comic/video production workbench — a single-page React 19 app that implements a "Script → Assets → Keyframes → Export" pipeline. It integrates with the AntSK API platform for AI model access (GPT, Gemini, Veo, Sora). All data is stored client-side in IndexedDB; there is no backend server.

## Commands

```bash
npm run dev              # Start Vite dev server on port 3000 (0.0.0.0)
npm run build            # Build for production (runs UTF-8 check first)
npm run check:utf8       # Run UTF-8 encoding check on source files
npm run preview          # Preview production build
npm run media-proxy      # Start standalone media proxy server (port 8787)
```

The dev server includes two built-in Vite plugins:
- **media-proxy** at `/api/media-proxy` — proxies media requests (images/videos) to bypass CORS
- **new-api-proxy** at `/api/new-api/*` — proxies authenticated requests to `api.antsk.cn` for the account center

## Architecture

### Routing & Page Structure

| Route | Component | Context |
|-------|-----------|---------|
| `/` | `Dashboard` | None |
| `/project/:projectId` | `ProjectOverview` | `ProjectProvider` |
| `/project/:projectId/characters` | `CharacterLibraryPage` | `ProjectProvider` |
| `/project/:projectId/episode/:episodeId` | `EpisodeWorkspace` | `ProjectProvider` |
| `/account` | `NewApiConsole` | None |

### Production Pipeline (5 Stages)

The core workflow is a linear pipeline managed by `EpisodeWorkspace` in [App.tsx](App.tsx). The current stage is stored as `currentEpisode.stage` and rendered via a switch in `renderStage()`:

1. **Script** ([components/StageScript/](components/StageScript/)) — Script parsing, scene breakdown, shot list generation, character extraction
2. **Assets** ([components/StageAssets/](components/StageAssets/)) — Character/scene/prop reference image generation with wardrobe variations and turnaround views
3. **Director** ([components/StageDirector/](components/StageDirector/)) — Shot-by-shot keyframe generation, nine-grid preview, camera movement guides, video generation (Veo/Sora)
4. **Export** ([components/StageExport/](components/StageExport/)) — Timeline visualization, render log tracking, master video export
5. **Prompts** ([components/StagePrompts/](components/StagePrompts/)) — Editable prompt templates for all stages (storyboard, keyframe, nine-grid, video)

Navigation between stages triggers an `isGenerating` guard — switching pages during active AI generation prompts a warning since in-flight generation state would be lost.

### State Management

- **ProjectContext** ([contexts/ProjectContext.tsx](contexts/ProjectContext.tsx)) — the central state manager. Wraps episode workspace and project-level pages. Provides CRUD for series, episodes, and asset libraries (characters, scenes, props). Handles asset-to-episode sync tracking.
- **ThemeContext** ([contexts/ThemeContext.tsx](contexts/ThemeContext.tsx)) — dark/light theme toggle persisted to `localStorage` key `bigbanana_theme`.
- Episodes auto-save to IndexedDB 1 second after the last change (debounced in `EpisodeWorkspace`).
- On app load, any in-flight generation states (`generating`, `generating_panels`, `generating_image`) from a previous session are cleared to `failed` — this prevents stuck loading states after a tab close.

### Data Storage

**IndexedDB** (`BigBananaDB`, version 3) with four object stores: `projects`, `assetLibrary`, `seriesProjects`, `series`, `episodes`. Implemented in [services/storageService.ts](services/storageService.ts).

The `ProjectState` type (in [types.ts](types.ts)) is the legacy flat project model. The newer data model uses `SeriesProject` → `Series` → `Episode` hierarchy, with separate `AssetLibraryItem` records for character/scene/prop libraries. Migration functions handle v2→v3 transitions.

### AI Service Layer

The AI service follows a **facade → sub-module** pattern:

- [services/aiService.ts](services/aiService.ts) — facade, re-exports everything from `services/ai/`
- [services/ai/apiCore.ts](services/ai/apiCore.ts) — base layer: API key management, HTTP calls with retry logic, JSON parsing helpers, media conversion utilities
- [services/ai/scriptService.ts](services/ai/scriptService.ts) — script parsing, storyboard generation, continuation/rewriting
- [services/ai/visualService.ts](services/ai/visualService.ts) — art direction, prompt generation, image generation, character turnarounds
- [services/ai/videoService.ts](services/ai/videoService.ts) — video generation (Veo sync + Sora async modes)
- [services/ai/shotService.ts](services/ai/shotService.ts) — keyframe optimization, action suggestions, shot splitting, nine-grid generation
- [services/ai/audioService.ts](services/ai/audioService.ts) — dubbing/audio generation
- [services/ai/promptConstants.ts](services/ai/promptConstants.ts) — visual style prompts, negative prompts

### Model Registry & Adapter System

[services/modelRegistry.ts](services/modelRegistry.ts) manages model definitions, providers, and active model selection, persisted to `localStorage` key `bigbanana_model_registry`.

[services/adapters/](services/adapters/) implements per-type API calls:
- `chatAdapter.ts` — OpenAI-compatible chat completions
- `imageAdapter.ts` — Gemini `generateContent` and OpenAI Images API
- `videoAdapter.ts` — sync (Veo via chat/completions) and async (Sora/Doubao via task polling)

Model types and defaults are defined in [types/model.ts](types/model.ts). Built-in providers: `antsk` (api.antsk.cn, default) and `volcengine` (ark.cn-beijing.volces.com).

### Key Types

The central domain types are in [types.ts](types.ts): `Character`, `Scene`, `Prop`, `Keyframe`, `VideoInterval`, `Shot`, `NineGridData`, `CharacterTurnaroundData`, `PromptTemplateConfig`, `SeriesProject`, `Series`, `Episode`, `ProjectState` (legacy).

Model-layer types are in [types/model.ts](types/model.ts): `ModelDefinition`, `ModelProvider`, `ActiveModels`, `ChatOptions`, `ImageGenerateOptions`, `VideoGenerateOptions`.

### Proxy Servers

Two Node.js servers in [server/](server/):
- `mediaProxyServer.mjs` — standalone CORS proxy for media URLs (production use via Docker)
- `newApiProxyCore.mjs` + `newApiProxyServer.mjs` — proxies authenticated API calls to the new-api account center, with session management

The Vite config embeds both as dev plugins so no separate server process is needed in development.

### Docker

Three Dockerfiles for multi-architecture deployment:
- `Dockerfile` — main app (Nginx serving built assets)
- `Dockerfile.media-proxy` — standalone media proxy
- `Dockerfile.new-api-proxy` — new-api proxy server

### Import Aliases

`@/` maps to the project root via `tsconfig.json` paths and Vite resolve alias.

## Key Conventions

- All image data is stored as base64 data URIs (`data:image/png;base64,...`) in IndexedDB
- Video data uses OPFS (Origin Private File System) for storage via [services/videoStorageService.ts](services/videoStorageService.ts)
- API key is stored as `antsk_api_key` in localStorage; missing key triggers model config modal automatically
- Components use CSS variables (e.g., `var(--bg-base)`, `var(--text-primary)`) for theming — these are defined by `data-theme` attribute on `<html>`
- Chinese is the primary UI language; code comments are a mix of Chinese and English
- The `isGenerating` flag pattern is used to prevent accidental navigation away from active AI operations
