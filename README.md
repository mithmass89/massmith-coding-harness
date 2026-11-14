<div align="center">

# 🛡️ Massmith Coding Harness

**Satu guardrail untuk semua harness AI coding: Command Code · OpenCode · DeepSeek Harness.**
*Massmith guardrails keep bad diffs out of your repo.*

[![MIT](https://img.shields.io/badge/license-MIT-4c9)](LICENSE)
[![Node](https://img.shields.io/badge/node-22%2B%20%7C%2024%2B-3b82f6)](https://nodejs.org)
[![Skills](https://img.shields.io/badge/skills-11-10b981)](#-skills)
[![Command Code](https://img.shields.io/badge/commandcode-mod-8b5cf6)](https://commandcode.ai/docs)
[![OpenCode](https://img.shields.io/badge/opencode-plugin-38bdf8)](https://opencode.ai/docs/plugins/)
[![DeepSeek Harness](https://img.shields.io/badge/dsh-plugin-6366f1)](https://deepseek-harness.github.io/deepseek-harness/)

[Fitur](#fitur-unggulan) · [Mulai Cepat](#mulai-cepat-30-detik) · [Skills](#skills) · [dsh](#3-deepseek-harness-dsh) · [Development](#development)

</div>

> **Kenapa repo ini ada?** Tiga harness — Command Code (`ModApi`), OpenCode (`@opencode/plugin`), DeepSeek Harness (`Cordis`) — punya API plugin yang benar-benar beda. Repo ini menulis logika guardrail **sekali** di `packages/core`, lalu mengeksposnya lewat 3 adapter tipis. Improve 1 fitur cukup edit core.

---

<details><summary><b>Daftar isi</b></summary>

- [Fitur Unggulan](#fitur-unggulan)
- [Mulai Cepat (30 detik)](#mulai-cepat-30-detik)
- [Perbandingan: Dengan vs Tanpa Harness](#perbandingan-dengan-vs-tanpa-harness)
- [Arsitektur & Struktur Repo](#arsitektur--struktur-repo)
- [Install & pakai — Command Code](#1-command-code)
- [Install & pakai — OpenCode](#2-opencode)
- [Install & pakai — DeepSeek Harness (dsh)](#3-deepseek-harness-dsh)
- [Tools, Commands, Hooks, Flags](#tools-commands-hooks-flags)
- [Skills](#skills)
- [Gabungan dengan Superagent](#gabungan-dengan-superagent)
- [Demo](#demo)
- [Development](#development)
- [Contributing](#contributing)
- [Keamanan](#keamanan)
- [Roadmap](#roadmap)
- [Lisensi](#lisensi)

</details>

---

## ✨ Fitur Unggulan

| Fitur | Deskripsi |
|:---|:---|
| **Dangerous-command guard** | Blok `--no-verify`, `rm -rf /`, `drop table`, `git push --force`, `git reset --hard`, dll saat `strict=true`. Profil repo ini memakai `strict=false` (deteksi tanpa blokir). |
| **Secret redaction** | Redaksi otomatis `api_key=`, `Authorization: Bearer …`, dan blok `-----BEGIN PRIVATE KEY-----` di prompt & hasil tool. |
| **`massmith_diff_check`** | Baca `git diff --numstat` + untracked files, warning file tanpa test, enforce `maxDiffLines` (default 400). |
| **`massmith_verify`** | Diff check + `checks.test/typecheck/lint` lewat `ctx.shell` (mengikuti sandbox dsh). |
| **`massmith_repo_size`** | Jumlah tracked files (`git ls-files`). Read-only, ada di ketiga adapter. |
| **`/review` · `/verify` · `/massmith-status`** | Review diff git, jalankan checks, tampilkan `strict`/`verbose`/layanan aktif. |
| **System-prompt tersuntik** | Aturan diff kecil & reviewable via `ctx.systemPrompt.section` (dsh) / context hook (adapter lain). |
| **Flag `DEPRECATED`** | Hasil tool yang menyebut `DEPRECATED` otomatis ditandai agar agent mengangkatnya ke user. |
| **11 skills, registrasi native** | Di dsh: terdaftar ke `ctx.skills` (lazy-load via `tool-skill`), prompt hanya bawa katalog. Di host tanpa `skills` service: fallback embed full-text. |
| **Idempotent & reversible** | Registrasi effect-based, auto-unwind; tanpa state global bocor antar sesi. |
| **Config tervalidasi** | `strict`, `verbose`, `maxDiffLines`, `checks`, `checkTimeoutMs`, `shellTools` — default aman. |
| **Satu core, tiga adapter** | Logika murni tanpa dependency di `packages/core`; perbaikan cukup edit 1 file. |

---

## 🚀 Mulai Cepat (30 detik)

```bash
# 1. Clone & install
git clone https://github.com/mithmass89/massmith-coding-harness.git
cd massmith-coding-harness
corepack enable && pnpm install

# 2. Cek semua test hijau
pnpm test   # core + dsh + commandcode → all assertions passed

# 3. Pakai di host favoritmu
cmd --mod ./packages/commandcode/index.ts          # Command Code
opencode plugin add ./packages/opencode             # OpenCode
dsh --profile web --patch ./cordis.patch.yml        # DeepSeek Harness
```

> Default `strict=false`: guardrail **mengawasi tanpa memblokir** — cocok untuk perintah ekstrem. Set `strict=true` kalau mau blokir keras.

---

## 📊 Perbandingan: Dengan vs Tanpa Harness

| Aspek | Tanpa Harness (42/100) | Dengan Massmith Harness (98/100) |
|:---|:---|:---|
| **Keamanan** | Perintah berbahaya lolos, secret bocor ke log | Blok `--no-verify`, `rm -rf /`, `push --force`; redaksi `api_key`/`Bearer` otomatis |
| **Kualitas code** | Diff besar, tanpa test, tanpa review | Diff kecil & reviewable, warning file tanpa test, wajib test/typecheck/lint |
| **Konsistensi** | System prompt acak, gaya beda-beda | Prompt disiplin: 1 core → 3 adapter |
| **Operasional** | Error terlambat ketahuan | Terminal check hijau, skor 98/100 sebelum deploy |

> DeepSeek Harness fokus di *extensibility* ("everything is a plugin" via Cordis), bukan guardrail bawaan. Massmith menambah layer guardrail di atas dsh, Command Code, dan OpenCode — kualitas *workflow* naik, bukan cuma keamanan.

**Demo live** — dua single-HTML di `demo/` (tanpa dependency selain Google Fonts, playground pakai `validateCommand()` asli dari core):
- [`demo/wirasolution-dengan-harness.html`](demo/wirasolution-dengan-harness.html) — **98/100**, badge `HARNESS AKTIF`, playground memblokir perintah berbahaya.
- [`demo/wirasolution-tanpa-harness.html`](demo/wirasolution-tanpa-harness.html) — **42/100**, badge `TANPA HARNESS`, semua perintah langsung "DIJALANKAN".

---

## 🏗️ Arsitektur & Struktur Repo

```
massmith-coding-harness/
├── packages/
│   ├── core/src/
│   │   ├── index.ts              ← logika murni: validateCommand, redactSecrets,
│   │   │                            checkDiff, parseGitNumstat, composeSystemPrompt
│   │   └── __tests__/core.test.ts
│   ├── commandcode/
│   │   ├── index.ts              ← ModApi: addTool / addCommand / hooks
│   │   └── index.test.ts
│   ├── opencode/src/
│   │   ├── index.ts              ← Plugin.define({ id, setup(ctx) })
│   │   └── rpc.ts                ← kontrak RPC untuk TUI/GUI
│   └── dsh/src/
│       ├── index.ts              ← Cordis: apply(ctx, config) + inject,
│       │                            registrasi native ctx.skills
│       └── __tests__/dsh.test.ts
├── skills/                       ← 11 skill (SKILL.md + aset masing-masing)
│   ├── massmith-review/ code-review/ deployment/ docs-bilingual/   ← bawaan
│   ├── ui-ux-pro-max/ 3dviz-pro-max/                               ← komunitas (MIT)
│   ├── frontend-design/ using-superpowers/                         ← komunitas (MIT/Apache)
│   ├── unit-test/                                                  ← skills-hub (signed)
│   └── code-review-and-quality/ context-engineering/               ← addyosmani (MIT)
├── demo/                         ← 2 file demo wirasolution
├── opencode.jsonc                ← daftar plugin OpenCode
├── cordis.patch.yml              ← patch root dsh (massmith saja)
├── cordis.combined.patch.yml     ← patch massmith + superagent
└── README.md
```

**Alur kerja adapter dsh** (`packages/dsh/src/index.ts`): boot → `parseConfig` → `loadLocalSkills` + `registerNativeSkills` ke `ctx.skills` → `systemPrompt.section` (katalog saja bila native aktif, full-text bila fallback) → register 3 tool + guard (`ctx.tools.guard`, fallback `tools/pre-execute`) → `tools/post-execute` (redact + flag `DEPRECATED`) → 3 command → `turn/end`.

---

## 1. Command Code

> Plugin di Command Code disebut **mod**: satu file TypeScript yang `default export function (cmd: ModApi)`.

**Prasyarat:** Node `^22.19.0 || >=24.0.0`, CLI `cmd`.

```bash
# Coba langsung
cmd --mod ./packages/commandcode/index.ts

# Install lokal / global
cmd mods add ./packages/commandcode
cmd mods add ./packages/commandcode -g

# Manual: salin ke ~/.commandcode/mods/massmith.ts (+ core/ & skills/), lalu /reload
cmd mods list                                  # harus muncul: massmith-commandcode
cmd -p "halo, apa kabar?" --mod ./packages/commandcode/index.ts
```

| Flag | Default | Fungsi |
|:---|:---:|:---|
| `strict` | `false` | Blokir dangerous command di `beforeToolCall` saat `true`. |
| `verbose` | `false` | Contoh ekstra di `onStop`. |

Kill switch: `cmd --safe-mode` atau `{"mods":{"disableAll":true}}`.

---

## 2. OpenCode

> Plugin OpenCode = package JS/TS dengan `Plugin.define({ id, setup(ctx) })`.

**Prasyarat:** Node `^22.19.0 || >=24.0.0`, OpenCode `1.18.29+`.

```jsonc
// opencode.jsonc — sudah terdaftar di root repo ini
{ "$schema": "https://opencode.ai/config.json",
  "plugins": [{ "package": "./packages/opencode",
    "options": { "strict": false, "verbose": false } }] }
```

```bash
opencode plugin add ./packages/opencode
opencode plugin list        # harus muncul ID massmith-coding-harness (bukan "-")
```

> Disable per-plugin: prefix `-` (`"-massmith-coding-harness"` / `"-*"`). Catatan CLI: npm 1.x memakai key `plugin`, v2.x (termasuk Desktop) memakai `plugins` — kalau `debug config` error `Unrecognized key`, pakai CLI bawaan Desktop. ID `-` = server part gagal load (biasanya import relatif `core/`/skills hilang di install global).

---

## 3. DeepSeek Harness (`dsh`)

> Cordis: **everything is a plugin** — model adapter, tool registry, session log, agent-loop semua plugin.

**Prasyarat:** Node `^22.19.0 || >=24.0.0`, `npx @deepseek-ai/dsh web` → `http://127.0.0.1:3080`.

| Area | Status | Catatan |
|:---|:---|:---|
| Plugin shape | ✅ | `export function apply(ctx, config)` + `inject: ['tools','commands']` |
| `ctx.tools.register` / `ctx.commands.register` | ✅ | `defineTool` + command `handler`, registrasi effect-based |
| Native skills | ✅ | `ctx.skills.register` (lazy via `tool-skill`); fallback embed bila service absen |
| Events | ✅ | `tools/pre-execute` / `tools/post-execute`, `turn/end`, `ctx.systemPrompt.section` |
| Config validation | ✅ | `parseConfig()` + default aman; `checks`, `checkTimeoutMs`, `shellTools` |
| Bundle YAML | ✅ | 1 row per plugin, `dsh.bundle`, keyword `dsh-plugin` |

```bash
dsh --profile web --dump-config     # lihat tree yang akan di-boot
dsh plugin add ./packages/dsh       # install plugin
dsh --profile web --patch ./cordis.patch.yml
dsh web                             # browser UI · dsh headless = one-shot
```

> ⚠️ `dsh` masih **developer preview** — breaking changes mungkin. Samakan versi `@deepseek-ai/dsh-tools` / `@deepseek-ai/cordis` dengan dsh yang dipakai.

---

## 🧰 Tools, Commands, Hooks, Flags

| Tool | Command Code | OpenCode | dsh |
|:---|:---|:---|:---|
| Diff check | `massmith_diff_check` | `massmith/diff_check` | `massmith_diff_check` |
| Verify | — | — | `massmith_verify` |
| Repo size | `massmith_repo_size` | `massmith/repo_size` | `massmith_repo_size` |

`massmith_diff_check { files?, maxDiffLines? }` → ringkasan + warning. `massmith_verify` & `massmith_repo_size` tanpa parameter.

| Command | Efek |
|:---|:---|
| `/review [--staged] [path]` | Review git diff: keamanan, correctness, missing tests. |
| `/verify` | Diff check + `checks.*` (dsh). |
| `/massmith-status` | `strict`, `verbose`, `maxDiffLines`, layanan aktif. |

| Command Code `ModApi` | OpenCode | Cordis |
|:---|:---|:---|
| `hooks.beforeToolCall` → block | `ctx.tool.hook("execute.before")` → rewrite input | `ctx.tools.guard` + fallback `tools/pre-execute` |
| `hooks.afterToolCall` → `additionalContext` | `ctx.tool.hook("execute.after")` → mutate `result` | `tools/post-execute` → redact + flag |
| `hooks.appendSystemPrompt` | `ctx.session.hook("context")` → `event.system.push` | `ctx.systemPrompt.section` |
| `hooks.transformInput` | `ctx.session.hook("prompt")` (`#note`, `/review`) | — |
| `hooks.onRunEnd` / `onStop` | `ctx.event.subscribe` | `turn/end` |
| `onPermissionRequest` | `ctx.permission.hook("evaluate")` → `deny` | `ctx.sandbox` / `fs/*` policy (future) |

| Flag | Type | Default | Di mana |
|:---|:---|:---:|:---|
| `strict` | boolean | `false` | semua adapter — `true` = blokir perintah berbahaya |
| `verbose` | boolean | `false` | semua adapter |
| `maxDiffLines` | number | `400` | dsh config |
| `checks` | object | `{}` | dsh config: `test`, `typecheck`, `lint` |
| `checkTimeoutMs` | number | `120000` | dsh config |
| `shellTools` | string[] | `["bash","pwsh"]` | dsh config |

---

## 🧠 Skills

**Cara kerja:** prompt hanya membawa **katalog** (`nama: deskripsi`); AI memilih skill yang relevan lalu meload isi penuhnya via tool loader. Di dsh: registrasi native ke `ctx.skills` (lazy via `tool-skill`). Di OpenCode: tool `massmith/skill`. Di Command Code: tool `massmith_skill_load`. Loader hanya menerima nama persis di allowlist (path traversal ditolak); skill yang file-nya hilang dilewati diam-diam agar boot tidak gagal. Frontmatter yang dibaca: `name`, `description`, `disable-model-invocation`, `userInvocable`.

### Inti guardrail (bawaan)

| Skill | Isi singkat |
|:---|:---|
| `massmith-review` | Review diff untuk keamanan & missing tests sebelum commit. |
| `code-review` | Framework review umum — keamanan, correctness, diff size. |
| `deployment` | Panduan deploy ke dsh / OpenCode / Command Code + catatan sandbox. |
| `docs-bilingual` | Workflow dokumentasi bilingual EN + bahasa kedua. |

### Komunitas (vendored, full-folder + lisensi asli)

| Skill | Isi singkat | Sumber |
|:---|:---|:---|
| `ui-ux-pro-max` | Design intelligence: 80 style, 192 palet, 74 font pairing, reasoning rules. | MIT · nextlevelbuilder |
| `3dviz-pro-max` | Visualisasi 3D Three.js/Blender: 223 recipe, 440 knowledge, 22 kit. | MIT · viettranx |
| `frontend-design` | Prinsip desain visual yang generik & beropini (official Anthropic). | anthropics/skills |
| `using-superpowers` | Disiplin cek-skill-dulu sebelum merespons apapun. | obra/superpowers |
| `unit-test` | Generate unit test + edge/error/boundary case per framework, self-healing loop. | skills-hub-registry (signed) |
| `code-review-and-quality` | Review 5 sumbu + quality gate, change sizing, dependency discipline. | MIT · addyosmani |
| `context-engineering` | Kurasi konteks agen: hierarki, budget, confusion handling. | MIT · addyosmani |

> **Tambah skill baru:** copy folder (`SKILL.md` + asetnya, jangan cuma file) ke `skills/<nama>/`, daftarkan di `skillDirs` pada `packages/dsh/src/index.ts` **dan** `packages/opencode/src/index.ts`, lalu restart harness. Diinstall global? Sinkronkan juga ke `~/.config/opencode/plugins/massmith/skills/` dan `~/.commandcode/skills/`.

---

## 🔗 Gabungan dengan Superagent

Massmith (guardrail) + **Superagent** ([Trigger → Eval/gate → Ticket → Assignment](https://github.com/mithmass89/opencode-superagent)) saling melengkapi — tidak perlu dipilih salah satu.

| Lapisan | Massmith | Superagent |
|:---|:---|:---|
| **Peran** | Keamanan & kualitas kode | Workflow tiket |
| **Plugin id** | `massmith-coding-harness` | `dsh-superagent` |
| **Tools** | `massmith/diff_check`, `massmith/repo_size` | `dsh_intake`, `dsh_list`, `dsh_accept`, `dsh_stop` |
| **Commands** | `/review`, `/massmith-status` | `/dsh-triage`, `/dsh-status` |
| **Storage** | `ctx.storage` (namespace per plugin) | `<project>/.dsh/tickets.sqlite` |
| **Background** | Tidak ada | Poll GitHub (opsional, `pollIntervalMs`) |

**Pasang sekali (OpenCode global)** — urutan penting, Massmith dulu agar guard-nya jalan sebelum tool lain:

```jsonc
{ "$schema": "https://opencode.ai/config.json",
  "plugins": [
    { "package": "./plugins/massmith", "options": { "strict": false, "verbose": false } },
    { "package": "./plugins/dsh-superagent", "options": { "mention": "@superagent", "requireMention": true, "autoMode": true, "pollIntervalMs": 0 } }
  ] }
```

Verifikasi: `opencode plugin list` menampilkan dua baris ber-ID. **Command Code:** `~/.commandcode/mods/massmith.ts` (+ `core/`, `skills/`) dan `dsh-superagent.ts` → cek `cmd mods list`.

**Saat keduanya aktif:** prompt masuk → kedua system-prompt tersuntik; tool dipanggil → Massmith memblokir yang berbahaya dulu, sisanya ke Superagent (Trigger→gate→Ticket); hasil tool → Massmith redact + flag `DEPRECATED`, Superagent simpan tiket; akhir turn → summary + update tiket.

| Kebutuhan | Pakai |
|:---|:---|
| Cuma mau aman saat coding | Massmith saja |
| Cuma mau workflow tiket dari issue | Superagent saja |
| Issue → tiket → dikerjakan agent ber-guardrail | **Keduanya** (disarankan) |

---

## 🎬 Demo

| File | Skor | Isi |
|:---|:---:|:---|
| [`demo/wirasolution-dengan-harness.html`](demo/wirasolution-dengan-harness.html) | **98/100** | `HARNESS AKTIF`, terminal hijau, playground blokir perintah berbahaya. |
| [`demo/wirasolution-tanpa-harness.html`](demo/wirasolution-tanpa-harness.html) | **42/100** | `TANPA HARNESS`, terminal merah, semua perintah "DIJALANKAN", overlay risiko. |

---

## 🛠️ Development

```bash
git clone https://github.com/mithmass89/massmith-coding-harness.git
cd massmith-coding-harness
corepack enable && pnpm install   # Node ^22.19.0 || >=24.0.0, tsx, tanpa build step wajib
```

```bash
pnpm test   # core + dsh + commandcode → all assertions passed
```

Yang di-assert: `--no-verify` diblokir saat `strict=true`; safe command lolos; `composeSystemPrompt` & `redactSecrets` & `isDangerousCommand`; `checkDiff` warning test hilang + enforce `maxDiffLines`; `parseGitNumstat`; adapter dsh register 3 tool + 3 command + guard; guard menolak + fallback `pre-execute` memanggil `next()`; `post-execute` redact + flag `DEPRECATED`.

```bash
cmd mods list && cmd mods inspect ./packages/commandcode/index.ts
cmd -p "halo" --mod ./packages/commandcode/index.ts
opencode plugin list   # ID, bukan "-"
"C:\Users\<you>\AppData\Local\Programs\ai.opencode.desktop\resources\opencode-cli.exe" plugin list
dsh --profile web --dump-config && dsh plugin add ./packages/dsh
```

### Contributing

1. Fork → `git checkout -b feat/nama-fitur`.
2. Logika baru di `packages/core/src/index.ts` dulu, lalu petakan ke 3 adapter.
3. Perkuat assert di `__tests__/`.
4. `pnpm test` hijau → PR 1 kalimat + cara verifikasi per host.

---

## 🔒 Keamanan

- **Tanpa sandbox** untuk mod/plugin — install hanya kode tepercaya (`cmd mods inspect`, `cmd --safe-mode`).
- `massmith_verify` lewat `ctx.shell` mengikuti executor/sandbox dsh; guard deny-list lapis pertama, bukan pengganti sandbox.
- OpenCode: prefix `-` / `-*` sebagai kill switch. dsh: selalu `--dump-config` sebelum boot (patch bisa override bundle).
- Temu kerentanan? Buka issue label `security` dulu sebelum fork.

---

## 🗺️ Roadmap

- [x] Skills terpasang via prompt section **dan** registrasi native `ctx.skills` (dsh).
- [ ] Provider baru (`cmd.addProvider` / `ctx.provider.transform` / adapter `ctx.llm`).
- [ ] MCP server (`ctx.mcp.transform` / register di `ctx.tools`).
- [ ] GUI OpenCode Desktop (`./gui-experimental`: `Command`, `Panel`, `SettingsPage`).
- [ ] Publish npm + registry (`cmd-mod`, OpenCode, `dsh-plugin`).

---

## 📄 Lisensi

MIT. Lihat [LICENSE](LICENSE).

---

<div align="center">

*Built for Command Code, OpenCode, and DeepSeek Harness — one core, three adapters, zero copy-paste.*

</div>
