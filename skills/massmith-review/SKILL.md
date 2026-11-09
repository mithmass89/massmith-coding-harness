---
name: massmith-review
description: Review diff untuk keamanan dan missing tests sebelum commit.
disable-model-invocation: false
userInvocable: true
---

# Massmith Review (Guardrail)

Jalankan sebelum commit, test, atau push. Massmith harness memblokir
perintah destruktif; kamu yang memastikan diff aman dan ter-review.

## Langkah

1. **Perintah berbahaya**: tolak `--no-verify`, `rm -rf /`, `rm -rf $HOME`,
   `drop table/database`, `git push --force`, `git reset --hard`, `mkfs`.
   Gunakan `git commit` tanpa flag skip hook; biarkan hook jalan.
2. **Diff check**: jalankan tool `massmith_diff_check` untuk file berubah yang
   akan di-commit. Atasi warning "no test file found" sebelum lanjut.
3. **Secret redaction**: jangan pernah menulis `api_key=`, token
   bearer, atau blok private key ke file ter-commit. Redaksi otomatis
   menolaknya di post-execute; hentikan hal yang sama secara manual.
4. **DEPRECATED**: bila tool result menyebut `DEPRECATED`, angkat ke user.

## Aturan

- Satu perubahan, satu commit. Diff kecil dan reviewable lebih baik.
- Tanpa `validateCommand` lolos, perubahan tidak boleh commit.
