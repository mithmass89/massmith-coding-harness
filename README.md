<div align="center">

# Massmith Coding Harness

**Shared core + adapters untuk coding yang lebih aman di Command Code, OpenCode, dan DeepSeek Harness.**
*Massmith guardrails keep bad diffs out of your repo.*

[![MIT](https://img.shields.io/badge/license-MIT-4c9)](LICENSE)
[![Node](https://img.shields.io/badge/node-22%2B%20%7C%2024%2B-3b82f6)](https://nodejs.org)
[![Command Code](https://img.shields.io/badge/commandcode-mod-8b5cf6)](https://commandcode.ai/docs)
[![OpenCode](https://img.shields.io/badge/opencode-plugin-38bdf8)](https://opencode.ai/docs/plugins/)
[![DeepSeek Harness](https://img.shields.io/badge/dsh-plugin-6366f1)](https://deepseek-harness.github.io/deepseek-harness/)

</div>

> **Kenapa repo ini ada?** Tiga harness — Command Code (`ModApi`), OpenCode (`@opencode/plugin`), dan DeepSeek Harness (`Cordis`) — punya API plugin yang benar-benar beda. Repo ini menulis logika coding guardrail **sekali** di `packages/core`, lalu me-expose-nya lewat 3 adapter tipis. Mau improve 1 fitur cukup edit core.

---

<details><summary><b>Daftar isi</b></summary>

- [Fitur Unggulan](#fitur-unggulan)
- [Perbandingan: Dengan vs Tanpa Harness](#perbandingan-dengan-vs-tanpa-harness)
- [Struktur Repo](#struktur-repo)
- [Install & pakai — Command Code](#1-command-code)
- [Install & pakai — OpenCode](#2-opencode)
- [Install & pakai — DeepSeek Harness (dsh)](#3-deepseek-harness-dsh)
- [Tools, commands, hooks, flags](#tools-commands-hooks-flags)
- [Skills Bawaan](#skills-bawaan)
- [Gabungan dengan Superagent](#gabungan-dengan-superagent)
- [Demo](#demo)
- [Development](#development)
- [Contributing](#contributing)
- [Keamanan](#keamanan)
- [Lisensi](#lisensi)

</details>

---

## Fitur Unggulan

| Fitur | Deskripsi |
|:---|:---|
| **Dangerous-command guard** | Blok `--no-verify`, `rm -rf /`, `drop table`, `git push --force`, `git reset --hard`, dll saat `strict=true`. Profil repo ini memakai `strict=false`. |
| **Secret redaction** | Redaksi otomatis untuk `api_key=`, `Authorization: Bearer ...`, dan blok `-----BEGIN PRIVATE KEY-----`. |
| **`massmith_diff_check`** | Tool read-only dsh: baca `git diff --numstat` + untracked files, warning file tanpa test, dan enforce `maxDiffLines` (default 400); adapter lain memakai daftar file yang diberikan. |
| **`massmith_verify`** | Tool dsh: jalankan diff check + `checks.test/typecheck/lint` lewat `ctx.shell` (sandbox dsh). |
| **`massmith_repo_size`** | Tool read-only: jumlah tracked files (`git ls-files`), tersedia di ketiga adapter. |
| **`/review`** | Command: review perubahan git untuk keamanan, correctness, dan missing tests. |
| **`/massmith-status`** | Command: tampilkan `strict`, `verbose`, `cwd`. |
| **`#note`** | Transform input `#note` → `noted.`, dan `/review <path>` → prompt review. |
| **System-prompt tersuntik** | Aturan diff kecil & reviewable lewat `ctx.systemPrompt.section` (dsh) atau `appendSystemPrompt`/context hook (adapter lain). |
| **Flag `DEPRECATED`** | Menandai hasil tool yang menyebut `DEPRECATED` agar agent mengangkatnya ke user. |
| **Idempotent & retriable** | Registrasi effect-based; tidak ada state global yang bocor antar sesi. |
| **Reversible (Cordis)** | `ctx.systemPrompt.section` + `ctx.tools.guard` + `ctx.on` ter-unwind otomatis; `inject: ['tools','commands']`. |
| **Config tervalidasi** | `strict`, `verbose`, `maxDiffLines`, `checks`, `checkTimeoutMs`, `shellTools` di-parse dengan default aman. |
| **Skills Markdown** | 4 skill bawaan di-load ke system prompt: `massmith-review`, `code-review`, `deployment`, `docs-bilingual`. |
| **Cross-harness** | Satu core tanpa dependency, 3 adapter tipis — perbaikan cukup edit `packages/core`. |

Semua fitur ini ditulis sekali di [packages/core/src/index.ts](packages/core/src/index.ts) sebagai fungsi murni tanpa dependency, lalu dipetakan ke API masing-masing harness.

---

## Perbandingan: Dengan vs Tanpa Harness

| Aspek | Tanpa Harness (42/100) | Dengan Massmith Harness (98/100) |
|:---|:---|:---|
| **Keamanan** | Perintah berbahaya lolos, secret bocor ke log | Blok `--no-verify`, `rm -rf /`, `push --force`; redaksi `api_key`/`Bearer` otomatis |
| **Kualitas code** | Diff besar, tanpa test, tanpa review | Diff kecil & reviewable, warning file tanpa test, wajib test/typecheck/lint |
| **Konsistensi** | System prompt acak, gaya beda-beda | Prompt disiplin: 1 core → 3 adapter (Command Code, OpenCode, dsh) |
| **Operasional** | Error terlambat ketahuan | Terminal check hijau, score 98/100 sebelum deploy |

> **DeepSeek Harness (`dsh`) fokus di extensibility** ("everything is a plugin" via Cordis), bukan guardrail bawaan. Massmith menambah layer guardrail di atas dsh, Command Code, dan OpenCode — jadi kualitas *workflow* naik, bukan cuma keamanan.

**Demo live:** dua single-HTML di `demo/` —
- [`demo/wirasolution-dengan-harness.html`](demo/wirasolution-dengan-harness.html) — **98/100**, badge `HARNESS AKTIF`, playground blokir `--no-verify`/`rm -rf /`/`push --force`.
- [`demo/wirasolution-tanpa-harness.html`](demo/wirasolution-tanpa-harness.html) — **42/100**, badge `TANPA HARNESS`, playground **semua perintah langsung "DIJALANKAN"**, overlay "Risiko!".

Kedua file tanpa dependency selain Google Fonts; playground-nya pakai fungsi asli `validateCommand()` dari core dalam JavaScript inline.

---

## Struktur Repo

```
massmith-coding-harness/
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
│       ├── package.json            ← {"dsh":{"bundle":"./cordis.patch.yml"}}, keywords dsh-plugin
│       ├── cordis.patch.yml
│       └── src/
│           ├── index.ts            ← Cordis: apply(ctx, config) + inject ['tools','commands']
│           └── __tests__/dsh.test.ts
├── skills/
│   ├── massmith-review/SKILL.md      ← review diff guardrail sebelum commit
│   ├── code-review/SKILL.md          ← framework review umum
│   ├── deployment/SKILL.md           ← panduan deploy 3 harness
│   └── docs-bilingual/SKILL.md       ← workflow docs bilingual
├── demo/
│   ├── wirasolution-dengan-harness.html  ← demo dengan harness (98/100)
│   └── wirasolution-tanpa-harness.html   ← demo tanpa harness (42/100)
├── opencode.jsonc                    ← daftar plugin OpenCode
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

**D. Manual:** salin `packages/commandcode/index.ts` ke `~/.commandcode/mods/massmith.ts` (user) atau `.commandcode/mods/massmith.ts` (project, butuh workspace trust). Reload dengan `/reload`.

### Verifikasi

```bash
cmd mods list                                  # harus muncul: massmith-commandcode
cmd mods inspect ./packages/commandcode/index.ts
cmd -p "halo, apa kabar?" --mod ./packages/commandcode/index.ts   # headless sanity check
```

### Flag

```bash
cmd --mod ./packages/commandcode/index.ts --mod-option strict=false --mod-option verbose=false
```

| Flag | Default | Fungsi |
|:---|:---:|:---|
| `strict` | `false` | Blok dangerous command di `beforeToolCall` saat `true`. |
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
      "options": { "strict": false, "verbose": false }
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

**C. Manual (local discovery):** taruh di `.opencode/plugins/massmith/index.ts` — OpenCode auto-load dari sistem file tanpa daftar di config.

**D. Publish ke npm** (opsional): package ini sudah punya `exports: {".": "./src/index.ts", "./rpc": "./src/rpc.ts"}` dan dependency `@opencode/plugin`. Publish lalu install dengan `opencode plugin add <nama-paket>`.

### Verifikasi

```bash
opencode plugin list              # harus muncul: massmith-coding-harness
opencode plugin list --builtin
touch .opencode/plugins/massmith/index.ts && opencode service restart
```

### Options

Passthrough `ctx.options` dari `opencode.jsonc`:

```jsonc
{
  "plugins": [
    { "package": "./packages/opencode", "options": { "strict": false, "verbose": false } }
  ]
}
```

> Untuk disable: prefix `-` — misal `"-massmith-coding-harness"` atau `"-*"` untuk semua. Plugin built-in `opencode.config.policy` dan `opencode.provider.opencode` tidak bisa di-disable (policy enforcement).

### Desktop (GUI) — catatan

Server part (`massmith-coding-harness`) jalan di **background server** OpenCode — hooks/tools tetap aktif tapi tidak ada indikator visual di Desktop. **Desktop GUI** (`./gui-experimental`) belum terimplementasi di plugin ini; untuk panel/command di UI Desktop, tambahkan file `./gui-experimental` (`Command`, `Panel`, `SettingsPage` dari `@opencode/plugin/gui`) dengan `exports` di `package.json`. Tanpa itu, di **Settings > Extensions > Plugins** tidak ada row GUI untuk Massmith (server part tetap terdaftar).

---

## 3. DeepSeek Harness (`dsh`)

> Cordis: **everything is a plugin** — model adapter, tool registry, session log, agent-loop semua plugin. Tidak ada core istimewa.

### Prasyarat

- Node `^22.19.0 || >=24.0.0` (tanpa 23.x — non-LTS)
- `npx @deepseek-ai/dsh web` untuk Web UI di `http://127.0.0.1:3080`

### Status kesesuaian dengan DeepSeek Harness

| Area | Status | Catatan |
|:---|:---|:---|
| Plugin shape | ✅ | `export function apply(ctx, config)` + `inject: ['tools','commands']` |
| `ctx.tools.register` / `ctx.commands.register` | ✅ | `defineTool` + command `handler`; registrasi otomatis effect |
| Events | ✅ | `tools/pre-execute`/`tools/post-execute`, `turn/end`, `ctx.systemPrompt.section` |
| Disposer / cleanup | ✅ | Registrasi Cordis auto-unwind; `ctx.effect` untuk prompt section |
| Config validation | ✅ | `parseConfig()` manual + default aman; `checks`, `checkTimeoutMs`, `shellTools` |
| Bundle YAML | ✅ | 1 row per plugin, `dsh.bundle` di `package.json`, `dsh-plugin` keyword |
| Type safety | ✅ | `Context` dari `@deepseek-ai/cordis` + `defineTool` dari `@deepseek-ai/dsh-tools` |

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

> ⚠️ `dsh` masih **developer preview** — breaking changes mungkin. Plugin ini mem-pin `@deepseek-ai/dsh-tools@0.0.1-rc.1` dan `@deepseek-ai/cordis@^4.1.0`; samakan dengan versi dsh yang dipakai.

---

## Tools, commands, hooks, flags

### Tools

`massmith_diff_check` dan `massmith_repo_size` read-only; `massmith_verify` menjalankan perintah check.

| Nama | Command Code | OpenCode | dsh |
|:---|:---|:---|:---|
| Diff check | `massmith_diff_check` | `massmith/diff_check` | `massmith_diff_check` |
| Verify | — | — | `massmith_verify` |
| Repo size | `massmith_repo_size` | `massmith/repo_size` | `massmith_repo_size` |

`massmith_diff_check` signature: `{ files?: string[], maxDiffLines?: number }` → teks ringkasan + daftar warning.
`massmith_verify` dan `massmith_repo_size` tidak menerima parameter.

### Commands

| Nama | Efek |
|:---|:---|
| `/review [--staged] [path]` | Review git diff untuk keamanan & missing tests. |
| `/massmith-status` | Tampilkan status mod/plugin saat ini. |
| `#note` (typed input) | Di-handle jadi row info `noted.` tanpa turn model. |

### Hooks yang dipasang

| Command Code `ModApi` | OpenCode | Cordis |
|:---|:---|:---|
| `hooks.beforeToolCall` → block | `ctx.tool.hook("execute.before")` → rewrite input | `ctx.tools.guard` (monotonic) + fallback `tools/pre-execute` waterfall |
| `hooks.afterToolCall` → `additionalContext` | `ctx.tool.hook("execute.after")` → mutate `result` | `tools/post-execute` → replace content/redact |
| `hooks.appendSystemPrompt` | `ctx.session.hook("context")` → `event.system.push` | `ctx.systemPrompt.section` |
| `hooks.transformInput` | `ctx.session.hook("prompt")` | — (tidak ada transform input di adapter dsh) |
| `hooks.onRunEnd` / `onStop` | `ctx.event.subscribe` | `turn/end` event |
| `hooks.onPermissionRequest` (via `onPermissionRequest`) | `ctx.permission.hook("evaluate")` → `deny` | `ctx.sandbox` / `fs/*` policy (future) |

### Flags / options

| Flag | Type | Default | Di mana |
|:---|:---|:---:|:---|
| `strict` | boolean | `false` | semua adapter |
| `verbose` | boolean | `false` | semua adapter |
| `maxDiffLines` | number | `400` | dsh config |
| `checks` | object | `{}` | dsh config: `test`, `typecheck`, `lint` |
| `checkTimeoutMs` | number | `120000` | dsh config |
| `shellTools` | string[] | `["bash","pwsh"]` | dsh config |

---

## Skills Bawaan

Skill Markdown di-load ke system prompt via `composeSystemPrompt(extra)` — tanpa menunggu API native `cmd.addSkillsPath` / `ctx.skill.transform` / `ctx.skills`.

| Skill | File | Deskripsi |
|:---|:---|:---|
| `massmith-review` | [`skills/massmith-review/SKILL.md`](skills/massmith-review/SKILL.md) | Review diff untuk keamanan & missing tests sebelum commit. |
| `code-review` | [`skills/code-review/SKILL.md`](skills/code-review/SKILL.md) | Framework review umum — keamanan, correctness, diff size. |
| `deployment` | [`skills/deployment/SKILL.md`](skills/deployment/SKILL.md) | Panduan deploy ke dsh, OpenCode, Command Code + catatan sandbox. |
| `docs-bilingual` | [`skills/docs-bilingual/SKILL.md`](skills/docs-bilingual/SKILL.md) | Workflow docs bilingual EN + bahasa kedua. |
| `ui-ux-pro-max` | [`skills/ui-ux-pro-max/SKILL.md`](skills/ui-ux-pro-max/SKILL.md) | Design intelligence UI/UX (80 style, 192 palet, reasoning rules; MIT, nextlevelbuilder). |
| `3dviz-pro-max` | [`skills/3dviz-pro-max/SKILL.md`](skills/3dviz-pro-max/SKILL.md) | Visualisasi 3D Three.js/Blender (223 recipe, 22 kit; MIT, viettranx). |
| `frontend-design` | [`skills/frontend-design/SKILL.md`](skills/frontend-design/SKILL.md) | Prinsip desain visual generik (official Anthropic, anthropics/skills). |
| `using-superpowers` | [`skills/using-superpowers/SKILL.md`](skills/using-superpowers/SKILL.md) | Disiplin pakai-skill-dulu sebelum merespons (obra/superpowers). |
| `unit-test` | [`skills/unit-test/SKILL.md`](skills/unit-test/SKILL.md) | Generate unit test + edge case per framework (official skills-hub-registry, signed). |
| `code-review-and-quality` | [`skills/code-review-and-quality/SKILL.md`](skills/code-review-and-quality/SKILL.md) | Review 5 sumbu + quality gate, sizing, dependency discipline (MIT, addyosmani). |
| `context-engineering` | [`skills/context-engineering/SKILL.md`](skills/context-engineering/SKILL.md) | Kurasi konteks agen: hierarki, budget, confusion handling (MIT, addyosmani). |

Untuk tambah skill baru: copy folder + `SKILL.md` + frontmatter (`name`, `description`, `disable-model-invocation`, `userInvocable`), lalu restart harness.

---

## Gabungan dengan Superagent

Massmith (guardrail) dan **Superagent** ([mithmass89/opencode-superagent](https://github.com/mithmass89/opencode-superagent), alur Trigger → Eval/gate → Ticket → Assignment) **berdampingan dan saling melengkapi** — tidak perlu dipilih salah satu.

| Lapisan | Massmith | Superagent |
|:---|:---|:---|
| **Peran** | Keamanan & kualitas kode | Workflow tiket |
| **Plugin id** | `massmith-coding-harness` | `dsh-superagent` |
| **Tools** | `massmith/diff_check`, `massmith/repo_size` | `dsh_intake`, `dsh_list`, `dsh_accept`, `dsh_stop` |
| **Commands** | `/review`, `/massmith-status` | `/dsh-triage`, `/dsh-status` |
| **Storage** | `ctx.storage` (namespace per plugin) | `<project>/.dsh/tickets.sqlite` |
| **Background** | Tidak ada | Poll GitHub (opsional, `pollIntervalMs`) |

Karena id, nama tool/command, dan namespace storage berbeda, keduanya **tidak saling menimpa**.

### Pasang sekali, dua plugin otomatis aktif

**OpenCode (global, semua project):**

1. Salin kedua folder ke `~/.config/opencode/plugins/`:
   - `massmith/` (dari `packages/opencode` + `core/`)
   - `dsh-superagent/` (dari repo superagent)
2. Daftarkan keduanya di `~/.config/opencode/opencode.jsonc` — **urutan penting**:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    { "package": "./plugins/massmith", "options": { "strict": false, "verbose": false } },
    { "package": "./plugins/dsh-superagent", "options": { "mention": "@superagent", "requireMention": true, "autoMode": true, "pollIntervalMs": 0 } }
  ]
}
```

> Massmith **harus di baris pertama**: hook `execute.before`-nya memblokir perintah berbahaya sebelum tool apa pun (termasuk `dsh_*`) berjalan.

3. Verifikasi: `opencode plugin list` harus menampilkan **dua** baris dengan ID (bukan `-`):

```
ID                       VERSION  SOURCE
dsh-superagent           local    C:\Users\...\plugins\dsh-superagent
massmith-coding-harness  local    C:\Users\...\plugins\massmith
```

**Command Code (global):**

- `~/.commandcode/mods/massmith.ts` (+ `~/.commandcode/core/src/index.ts`, `~/.commandcode/skills/`)
- `~/.commandcode/mods/dsh-superagent.ts`
- Cek dengan `cmd mods list` → dua baris `· user ·`.

> **Penting:** mod adapter memakai import relatif ke core (`../core/src/index.ts`) dan skills (`../skills/`). Kalau memindahkan file mod, salin juga `core/` dan `skills/` — atau minta plugin dijalankan sebagai package (`cmd mods add ./packages/commandcode -g`).

### Yang terjadi saat keduanya aktif

1. **Prompt masuk** — Massmith menyuntik aturan disiplin (diff kecil, wajib test, redaksi secret) dan Superagent menyuntik reminder Trigger→Gate→Ticket.
2. **Tool dipanggil** — Massmith memblokir perintah berbahaya lebih dulu; sisanya diteruskan ke Superagent (`dsh_intake` mencatat Trigger, gate policy memutuskan, Ticket dibuat).
3. **Hasil tool** — Massmith meredaksi secret + menandai `DEPRECATED`; Superagent menyimpan tiket ke SQLite.
4. **Akhir turn** — Massmith menampilkan summary; Superagent memperbarui status tiket / poll GitHub (jika diaktifkan).

### Kapan sebaiknya hanya salah satu?

| Kebutuhan | Pakai |
|:---|:---|
| Cuma mau aman saat coding | Massmith saja |
| Cuma mau workflow tiket dari issue GitHub | Superagent saja |
| Tim: issue masuk → tiket → dikerjakan agent dengan guardrail | **Keduanya** (disarankan) |

---

## Demo

### Wirasolution — Jasa Pembuatan Website (2 file)

| File | Skor | Isi |
|:---|:---:|:---|
| [`demo/wirasolution-dengan-harness.html`](demo/wirasolution-dengan-harness.html) | **98/100** | `HARNESS AKTIF` (`strict=true`), terminal check hijau, playground blokir perintah berbahaya, preview bersih. |
| [`demo/wirasolution-tanpa-harness.html`](demo/wirasolution-tanpa-harness.html) | **42/100** | `TANPA HARNESS` (`strict=off`), terminal merah, playground **semua perintah langsung DIJALANKAN**, overlay "Risiko!". |

Kedua file single-HTML (CSS + JS inline, animasi blob, reveal on scroll, counter statistik, spotlight kartu), saling ter-link, tanpa dependency selain Google Fonts. Playground memakai fungsi `validateCommand()` asli dari core dalam JavaScript inline.

---

## Development

### Setup

```bash
git clone https://github.com/mithmass89/massmith-coding-harness.git
cd massmith-coding-harness
corepack enable
pnpm install
```

Butuh Node `^22.19.0 || >=24.0.0` dan `tsx` untuk jalan tanpa build. Core ditulis sebagai TS murni tanpa build step wajib.

### Test

```bash
pnpm test
# atau langsung:
node --import tsx packages/core/src/__tests__/core.test.ts
node --import tsx packages/dsh/src/__tests__/dsh.test.ts
```

`core.test.ts` dan `dsh.test.ts` meng-assert:

- `--no-verify` di-block saat `strict=true`
- safe command lolos
- `composeSystemPrompt()` mengandung instruksi reviewable diff
- `redactSecrets()` meredaksi `api_key=`
- `isDangerousCommand()` mendeteksi `git push --force`
- `checkDiff(['a.ts'])` memberi warning test hilang
- `parseGitNumstat()` membaca additions/deletions dan binary
- `checkDiff()` meng-enforce `maxDiffLines` bila diff stats tersedia
- `summarizeTurn(3, false)` format benar
- adapter dsh mendaftarkan 3 tool + 3 command + guard saat `apply()` dipanggil
- guard menolak dangerous command; fallback `tools/pre-execute` tetap memanggil `next()`
- `post-execute` meredaksi secret dan menandai `DEPRECATED`

Output: `core.test.ts: all assertions passed` dan `dsh.test.ts: all assertions passed`

### Perintah verifikasi per-adapter

```bash
# Command Code — cek mod yang ter-load (user + project scope)
cmd mods list
cmd mods inspect ./packages/commandcode/index.ts

# Command Code — headless sanity check dengan mod
cmd -p "halo" --mod ./packages/commandcode/index.ts

# OpenCode — daftar plugin yang ter-load (harus muncul dengan ID, bukan "-")
opencode plugin list

# OpenCode Desktop (bundled CLI v2.x, schema `plugins`)
"C:\Users\<you>\AppData\Local\Programs\ai.opencode.desktop\resources\opencode-cli.exe" plugin list

# OpenCode — validasi config
opencode debug config

# dsh
dsh --profile web --dump-config
dsh plugin add ./packages/dsh
```

> **Catatan versi:** OpenCode CLI npm 1.x memakai key `plugin` (string/array), sedangkan OpenCode v2.x (termasuk desktop) memakai `plugins` (array of string atau `{package, options}`). Kalau `opencode debug config` error `Unrecognized key: plugins`, CLI kamu versi 1.x — pakai CLI bawaan desktop untuk memvalidasi.

> **Catatan ID `-`:** baris plugin dengan ID `-` berarti server part gagal load. Penyebab paling umum: import relatif ke `core/` atau skills tidak ada di lokasi install global. Pastikan `core/src/index.ts` ada di sebelah plugin.

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
- `massmith_verify` menjalankan `checks.*` lewat `ctx.shell`, sehingga mengikuti executor/sandbox dsh. Guard deny-list tetap lapis pertama, bukan pengganti sandbox.
- Untuk OpenCode, gunakan `-` prefix di `plugins` atau `-*` untuk kill switch per-plugin.
- Untuk `dsh`, layering berarti patch kamu bisa meng-override bundle bawaan — selalu cek dengan `--dump-config` sebelum boot.
- Jika kamu menemukan kerentanan, buka issue dengan label `security` sebelum fork.

---

## Improve lanjutan

1. **Provider baru** — `cmd.addProvider` / `ctx.provider.transform` / adapter `ctx.llm`.
2. **MCP server** — `ctx.mcp.transform` (OpenCode) atau register di `ctx.tools` (Cordis).
3. **Skills** — ✅ terpasang via prompt section; migrasi ke `skill-filesystem`/`tool-skill` native adalah fase berikutnya.
4. **GUI (OpenCode Desktop)** — tambahkan `./gui-experimental` (`Command`, `Panel`, `SettingsPage`) agar panel/command muncul di UI Desktop.
5. **Packaging**:
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
