# AGENTS.md — massmith-coding-harness + antislop

Satu core, tiga adapter: Command Code · OpenCode · DeepSeek Harness.
Guardrail: `packages/core` (validateCommand, redactSecrets, checkDiff). UI: `DESIGN.md` + antislop.

## Cara pakai skill
Prompt hanya bawa katalog. Load penuh via:
- dsh: `tool-skill` (native `ctx.skills`)
- OpenCode: `massmith/skill {name}`
- CommandCode: `massmith_skill_load {name}`

17 skill di `skills/`: 4 inti + 7 komunitas + 6 antislop (`antislop`, `antislop-ui`, `antislop-copywriting`, `antislop-human`, `antislop-layoutmobile`, `antislop-code` v3.2.30).

## Aturan UI
1. Baca `DESIGN.md` dulu (arah). Tanpa itu output = draft without direction, dial ENERGY 1 / RHYTHM 1 / MOTION 1.
2. Baca `antislop.md` (filter R-01 s/d R-40) + skill yang relevan.
3. Tanya mode: DURING (bangun baru) atau AFTER (audit `anti-slop/audit-001-*.md`).
4. Akhiri dengan Delivery Gate PASS/FAIL per baris + bukti (kontras, klik, mobile 360px, keyboard).

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read `antislop.md` (core) and then the skill for the task:
- UI / visual: `skills/antislop-ui/SKILL.md`
- Copy & text: `skills/antislop-copywriting/SKILL.md`
- People: `skills/antislop-human/SKILL.md`
- Mobile / responsive: `skills/antislop-layoutmobile/SKILL.md`
- Code comments: `skills/antislop-code/SKILL.md`
Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
Only an explicit choice of antislop during or after selects a session mode. A request to review, audit, or avoid file edits does not select a mode; read the global preference in that case. Another skill's mode does not select antislop's mode.
If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
To update antislop later: download `antislop.md` again, or run `npx antislop-ai --update` if it was installed as skill folders.
<!-- antislop:end -->
