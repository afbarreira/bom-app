/* =========================================================
   BOM! — Camada de persistência (seção 8 do documento)
   As telas NUNCA falam direto com o Firebase: usam só estes 5 módulos.

     1. Autenticacao   → Firebase Authentication (cadastro, login, logout, sessão salva)
     2. Usuario        → coleção  usuarios
     3. Dispositivo    → subcoleção usuarios/{uid}/dispositivos
     4. LogAcesso      → coleção  logs_acesso
     5. ArquivosLocais → PDFs e pastas no armazenamento do aparelho

   Modo NUVEM (Supabase): quando js/supabase-config.js tem a URL e a chave do projeto.
   Modo NUVEM (Firebase): quando js/firebase-config.js tem a configuração do projeto.
   Modo LOCAL: sem configuração, tudo fica no aparelho (para testes offline).
   ========================================================= */
(function () {
  'use strict';
  const sbCfg = window.BOM_SUPABASE_CONFIG || null;
  const cfg = sbCfg ? null : (window.BOM_FIREBASE_CONFIG || null);
  const MEMP = {};
  const LSP = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? (k in MEMP ? MEMP[k] : d) : JSON.parse(v); } catch (e) { return k in MEMP ? MEMP[k] : d; } },
    set(k, v) { MEMP[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return e && e.name === 'SecurityError'; } },
    del(k) { delete MEMP[k]; try { localStorage.removeItem(k); } catch (e) {} }
  };
  const novoId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  async function hashSenha(p) {
    try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bom:' + p)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    catch (e) { let h = 7; for (const c of 'bom:' + p) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h; }
  }

  let auth = null, db = null, SB = null;
  const BOM = window.BOM = {nuvem: false, provedor: 'local', erro: null, LSP, hashSenha};

  /* ---------- inicialização ---------- */
  BOM.iniciar = async function () {
    if (sbCfg) {
      try {
        await Promise.race([window.BOM_LIBS || Promise.resolve(), new Promise(r => setTimeout(r, 12000))]);
        if (!window.supabase || !supabase.createClient) throw new Error('A biblioteca do Supabase não carregou. Verifique a internet.');
        SB = supabase.createClient(String(sbCfg.url).replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, ''), sbCfg.anonKey, {auth: {persistSession: true, autoRefreshToken: true, storageKey: 'bom-auth'}});
        BOM.nuvem = true; BOM.provedor = 'Supabase'; return true;
      } catch (e) { console.error('[BOM] Supabase:', e); BOM.erro = String(e.message || e); SB = null; return false; }
    }
    if (!cfg) return false;
    try {
      await Promise.race([window.BOM_LIBS || Promise.resolve(), new Promise(r => setTimeout(r, 12000))]);
      if (!window.firebase || !firebase.auth || !firebase.firestore) throw new Error('As bibliotecas do Firebase não carregaram. Verifique a internet.');
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      auth = firebase.auth(); db = firebase.firestore();
      try { await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}
      BOM.nuvem = true; BOM.provedor = 'Firebase'; return true;
    } catch (e) { console.error('[BOM] Firebase:', e); BOM.erro = String(e.message || e); BOM.nuvem = false; return false; }
  };
  const TS = d => firebase.firestore.Timestamp.fromDate(d ? new Date(d) : new Date());
  const iso = v => v == null ? null : (v.toDate ? v.toDate().toISOString() : v);
  const ERROS = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-login-credentials': 'E-mail ou senha incorretos.', 'auth/invalid-email': 'Informe um e-mail válido.', 'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.', 'auth/network-request-failed': 'Sem conexão com a internet.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
    'auth/operation-not-allowed': 'Login por e-mail e senha não está ativado no Firebase.', 'permission-denied': 'Sem permissão no banco de dados (confira as regras do Firestore).', 'unavailable': 'Banco de dados indisponível. Verifique a internet.'
  };
  const erro = e => new Error(ERROS[e && e.code] || (e && e.message) || 'Erro inesperado.');
  /* ---------- Supabase: mensagens e conversão de nomes (snake_case ⇄ documento) ---------- */
  const SBERR = [[/invalid login credentials/i, 'E-mail ou senha incorretos.'], [/email not confirmed/i, 'Confirme seu e-mail (veja a caixa de entrada) antes de entrar.'], [/already registered|already exists/i, 'Já existe uma conta com este e-mail.'],
    [/password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'], [/rate limit|too many/i, 'Muitas tentativas. Aguarde alguns minutos.'], [/failed to fetch|network/i, 'Sem conexão com a internet.'],
    [/row-level security|permission denied/i, 'Sem permissão no banco de dados (confira se o schema.sql foi executado).'], [/relation .* does not exist|could not find the table/i, 'As tabelas não existem no Supabase. Execute o arquivo supabase/schema.sql.'], [/signups not allowed/i, 'Cadastro desativado no Supabase (Authentication → Providers → Email).']];
  const sbErro = e => { const m = String((e && e.message) || e || ''); const f = SBERR.find(([r]) => r.test(m)); return new Error(f ? f[1] : m || 'Erro inesperado.'); };
  const sbOk = ({data, error}) => { if (error) throw sbErro(error); return data; };
  const sbUser = r => r && ({uid: r.uid, nome: r.nome, email: r.email, perfil: r.perfil, ativo: r.ativo !== false, dataCadastro: r.data_cadastro});
  const sbDisp = r => ({idDispositivo: r.id_dispositivo, nomeDispositivo: r.nome_dispositivo, plataforma: r.plataforma, ultimoAcesso: r.ultimo_acesso});
  const sbLog = r => ({idLog: r.id_log, uid: r.uid, nomeUsuario: r.nome_usuario, idDispositivo: r.id_dispositivo, nomeDispositivo: r.nome_dispositivo || r.id_dispositivo, dataLogin: r.data_login, horaLogout: r.hora_logout, situacao: r.situacao});
  const agora = () => new Date().toISOString();

  /* ======================= 1. AUTENTICAÇÃO ======================= */
  BOM.Autenticacao = {
    /** Cadastra e-mail e senha. Retorna o uid da conta. */
    async cadastrar(email, senha, nome) {
      if (SB) {
        const d = sbOk(await SB.auth.signUp({email, password: senha, options: {data: {nome}}}));
        if (!d.session) throw new Error('Conta criada! Abra o e-mail de confirmação enviado pelo Supabase e depois entre. (Para não pedir confirmação, veja o passo 3 do CONFIGURAR-SUPABASE.md.)');
        return d.user.id;
      }
      if (BOM.nuvem) { try { return (await auth.createUserWithEmailAndPassword(email, senha)).user.uid; } catch (e) { throw erro(e); } }
      const users = LSP.get('bom_usuarios', []);
      if (users.some(u => u.email === email)) throw new Error('Já existe uma conta com este e-mail.');
      const uid = 'u-' + novoId(); users.push({uid, email, senhaHash: await hashSenha(senha)}); LSP.set('bom_usuarios', users); return uid;
    },
    /** Faz login com e-mail e senha. Retorna o uid. */
    async entrar(email, senha) {
      if (SB) return sbOk(await SB.auth.signInWithPassword({email, password: senha})).user.id;
      if (BOM.nuvem) { try { return (await auth.signInWithEmailAndPassword(email, senha)).user.uid; } catch (e) { throw erro(e); } }
      const u = LSP.get('bom_usuarios', []).find(x => x.email === email);
      if (!u || u.senhaHash !== await hashSenha(senha)) throw new Error('E-mail ou senha incorretos.');
      return u.uid;
    },
    /** Encerra a sessão. */
    async sair() { if (SB) { try { await SB.auth.signOut(); } catch (e) {} return; } if (BOM.nuvem) { try { await auth.signOut(); } catch (e) {} } },
    /** uid da sessão salva no aparelho (ou null). */
    async usuarioAtual() {
      if (SB) { try { const {data} = await SB.auth.getSession(); return data && data.session ? data.session.user.id : null; } catch (e) { return null; } }
      if (!BOM.nuvem) { const s = LSP.get('bom_session', null); return Promise.resolve(s ? s.uid : null); }
      return new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u ? u.uid : null); }); });
    }
  };

  /* ======================= 2. USUÁRIO (coleção usuarios) ======================= */
  const semSenha = u => { if (!u) return null; const {senhaHash, ...r} = u; return r; };
  const docUser = (id, d) => ({uid: id, nome: d.nome, email: d.email, perfil: d.perfil, ativo: d.ativo !== false, dataCadastro: iso(d.dataCadastro)});
  BOM.Usuario = {
    /** Cria o perfil no cadastro (sempre perfil "usuario" e conta ativa). */
    async criar({uid, nome, email}) {
      if (SB) { // cria a linha em "usuarios" (perfil "usuario" e ativo vêm do padrão da tabela)
        const ja = await BOM.Usuario.obter(uid); if (ja) return ja;
        if (!nome) { try { const {data} = await SB.auth.getUser(); nome = data.user.user_metadata && data.user.user_metadata.nome; } catch (e) {} }
        sbOk(await SB.from('usuarios').insert({uid, nome: nome || String(email).split('@')[0], email}));
        const u = await BOM.Usuario.obter(uid); if (u) return u;
        throw new Error('Perfil não foi criado. Execute o arquivo supabase/schema.sql no SQL Editor.');
      }
      const perfil = {uid, nome, email, perfil: 'usuario', ativo: true};
      if (BOM.nuvem) { try { await db.collection('usuarios').doc(uid).set({...perfil, dataCadastro: TS()}); } catch (e) { throw erro(e); } return {...perfil, dataCadastro: new Date().toISOString()}; }
      const users = LSP.get('bom_usuarios', []), u = users.find(x => x.uid === uid);
      Object.assign(u, perfil, {dataCadastro: new Date().toISOString(), dispositivos: u.dispositivos || []}); LSP.set('bom_usuarios', users); return semSenha(u);
    },
    /** Consulta o perfil e o tipo de acesso. */
    async obter(uid) {
      if (SB) return sbUser(sbOk(await SB.from('usuarios').select('*').eq('uid', uid).maybeSingle()));
      if (BOM.nuvem) { try { const d = await db.collection('usuarios').doc(uid).get(); return d.exists ? docUser(d.id, d.data()) : null; } catch (e) { throw erro(e); } }
      return semSenha(LSP.get('bom_usuarios', []).find(x => x.uid === uid));
    },
    /** Lista todas as contas (somente administrador). */
    async listar() {
      if (SB) return sbOk(await SB.from('usuarios').select('*').order('nome')).map(sbUser);
      if (BOM.nuvem) { try { return (await db.collection('usuarios').get()).docs.map(d => docUser(d.id, d.data())); } catch (e) { throw erro(e); } }
      return LSP.get('bom_usuarios', []).map(semSenha);
    },
    /** Ativa ou desativa uma conta (somente administrador). */
    async definirAtivo(uid, ativo) {
      if (SB) { const d = sbOk(await SB.from('usuarios').update({ativo}).eq('uid', uid).select('uid')); if (!d || !d.length) throw new Error('Sem permissão para alterar esta conta.'); return; }
      if (BOM.nuvem) { try { await db.collection('usuarios').doc(uid).update({ativo}); } catch (e) { throw erro(e); } return; }
      const users = LSP.get('bom_usuarios', []), u = users.find(x => x.uid === uid); if (u) { u.ativo = ativo; LSP.set('bom_usuarios', users); }
    }
  };

  /* ======================= 3. DISPOSITIVO (subcoleção dispositivos) ======================= */
  BOM.Dispositivo = {
    /** Registra o aparelho no login e atualiza o último acesso. */
    async registrar(uid, {idDispositivo, nomeDispositivo, plataforma}) {
      const reg = {idDispositivo, nomeDispositivo, plataforma};
      if (SB) { sbOk(await SB.from('dispositivos').upsert({uid, id_dispositivo: idDispositivo, nome_dispositivo: nomeDispositivo, plataforma, ultimo_acesso: agora()}, {onConflict: 'uid,id_dispositivo'})); return; }
      if (BOM.nuvem) { try { await db.collection('usuarios').doc(uid).collection('dispositivos').doc(idDispositivo).set({...reg, ultimoAcesso: TS()}, {merge: true}); } catch (e) { throw erro(e); } return; }
      const users = LSP.get('bom_usuarios', []), u = users.find(x => x.uid === uid); if (!u) return;
      u.dispositivos = u.dispositivos || []; let d = u.dispositivos.find(x => x.idDispositivo === idDispositivo);
      if (!d) { d = {...reg}; u.dispositivos.push(d); } Object.assign(d, reg, {ultimoAcesso: new Date().toISOString()}); LSP.set('bom_usuarios', users);
    },
    /** Lista os aparelhos de um usuário. */
    async listar(uid) {
      if (SB) return sbOk(await SB.from('dispositivos').select('*').eq('uid', uid).order('ultimo_acesso', {ascending: false})).map(sbDisp);
      if (BOM.nuvem) { try { return (await db.collection('usuarios').doc(uid).collection('dispositivos').get()).docs.map(d => ({...d.data(), ultimoAcesso: iso(d.data().ultimoAcesso)})); } catch (e) { throw erro(e); } }
      const u = LSP.get('bom_usuarios', []).find(x => x.uid === uid); return (u && u.dispositivos) || [];
    }
  };

  /* ======================= 4. LOG DE ACESSO (coleção logs_acesso) ======================= */
  const docLog = (id, d) => ({idLog: id, uid: d.uid, nomeUsuario: d.nomeUsuario, idDispositivo: d.idDispositivo, nomeDispositivo: d.nomeDispositivo || d.idDispositivo, dataLogin: iso(d.dataLogin), horaLogout: iso(d.horaLogout), situacao: d.situacao});
  const porData = (a, b) => String(b.dataLogin).localeCompare(String(a.dataLogin));
  BOM.LogAcesso = {
    /** Abre o registro no login (hora de logout em branco). Retorna o idLog. */
    async abrir(usuario, disp) {
      if (SB) return sbOk(await SB.from('logs_acesso').insert({uid: usuario.uid, nome_usuario: usuario.nome, id_dispositivo: disp.idDispositivo, nome_dispositivo: disp.nomeDispositivo}).select('id_log').single()).id_log;
      if (BOM.nuvem) {
        try { const ref = db.collection('logs_acesso').doc(); await ref.set({idLog: ref.id, uid: usuario.uid, nomeUsuario: usuario.nome, idDispositivo: disp.idDispositivo, nomeDispositivo: disp.nomeDispositivo, dataLogin: TS(), horaLogout: null, situacao: 'ativa'}); return ref.id; }
        catch (e) { throw erro(e); }
      }
      const logs = LSP.get('bom_logs', []), idLog = 'log-' + novoId();
      logs.push({idLog, uid: usuario.uid, nomeUsuario: usuario.nome, idDispositivo: disp.idDispositivo, nomeDispositivo: disp.nomeDispositivo, dataLogin: new Date().toISOString(), horaLogout: null, situacao: 'ativa'});
      LSP.set('bom_logs', logs); return idLog;
    },
    /** Fecha o registro no logout: grava a hora e muda a situação para "encerrada". */
    async fechar(idLog) {
      if (!idLog) return;
      if (SB) { try { sbOk(await SB.from('logs_acesso').update({hora_logout: agora(), situacao: 'encerrada'}).eq('id_log', idLog)); } catch (e) { console.warn('[BOM] fechar log:', e); } return; }
      if (BOM.nuvem) { try { await db.collection('logs_acesso').doc(idLog).update({horaLogout: TS(), situacao: 'encerrada'}); } catch (e) { console.warn('[BOM] fechar log:', e); } return; }
      const logs = LSP.get('bom_logs', []), l = logs.find(x => x.idLog === idLog);
      if (l && !l.horaLogout) { l.horaLogout = new Date().toISOString(); l.situacao = 'encerrada'; LSP.set('bom_logs', logs); }
    },
    /** Histórico do próprio usuário. */
    async listarDoUsuario(uid) {
      if (SB) return sbOk(await SB.from('logs_acesso').select('*').eq('uid', uid).order('data_login', {ascending: false})).map(sbLog);
      if (BOM.nuvem) { try { return (await db.collection('logs_acesso').where('uid', '==', uid).get()).docs.map(d => docLog(d.id, d.data())).sort(porData); } catch (e) { throw erro(e); } }
      return LSP.get('bom_logs', []).filter(l => l.uid === uid).sort(porData);
    },
    /** Histórico geral (somente administrador). */
    async listarTodos() {
      if (SB) return sbOk(await SB.from('logs_acesso').select('*').order('data_login', {ascending: false}).limit(1000)).map(sbLog);
      if (BOM.nuvem) { try { return (await db.collection('logs_acesso').orderBy('dataLogin', 'desc').limit(1000).get()).docs.map(d => docLog(d.id, d.data())); } catch (e) { throw erro(e); } }
      return LSP.get('bom_logs', []).slice().sort(porData);
    },
    /** Encerra as sessões abertas de um usuário (usado ao desativar a conta). */
    async encerrarAtivosDe(uid) {
      if (SB) { try { sbOk(await SB.from('logs_acesso').update({hora_logout: agora(), situacao: 'encerrada'}).eq('uid', uid).eq('situacao', 'ativa')); } catch (e) { console.warn('[BOM] encerrar sessões:', e); } return; }
      if (BOM.nuvem) {
        try { const q = await db.collection('logs_acesso').where('uid', '==', uid).where('situacao', '==', 'ativa').get(); const b = db.batch(); q.docs.forEach(d => b.update(d.ref, {horaLogout: TS(), situacao: 'encerrada'})); await b.commit(); } catch (e) { console.warn('[BOM] encerrar sessões:', e); }
        return;
      }
      const logs = LSP.get('bom_logs', []); logs.filter(l => l.uid === uid && l.situacao === 'ativa').forEach(l => { l.situacao = 'encerrada'; l.horaLogout = new Date().toISOString(); }); LSP.set('bom_logs', logs);
    }
  };

  /* ======================= 5. ARQUIVOS LOCAIS (aparelho) ======================= */
  const IDBX = {
    db: null,
    open() { return new Promise((res, rej) => { if (this.db) return res(this.db); let r; try { r = indexedDB.open('bom_pdfs', 1); } catch (e) { return rej(e); } r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
    async put(k, v) { try { const db = await this.open(); await new Promise((res, rej) => { const t = db.transaction('files', 'readwrite'); t.objectStore('files').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) { MEMP['bin:' + k] = v; } },
    async get(k) { if (MEMP['bin:' + k]) return MEMP['bin:' + k]; try { const db = await this.open(); return await new Promise((res, rej) => { const r = db.transaction('files').objectStore('files').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch (e) { return null; } },
    async del(k) { delete MEMP['bin:' + k]; try { const db = await this.open(); db.transaction('files', 'readwrite').objectStore('files').delete(k); } catch (e) {} }
  };
  BOM.ArquivosLocais = {
    /** Lê a estrutura de pastas e arquivos do usuário neste aparelho. */
    carregar(uid) { return LSP.get('bom_fs2_' + uid, null); },
    /** Grava a estrutura de pastas e arquivos. Retorna false se faltar espaço. */
    salvar(uid, fs) { return LSP.set('bom_fs2_' + uid, fs); },
    /** Conteúdo (bytes) dos arquivos importados. */
    bytes: {put: (k, v) => IDBX.put(k, v), get: k => IDBX.get(k), del: k => IDBX.del(k)}
  };
})();
