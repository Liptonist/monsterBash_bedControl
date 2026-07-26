// 全ページ共通：Firebase初期化・Googleログイン・許可リスト判定・変更履歴の記録
//
// 許可リストは kyuugo/allowedUsers に置く。キーはメールアドレスの「.」を「,」に
// 置換したもの（RTDBのキーに「.」を使えないため）。値は次の2形式を許容する。
//   true                                  … 一般ユーザー（旧形式・互換のため残す）
//   { name: "山田太郎", admin: true }      … 表示名つき。admin:true は管理者
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, get, onValue }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
         getRedirectResult, onAuthStateChanged, signOut,
         signInWithEmailAndPassword, createUserWithEmailAndPassword,
         sendPasswordResetEmail, updatePassword }
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

// ─── 開催年と開催日（患者IDの採番に使う） ────────────
// kyuugo/festival = { year: 2026, day: 1 }
// day は開催初日が1、翌日が2。日次の締めで繰り上がる。
export const festival = {year: new Date().getFullYear(), day: 1};

export function subscribeFestival(onChange) {
  onValue(ref(db, 'kyuugo/festival'), snap => {
    const v = snap.val() || {};
    festival.year = Number(v.year) || new Date().getFullYear();
    festival.day  = Number(v.day)  || 1;
    if (onChange) onChange(festival);
  }, e => console.warn('festival:', e));
}

// 患者ID。例: 2026-1-001（年 - 開催日 - 連番3桁）
export const formatPid = (seq, year = festival.year, day = festival.day) =>
  `${year}-${day}-${String(seq).padStart(3, '0')}`;

// 保存用の患者ID。記録済みのコードを優先し、旧データは従来表記にする
export const pidText = r =>
  (r && r.patientCode) ? r.patientCode : (r && r.patientId ? 'P-' + r.patientId : '');

