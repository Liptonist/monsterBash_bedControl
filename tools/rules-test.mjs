#!/usr/bin/env node
// database.rules.json の検証スクリプト（任意・開発用）
//
// 本番のルールを差し替える前に、ローカルのエミュレータに当てて
//   ・許可すべき操作が通るか（アプリの各手順をそのままなぞる）
//   ・拒否すべき操作が弾かれるか
// を確認する。アプリ本体はこのスクリプトに依存しない。
//
//   npm i -g firebase-tools          （Java も必要）
//   firebase emulators:start --only database --project monster-bash-test
//   node tools/rules-test.mjs
//
// firebase.json に database.rules の指定が必要:
//   { "database": { "rules": "database.rules.json" },
//     "emulators": { "database": { "host": "127.0.0.1", "port": 9000 } } }

const BASE = process.env.RULES_EMU || 'http://127.0.0.1:9000';
const NS   = (process.env.RULES_PROJECT || 'monster-bash-test') + '-default-rtdb';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
// エミュレータは署名を検証しないので alg:none のトークンで十分
function token(email, provider = 'google.com', uid = 'uid-' + email) {
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: 'https://securetoken.google.com/monster-bash-test', aud: 'monster-bash-test',
    sub: uid, user_id: uid, iat: 1, exp: 9999999999,
    email, email_verified: true,
    firebase: { sign_in_provider: provider, identities: { email: [email] } },
  })}.`;
}

async function req(method, path, auth, body) {
  // owner はルールを迂回する管理接続。利用者は auth クエリでトークンを渡す
  const isOwner = auth === 'owner';
  const url = `${BASE}/${path}.json?ns=${NS}` + (isOwner ? '' : `&auth=${encodeURIComponent(auth)}`);
  const headers = isOwner ? { Authorization: 'Bearer owner' } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    console.error(`\nエミュレータに接続できません（${BASE}）。先に起動してください:\n`
      + '  firebase emulators:start --only database --project monster-bash-test\n');
    process.exit(2);
  }
  return { ok: r.ok, status: r.status };
}

const ADMIN = token('admin@example.com');                // 管理者
const STAFF = token('staff@example.com');                // 一般スタッフ（Googleログイン）
const PWOK  = token('pw@example.com', 'password');       // authType: password で登録済み
const PWBAD = token('staff@example.com', 'password');    // Google登録なのにパスワードで来た
const OUT   = token('nobody@example.com');               // 許可リストにいない

// index.html の itemPayload() 相当。SDK は null の子を書かないので同じ形にする
function itemPayload(i) {
  const o = { localId: i.localId, status: i.status, name: i.name ?? '', sym: i.sym ?? '',
              waiting: !!i.waiting, gender: i.gender ?? '' };
  if (i.patientId   != null) o.patientId   = i.patientId;
  if (i.patientCode != null) o.patientCode = i.patientCode;
  if (i.enteredAt   != null) o.enteredAt   = i.enteredAt;
  if (i.age         != null) o.age         = i.age;
  return o;
}
const empty = n => itemPayload({ localId: n, status: 'empty' });
const item = (o = {}) => ({
  localId: 1, status: 'green', name: '山田', sym: '頭痛',
  waiting: false, enteredAt: 1700000000000, age: 30, gender: '男', ...o,
});
const rec = (o = {}) => ({
  patientId: 1, patientCode: '2026-1-001', name: '山田', age: 30, gender: '男',
  sym: '頭痛', room: '本部', slotId: 'B1', kind: 'ベッド',
  triage: '軽症', outcome: '帰宅', enteredAt: 1, exitedAt: 2, stayMins: 1, recordedAt: 3, ...o,
});
const log = (o = {}) => ({
  at: 1700000000000, uid: 'uid-staff@example.com', email: 'staff@example.com',
  name: 'スタッフ', action: '登録', target: '本部 ベッドB1', detail: '軽症', ...o,
});
const logChange = (action, target, detail = '') => log({ at: Date.now(), action, target, detail });

async function seed() {
  await req('PUT', 'kyuugo', 'owner', {
    allowedUsers: {
      'admin@example,com': { name: '管理者', admin: true },
      'staff@example,com': { name: 'スタッフ' },
      'pw@example,com':    { name: 'ID運用', authType: 'password' },
    },
    festival: { year: 2026, day: 1 },
    appVersion: '0.13.0',
    globalPatientId: 5,
    rooms: [0, 1, 2, 3].reduce((r, i) => (r[i] = {
      beds: Array.from({ length: 10 }, (_, n) => empty(n + 1)),
      chairsIn: Array.from({ length: 4 }, (_, n) => empty(n + 1)),
      chairsOut: Array.from({ length: 4 }, (_, n) => empty(n + 1)),
    }, r), {}),
    discharged: { existing: rec() },
    discharged_trash: { intrash: rec({ trashedAt: 9 }) },
    auditLog: { e1: log() },
    archives: { '2026-1': { year: 2026, day: 1, label: '2026年 1日目', archivedAt: 1,
                            archivedBy: '管理者', dischargedCount: 0, trashCount: 0 } },
  });
}

let pass = 0, fail = 0;

// 許可/拒否を確かめる。毎回シードし直して他のテストに影響させない
async function t(name, expect, method, path, auth, body) {
  const r = await req(method, path, auth, body);
  const got = r.ok ? 'allow' : 'deny';
  if (got === expect) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} — ${expect} のはずが ${got} (${r.status})`); }
  await seed();
}

