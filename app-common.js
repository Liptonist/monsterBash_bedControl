// 全ページ共通：Firebase初期化・Googleログイン・許可リスト判定・変更履歴の記録
//
// 許可リストは kyuugo/allowedUsers に置く。キーはメールアドレスの「.」を「,」に
// 置換したもの（RTDBのキーに「.」を使えないため）。値は次の2形式を許容する。
//   true                                  … 一般ユーザー（旧形式・互換のため残す）
//   { name: "山田太郎", admin: true }      … 表示名つき。admin:true は管理者
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, get }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
         getRedirectResult, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA2CJS6NF3rr46138iP5E8QZNRxz9kUzYk",
  authDomain: "monster-bash-2026-medical.firebaseapp.com",
  databaseURL: "https://monster-bash-2026-medical-default-rtdb.firebaseio.com",
  projectId: "monster-bash-2026-medical",
  storageBucket: "monster-bash-2026-medical.firebasestorage.app",
  messagingSenderId: "728030132786",
  appId: "1:728030132786:web:c6bd82bf1ccdb1f7761a2b",
};

export const app  = initializeApp(firebaseConfig);
export const db   = getDatabase(app);
export const auth = getAuth(app);

export const emailKey = e => (e || '').trim().toLowerCase().replace(/\./g, ',');

// ログイン中のユーザー情報。requireAuth が通ったあとに中身が入る
// name は表示用に解決済みの名前（許可リスト → Googleプロフィール → 未設定）
export const me = {user: null, email: '', name: '', admin: false};

export const NO_NAME = '(名前未設定)';

// 表示名の決定順：許可リストの name → Googleアカウントのプロフィール名 → 未設定
// メールアドレスは表示に使わない
export function displayName(registeredName, googleName) {
  return (registeredName || '').trim() || (googleName || '').trim() || NO_NAME;
}

// ─── ログイン画面（各ページに動的に差し込む） ─────────────
const AUTH_CSS = `
.auth-ovl{position:fixed;inset:0;background:#f5f5f5;z-index:200;display:flex;align-items:center;justify-content:center;padding:20px 12px;overflow-y:auto}
.auth-ovl.hide{display:none}
.auth-card{background:#fff;border-radius:14px;border:1px solid #e0e0e0;width:340px;max-width:100%;margin:auto;padding:28px 22px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.1)}
.auth-title{font-size:17px;font-weight:600;margin-bottom:8px}
.auth-sub{font-size:13px;color:#666;line-height:1.7;margin-bottom:20px}
.auth-btn{width:100%;padding:11px 14px;border:1px solid #dadce0;border-radius:8px;background:#fff;font-size:14px;font-weight:600;color:#3c4043;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px}
.auth-btn:hover{background:#f8f9fa}
.auth-btn:disabled{opacity:.5;cursor:default}
.auth-sub-btn{margin-top:12px;background:none;border:none;color:#888;font-size:12px;cursor:pointer;text-decoration:underline}
.auth-err{background:#fdecea;border:1px solid #f5c6c2;color:#b3261e;border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.7;text-align:left;margin-bottom:16px;word-break:break-all}
.auth-note{background:#fff8e1;border:1px solid #ffe0a3;color:#7a5b00;border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.7;text-align:left;margin-bottom:16px;word-break:break-all}
.auth-code{display:block;background:#f1f3f4;border-radius:5px;padding:5px 7px;margin-top:6px;font-family:monospace;font-size:11.5px;word-break:break-all}
.hdr-user{font-size:11.5px;color:#888;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hdr-logout{background:none;border:1px solid #e0e0e0;border-radius:6px;color:#666;font-size:11.5px;padding:3px 8px;cursor:pointer;white-space:nowrap}
.hdr-logout:hover{background:#f5f5f5}
`;

const AUTH_HTML = `
<div class="auth-card">
  <div class="auth-title" id="auth-h"></div>
  <div class="auth-sub" id="auth-sub">続けるにはGoogleアカウントでログインしてください。</div>
  <div class="auth-err" id="auth-err" style="display:none"></div>
  <div class="auth-note" id="auth-note" style="display:none"></div>
  <button class="auth-btn" id="auth-btn"><span>🔑</span><span>Googleでログイン</span></button>
  <button class="auth-sub-btn" id="auth-logout" style="display:none">別のアカウントでログインする</button>
</div>`;

let ovl;

function mountAuthUi(title) {
  const st = document.createElement('style');
  st.textContent = AUTH_CSS;
  document.head.appendChild(st);

  ovl = document.createElement('div');
  ovl.className = 'auth-ovl';
  ovl.innerHTML = AUTH_HTML;
  document.body.appendChild(ovl);

  ovl.querySelector('#auth-h').textContent = title;
  ovl.querySelector('#auth-btn').addEventListener('click', doLogin);
  ovl.querySelector('#auth-logout').addEventListener('click', doLogout);
}