// 画面表示用。煩雑さを避けるため先頭の年を省く（2026-1-001 → 1-001）。
// データ側には年を含んだままの値を保存する。
export const pidShort = r => pidText(r).replace(/^\d{4}-/, '');

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
.auth-div{display:flex;align-items:center;gap:10px;margin:16px 0 12px;color:#bbb;font-size:11.5px}
.auth-div::before,.auth-div::after{content:'';flex:1;height:1px;background:#e5e5e5}
.auth-inp{width:100%;padding:9px 11px;border:1px solid #d0d0d0;border-radius:8px;font-size:14px;font-family:inherit;margin-bottom:8px}
.auth-inp:focus{outline:none;border-color:#3b82f6}
.auth-btn2{width:100%;padding:10px 14px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
.auth-btn2:hover{background:#2563eb}
.auth-btn2:disabled{opacity:.5;cursor:default}
.auth-ok{background:#e8f5e9;border:1px solid #b7e0ba;color:#256029;border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.7;text-align:left;margin-bottom:16px}
`;

const AUTH_HTML = `
<div class="auth-card">
  <div class="auth-title" id="auth-h"></div>
  <div class="auth-sub" id="auth-sub">続けるにはGoogleアカウントでログインしてください。</div>
  <div class="auth-err" id="auth-err" style="display:none"></div>
  <div class="auth-ok" id="auth-ok" style="display:none"></div>
  <div class="auth-note" id="auth-note" style="display:none"></div>
  <button class="auth-btn" id="auth-btn"><span>🔑</span><span>Googleでログイン</span></button>
  <div id="auth-pw" style="display:none">
    <div class="auth-div"><span>または</span></div>
    <input class="auth-inp" id="auth-email" type="email" placeholder="メールアドレス" autocomplete="username">
    <input class="auth-inp" id="auth-pass" type="password" placeholder="パスワード" autocomplete="current-password">
    <button class="auth-btn2" id="auth-pw-btn">ログイン</button>
    <button class="auth-sub-btn" id="auth-reset">パスワードを忘れた場合</button>
  </div>
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
  ovl.querySelector('#auth-pw-btn').addEventListener('click', doPasswordLogin);
  ovl.querySelector('#auth-reset').addEventListener('click', doPasswordReset);
  // パスワード欄でEnterを押したらログインする
  ovl.querySelector('#auth-pass').addEventListener('keydown',
    e => { if (e.key === 'Enter') doPasswordLogin(); });
  ovl.querySelector('#auth-email').addEventListener('keydown',
    e => { if (e.key === 'Enter') ovl.querySelector('#auth-pass').focus(); });
}

// mode: 'login' | 'working' | 'denied' | 'setup' | 'error'
function showAuth(mode, opts = {}) {
  ovl.classList.remove('hide');
  const sub  = ovl.querySelector('#auth-sub');
  const err  = ovl.querySelector('#auth-err');
  const okEl = ovl.querySelector('#auth-ok');
  const note = ovl.querySelector('#auth-note');
  const btn  = ovl.querySelector('#auth-btn');
  const out  = ovl.querySelector('#auth-logout');
  const pw   = ovl.querySelector('#auth-pw');

  err.style.display = note.style.display = okEl.style.display = 'none';
  btn.style.display = out.style.display = pw.style.display = 'none';
  btn.disabled = false;
  ovl.querySelector('#auth-pw-btn').disabled = false;

  if (mode === 'working') {
    sub.textContent = opts.text || '確認中...';
  } else if (mode === 'login') {
    sub.textContent = 'Googleアカウント、または配布されたIDとパスワードでログインしてください。';
    btn.style.display = '';
    pw.style.display = '';
    if (opts.ok) { okEl.style.display = ''; okEl.textContent = opts.ok; }
    if (opts.message) { err.style.display = ''; err.textContent = opts.message; }
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
    pw.style.display = '';
  }
}

// Firebaseのエラーコードを日本語にする。原因を追えるよう元のコードも併記する
function authErrText(e) {
  const c = e?.code || '';
  return jaAuthMessage(c, e) + (c ? `（${c}）` : '');
}

function jaAuthMessage(c, e) {
  const map = {
    'auth/invalid-credential':    'メールアドレスまたはパスワードが違います。',
    'auth/wrong-password':        'メールアドレスまたはパスワードが違います。',
    'auth/user-not-found':        'メールアドレスまたはパスワードが違います。',
    'auth/invalid-email':         'メールアドレスの形式が正しくありません。',
    'auth/user-disabled':         'このアカウントは無効化されています。',
    'auth/too-many-requests':     '試行回数が多すぎます。しばらく待ってからお試しください。',
    'auth/network-request-failed':'通信に失敗しました。電波状況をご確認ください。',
    'auth/email-already-in-use':  'このメールアドレスのアカウントは既に存在します。',
    'auth/weak-password':         'パスワードは6文字以上にしてください。',
    'auth/operation-not-allowed': 'Firebaseコンソールで「メール/パスワード」を有効化してください。',
    'PERMISSION_DENIED':          'データベースの権限がありません（管理者以外は登録できません）。',
  };
  if (map[c]) return map[c];
  // Realtime Database 側の権限エラーはコード名が異なる
  if (/permission_denied/i.test(e?.message || '')) return map['PERMISSION_DENIED'];
  return e?.message || String(e);
}

async function doPasswordLogin() {
  // 登録時は小文字で作るため、ログイン時もそろえる
  const email = ovl.querySelector('#auth-email').value.trim().toLowerCase();
  const pass  = ovl.querySelector('#auth-pass').value;
  if (!email || !pass) {
    showAuth('login', {message: 'メールアドレスとパスワードを入力してください。'});
    ovl.querySelector('#auth-email').value = email;
    return;
  }
  const btn = ovl.querySelector('#auth-pw-btn');
  btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    console.warn(e);
    showAuth('login', {message: authErrText(e)});
    ovl.querySelector('#auth-email').value = email;
  }
}

async function doPasswordReset() {
  const email = ovl.querySelector('#auth-email').value.trim().toLowerCase();
  if (!email) {
    showAuth('login', {message: 'メールアドレスを入力してから押してください。'});
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showAuth('login', {ok: email + ' 宛にパスワード再設定メールを送りました。'});
  } catch (e) {
    console.warn(e);
    showAuth('login', {message: authErrText(e)});
  }
  ovl.querySelector('#auth-email').value = email;
}

/**
 * ID/パスワードのアカウントを作る（管理者がユーザー管理画面から使う）。
 * 別のFirebaseアプリを一時的に作って実行するため、操作中の管理者は
 * ログアウトされない。
 */
export async function createPasswordAccount(email, password) {
  const sub = initializeApp(firebaseConfig, 'mk-' + Date.now());
  const subAuth = getAuth(sub);
  try {
    await createUserWithEmailAndPassword(subAuth, email, password);
  } finally {
    await signOut(subAuth).catch(() => {});
    await deleteApp(sub).catch(() => {});
  }
}

/**
 * 管理者が配布済みのパスワードを別のものに変更する。
 * クライアントSDKでは他人のパスワードを直接設定できないため、
 * 一時的な別アプリでそのアカウントとしてログインし直して変更する。
 * 現在のパスワードが必要。分からない場合は再設定メールを使う。
 */
export async function changePasswordAs(email, currentPassword, newPassword) {
  const sub = initializeApp(firebaseConfig, 'pw-' + Date.now());
  const subAuth = getAuth(sub);
  try {
    const cred = await signInWithEmailAndPassword(subAuth, email, currentPassword);
    await updatePassword(cred.user, newPassword);
  } finally {
    await signOut(subAuth).catch(() => {});
    await deleteApp(sub).catch(() => {});
  }
}

// パスワード再設定メールを送る（ユーザー管理画面から使う）
export const sendResetEmail = email => sendPasswordResetEmail(auth, email);

export { authErrText };

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
// authType: 'password' なら ID/パスワードでログインするアカウント。
// 未設定は Google ログイン扱い（パスワード付きの作成時に必ず記録するため）
export function readProfile(val) {
  if (val === true) return {allowed: true, name: '', admin: false, authType: ''};
  if (val && typeof val === 'object') {
    return {
      allowed: true,
      name: (val.name || '').trim(),
      admin: val.admin === true,
      authType: val.authType || '',
    };
  }
  return {allowed: false, name: '', admin: false, authType: ''};
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

// ─── 保存状態の表示と、保存完了までの画面遷移の抑止 ──────
// Firebaseへの書き込みが確定するまでメッセージを出し、その間は
// 別ページへ移動しないようにする（オフライン時は明示的に移動できる）。
const SAVE_CSS = `
.save-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:150;
  display:none;align-items:center;gap:10px;max-width:calc(100% - 24px);
  padding:10px 16px;border-radius:10px;font-size:13px;line-height:1.6;
  box-shadow:0 4px 16px rgba(0,0,0,.18)}
.save-toast.show{display:flex}
.save-toast.saving{background:#fff8e1;border:1px solid #ffe0a3;color:#7a5b00}
.save-toast.saved{background:#e8f5e9;border:1px solid #b7e0ba;color:#256029}
.save-toast.error{background:#fdecea;border:1px solid #f5c6c2;color:#b3261e}
.save-toast .spin{width:13px;height:13px;border:2px solid #e0c98a;border-top-color:#7a5b00;
  border-radius:50%;animation:save-spin .8s linear infinite;flex-shrink:0}
@keyframes save-spin{to{transform:rotate(360deg)}}
.save-toast .go{background:none;border:1px solid currentColor;border-radius:6px;
  color:inherit;font-size:11.5px;padding:3px 9px;cursor:pointer;white-space:nowrap;flex-shrink:0}
`;

let pending = 0;         // 確定待ちの書き込み数
let saveError = null;    // 直近の失敗
let navTarget = null;    // 保存待ちで保留している遷移先
let toastEl = null;
let savedTimer = null;

function ensureToast() {
  if (toastEl) return;
  const st = document.createElement('style');
  st.textContent = SAVE_CSS;
  document.head.appendChild(st);
  toastEl = document.createElement('div');
  toastEl.className = 'save-toast';
  document.body.appendChild(toastEl);
}

function renderToast(state) {
  ensureToast();
  const blocked = navTarget !== null;

  if (state === 'saving') {
    toastEl.className = 'save-toast show saving';
    toastEl.innerHTML = '<span class="spin"></span><span></span>';
    toastEl.lastChild.textContent = blocked
      ? '保存中です。完了したら移動します...'
      : '保存中です。反映をお待ちください...';
    if (blocked) addEscape('未送信のまま移動');
  } else if (state === 'error') {
    toastEl.className = 'save-toast show error';
    toastEl.innerHTML = '<span></span>';
    toastEl.lastChild.textContent =
      '保存できませんでした: ' + (saveError?.code || saveError?.message || saveError);
    addEscape(blocked ? 'それでも移動' : '閉じる');
  } else if (state === 'saved') {
    toastEl.className = 'save-toast show saved';
    toastEl.innerHTML = '<span></span>';
    toastEl.lastChild.textContent = '保存しました';
  } else {
    toastEl.className = 'save-toast';
  }
}

function addEscape(label) {
  const b = document.createElement('button');
  b.className = 'go';
  b.textContent = label;
  b.addEventListener('click', () => {
    const t = navTarget;
    navTarget = null;
    saveError = null;
    if (t) { window.removeEventListener('beforeunload', warnUnload); location.href = t; }
    else renderToast(pending > 0 ? 'saving' : null);
  });
  toastEl.appendChild(b);
}

function updateSaveState() {
  if (pending > 0) { renderToast('saving'); return; }

  if (saveError) { renderToast('error'); return; }

  // 保留していた遷移をここで実行する
  if (navTarget) {
    const t = navTarget;
    navTarget = null;
    window.removeEventListener('beforeunload', warnUnload);
    location.href = t;
    return;
  }

  renderToast('saved');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { if (pending === 0 && !saveError) renderToast(null); }, 1800);
}

function warnUnload(e) {
  if (pending > 0) { e.preventDefault(); e.returnValue = ''; }
}
window.addEventListener('beforeunload', warnUnload);

/**
 * Firebaseへの書き込みを監視下に置く。確定するまで「保存中」を表示する。
 * @param {Promise} promise set/update/push/runTransaction の戻り値
 * @returns {Promise} 呼び出し側で続けて扱えるよう元のPromiseを返す
 */
export function trackWrite(promise) {
  pending++;
  saveError = null;
  renderToast('saving');
  return promise.then(
    v => { pending--; updateSaveState(); return v; },
    e => {
      pending--; saveError = e; console.warn(e); updateSaveState();
      throw e;
    }
  );
}

export const hasPendingWrites = () => pending > 0;

// 同一タブ内のページ移動を、保存が確定するまで保留する。
// タブ行は再描画で作り直されるため、documentへの委譲で受ける。
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href]');
  if (!a || a.target === '_blank') return;
  const href = a.getAttribute('href');
  if (!href || /^(https?:|mailto:|tel:|#)/.test(href)) return;
  if (pending === 0 && !saveError) return;

  e.preventDefault();
  navTarget = href;
  renderToast(pending > 0 ? 'saving' : 'error');
});

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