// アプリの手順を順番に流す（前の書き込みを引き継ぐのでシードし直さない）
async function step(name, method, path, auth, body) {
  const r = await req(method, path, auth, body);
  if (r.ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} — 拒否されました (${r.status})`); }
}

await seed();
console.log('\n╔══ 許可と拒否 ══╗');
console.log('\n── 認証・許可リスト ──');

await t('未登録ユーザーは rooms を読めない',        'deny',  'GET', 'kyuugo/rooms', OUT);
await t('未登録ユーザーは rooms を書けない',        'deny',  'PUT', 'kyuugo/rooms/0/beds/0', OUT, item());
await t('スタッフは rooms を読める',                'allow', 'GET', 'kyuugo/rooms', STAFF);
await t('authType:password の人はパスワードで入れる','allow','GET', 'kyuugo/rooms', PWOK);
await t('Google登録の人はパスワードで入れない',      'deny',  'GET', 'kyuugo/rooms', PWBAD);
await t('スタッフは許可リスト全体を読めない',        'deny',  'GET', 'kyuugo/allowedUsers', STAFF);
await t('スタッフは自分の1件だけ読める',            'allow', 'GET', 'kyuugo/allowedUsers/staff@example,com', STAFF);
await t('スタッフは他人の1件は読めない',            'deny',  'GET', 'kyuugo/allowedUsers/admin@example,com', STAFF);
await t('管理者は許可リスト全体を読める',           'allow', 'GET', 'kyuugo/allowedUsers', ADMIN);
await t('スタッフは許可リストを書けない',           'deny',  'PUT', 'kyuugo/allowedUsers/x@example,com', STAFF, { admin: true });
await t('スタッフは自分を管理者に昇格できない',      'deny',  'PUT', 'kyuugo/allowedUsers/staff@example,com/admin', STAFF, true);
await t('管理者はユーザーを追加できる',             'allow', 'PUT', 'kyuugo/allowedUsers/new@example,com', ADMIN, { name: '新人' });
await t('大文字のキーは登録できない',               'deny',  'PUT', 'kyuugo/allowedUsers/New@example,com', ADMIN, { name: '新人' });
await t('@のないキーは登録できない',                'deny',  'PUT', 'kyuugo/allowedUsers/newexample,com', ADMIN, { name: '新人' });
await t('未知のフィールドは登録できない',           'deny',  'PUT', 'kyuugo/allowedUsers/new@example,com', ADMIN, { name: '新人', role: 'x' });
await t('authTypeはpasswordのみ',                   'deny',  'PUT', 'kyuugo/allowedUsers/new@example,com', ADMIN, { authType: 'google' });
await t('旧形式の true も許容',                     'allow', 'PUT', 'kyuugo/allowedUsers/old@example,com', ADMIN, true);

console.log('\n── 患者データ（rooms） ──');
await t('スタッフは枠を更新できる',                 'allow', 'PUT', 'kyuugo/rooms/0/beds/0', STAFF, item({ status: 'red' }));
await t('枠の一括更新（人数変更）ができる',         'allow', 'PUT', 'kyuugo/rooms/0/beds', STAFF, [item(), item({ localId: 2 })]);
await t('不正なstatusは書けない',                   'deny',  'PUT', 'kyuugo/rooms/0/beds/0', STAFF, item({ status: 'hacked' }));
await t('未知のフィールドは書けない',               'deny',  'PUT', 'kyuugo/rooms/0/beds/0', STAFF, item({ note: 'x' }));
await t('waitingは真偽値のみ',                      'deny',  'PUT', 'kyuugo/rooms/0/beds/0', STAFF, item({ waiting: 'yes' }));
await t('氏名が長すぎると書けない',                 'deny',  'PUT', 'kyuugo/rooms/0/beds/0', STAFF, item({ name: 'あ'.repeat(101) }));
await t('症状が長すぎると書けない',                 'deny',  'PUT', 'kyuugo/rooms/0/beds/0', STAFF, item({ sym: 'あ'.repeat(1001) }));
await t('localIdなしは書けない',                    'deny',  'PUT', 'kyuugo/rooms/0/beds/0', STAFF, { status: 'green' });
await t('未知の種別（kind）には書けない',           'deny',  'PUT', 'kyuugo/rooms/0/sofas/0', STAFF, item());
await t('存在しない部屋番号には書けない',           'deny',  'PUT', 'kyuugo/rooms/aa/beds/0', STAFF, item());
await t('スタッフは部屋の枠を全消しできない',       'deny',  'DELETE', 'kyuugo/rooms/0/beds', STAFF);
await t('スタッフはrooms全体を消せない',            'deny',  'DELETE', 'kyuugo/rooms', STAFF);
await t('管理者は部屋の枠を消せる',                 'allow', 'DELETE', 'kyuugo/rooms/0/beds', ADMIN);
await t('複数枠の同時更新（移動）ができる',         'allow', 'PATCH', '', STAFF,
  { 'kyuugo/rooms/0/beds/0': item({ status: 'empty', name: '', sym: '', patientId: null }),
    'kyuugo/rooms/0/beds/1': item({ localId: 2 }) });

console.log('\n── 患者ID採番 ──');
await t('採番カウンタを更新できる',                 'allow', 'PUT', 'kyuugo/globalPatientId', STAFF, 6);
await t('数値以外は書けない',                       'deny',  'PUT', 'kyuugo/globalPatientId', STAFF, '999');
await t('負の値は書けない',                         'deny',  'PUT', 'kyuugo/globalPatientId', STAFF, -1);

console.log('\n── 退室記録 ──');
await t('スタッフは退室記録を追加できる',           'allow', 'POST', 'kyuugo/discharged', STAFF, rec());
await t('スタッフは既存の退室記録を書き換えられない','deny', 'PUT', 'kyuugo/discharged/existing', STAFF, rec({ name: '改ざん' }));
await t('スタッフは1項目だけの改ざんもできない',    'deny',  'PUT', 'kyuugo/discharged/existing/name', STAFF, '改ざん');
await t('管理者は既存の退室記録を修正できる',       'allow', 'PUT', 'kyuugo/discharged/existing', ADMIN, rec({ name: '訂正' }));
await t('控えなしの削除はできない',                 'deny',  'DELETE', 'kyuugo/discharged/existing', STAFF);
await t('ゴミ箱に控えがあれば削除できる',           'allow', 'DELETE', 'kyuugo/discharged/intrash', STAFF);
await t('ゴミ箱へ移せる（新規作成）',               'allow', 'PUT', 'kyuugo/discharged_trash/existing', STAFF, rec({ trashedAt: 1 }));
await t('スタッフは退室記録ノードを全消しできない', 'deny',  'DELETE', 'kyuugo/discharged', STAFF);
await t('スタッフはゴミ箱を全消しできない',         'deny',  'DELETE', 'kyuugo/discharged_trash', STAFF);
await t('管理者は締めで一括消去できる',             'allow', 'PATCH', '', ADMIN,
  { 'kyuugo/discharged': null, 'kyuugo/discharged_trash': null, 'kyuugo/globalPatientId': 0, 'kyuugo/festival/day': 2 });
await t('未知のフィールドは記録できない',           'deny',  'POST', 'kyuugo/discharged', STAFF, rec({ memo: 'x' }));
await t('滞在時間は数値のみ',                       'deny',  'POST', 'kyuugo/discharged', STAFF, rec({ stayMins: '10分' }));
await t('転帰つきの記録を追加できる',               'allow', 'POST', 'kyuugo/discharged', STAFF, rec({ outcome: '救急搬送' }));
await t('転帰なしの記録も追加できる（旧データ互換）','allow', 'POST', 'kyuugo/discharged', STAFF, rec({ outcome: undefined }));
await t('転帰が長すぎると記録できない',             'deny',  'POST', 'kyuugo/discharged', STAFF, rec({ outcome: 'あ'.repeat(21) }));
await t('転帰は文字列のみ',                         'deny',  'POST', 'kyuugo/discharged', STAFF, rec({ outcome: 1 }));

console.log('\n── 変更履歴（auditLog） ──');
await t('スタッフは履歴を読める',                   'allow', 'GET', 'kyuugo/auditLog', STAFF);
await t('スタッフは履歴を追記できる',               'allow', 'POST', 'kyuugo/auditLog', STAFF, log());
await t('既存の履歴は書き換えられない',             'deny',  'PUT', 'kyuugo/auditLog/e1', STAFF, log({ action: '改ざん' }));
await t('既存の履歴の項目も書き換えられない',       'deny',  'PUT', 'kyuugo/auditLog/e1/action', STAFF, '改ざん');
await t('既存の履歴に項目を足せない',               'deny',  'PUT', 'kyuugo/auditLog/e1/extra', STAFF, 'x');
await t('履歴は削除できない',                       'deny',  'DELETE', 'kyuugo/auditLog/e1', STAFF);
await t('管理者でも履歴は削除できない',             'deny',  'DELETE', 'kyuugo/auditLog/e1', ADMIN);
await t('他人になりすました履歴は書けない',         'deny',  'POST', 'kyuugo/auditLog', STAFF, log({ email: 'admin@example.com' }));
await t('他人のuidを名乗る履歴は書けない',          'deny',  'POST', 'kyuugo/auditLog', STAFF, log({ uid: 'uid-admin@example.com' }));
await t('必須項目を欠く履歴は書けない',             'deny',  'POST', 'kyuugo/auditLog', STAFF, { at: 1, email: 'staff@example.com' });
await t('未知の項目を持つ履歴は書けない',           'deny',  'POST', 'kyuugo/auditLog', STAFF, log({ payload: 'x' }));

console.log('\n── アプリの版（新しい版のお知らせ） ──');
await t('スタッフは版を読める',                     'allow', 'GET', 'kyuugo/appVersion', STAFF);
await t('スタッフは版を書ける（自動で配信する）',    'allow', 'PUT', 'kyuugo/appVersion', STAFF, '0.13.1');
await t('未登録ユーザーは版を読めない',             'deny',  'GET', 'kyuugo/appVersion', OUT);
await t('未登録ユーザーは版を書けない',             'deny',  'PUT', 'kyuugo/appVersion', OUT, '9.9.9');
await t('版の形式が違うと書けない',                 'deny',  'PUT', 'kyuugo/appVersion', STAFF, 'v0.13.1');
await t('版が数値だと書けない',                     'deny',  'PUT', 'kyuugo/appVersion', STAFF, 13);
await t('版に余計な文字を混ぜられない',             'deny',  'PUT', 'kyuugo/appVersion', STAFF, '0.13.1<script>');

console.log('\n── 開催情報・保存済み記録 ──');
await t('スタッフは開催情報を読める',               'allow', 'GET', 'kyuugo/festival', STAFF);
await t('スタッフは開催情報を書けない',             'deny',  'PUT', 'kyuugo/festival', STAFF, { year: 2026, day: 2 });
await t('管理者は開催情報を書ける',                 'allow', 'PUT', 'kyuugo/festival', ADMIN, { year: 2026, day: 2 });
await t('開催年が範囲外だと書けない',               'deny',  'PUT', 'kyuugo/festival/year', ADMIN, 1900);
await t('開催情報に未知の項目は書けない',           'deny',  'PUT', 'kyuugo/festival', ADMIN, { year: 2026, day: 2, note: 'x' });
await t('スタッフは保存済み記録を読める',           'allow', 'GET', 'kyuugo/archives', STAFF);
await t('スタッフは保存済み記録を書けない',         'deny',  'PUT', 'kyuugo/archives/2026-2', STAFF, { year: 2026, day: 2, archivedAt: 1 });
await t('管理者は締めた日を保存できる',             'allow', 'PUT', 'kyuugo/archives/2026-2', ADMIN,
  { year: 2026, day: 2, label: '2026年 2日目', archivedAt: 1, archivedBy: '管理者',
    dischargedCount: 1, trashCount: 0, discharged: { k: rec() }, discharged_trash: { t: rec({ trashedAt: 1 }) } });
await t('保存済み記録に必須項目がないと書けない',   'deny',  'PUT', 'kyuugo/archives/2026-3', ADMIN, { label: 'x' });

console.log('\n── 範囲外のパス ──');
await t('kyuugo直下の未知のパスは書けない',         'deny',  'PUT', 'kyuugo/whatever', ADMIN, { a: 1 });
await t('ルート直下は読めない',                     'deny',  'GET', '', ADMIN);

await seed();
console.log('\n╔══ アプリの各手順が通るか ══╗');
console.log('\n── 受け入れ（index.html: saveB） ──');
await step('採番トランザクション（globalPatientId = 1）', 'PUT', 'kyuugo/globalPatientId', STAFF, 1);
const patient = itemPayload({ localId: 1, patientId: 1, patientCode: '2026-1-001', status: 'yellow',
  name: '山田太郎', sym: '熱中症の疑い', waiting: false, enteredAt: 1764547200000, age: 42, gender: '男' });
await step('枠に患者を登録', 'PUT', 'kyuugo/rooms/0/beds/0', STAFF, patient);
await step('変更履歴に「登録」を追記', 'POST', 'kyuugo/auditLog', STAFF,
  logChange('登録', '本部 ベッドB1', '中等症 / 1-001 / 山田太郎 / 熱中症の疑い'));

console.log('\n── 編集・送迎待ち ──');
await step('内容を編集（重症・送迎待ち）', 'PUT', 'kyuugo/rooms/0/beds/0', STAFF,
  { ...patient, status: 'red', waiting: true, sym: 'あ'.repeat(500) });
await step('氏名・症状が空のまま保存', 'PUT', 'kyuugo/rooms/0/beds/1', STAFF,
  itemPayload({ localId: 2, patientId: 2, patientCode: '2026-1-002', status: 'green', enteredAt: 1764547200000 }));
await step('年齢・性別なしで保存', 'PUT', 'kyuugo/rooms/0/beds/2', STAFF,
  itemPayload({ localId: 3, patientId: 3, patientCode: '2026-1-003', status: 'green', name: '氏名不明', enteredAt: 1 }));

console.log('\n── 移動（index.html: moveB） ──');
await step('別室の椅子へ一括で移す', 'PATCH', '', STAFF, {
  'kyuugo/rooms/2/chairsIn/3': { ...patient, localId: 4 },
  'kyuugo/rooms/0/beds/0': empty(1),
});
await step('変更履歴に「移動」を追記', 'POST', 'kyuugo/auditLog', STAFF,
  logChange('移動', '本部 ベッドB1 → サーカス 椅子（室内）C4', '重症 / 1-001 / 山田太郎'));

console.log('\n── 枠数の変更（index.html: chgCnt） ──');
await step('ベッドを40床に増やす', 'PUT', 'kyuugo/rooms/0/beds', STAFF,
  Array.from({ length: 40 }, (_, n) => empty(n + 1)));
await step('ベッドを1床に減らす', 'PUT', 'kyuugo/rooms/0/beds', STAFF, [empty(1)]);
await step('変更履歴に「枠数変更」を追記', 'POST', 'kyuugo/auditLog', STAFF,
  logChange('枠数変更', '本部 ベッド', '10 → 40'));

console.log('\n── 退室（index.html: checkoutB） ──');
const record = { patientId: 1, patientCode: '2026-1-001', name: '山田太郎', age: 42, gender: '男',
  sym: '熱中症の疑い', room: 'サーカス', slotId: 'C4', kind: '椅子（室内）', triage: '重症',
  outcome: '救急搬送',
  enteredAt: 1764547200000, exitedAt: 1764554400000, stayMins: 120, recordedAt: Date.now() };
await step('退室記録を追加（push）', 'POST', 'kyuugo/discharged', STAFF, record);
await step('枠を空きに戻す', 'PUT', 'kyuugo/rooms/2/chairsIn/3', STAFF, empty(4));
await step('変更履歴に「退室」を追記', 'POST', 'kyuugo/auditLog', STAFF,
  logChange('退室', 'サーカス 椅子（室内）C4', '1-001 / 山田太郎 / 重症 / 救急搬送 / 滞在120分'));
await step('滞在時間なし（時刻未入力）の退室記録', 'POST', 'kyuugo/discharged', STAFF,
  { patientId: 9, name: '', sym: '', room: '本部', slotId: 'B1', kind: 'ベッド', triage: '軽症',
    outcome: '帰宅', recordedAt: Date.now() });
await step('日付をまたいだ退室記録（翌日の退室時刻）', 'POST', 'kyuugo/discharged', STAFF,
  { ...record, enteredAt: 1764551400000, exitedAt: 1764552600000, stayMins: 20, outcome: '経過観察' });

console.log('\n── ゴミ箱への移動と復帰（discharged.html） ──');
await req('PUT', 'kyuugo/discharged/rec1', 'owner', record);
await step('ゴミ箱へ写す', 'PUT', 'kyuugo/discharged_trash/rec1', STAFF, { ...record, trashedAt: Date.now() });
await step('一覧から消す', 'DELETE', 'kyuugo/discharged/rec1', STAFF);
await step('一覧へ戻す', 'PUT', 'kyuugo/discharged/rec1', STAFF, record);
await step('ゴミ箱から消す', 'DELETE', 'kyuugo/discharged_trash/rec1', STAFF);
await step('変更履歴に「一覧に戻す」を追記', 'POST', 'kyuugo/auditLog', STAFF,
  logChange('一覧に戻す', 'サーカス 椅子（室内）C4', '1-001 / 山田太郎'));

console.log('\n── 入室に戻す（discharged.html: doReenter） ──');
await step('空き枠へトランザクションで書き戻す', 'PUT', 'kyuugo/rooms/1/beds/2', STAFF,
  itemPayload({ localId: 3, patientId: 1, patientCode: '2026-1-001', status: 'red',
                name: '山田太郎', sym: '熱中症の疑い', waiting: false, enteredAt: 1764547200000, age: 42, gender: '男' }));
await step('退室記録をゴミ箱へ（戻し先つき）', 'PUT', 'kyuugo/discharged_trash/rec1', STAFF,
  { ...record, trashedAt: Date.now(), reenteredTo: '空海横 ベッドB3' });
await step('退室記録を一覧から消す', 'DELETE', 'kyuugo/discharged/rec1', STAFF);

console.log('\n── 日次の締め（discharged.html: closeDay／管理者） ──');
await step('保存・消去・採番リセット・日付繰り上げを1回で', 'PATCH', '', ADMIN, {
  'kyuugo/archives/2026-1': {
    year: 2026, day: 1, label: '2026年 1日目', archivedAt: Date.now(), archivedBy: '管理者',
    dischargedCount: 2, trashCount: 1,
    discharged: { rec2: record, rec3: record },
    discharged_trash: { rec1: { ...record, trashedAt: 1, reenteredTo: '空海横 ベッドB3' } },
  },
  'kyuugo/discharged': null,
  'kyuugo/discharged_trash': null,
  'kyuugo/globalPatientId': 0,
  'kyuugo/festival/day': 2,
});
await step('変更履歴に「日次の締め」を追記', 'POST', 'kyuugo/auditLog', ADMIN,
  { ...logChange('日次の締め', '2026年 1日目', '退室済み2件 / ゴミ箱1件'),
    uid: 'uid-admin@example.com', email: 'admin@example.com', name: '管理者' });
await step('開催年・日の手動修正', 'PATCH', 'kyuugo/festival', ADMIN, { year: 2026, day: 2 });

console.log('\n── ユーザー管理（users.html／管理者） ──');
await step('Googleユーザーを追加', 'PUT', 'kyuugo/allowedUsers/tanaka@example,com', ADMIN, { name: '田中' });
await step('ID/パスワードのユーザーを追加', 'PUT', 'kyuugo/allowedUsers/sato@example,com', ADMIN,
  { name: '佐藤', authType: 'password' });
await step('管理者として追加', 'PUT', 'kyuugo/allowedUsers/suzuki@example,com', ADMIN, { name: '鈴木', admin: true });
await step('表示名だけのユーザー（空の名前）', 'PUT', 'kyuugo/allowedUsers/noname@example,com', ADMIN, { name: '' });
await step('authType を後から補う', 'PUT', 'kyuugo/allowedUsers/tanaka@example,com/authType', ADMIN, 'password');
await step('ユーザーを削除', 'DELETE', 'kyuugo/allowedUsers/tanaka@example,com', ADMIN);
await step('変更履歴に「ユーザー追加」を追記', 'POST', 'kyuugo/auditLog', ADMIN,
  { ...logChange('ユーザー追加', '田中', '一般 / Googleログイン'),
    uid: 'uid-admin@example.com', email: 'admin@example.com', name: '管理者' });

console.log('\n── 各画面の購読（読み取り） ──');
for (const [name, path] of [['index.html', 'kyuugo/rooms'], ['index.html 採番', 'kyuugo/globalPatientId'],
  ['discharged.html', 'kyuugo/discharged'], ['discharged.html ゴミ箱', 'kyuugo/discharged_trash'],
  ['history.html', 'kyuugo/auditLog'], ['archives.html', 'kyuugo/archives'],
  ['共通 開催情報', 'kyuugo/festival'], ['共通 自分の権限', 'kyuugo/allowedUsers/staff@example,com']]) {
  await step(`${name} を購読できる`, 'GET', path, STAFF);
}

console.log(`\n結果: ${pass} passed, ${fail} failed`);
if (fail) console.log('※ ルールを本番に貼る前に失敗の内容を確認してください。');
process.exit(fail ? 1 : 0);
