# 執筆ノート — 小説執筆支援ツール

PC と iPad で同じ原稿を書き続けるための、ブラウザで動く執筆エディタです。
Google ドキュメントに近い「紙の上に書く」レイアウトで、右側に引き出し式のメモ欄(テキスト+手書き)を備えています。

## 機能

- **作品 → 章 → 話** の階層。話ごとに本文を書き、サイドバーで並べ替え・追加・削除
- **リアルタイム文字数**: この話 / 章 / 作品全体の文字数、行数、400字詰め原稿用紙換算(画面下部)。サイドバーにも話ごとの文字数
- **右側の引き出しメモ**: 画面右端の「メモ」タブで出し入れ。メモは何枚でも作れ、テキスト入力と **ペンでの手書き**(Apple Pencil の筆圧対応、指を無視する「ペンのみ」設定、消しゴム、1画戻す)を同じ紙の上に重ねて書けます
- **自動保存**: 入力のたびに端末内(IndexedDB)へ保存。オフラインでも動作
- **端末間同期**: GitHub の非公開リポジトリ(おすすめ・設定が簡単)か、自分の Firebase(Firestore、リアルタイム)を選んで PC / iPad 間で同期(後述)
- **バックアップ**: JSON で全データを保存/読み込み、作品をテキスト(.txt)で書き出し
- **PWA**: iPad の Safari で「ホーム画面に追加」するとアプリのように全画面で使えます
- 表示設定: 明朝/ゴシック、文字サイズ、行間、文字数の数え方(空白を含む/含まない)

## 使い方(開発・ローカル)

```bash
npm install
npm run dev
```

`http://localhost:5173` を開きます。同じ Wi-Fi 内の iPad からは、`npm run dev` が表示する `Network:` の URL でアクセスできます。

本番ビルド:

```bash
npm run build
```

`dist/` を任意の静的ホスティング(Firebase Hosting、GitHub Pages、Netlify、Vercel など)に置けば、どこからでも同じ URL で使えます。
iPad で常用するなら HTTPS で公開したうえで「ホーム画面に追加」してください(オフラインキャッシュとフルスクリーンが有効になります)。

## 外出先から使う(GitHub Pages に公開)

1. GitHub で**公開**リポジトリを作る(例: `novel-writer`)。アプリのコードだけで原稿は含まれないので公開で問題ありません
2. このフォルダをそのリポジトリに push する

   ```bash
   git add -A
   git commit -m "執筆ノート"
   git branch -M main
   git remote add origin https://github.com/<ユーザー名>/novel-writer.git
   git push -u origin main
   ```

3. リポジトリの Settings → Pages → 「Build and deployment」の Source を **GitHub Actions** にする
4. push のたびに `.github/workflows/deploy.yml` がビルドして公開します。URL は `https://<ユーザー名>.github.io/novel-writer/`
5. iPad の Safari でその URL を開き、共有 → 「ホーム画面に追加」

## 端末間同期(GitHub)の設定 ― おすすめ

原稿データを**非公開**リポジトリに JSON として保存し、各端末が読み書きします。同期は「起動時・画面に戻ったとき・1分ごと」に取り込み、変更は数秒後にまとめて1コミットとして送信します。リアルタイムではないので、PC と iPad で**同時に**同じ話を編集する使い方には向きません(片方ずつ使う分には問題ありません)。

1. GitHub で**非公開**リポジトリを作る(例: `novel-data`)。README などは追加しなくて構いません(空でも可)
2. トークンを発行: GitHub 右上のアイコン → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
   - Repository access: **Only select repositories** → `novel-data` だけを選ぶ
   - Permissions → Repository permissions → **Contents: Read and write**(他は不要)
   - Expiration は長め(1年など)にしておくと楽です。期限が切れたら再発行して貼り直します
3. アプリの ⚙ 設定 → 「端末間の同期」→ 同期方式を **GitHub** にし、リポジトリ(`ユーザー名/novel-data`)とトークンを入力 → 「接続テスト」→ 「この設定で同期を開始」
4. もう一方の端末でも同じ設定を入力すると、同じデータが取り込まれます

トークンは各端末のブラウザ内にだけ保存されます。万一漏れても、そのリポジトリの内容の読み書きしかできないよう、上記のとおり権限を絞ってください。

副産物として、原稿の変更履歴が Git のコミットとしてすべて残ります(GitHub 上でいつでも過去の版を見られます)。

## 端末間同期(Firebase)の設定

リアルタイム同期が必要な場合はこちら。設定しなくても各端末内には保存されます。

1. https://console.firebase.google.com で新しいプロジェクトを作成
2. **Authentication** → 「ログイン方法」→ **Google** を有効化
3. **Firestore Database** → データベースを作成(本番モードでよい)→ 「ルール」を以下にして公開

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

4. プロジェクトの設定 → 「マイアプリ」→ **ウェブアプリを追加**(`</>` アイコン)。表示される `firebaseConfig = { ... }` をコピー
5. Authentication → 「設定」→ **承認済みドメイン** に、アプリを開くドメイン(例: `localhost`、公開先のドメイン)を追加
6. アプリの ⚙ 設定 → 「端末間の同期」に `firebaseConfig` を貼り付け → 「この設定で同期を開始」→ 「Googleでログイン」

同じ Google アカウントでログインした端末同士でデータが同期されます。同じ話を両方で同時に編集した場合は、後に保存した方が優先されます(最終書き込み優先)。

### 同期を使わない場合

設定 → バックアップ → 「すべてをJSONで保存」で出力したファイルを iCloud Drive / Google ドライブ経由でもう一方の端末に渡し、「JSONを読み込む」で取り込めます。

## 技術構成

- Vite + React + TypeScript
- 保存: Dexie(IndexedDB)
- 同期: Firebase Auth(Google)+ Firestore(オフライン永続キャッシュ有効)
- 手書き: Canvas + Pointer Events(筆圧・coalesced events 対応、ストロークはベクタ保存)
- PWA: vite-plugin-pwa(Workbox)

## ファイル構成

```
src/
  App.tsx                 全体レイアウト(サイドバー / 原稿 / 引き出し)
  store.ts                状態管理(zustand)と IndexedDB への保存
  db.ts                   Dexie スキーマ
  types.ts                データ型
  sync/index.ts           同期方式の切り替え
  sync/github.ts          GitHub リポジトリ同期(Git Data API で1コミットにまとめて送信)
  sync/firebase.ts        Firestore 同期
  components/
    Editor.tsx            原稿ページ(話タイトル+本文)
    Sidebar.tsx           作品・章・話の目次
    MemoDrawer.tsx        右側の引き出しメモ
    HandwritingCanvas.tsx 手書きキャンバス
    StatusBar.tsx         文字数カウンター
    TopBar.tsx            上部バー
    SettingsDialog.tsx    設定・同期・バックアップ
  utils/count.ts          文字数の計算
```
