<div align="center">

# 🐊 Crocodile Coding Harness

**Shared core + adapters untuk coding yang lebih aman di Command Code, OpenCode, dan DeepSeek Harness.**

*Crocodile bites bad diffs so your agent doesn't ship them.*
[![MIT](https://img.shields.io/badge/license-MIT-4c9)](LICENSE)
[![Node](https://img.shields.io/badge/node-22%2B%20%7C%2024%2B-3b82f6)](https://nodejs.org)
[![Command Code](https://img.shields.io/badge/commandcode-mod-8b5cf6)](https://commandcode.ai/docs)
[![OpenCode](https://img.shields.io/badge/opencode-plugin-38bdf8)](https://opencode.ai/docs/plugins/)
[![DeepSeek Harness](https://img.shields.io/badge/dsh-plugin-6366f1)](https://deepseek-harness.github.io/deepseek-harness/)

</div>

> **Kenapa repo ini ada?** Tiga harness — Command Code (`ModApi`), OpenCode (`@opencode/plugin`), dan DeepSeek Harness (`Cordis`) — punya API plugin yang benar-benar beda. Repo ini menulis logika coding guardrail **sekali** di `packages/core`, lalu me-expose-nya lewat 3 adapter tipis. Mau improve 1 fitur cukup edit core.

---

<details><summary><b>Daftar isi</b></summary>

- [Fitur](#fitur)
- [ Struktur Repo](#struktur-repo)
- [Install & pakai — Command Code](#1-command-code)
- [Install & pakai — OpenCode](#2-opencode)
- [Install & pakai — DeepSeek Harness (dsh)](#3-deepseek-harness-dsh)
- [Tools, commands, hooks, flags](#tools-commands-hooks-flags)
- [Development](#development)
- [Contributing](#contributing)
- [Keamanan](#keamanan)
- [Lisensi](#lisensi)

</details>

---

## Fitur

| Fitur | Deskripsi |
|:---|:---|
| **Dangerous-command guard** | Blok `--no-verify`, `rm -rf /`, `drop table`, `git push --force`, dll. Flag `strict=true` aktif secara default. |
| **Secret redaction** | Redaksi otomatis untuk `api_key=`, `Authorization: Bearer ...`, dan blok `-----BEGIN PRIVATE KEY-----`. |
| **`crocodile_diff_check`** | Tool read-only: cek file berubah, peringatan file tanpa test, dan batas `maxDiffLines`. |
| **`crocodile_repo_size`** | Tool read-only: jumlah tracked files (`git ls-files`). |
| **`/review`** | Command: review perubahan git untuk keamanan, correctness, dan missing tests. |
| **`/crocodile-status`** | Command: tampilkan `strict`, `verbose`, `cwd`. |
| **`#note`** | Transform input ` #note ` → `noted.`, dan `/review <path>` → prompt review. |
| **System-prompt tersuntik** | Aturan diff kecil & reviewable, tanpa destructive command, wajib test/typecheck/lint. |
| **Flag `DEPRECATED`** | Menandai hasil tool yang menyebut `DEPRECATED` agar agent mengangkatnya ke user. |
| **Idempotent & retriable** | Semua adapter me-return cleanup/disposable; tidak ada state global yang bocor antar sesi. |

Semua fitur ini ditulis sekali di [packages/core/src/index.ts](packages/core/src/index.ts) sebagai fungsi murni tanpa dependency, lalu dipetakan ke API masing-masing harness.

---

## Struktur Repo

```
crocodile-coding-harness/
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts              ← logika murni: validateCommand, redactSecrets, checkDiff, …
│   │       └── __tests__/core.test.ts
│   ├── commandcode/
│   │   ├── package.json              ← {"commandcode":{"mods":["./index.ts"]}}, keywords cmd-mod
│   │   └── index.ts                  ← ModApi: addTool / addCommand / hooks (default export function (cmd))
│   ├── opencode/
│   │   ├── package.json              ← exports: ".", "./rpc" + @opencode/plugin
│   │   └── src/
│   │       ├── index.ts              ← Plugin.define({id, setup(ctx)})
│   │       └── rpc.ts                ← kontrak RPC untuk TUI/GUI
│   └── dsh/
│       ├── package.json              ← {"dsh":{"bundle":"./cordis.patch.yml"}}, keywords dsh-plugin
│       ├── cordis.patch.yml
│       └── src/index.ts              ← Cordis plugin: (ctx) => {}
├── opencode.jsonc                    ← daftar plugin OpenCode
├── .commandcode/settings.json        ← daftar mod Command Code
├── cordis.patch.yml                  ← patch root untuk dsh
├── package.json
└── README.md
```

---

## 1. Command Code

> Plugin di Command Code disebut **mod**: satu file TypeScript yang `default export function (cmd: ModApi)`.

### Prasyarat

- Node `^22.19.0 || >=24.0.0`
- Command Code CLI `cmd` (untuk `mods add/list/inspect`)

### Cara pakai

**A. Load langsung tanpa install (paling cepat untuk mencoba):**

```bash
cmd --mod ./packages/commandcode/index.ts
```

**B. Install sebagai package lokal:**

```bash
cmd mods add ./packages/commandcode
cmd mods list
```

**C. Global (untuk semua project):**

```bash
cmd mods add ./packages/commandcode -g
```

**D. Manual:** salin `packages/commandcode/index.ts` ke `~/.commandcode/mods/crocodile.ts` (user) atau `.commandcode/mods/crocodile.ts` (project, butuh workspace trust). Reload dengan `/reload`.

### Verifikasi

```bash
cmd mods list                                  # harus muncul: crocodile-commandcode
cmd mods inspect ./packages/commandcode/index.ts
cmd -p "halo, apa kabar?" --mod ./packages/commandcode/index.ts   # headless sanity check
```

### Flag

```bash
cmd --mod ./packages/commandcode/index.ts --mod-option strict=true --mod-option verbose=false
```

| Flag | Default | Fungsi |
|:---|:---:|:---|
| `strict` | `true` | Blok dangerous command di `beforeToolCall`. |
| `verbose` | `false` | Tampilkan contoh extra di `onStop`. |

Kill switch: `cmd --safe-mode` (hanya built-in mods) atau `{"mods":{"disableAll":true}}`.

---

## 2. OpenCode

> Plugin OpenCode adalah package JS/TS dengan `Plugin.define({ id, setup(ctx) })`. Server part `.`, TUI `./tui`, GUI `./gui-experimental`, RPC `./rpc`.

### Prasyarat

- Node `^22.19.0 || >=24.0.0`
- OpenCode `1.18.29+` (mendukung V1 & V2 via `Plugin.define` + `server()` opsional)

### Cara pakai

**A. Dari `opencode.jsonc` di root repo ini (sudah terdaftar):**

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "./packages/opencode",
      "options": { "strict": true, "verbose": false }
    }
  ]
}
```

**B. Install via CLI:**

```bash
opencode plugin add ./packages/opencode
opencode plugin list
opencode plugin check
```

**C. Manual (local discovery):** taruh di `.opencode/plugins/crocodile/index.ts` — OpenCode auto-load dari sistem file tanpa daftar di config.

**D. Publish ke npm** (opsional): package ini sudah punya `exports: {".": "./src/index.ts", "./rpc": "./src/rpc.ts"}` dan dependency `@opencode/plugin`. Publish lalu install dengan `opencode plugin add <nama-paket>`.

### Verifikasi

```bash
opencode plugin list              # harus muncul: crocodile-coding-harness
opencode plugin list --builtin
touch .opencode/plugins/crocodile/index.ts && opencode service restart
```

### Options

Passthrough `ctx.options` dari `opencode.jsonc`:

```jsonc
{
  "plugins": [
    { "package": "./packages/opencode", "options": { "strict": true, "verbose": false } }
  ]
}
```

> Untuk disable: prefix `-` — misal `"-crocodile-coding-harness"` atau `"-*"` untuk semua. Plugin built-in `opencode.config.policy` dan `opencode.provider.opencode` tidak bisa di-disable (policy enforcement).

---

## 3. DeepSeek Harness (`dsh`)

> Cordis: **everything is a plugin** — model adapter, tool registry, session log, agent-loop semua plugin. Tidak ada core istimewa.

### Prasyarat

- Node `^22.19.0 || >=24.0.0` (tanpa 23.x — non-LTS)
- `npx @deepseek-ai/dsh web` untuk Web UI di `http://127.0.0.1:3080`

### Cara pakai

```bash
# lihat tree yang akan di-boot (profile → bundles → patch → home patch)
dsh --profile web --dump-config

# install plugin
dsh plugin add ./packages/dsh

# atau pakai patch root langsung
dsh --profile web --patch ./cordis.patch.yml

# jalankan
dsh web          # browser UI
dsh headless     # one-shot tanpa server
```

> ⚠️ `dsh` masih **developer preview** (`0.1.0-rc.x`) — breaking changes mungkin. Pin versi yang sama dengan `dsh --version` saat `plugin add`.

---

## Tools, commands, hooks, flags

### Tools (read-only — tersedia di plan mode)

| Nama | Command Code | OpenCode | dsh |
|:---|:---|:---|:---|
| Diff check | `crocodile_diff_check` | `crocodile/diff_check` | `crocodile_diff_check` (via `ctx.tools`) |
| Repo size | `crocodile_repo_size` | `crocodile/repo_size` | — (ditambahkan via `ctx.tools` bila perlu) |

Signature: `{ files?: string[], maxDiffLines?: number }` → teks ringkasan + daftar warning.

### Commands

| Nama | Efek |
|:---|:---|
| `/review [--staged] [path]` | Review git diff untuk keamanan & missing tests. |
| `/crocodile-status` | Tampilkan status mod/plugin saat ini. |
| `#note` (typed input) | Di-handle jadi row info `noted.` tanpa turn model. |

### Hooks yang dipasang

| Command Code `ModApi` | OpenCode | Cordis |
|:---|:---|:---|
| `hooks.beforeToolCall` → block | `ctx.tool.hook("execute.before")` → rewrite input | `tools/pre-execute` waterfall → reject |
| `hooks.afterToolCall` → `additionalContext` | `ctx.tool.hook("execute.after")` → mutate `result` | `tools/post-execute` → mutate `event.result` |
| `hooks.appendSystemPrompt` | `ctx.session.hook("context")` → `event.system.push` | `agent/pre-step` → inject system message |
| `hooks.transformInput` | `ctx.session.hook("prompt")` | — (dilakukan di `agent/pre-step`) |
| `hooks.onRunEnd` / `onStop` | `ctx.event.subscribe` | `turn/end` event |
| `hooks.onPermissionRequest` (via `onPermissionRequest`) | `ctx.permission.hook("evaluate")` → `deny` | `ctx.sandbox` / `fs/*` policy (future) |

### Flags / options

| Flag | Type | Default | Di mana |
|:---|:---|:---:|:---|
| `strict` | boolean | `true` | semua adapter |
| `verbose` | boolean | `false` | semua adapter |

---

## Development

### Setup

```bash
git clone https://github.com/mithmass89/crocodile-coding-harness.git
cd crocodile-coding-harness
corepack enable
pnpm install
```

Butuh Node `^22.19.0 || >=24.0.0` dan `tsx` untuk jalan tanpa build. Core ditulis sebagai TS murni tanpa build step wajib.

### Test

```bash
pnpm test
# atau langsung:
node --import tsx packages/core/src/__tests__/core.test.ts
```

`core.test.ts` meng-assert:

- `--no-verify` di-block saat `strict=true`
- safe command lolos
- `composeSystemPrompt()` mengandung instruksi reviewable diff
- `redactSecrets()` meredaksi `api_key=`
- `isDangerousCommand()` mendeteksi `git push --force`
- `checkDiff(['a.ts'])` memberi warning test hilang
- `summarizeTurn(3, false)` format benar

Output: `core.test.ts: all assertions passed`

### Perintah verifikasi per-adapter

```bash
# Command Code
cmd --mod ./packages/commandcode/index.ts
cmd mods list
cmd mods inspect ./packages/commandcode/index.ts

# OpenCode
opencode plugin list
touch .opencode/plugins/crocodile/index.ts; opencode service restart

# dsh
dsh --profile web --dump-config
dsh plugin add ./packages/dsh
```

### Kontribusi

1. Fork repo.
2. Buat branch baru: `git checkout -b feat/nama-fitur`.
3. Semua logika baru taruh di `packages/core/src/index.ts` dulu, lalu petakan ke 3 adapter.
4. Tambahkan/ perkuat assert di `packages/core/src/__tests__/core.test.ts`.
5. Jalankan `pnpm test` — harus `all assertions passed`.
6. Buka PR dengan deskripsi singkat: 1 kalimat apa yang berubah + cara verifikasi di Command Code/OpenCode/dsh.

---

## Keamanan

- **Tidak ada sandbox** untuk mod/plugin — install hanya kode yang kamu percaya. Gunakan `cmd mods inspect` / `cmd --safe-mode` untuk audit.
- Untuk OpenCode, gunakan `-` prefix di `plugins` atau `-*` untuk kill switch per-plugin.
- Untuk `dsh`, layering berarti patch kamu bisa meng-override bundle bawaan — selalu cek dengan `--dump-config` sebelum boot.
- Jika kamu menemukan kerentanan, buka issue dengan label `security` sebelum fork.

---

## Improve lanjutan

1. **Provider baru** — `cmd.addProvider` / `ctx.provider.transform` / adapter `ctx.llm`.
2. **MCP server** — `ctx.mcp.transform` (OpenCode) atau register di `ctx.tools` (Cordis).
3. **Skills** — `cmd.addSkillsPath` / `ctx.skill.transform`.
4. **Packaging**:
   - Command Code: tambah `keywords: ["cmd-mod"]` (sudah ada), publish npm, lalu daftar ke `mods/registry.json` di `CommandCodeAI/command-code`.
   - OpenCode: publish npm dengan `exports: {".": "./src/index.ts", "./rpc": "./src/rpc.ts", "./tui": "..."}`.
   - dsh: `keywords: ["dsh-plugin"]` + `cordis.patch.yml`, install via `dsh plugin add`.

---

## Lisensi

MIT. Lihat [LICENSE](LICENSE).

---

<div align="center">

*Built for Command Code, OpenCode, and DeepSeek Harness — one core, three adapters, zero copy-paste.*

</div>
