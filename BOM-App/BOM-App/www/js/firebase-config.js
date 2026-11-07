/* =========================================================
   Configuração do Firebase do BOM!

   Enquanto estiver como null, o app funciona no MODO LOCAL
   (contas, log e arquivos só neste aparelho, com contas de teste).

   Para ligar o MODO NUVEM (login em qualquer dispositivo, log no Firestore):
   Console do Firebase → ⚙ Configurações do projeto → Seus apps → app Web (</>)
   → copie o objeto firebaseConfig e cole no lugar do null abaixo.
   Passo a passo completo em CONFIGURAR-FIREBASE.md.

   Esses dados não são senhas: a proteção fica nas regras do Firestore.
   ========================================================= */
window.BOM_FIREBASE_CONFIG = null;

/* Exemplo de como fica depois de colar:
window.BOM_FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "bom-app-xxxx.firebaseapp.com",
  projectId: "bom-app-xxxx",
  storageBucket: "bom-app-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
*/