// mode: 'login' | 'working' | 'denied' | 'setup' | 'error'
function showAuth(mode, opts = {}) {
  ovl.classList.remove('hide');
  const sub  = ovl.querySelector('#auth-sub');
  const err  = ovl.querySelector('#auth-err');
  const note = ovl.querySelector('#auth-note');
  const btn  = ovl.querySelector('#auth-btn');
  const out  = ovl.querySelector('#auth-logout');

  err.style.display = note.style.display = 'none';
  btn.style.display = out.style.display = 'none';
  btn.disabled = false;

  if (mode === 'working') {
    sub.textContent = opts.text || '確認中...';
  } else if (mode === 'login') {
    sub.textContent = '続けるにはGoogleアカウントでログインしてください。';
    btn.style.display = '';
  } else if (mode === 'denied') {
    sub.textContent = 'このアカウントには利用権限がありません。';
    err.style.display = '';
    err.innerHTML = 'ログイン中: <b></b><br>管理者に許可リストへの追加を依頼してください。';
    err.querySelector('b').textContent = opts.email || '';
    out.style.display = '';
  } else if (mode === 'setup') {
    sub.textContent = '許可リスト（kyuugo/allowedUsers）がまだ未設定です。';
    note.style.display = '';
    note.innerHTML = 'Firebaseコンソールの Realtime Database で、以下のキーの下に '
      + '<code>admin</code> = <code>true</code> を追加すると、このアカウントが最初の管理者になります。'
      + '<code class="auth-code"></code>';
    note.querySelector('.auth-code').textContent =
      'kyuugo/allowedUsers/' + emailKey(opts.email) + '/admin  =  true';
    out.style.display = '';
  } else if (mode === 'error') {
    sub.textContent = 'ログイン処理でエラーが発生しました。';
    err.style.display = '';
    err.textContent = opts.message || '不明なエラー';
    btn.style.display = '';
  }
}

async function doLogin() {
  ovl.querySelector('#auth-btn').disabled = true;
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // ポップアップが塞がれる環境（アプリ内ブラウザ等）ではリダイレクト方式にする
    if (e && /popup-blocked|popup-closed-by-user|operation-not-supported/.test(e.code || '')) {
      try { await signInWithRedirect(auth, provider); return; }
      catch (e2) { showAuth('error', {message: (e2.code || '') + ' ' + (e2.message || '')}); return; }
    }
    showAuth('error', {message: (e.code || '') + ' ' + (e.message || '')});
  }
}

export async function doLogout() {
  try { await signOut(auth); } catch (e) { console.warn(e); }
  location.reload();   // 購読を確実に切るためリロードする
}

// 許可リストの値から利用可否・登録名・管理者かを取り出す。
// name は登録されたものだけを返す（未登録なら空文字）。表示名の解決は displayName で行う。
export function readProfile(val) {
  if (val === true) return {allowed: true, name: '', admin: false};
  if (val && typeof val === 'object') {
    return {allowed: true, name: (val.name || '').trim(), admin: val.admin === true};
  }
  return {allowed: false, name: '', admin: false};
}

/**
 * ログイン＋許可リスト判定が通ってから onReady(me) を呼ぶ。
 * @param {string} title    ログイン画面に出すページ名
 * @param {Function} onReady 認証後に一度だけ呼ばれる
 * @param {boolean} adminOnly 管理者のみに限定するか
 */
export function requireAuth(title, onReady, adminOnly = false) {
  mountAuthUi(title);

  let started = false;

  onAuthStateChanged(auth, async user => {
    if (!user) { showAuth('login'); return; }

    showAuth('working', {text: '権限を確認しています...'});
    let prof;
    try {
      const snap = await get(ref(db, 'kyuugo/allowedUsers'));
      if (!snap.exists()) { showAuth('setup', {email: user.email}); return; }
      prof = readProfile(snap.child(emailKey(user.email)).val());
      if (!prof.allowed) { showAuth('denied', {email: user.email}); return; }
    } catch (e) {
      showAuth('error', {message: '許可リストを確認できませんでした: ' + (e.code || e.message || e)});
      return;
    }

    if (adminOnly && !prof.admin) {
      showAuth('denied', {email: user.email});
      return;
    }

    me.user = user;
    me.email = user.email;
    me.name = displayName(prof.name, user.displayName);
    me.admin = prof.admin;

    const chip = document.getElementById('hdr-user');
    if (chip) chip.textContent = me.name + (prof.admin ? '（管理者）' : '');
    const lo = document.getElementById('hdr-logout');
    if (lo) { lo.style.display = ''; lo.addEventListener('click', doLogout); }

    ovl.classList.add('hide');

    if (started) return;   // 再認証時に二重で起動しない
    started = true;
    onReady(me);
  });
}

// リダイレクト方式で戻ってきた場合の結果を拾う
getRedirectResult(auth).catch(e => console.warn(e));

/**
 * 変更履歴を kyuugo/auditLog に追記する。記録の失敗で本来の操作を止めない。
 * @param {string} action 操作の種類（例: 登録・編集、退室、移動）
 * @param {string} target 対象（例: 本部 ベッドB3）
 * @param {string} detail 補足
 */
export function logChange(action, target, detail = '') {
  if (!me.user) return;
  push(ref(db, 'kyuugo/auditLog'), {
    at: Date.now(),
    uid: me.user.uid,
    email: me.email,
    name: me.name,
    action, target, detail,
  }).catch(e => console.warn('auditLog:', e));
}
