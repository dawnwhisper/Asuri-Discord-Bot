# Asuri Discord Bot

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.x-brightgreen.svg)](https://nodejs.org/)

Asuri Discord Bot 是一个为 CTF 团队设计的辅助机器人，集成了 LLM 对话、题目频道管理和费用跟踪等功能。

## ✨ 功能特性

*   **LLM 对话 (`/chat ask`)**:
    *   与配置的大型语言模型进行交互。
    *   支持通过 SiliconFlow (默认) 或其他可配置的提供商。
    *   支持上传文本类附件（如代码、JSON、日志）作为上下文。
    *   自动截断过长的附件内容。
    *   显示当前使用的模型和本次调用的估算费用。
*   **LLM 配置 (`/chat config`)**:
    *   允许用户在运行时切换可用的 LLM 提供商和模型。
    *   在选择菜单和确认消息中显示模型价格（元/百万 Tokens）。
*   **费用跟踪 (`/money check`, `/money all`)**:
    *   记录每个用户通过 `/chat ask` 产生的累计费用。
    *   用户可以通过 `/money check` 查询自己的费用。
    *   `/money all` 可查询所有用户的费用汇总（默认仅用户自己可见，可添加权限控制）。
    *   费用数据存储在 `data/user_costs` 目录下的 JSON 文件中。
*   **CTF 题目频道管理**:
    *   `/newchallenge <name>`: 在当前分类下创建新的题目频道，并发送包含贡献者追踪按钮的欢迎消息。
    *   `/solved`: 将当前题目频道标记为已解决，重命名频道，并感谢贡献者。
    *   贡献者可以通过欢迎消息中的按钮将自己添加到列表。
*   **基础命令**:
    *   `/help`: 显示命令帮助。
    *   `/info`: 显示机器人信息和状态。
    *   `/ping`: 测试机器人和 API 延迟。
*   **状态监控**: 可配置向指定的 URL 发送心跳以监控机器人状态。
*   **速率限制处理**: 内建基本的 Discord API 速率限制处理和重试逻辑。

## 🚀 快速开始

### 先决条件

*   Node.js v18.x 或更高版本
*   Git
*   一个 Discord Bot Token 和 Application ID
*   (可选) LLM 提供商 (如 SiliconFlow) 的 API 密钥

### 安装

1.  **克隆仓库**:
    ```bash
    git clone https://github.com/dawnwhisper/Asuri-Discord-Bot.git
    cd Asuri-Discord-Bot
    ```

2.  **安装依赖**:
    ```bash
    npm install
    # 或者
    yarn install
    ```

3.  **配置环境变量**:
    *   复制 `.env.sample` 文件为 `.env`:
        ```bash
        cp .env.sample .env
        ```
    *   编辑 `.env` 文件，填入必要的信息：
        *   `APP_ID`: 你的 Discord 机器人 Application ID。
        *   `PUBLIC_KEY`: 你的 Discord 机器人 Public Key。
        *   `DISCORD_TOKEN`: 你的 Discord 机器人 Token。
        *   `STATUS_URL` (可选): 你的状态监控服务的推送 URL。
        *   `SILICONFLOW_API_KEY` (如果使用 SiliconFlow): 你的 SiliconFlow API 密钥。
        *   (根据需要配置其他 LLM 提供商的密钥和设置)

4.  **配置 LLM (可选)**:
    *   编辑 `config/llmConfig.js` 文件。
    *   修改 `availableProviders` 对象，添加或调整提供商、模型及其价格信息。
    *   默认使用 `siliconflow`。如果需要更改默认提供商，可以设置 `LLM_PROVIDER` 环境变量。

### 运行

1.  **注册斜杠命令**:
    ```bash
    npm run register
    # 或者
    yarn register
    ```
    (每次添加或修改命令定义后都需要重新运行)

2.  **启动机器人**:
    ```bash
    npm start
    # 或者
    yarn start
    ```

3.  **开发模式 (使用 nodemon 自动重启)**:
    ```bash
    npm run dev
    # 或者
    yarn dev
    ```

## ⚙️ 配置

*   **环境变量 (`.env`)**: 用于存储敏感信息如 API 密钥和 Token。
*   **LLM 配置 (`config/llmConfig.js`)**: 定义可用的 LLM 提供商、模型、价格和默认设置。
*   **命令定义 (`commands.js`)**: 定义所有斜杠命令的结构。

## 🤝 贡献

欢迎提交 Pull Requests 或 Issues！

## 🛡️ 安全

请参阅 [SECURITY.md](SECURITY.md) 了解如何报告安全漏洞。
