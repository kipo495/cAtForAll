# コマンド管理スクリプト

コマンドは Docker コンテナ内で実行します。プロジェクトのルートディレクトリで操作してください。

## コンテナを起動する

```powershell
docker compose up -d
```

## 登録済みコマンドを確認する

```powershell
docker compose exec node-app npm run list-commands
```

## コマンドを Discord に登録する

```powershell
docker compose exec node-app npm run deploy-commands
```

`deploy-commands.js` は、グローバルコマンドを削除したうえで、`commands` フォルダ内のコマンドを指定ギルドへ登録します。

## コンテナのログを確認する

```powershell
docker compose logs -f node-app
```
