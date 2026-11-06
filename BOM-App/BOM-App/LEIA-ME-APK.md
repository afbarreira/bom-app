# BOM! — como gerar o APK para Android

Este projeto coloca o protótipo HTML dentro de um app Android de verdade usando o **Capacitor**.
O código das telas é o mesmo da versão web e fica em `www/`.

## O que muda no app Android
- **Os dados ficam salvos de verdade.** Pastas, arquivos importados, anotações, sessão e log continuam lá depois de fechar o app ou reiniciar o celular.
- **Funciona sem internet.** As bibliotecas de PDF vão dentro do app, em `www/libs`.
- **Enviar para** abre o compartilhamento do Android (WhatsApp, e-mail, Drive…).
- **Salvar uma cópia** grava o arquivo em *Documentos › BOM* no celular.
- O **botão voltar** do Android fecha menus, sai da seleção, volta de pasta e, na tela inicial, fecha o app.
- Tem ícone e tela de abertura com a logo do BOM!.

## Estrutura
```
BOM-App/
├── www/                      → o app (index.html, css, js, img; libs é preenchida na compilação)
├── assets/                   → ícone e tela de abertura usados para gerar os ícones do Android
├── scripts/copy-libs.js      → copia pdf.js e jsPDF para www/libs
├── capacitor.config.json     → nome do app (BOM!), id (br.com.bom.organizador) e cores
├── package.json              → dependências e comandos
└── .github/workflows/gerar-apk.yml → gera o APK automaticamente no GitHub
```

---

## Opção 1: gerar o APK pelo GitHub (recomendada, sem instalar nada)

1. Crie uma conta em **github.com**, se ainda não tiver.
2. Clique em **New repository**, dê um nome (ex.: `bom-app`) e crie o repositório. Pode ser privado.
3. Na página do repositório, clique em **uploading an existing file** e arraste **todo o conteúdo** da pasta `BOM-App` (as pastas `www`, `assets`, `scripts`, `.github` e os arquivos). Depois clique em **Commit changes**.
   - A pasta `.github` começa com ponto e pode ficar oculta no seu PC. Se ela não subir, crie o arquivo direto no site: **Add file → Create new file**, escreva o nome `.github/workflows/gerar-apk.yml` e cole o conteúdo do arquivo de mesmo nome.
4. Abra a aba **Actions**. A tarefa **Gerar APK do BOM!** começa sozinha e leva cerca de 5 a 8 minutos. Se não começar, clique nela e em **Run workflow**.
5. Quando ficar verde ✅, clique na execução e, em **Artifacts**, baixe **BOM-Organizador-APK**. Dentro do .zip está o **BOM-Organizador.apk**.

Sempre que você alterar algo em `www/` e enviar ao GitHub, um APK novo é gerado.

## Opção 2: gerar no seu computador (Android Studio)

Instale antes:
- **Node.js 20** (nodejs.org)
- **Android Studio** (developer.android.com/studio). Na primeira abertura ele instala o Android SDK. Ele já inclui o Java 17.

No terminal, dentro da pasta `BOM-App`:
```bash
npm install
npm run prepare:android    # copia as bibliotecas, cria a pasta android, gera ícones e sincroniza
npx cap open android       # abre no Android Studio
```
No Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
O arquivo sai em `android/app/build/outputs/apk/debug/app-debug.apk`.

Para testar direto num celular ligado por USB (com a depuração USB ativada): clique em ▶ **Run**.

Depois de mudar algo em `www/`, rode `npx cap sync android` antes de compilar de novo.

## Instalar o APK no celular
1. Envie o `.apk` para o celular (WhatsApp, Drive, cabo USB…).
2. Toque no arquivo. O Android vai pedir para **permitir a instalação de apps desta fonte**: permita.
3. Toque em **Instalar**. O app **BOM!** aparece na tela inicial.

Esse APK é uma versão de teste (debug), boa para apresentar e distribuir para a turma.
Para publicar na Play Store, é preciso gerar uma versão assinada (`Build → Generate Signed App Bundle`) e criar uma conta de desenvolvedor no Google Play.

## Contas de teste
| Perfil | E-mail | Senha |
| --- | --- | --- |
| Usuário | ana@bom.app | 123456 |
| Administrador | admin@bom.app | admin123 |
| Conta desativada | bruno@bom.app | 123456 |
