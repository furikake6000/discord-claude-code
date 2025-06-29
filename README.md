# Discord Claude Code Bot

Discord経由でClaude Codeを呼び出せる開発エージェントボット

## 🚀 特徴

- **自然言語インターフェース**: メンションで Claude Code に指示
- **シンプルな構成**: Claude CLI の薄いラッパー
- **長文対応**: Discord の文字数制限を自動分割
- **GitHub連携**: 既存の GitHub MCP 権限を活用

## 📦 セットアップ

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env
# .env ファイルに DISCORD_TOKEN を設定

# ビルド
npm run build

# 実行
npm start
```

## 💬 使用方法

Discordでボットをメンションして自然言語で指示：

```
@bot READMEファイルを作成してください

@bot TypeScriptのエラーを修正してください

@bot Next.js 14の新機能について調べてください

@bot プルリクエストを作成してください
```

## 🏗️ 開発

```bash
npm run dev     # 開発モード
npm run lint    # コードチェック
npm run build   # ビルド
```