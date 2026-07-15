// The Sunday liturgy outline. Shared by the API, the app and the public share
// page so all three tell the same story.
//
// Order: Boas vindas · Louvor e adoração · Leitura e oração · Pregação
//        [· Ceia, only on communion Sundays] · Louvor e adoração · Oferta
//        · Anúncios · Despedida

export type MomentKey =
  | "boas_vindas"
  | "leitura_oracao"
  | "oferta"
  | "anuncios"
  | "despedida";

/** Moments backed by a `service_moments` row (person in charge + note). */
export const MOMENT_KEYS: MomentKey[] = [
  "boas_vindas",
  "leitura_oracao",
  "oferta",
  "anuncios",
  "despedida",
];

export const MOMENT_LABEL: Record<MomentKey, string> = {
  boas_vindas: "Boas vindas",
  leitura_oracao: "Leitura e oração",
  oferta: "Oferta",
  anuncios: "Anúncios",
  despedida: "Despedida",
};

/** Song moments (DB enum) grouped into the two worship blocks. */
export const SONGS_BEFORE = ["abertura", "adoracao"];
export const SONGS_COMMUNION = ["ceia"];
export const SONGS_AFTER = ["final", "outro"];
