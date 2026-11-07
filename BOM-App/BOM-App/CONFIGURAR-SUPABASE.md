# Guardar o banco de dados do BOM! no Supabase

Com o Supabase ligado, o app guarda contas, dispositivos e log de acesso na nuvem. O login funciona em qualquer dispositivo e o administrador vê o log de todos.

| Dado | Onde fica no Supabase |
| --- | --- |
| E-mail e senha | **Supabase Auth** (a senha nunca vai para as tabelas nem para o app) |
| Perfil do usuário | Tabela `usuarios` |
| Dispositivos usados | Tabela `dispositivos` |
| Log de acesso | Tabela `logs_acesso` |
| PDFs e pastas | Armazenamento interno do aparelho (não vão para o Supabase) |

O plano gratuito é suficiente. Projetos gratuitos **pausam depois de 7 dias sem uso**: se isso acontecer, abra o painel e clique em **Restore project**.

## 1. Criar o projeto
1. Acesse **supabase.com** e clique em **Start your project**. Dá para entrar com a sua conta do GitHub.
2. Clique em **New project**:
   - **Name:** `bom-app`
   - **Database Password:** crie uma senha forte e **guarde**, porque o app não usa, mas o painel pode pedir.
   - **Region:** *South America (São Paulo)*
3. Clique em **Create new project** e espere uns 2 minutos.

## 2. Criar as tabelas e as regras de segurança
1. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo `supabase/schema.sql` deste projeto, copie **tudo** e cole no editor.
3. Clique em **Run**. Deve aparecer *Success. No rows returned*.
4. Confira em **Table Editor**: devem aparecer as tabelas `usuarios`, `dispositivos` e `logs_acesso`, com um cadeado de **RLS enabled**.

O script cria:
- as 3 tabelas, com os campos do documento;
- as regras de segurança (RLS): cada um vê só o próprio histórico, só o admin vê tudo e só ele ativa ou desativa contas;
- as permissões por coluna: no cadastro, ninguém consegue se criar como admin, e o log só aceita preencher a hora de logout.

O script não usa funções (`create function`), então funciona mesmo nos editores que recusam esse comando. Pode rodar mais de uma vez sem problema.

## 3. Configurar o login por e-mail
1. Abra **Authentication → Sign In / Providers** (em versões antigas, **Providers**) e clique em **Email**.
2. Deixe **Enable Email provider** ligado.
3. **Recomendado para o protótipo:** desligue **Confirm email** e clique em **Save**.
   - Se deixar ligado, o Supabase manda um e-mail de confirmação no cadastro, e a pessoa só consegue entrar depois de clicar no link.

## 4. Copiar a URL e a chave para o app
1. Clique em **Connect**, no topo do painel, ou abra **Project Settings → API Keys** / **Data API**.
2. Copie:
   - **Project URL**, algo como `https://abcdefghijkl.supabase.co`
   - **anon public key**, que começa com `eyJ...`, ou a **publishable key** (`sb_publishable_...`)
3. Abra `js/supabase-config.js` e troque o `null`:
   ```js
   window.BOM_SUPABASE_CONFIG = {
     url: "https://abcdefghijkl.supabase.co",
     anonKey: "cole-aqui-a-chave-anon-ou-publishable"
   };
   ```
   - **Versão web (VS Code):** `BOM-Organizador/js/supabase-config.js`
   - **APK (GitHub):** no repositório, abra `BOM-App/BOM-App/www/js/supabase-config.js`, clique no lápis ✏️, cole e faça **Commit changes**. Um APK novo é gerado sozinho.

⚠️ Use só a chave **anon/publishable**. **Nunca** coloque a chave `service_role` / `secret` no app.

## 5. Criar o administrador
1. Abra o app e **cadastre-se** com o e-mail que será o administrador.
2. No Supabase, abra **SQL Editor**, cole as **duas linhas** abaixo trocando o e-mail nas duas, e clique em **Run**:
   ```sql
   update public.usuarios set perfil = 'admin' where email = 'seu-email@exemplo.com';
   update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"perfil":"admin"}' where email = 'seu-email@exemplo.com';
   ```
   - A primeira linha mostra "Administrador" no app.
   - A segunda dá a permissão de verdade, guardada no Supabase Auth, onde o app não consegue mexer.
3. **Saia do app e entre de novo**, para a permissão valer.
4. Entre na **área do administrador**: `admin.html` no computador, ou "Área do administrador" no app.

## 6. Conferir
- A tela de login mostra **"● Conectado à nuvem (Supabase)"** e as contas de teste somem.
- Depois de entrar no celular e no computador com a mesma conta:
  - **Authentication → Users** mostra a conta;
  - **Table Editor → logs_acesso** mostra os dois acessos, com data, hora de login, dispositivo e situação;
  - ao tocar em **Sair**, a coluna `hora_logout` é preenchida e `situacao` vira `encerrada`.

## Problemas comuns
| Mensagem no app | O que fazer |
| --- | --- |
| "As tabelas não existem no Supabase…" | Rode o `schema.sql` (passo 2). |
| "Perfil não foi criado…" | Rode o `schema.sql` de novo e entre com a conta: o perfil é criado no primeiro login. |
| "sql parser error … found: function" | Você usou uma versão antiga do `schema.sql`. Use a versão nova, que não tem funções. |
| O admin entra, mas o log aparece vazio ou só com os próprios acessos | Falta a segunda linha do passo 5, ou você não saiu e entrou de novo no app. |
| "Conta criada! Abra o e-mail de confirmação…" | O **Confirm email** está ligado (passo 3). Confirme pelo e-mail ou desligue a opção. |
| "Confirme seu e-mail… antes de entrar." | Mesmo caso acima. |
| "Sem permissão no banco de dados…" | As regras não foram criadas: rode o `schema.sql` de novo. |
| "A nuvem não conectou… Usando o modo local." | Sem internet, URL ou chave coladas erradas, ou projeto pausado. |

## Sobre o documento do projeto
As seções 5, 8 e 9 do documento citam o **Firebase**. Se a equipe for usar o Supabase, troque por:
- **Firebase Authentication → Supabase Auth**
- **Cloud Firestore → banco PostgreSQL do Supabase**
- **coleção / subcoleção → tabela** (`usuarios`, `dispositivos`, `logs_acesso`)
- **regras do Firestore → políticas RLS (Row Level Security)**

O modelo de dados (3 entidades e 3 relacionamentos 1:N) e os 5 módulos de persistência continuam iguais.
