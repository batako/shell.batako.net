# shell.batako.net

`cat README.md # Batako`

[shell.batako.net](https://shell.batako.net)は、Batakoのインタラクティブシェルです。

ワークステーションを起動し、ログインして、中にあるものを見てください。このプロジェクトはサイト上で体験することを前提にしています。実装が気になる人のために、ソースコードを公開しています。

## マシンの中身

- ファームウェア、ブート、画面リフレッシュ、ログインの演出
- キーボードとマウスで操作できるコマンドラインインターフェース
- 多言語Markdownを収めた読み取り専用Virtual File System
- コマンド履歴とTab補完
- Web Audio APIによるコンピューター音の合成
- ブラウン管を意識した表示効果と動きを抑える設定への対応
- 外部プロフィールとプロジェクトへの明示的なリンク

シェルはすべてブラウザ内で動作します。閲覧者のOSへ接続したり、実際のシェルでコマンドを実行したりすることはありません。

## ソースコードについて

- Next.js 16、React 19、TypeScript
- Next.jsによる静的エクスポート（ローカルでは`out/`）
- `.next/`を成果物とするAWS Amplify Hosting構成
- Node.js 24.x、npm 11.x
- 静的なメモリ内Virtual File System
- 未対応のシェル構文は拒否
- ターミナルによる閲覧者の認証情報や個人情報の収集はなし

<details>
<summary>ローカルで実行する</summary>

このプロジェクトはサイト上での利用を前提にしています。実装をローカルで確認したい場合は、次のコマンドで起動できます。

```bash
npm ci
npm run dev
```

検証：

```bash
npm run lint
npm run typecheck
npm test
```

</details>

## ライセンス

このリポジトリはソースコードを公開していますが、オープンソースライセンスは付与していません。

Copyright Batako Studio. All rights reserved.
