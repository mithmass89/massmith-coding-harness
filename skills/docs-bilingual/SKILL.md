---
name: docs-bilingual
description: Tulis dokumentasi bilingual (EN/ZH atau EN/ID) sejalan docs/AGENTS.md upstream.
disable-model-invocation: false
userInvocable: true
---

# Docs Bilingual

Workflow penulisan docs bilingual untuk repo ini, mengikuti konvensi
upstream `docs/AGENTS.md`.

## Prinsip

- Satu paragraf per baris fisik; satu fact satu rumah (one home per fact).
- Dua bahasa wajib: versi EN dan versi kedua (ZH/ID) dengan isi setara.
- Bahasa kedua dirujuk dari README utama; tanpa terjemahan parsial.
- Gunakan istilah konkret; hindari metafora; dokumentasikan kontrak
  (precondition, postcondition, failure) secara lengkap.

## Cek sebelum commit

1. Semua link lokal resolve (`docs/` links).
2. Tidak ada merge conflict marker.
3. Tabel/link terdaftar di README utama.
