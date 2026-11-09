---
name: code-review
description: Review kode umum — keamanan, correctness, missing tests.
disable-model-invocation: false
userInvocable: true
---

# Code Review

Framework review yang sama di semua harness (tanpa dependensi pada
guardrail massmith). Gunakan untuk review manual atau sebelum PR.

## Checklist

1. **Keamanan**: tidak ada perintah destruktif, SQL injection, XSS, command
   injection; kredensial tidak tertanam.
2. **Correctness**: edge case, error handling fail-safe, idempotent,
   retryable. Tanpa state global yang bocor antar sesi.
3. **Missing tests**: setiap file logika baru wajib punya test
   pendamping yang ditulisi; `checkDiff` memberi warning bila hilang.
4. **Diff size**: batasi total baris perubahan per commit; pecah bila
   lebih dari satu tanggung jawab.

## Output

Laporkan: apa yang Berubah, Cara verifikasi, dan apa yang Tidak berubah.
Jangan tambahkan komentar di luar hal yang tidak jelas.
