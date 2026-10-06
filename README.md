# PicNook

A free, privacy-first online image toolbox. Crop, recolor, resize, add canvas margins, and inspect or clean metadata — all processed locally in your browser, so your images never leave your device.

## Features

- **Privacy Protected** — 100% client-side. Images are handled with the Canvas API and never uploaded to a server.
- **Six Focused Tools** — color variants, color overlay, crop, proportional scale, canvas margin, and image info.
- **Metadata Viewer & Privacy Cleaner** — read EXIF (camera, lens, GPS, dates…) for many images at once, then strip GPS and device data and download cleaned copies in one click.
- **Batch-Friendly** — drop multiple images for color variants and image info, and download the whole result set as a ZIP.
- **Bilingual Interface** — 简体中文 (default) and English, switchable at runtime and remembered locally.
- **Favorites & Quick Search** — star the tools you use most and filter the list with a `Ctrl + K` search box.
- **Drag & Drop Support** — add images through drag-and-drop or the file picker.
- **No Uploads, No Accounts** — nothing is stored server-side; the workspace resets on refresh.

## Tools

| Category        | Tool                 | Route                   | Description                                                                                                     |
| --------------- | -------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Color           | Image Color Variants | `/tools/color-variants` | Generate many color and duotone presets from one image; compare thumbnails and download one or all.             |
| Color           | Image Color Overlay  | `/tools/color-overlay`  | Overlay any color with a blend mode plus brightness / contrast / gamma levels (e.g. `#fff` to brighten).        |
| Crop & Canvas   | Image Crop           | `/tools/crop`           | Crop by aspect ratio or custom size, drag for a live preview, export at original resolution.                    |
| Crop & Canvas   | Proportional Scale   | `/tools/scale`          | Resize while keeping the original aspect ratio — step by percent or type target pixels.                         |
| Crop & Canvas   | Canvas Margin        | `/tools/canvas-margin`  | Set a custom or transparent background, scale the image to control whitespace, and export with rounded corners. |
| Info & Metadata | Image Info           | `/tools/image-info`     | View basic info and EXIF metadata for multiple images, and strip privacy data like GPS and camera info.         |

## Installation

### Prerequisites

- Node.js 22.12 or newer (required by Astro 7)
- pnpm

### Clone the Repository

```bash
git clone https://github.com/isixe/PicNook.git
cd PicNook
```

### Install Dependencies

```bash
pnpm install
```

### Start the Development Server

```bash
pnpm dev
```

The application will be available at `http://localhost:4321`.

## Build for Production

```bash
pnpm build
```

The production build is output to `./dist/`. Preview it locally with:

```bash
pnpm preview
```

## Project Structure

```
PicNook/
├── public/                     # Static assets (favicon)
├── src/
│   ├── components/
│   │   ├── home/               # Home grid and tool cards
│   │   ├── layout/             # App shell: Sidebar, Topbar, tool page header
│   │   ├── tools/              # One folder per tool + shared ImageDropzone
│   │   └── ui/                 # shadcn-style primitives (Button, Card, …)
│   ├── i18n/                   # vue-i18n setup and locales/ (zh-CN, en)
│   ├── layouts/                # BaseLayout.astro
│   ├── lib/                    # tool-registry, canvas/image helpers, downloads
│   ├── pages/                  # Astro entry points (index + one per tool)
│   ├── plugins/                # vue-app entrypoint (Pinia, i18n, router)
│   ├── router/                 # Vue Router configuration
│   ├── stores/                 # Pinia stores (ui, favorites)
│   ├── styles/                 # Global styles and Tailwind theme tokens
│   ├── App.vue                 # Root layout (Sidebar + Topbar + RouterView)
│   └── env.d.ts
├── astro.config.mjs            # Astro + Vue integration
├── eslint.config.js            # ESLint flat config
├── tailwind.config.mjs         # Tailwind theme and design tokens
├── tsconfig.json               # TypeScript config (`@/*` -> `src/*`)
└── package.json
```

### Architecture Notes

The whole UI is a single Vue island. `src/pages/index.astro` renders `<AppShell client:only="vue" />`, and `AppShell` wraps `App.vue` (Sidebar + Topbar + `RouterView`). The extra Astro pages under `src/pages/tools/*.astro` exist only so the static build emits an HTML entry per route; in-app navigation is owned entirely by Vue Router.

To add a tool, update all of these:

1. Register it in `src/lib/tool-registry.ts` (slug, path, category, icon, i18n keys).
2. Add the route in `src/router/index.ts`.
3. Create the component under `src/components/tools/<slug>/`.
4. Add a matching `src/pages/tools/<slug>.astro` entry.
5. Add the title/description (and any UI strings) to **both** `src/i18n/locales/zh-CN.json` and `en.json`.

All user-facing text goes through vue-i18n; keep the two locale files in sync. `zh-CN` is the default and fallback locale.

## Supported Image Formats

- **Input:** any format your browser can decode (PNG, JPG / JPEG, WebP, GIF, AVIF, …).
- **Output:** PNG (Canvas export), plus ZIP for batch downloads.

> The Image Info tool's "clear privacy info" action re-draws pixels, which removes **all** metadata, not just GPS and camera fields.

## Commands

| Command             | Action                                    |
| ------------------- | ----------------------------------------- |
| `pnpm dev`          | Start the dev server at `localhost:4321`  |
| `pnpm build`        | Build the production site to `./dist/`    |
| `pnpm preview`      | Preview the production build              |
| `pnpm typecheck`    | Run `vue-tsc --noEmit` then `astro check` |
| `pnpm lint`         | Lint the project with ESLint              |
| `pnpm format`       | Format the project with Prettier          |
| `pnpm format:check` | Check formatting without writing changes  |

## License

This project is licensed under the [MIT](LICENSE) License.
