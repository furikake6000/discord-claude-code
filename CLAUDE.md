# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際にClaude Code (claude.ai/code) にガイダンスを提供します。

## プロジェクト概要

Claude Code機能の薄いラッパーを提供するDiscord botで、ユーザーがDiscordのメンションと自然言語を通じてClaude Codeと対話できるようにします。

## アーキテクチャ

- **技術スタック**: Node.js + TypeScript + discord.js + Claude Code SDK
- **コアパターン**: Claude Code SDKの薄いラッパー
- **インターフェース**: 自然言語プロンプト付きDiscordメンション
- **実行方式**: `@anthropic-ai/claude-code` SDKの直接呼び出し

## 主要コマンド

```bash
# 開発
npm install          # 依存関係のインストール
npm run dev         # ts-nodeを使用した開発モードでの実行
npm run build       # TypeScriptからJavaScriptへのコンパイル
npm start           # コンパイル済みJavaScriptの実行

# リンティング
npm run lint        # TypeScriptファイルに対するESLintの実行
```

## コアコンポーネント

### ClaudeSDKWrapper (`src/claude-sdk-wrapper.ts`)
- Claude Code SDKの`query`関数を使用した直接統合
- ストリーミングとバッチ処理の両方をサポート
- セッション管理とツール権限制御
- 操作用の設定可能な作業ディレクトリ

### DiscordClaudeBot (`src/main.ts`)
- Discord統合を処理するメインbotクラス
- メンションの処理とプロンプトの抽出
- スレッド単位でのセッション管理
- Discordメッセージ制限に合わせた長い応答の分割
- ストリーミング出力とタイピングインジケーターの提供

## 使用パターン

ユーザーはDiscordでbotにメンションすることで対話します：
```
@bot このプロジェクト用のREADMEファイルを作成して
@bot src/main.tsのTypeScriptエラーを修正して
@bot Next.js 14の新機能を検索して
```

## 環境設定

必要な環境変数：
- `DISCORD_TOKEN`: Discord botトークン
- `CLAUDE_WORK_DIR`: オプションの作業ディレクトリ（デフォルト: /home/furikake/claude_code/git）

## メッセージハンドリング

- botはメンションされたメッセージにのみ応答
- スレッド単位でのセッション継続管理
- メンションタグを削除して自然言語プロンプトを抽出
- プロンプトをClaude Code SDKに直接渡す
- ストリーミング出力によるリアルタイム応答表示
- 長い応答を複数のDiscordメッセージに分割して処理（2000文字制限）

## エラーハンドリング

- Claude Code SDKの例外とエラーメッセージのキャプチャ
- 適切なエラー処理とフォールバック機能
- Discordでのユーザーフレンドリーなエラーメッセージ表示