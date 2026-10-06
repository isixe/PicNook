# PicNook

A free, privacy-first online image toolbox. Crop, recolor, resize, add canvas margins, and inspect or clean metadata — all processed locally in your browser, so your images never leave your device.

## Features

- **Color Variants** — generate a set of color schemes and duotone presets from one image, compare them, and export individually or as a ZIP.
- **Color Overlay** — blend any color over the image with 16 blend modes plus brightness, contrast, and gamma levels.
- **Crop** — crop by aspect ratio or a custom width and height with a draggable live preview, exported at the original resolution.
- **Proportional Scale** — resize by percentage or exact target pixels while locking the original aspect ratio.
- **Canvas Margin** — place the image on a solid or transparent background, scale it to control whitespace, and round the corners.
- **Metadata Inspector** — read basic info and full EXIF (camera, lens, exposure, GPS, dates) for several images at once, and clear GPS and camera data to download cleaned copies.

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
