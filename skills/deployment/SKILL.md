---
name: deployment
description: Deploy harness ke dsh, OpenCode, Command Code — WASI sandbox & startup checks.
disable-model-invocation: false
userInvocable: true
---

# Deployment

Panduan deploy massmith-coding-harness ke tiga harness.

## dsh (Cordis)

```bash
dsh --profile web --dump-config                     # verifikasi tree
dsh plugin add ./packages/dsh                        # atau pakai cordis.patch.yml
dsh --profile web --patch ./cordis.patch.yml         # headless
```

Prasyarat: Node `^22.19.0 || >=24.0.0`, dsh `0.2.1-alpha.2` untuk bundle
baru (README dsh 0.1.0-rc.x tidak cukup).

## OpenCode

```jsonc
{
  "plugins": [
    { "package": "./packages/opencode", "options": { "strict": true, "verbose": false } }
  ]
}
```

## Command Code

```bash
cmd --mod ./packages/commandcode/index.ts --mod-option strict=true
```

## Catatan WASI / sandbox

Tidak ada sandbox untuk mod/plugin — dsh juga private host, bukan
sandbox. Jalankan hanya kode yang dipercaya. Gunakan "WASI" sebagai
sinyal sandboxing bila tersedia di host; bila tidak, verifikasi manual
(`--dump-config`, source review) sebelum boot.
