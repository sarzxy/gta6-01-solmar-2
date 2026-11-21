// SOLMAR — entry program for make.fun's gta6-01 bounty ("Make GTA 6").
//
// Running this file with Node 22 hands the game in: it copies the playable
// game (game/) and its screenshots (screenshots/) from this repository into
// the output directory, then writes the entry's dossier.json with the kit's
// own library (vendor/makefun-game.ts, copied unchanged), so the dossier is
// byte for byte the one the scorer rebuilds from the same files.
//
// The output directory is /output under the grader; anywhere else the
// MAKEFUN_OUTPUT_DIR environment variable names it.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps for this bounty, passed whole so this program refuses
// exactly where the scorer would: at most 160 KiB of source text in the
// dossier, at most 4 screenshots of at most 256 KiB each, and a game/ tree
// of at most 993 entries and 48 MiB with no path over 1,000 bytes.
const GATE_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function handIn(): void {
  // Start from an empty output directory so two runs write the same bytes.
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  for (const part of ['game', 'screenshots']) {
    cpSync(join(repoDir, part), join(outputDir, part), { recursive: true });
  }

  const dossier = buildDossier(outputDir, GATE_CAPS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);

  const bytes = typeof dossier === 'string' ? Buffer.byteLength(dossier) : dossier.length;
  console.log(`SOLMAR handed in: game/ + screenshots/ copied, dossier.json written (${bytes} bytes).`);
}

handIn();
