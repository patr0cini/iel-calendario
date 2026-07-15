import type { MomentKey, Song } from "./types";

// The Sunday liturgy outline (decision of 2026-07-15). Kept in one place so the
// page, the print sheet and the public share page agree.
//
// Boas vindas · Louvor e adoração · Leitura e oração · Pregação
// [· Ceia, only on communion Sundays] · Louvor e adoração · Oferta
// · Anúncios · Despedida

export const MOMENT_LABEL: Record<MomentKey, string> = {
  boas_vindas: "Boas vindas",
  leitura_oracao: "Leitura e oração",
  oferta: "Oferta",
  anuncios: "Anúncios",
  despedida: "Despedida",
};

/** Song moments (DB enum) grouped into the two worship blocks. */
const SONGS_BEFORE = ["abertura", "adoracao"];
const SONGS_COMMUNION = ["ceia"];
const SONGS_AFTER = ["final", "outro"];

export const songsBefore = (songs: Song[]) => songs.filter((s) => SONGS_BEFORE.includes(s.moment));
export const songsCommunion = (songs: Song[]) => songs.filter((s) => SONGS_COMMUNION.includes(s.moment));
export const songsAfter = (songs: Song[]) => songs.filter((s) => SONGS_AFTER.includes(s.moment));
