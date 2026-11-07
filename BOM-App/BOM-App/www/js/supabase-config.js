/* =========================================================
   Configuração do Supabase do BOM!

   Enquanto estiver como null, o app usa o Firebase (se configurado)
   ou o MODO LOCAL (tudo neste aparelho, com contas de teste).

   Para ligar o Supabase:
   Painel do Supabase → Project Settings → API (ou "Data API" / "API Keys")
   → copie a Project URL e a chave anon public (ou "publishable") e cole abaixo.
   Passo a passo completo em CONFIGURAR-SUPABASE.md.

   A chave anon/publishable não é senha: a proteção fica nas regras (RLS) do banco.
   ========================================================= */
window.BOM_SUPABASE_CONFIG = {
  url: "https://fiulewspenhuxgcuwprn.supabase.co",
  anonKey: "sb_publishable_f_E3bbI5xze2yb4YWXt_rA_ArmuL5CV"
};

/* Exemplo de como fica depois de colar:
window.BOM_SUPABASE_CONFIG = {
  url: "https://abcdefghijkl.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
};
*/
