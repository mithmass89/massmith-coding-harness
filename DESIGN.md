# DESIGN.md — Wirasolution + Massmith Harness

> Arah visual untuk semua UI di repo ini. Antislop adalah filter, file ini adalah jiwa (R-37).

## Identitas
Wirasolution: jasa pembuatan website untuk UMKM Indonesia yang ingin naik kelas. Bahasa Indonesia polos, jujur, tanpa hype. Bukan startup AI global, bukan template SaaS.

## Personality
Ramah, berani, dapat dipercaya. Seperti konsultan tetangga yang paham dagang, bukan salesman.

## Palet (2 core + 1 aksen, R-29)
- Paper `#FAF7F1` — base terang, bukan putih steril, hangat UMKM.
- Ink `#17211C` — near-black hijau, untuk teks utama. Kontras 15.2:1 di atas paper (R-25 PASS).
- Hijau usaha `#0E5E3A` — primer, dipakai untuk header section dan status harness aktif. Alasan: hijau warung/toko, bukan ungu AI default (R-01).
- Aksen CTA `#E8722A` — hanya untuk 1 tombol utama per layar. Tidak dipakai di badge, ikon, dan garis sekaligus.
- Netral: `#5B6570` untuk muted (4.6:1 di atas paper, R-25 PASS).

Larangan: tidak ada gradient blue-purple, tidak ada glow, glass hanya di 1 panel playground (R-10, R-13).

## Tipografi (R-06)
- Display: `Plus Jakarta Sans` Bold — karya desainer Indonesia, alasan identitas lokal, bukan default Inter/Space Grotesk.
- Body: `Inter` Regular — keterbacaan UMKM di HP murah.
- Mono: `JetBrains Mono` — hanya di blok playground `validateCommand()`, bukan heading.

## Layout & Ritme
Dial: ENERGY 2 / RHYTHM 3 / MOTION 1.
- RHYTHM 3: tiap section beda komposisi. Hero kiri-teks kanan-demo, layanan list 2 kolom, proses timeline horizontal, harga tabel 2 tier (Starter/Bisnis, bukan 3 kolom default R-05).
- Radius: 10px kartu, 999px hanya tombol utama. Tidak semua pill (R-11).
- Motion: hover saja, reveal 1x, hormati `prefers-reduced-motion` (R-19, R-39).

## Motif identitas
Hairline 1px + label mono kecil `// harness: aktif`. Diulang di tiap section sebagai penanda, bukan grid/dot background (R-07).

## Aturan konten (R-17, R-18, R-36, R-38)
- Tidak ada angka tanpa sumber. Statistik demo (`120+ proyek`) wajib diganti `[REAL DATA]` atau dihapus.
- Tidak ada testimoni fiktif. Tidak ada klaim SOC2/ISO.
- CTA spesifik: `Minta Penawaran`, `Uji Guardrail`, bukan `Get Started`.
- Semua tombol punya `href` nyata, form ada empty/loading/error state (R-26, R-27).
- Navigasi hanya ke section yang ada (R-24). FAQ hanya pertanyaan asli pelanggan.

## Verifikasi (R-35)
Sebelum klaim PASS: jalankan halaman, cek console 0 error, klik semua tombol, cek mobile 360px tanpa overflow horizontal, cek keyboard Tab/Enter/Escape, cek kontras pakai `skills/antislop-human/contrast-check.py`.
