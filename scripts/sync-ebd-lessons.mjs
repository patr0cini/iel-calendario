// Copies each lesson title from ebd.html (LICOES, tipo "licao") into the
// "tema da lição" of that Sunday in app.iel.pt (services.ebd_theme).
// Never overwrites a theme someone typed by hand: those are listed instead.
//
//   EBD_API=https://<ref>.supabase.co/functions/v1 EBD_TOKEN=<admin token> \
//     node scripts/sync-ebd-lessons.mjs [--dry-run]
//
// Run it again after editing LICOES in ebd.html.

import { readFileSync } from "node:fs";

const API = process.env.EBD_API;
const TOKEN = process.env.EBD_TOKEN;
const dryRun = process.argv.includes("--dry-run");
if (!API || !TOKEN) throw new Error("EBD_API and EBD_TOKEN are required");

const html = readFileSync(new URL("../ebd.html", import.meta.url), "utf8");
const start = html.indexOf("const LICOES = ") + "const LICOES = ".length;
const licoes = JSON.parse(html.slice(start, html.indexOf("];", start) + 1)).filter((l) => l.tipo === "licao");

const headers = { "Content-Type": "application/json", "x-access-token": TOKEN };
const byDate = new Map();
for (const year of new Set(licoes.map((l) => l.data.slice(0, 4)))) {
  const r = await fetch(`${API}/services?year=${year}`, { headers });
  if (!r.ok) throw new Error(`services ${year}: ${r.status}`);
  for (const s of await r.json()) byDate.set(s.service_date, s);
}

let set = 0, same = 0;
const missing = [], kept = [];
for (const l of licoes) {
  const s = byDate.get(l.data);
  if (!s) { missing.push(l.data); continue; }
  if (s.ebd_theme === l.titulo) { same++; continue; }
  if (s.ebd_theme) { kept.push(`${l.data}: "${s.ebd_theme}" (lição: "${l.titulo}")`); continue; }
  if (!dryRun) {
    const r = await fetch(`${API}/services/${s.id}`, { method: "PATCH", headers, body: JSON.stringify({ ebd_theme: l.titulo }) });
    if (!r.ok) throw new Error(`${l.data}: ${r.status} ${await r.text()}`);
  }
  set++;
}
console.log(`${licoes.length} lições · ${set} temas ${dryRun ? "por definir" : "definidos"} · ${same} já iguais`);
if (kept.length) console.log("Tema diferente já escrito à mão (não alterado):\n  " + kept.join("\n  "));
if (missing.length) console.log("Sem culto nessa data: " + missing.join(", "));
