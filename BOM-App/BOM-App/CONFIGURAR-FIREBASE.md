# Ligar o BOM! ao Firebase (modo nuvem)

Sem configuração, o app roda no **modo local** (tudo no aparelho, com contas de teste).
Com o Firebase ligado, ele passa ao **modo nuvem**, como pedem as seções 8 e 9 do documento:

| Dado | Onde fica |
| --- | --- |
| E-mail e senha | Firebase Authentication (a senha nunca fica no app) |
| Perfil do usuário | Firestore, coleção `usuarios` |
| Dispositivos usados | Firestore, subcoleção `usuarios/{uid}/dispositivos` |
| Log de acesso | Firestore, coleção `logs_acesso` |
| PDFs e pastas | Armazenamento interno do aparelho |

O plano gratuito do Firebase (Spark) é suficiente.

## 1. Criar o projeto
1. Acesse **console.firebase.google.com** com sua conta Google.
2. Clique em **Adicionar projeto** (ou **Criar um projeto**), dê o nome `bom-app` e avance. O Google Analytics pode ficar desativado.

## 2. Ativar o login por e-mail e senha
1. No menu, abra **Criação → Authentication** e clique em **Vamos começar**.
2. Na aba **Método de login**, escolha **E-mail/senha**, ative a primeira chave e clique em **Salvar**.

## 3. Criar o banco Firestore
1. Abra **Criação → Firestore Database** e clique em **Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)**. Modo: **produção**. Clique em **Criar**.
3. Na aba **Regras**, apague o conteúdo, cole o arquivo `firebase/firestore.rules` deste projeto e clique em **Publicar**.

## 4. Copiar a configuração para o app
1. Clique na engrenagem ⚙ → **Configurações do projeto**.
2. Em **Seus apps**, clique no ícone **Web `</>`**, dê um apelido (ex.: `bom-web`) e clique em **Registrar app**.
3. Copie o objeto `firebaseConfig` que aparece (apiKey, authDomain, projectId…).
4. Abra `js/firebase-config.js` e troque o `null` pelo objeto copiado:
   ```js
   window.BOM_FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "bom-app-xxxx.firebaseapp.com",
     projectId: "bom-app-xxxx",
     storageBucket: "bom-app-xxxx.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
   - **Versão web (VS Code):** `BOM-Organizador/js/firebase-config.js`
   - **APK (GitHub):** no repositório, abra `BOM-App/BOM-App/www/js/firebase-config.js`, clique no lápis ✏️, cole e faça **Commit changes**. Um APK novo é gerado sozinho.

Esses dados não são senhas: quem protege o banco são as regras do passo 3.

## 5. Criar o administrador
Por segurança, ninguém consegue se cadastrar como administrador pelo app.
1. Abra o app e **cadastre-se** normalmente com o e-mail que será o administrador.
2. No console, abra **Firestore Database → Dados → usuarios** e clique no documento com o seu e-mail.
3. No campo `perfil`, clique no lápis, troque `usuario` por **`admin`** e salve.
4. Entre na **área do administrador** (`admin.html` no computador, ou "Área do administrador" no app).

## 6. Conferir
- A tela de login mostra **"● Conectado à nuvem (Firebase)"** e as contas de teste somem.
- Entre com a mesma conta no celular (APK) e no computador: os dois acessos aparecem em **Meus acessos** e no **Log de acessos** do administrador.
- Em **Authentication → Usuários** aparecem as contas, e em **Firestore → Dados** aparecem `usuarios` e `logs_acesso`.

## Problemas comuns
| Mensagem | O que fazer |
| --- | --- |
| "Login por e-mail e senha não está ativado no Firebase." | Refaça o passo 2. |
| "Sem permissão no banco de dados" | Refaça o passo 3 (publicar as regras). |
| "Firebase não conectou: … Usando o modo local." | Sem internet, ou a configuração foi colada errada. Confira as vírgulas e aspas do passo 4. |
| "Perfil não encontrado" | A conta existe no Authentication, mas falta o documento em `usuarios`. Cadastre a conta pelo app, não pelo console. |
