# 飞书连接器中心 - 草料二维码数据同步插件

> 将草料二维码（MySQL 数据库）的数据同步到飞书多维表格的自定义连接器插件。

## 📋 简介

本插件是飞书连接器中心的自定义同步应用，支持将**草料二维码 OpenAPI** 或 **MySQL 数据库** 中的数据同步到飞书多维表格。

### ✨ 特性

- ✅ 支持两种数据源：草料二维码 OpenAPI / MySQL 数据库
- ✅ 前端可视化配置页面，无需编写代码
- ✅ 支持测试连接，自动获取表列表
- ✅ 支持增量同步和全量覆盖两种模式
- ✅ 可自定义同步周期（5-1440 分钟）
- ✅ 完全符合飞书连接器中心上架要求

## 🔧 配置信息

| 配置项 | 值 |
|--------|-----|
| **GitHub 仓库** | https://github.com/xiaohuoshuan123/caoliao-feishu-connector |
| **应用服务地址** | `https://feishu.yingjideng.dpdns.org` |
| **Verification token** | `caoliao-connector-2026` |
| **Cloudflare Worker** | `caoliao-feishu-connector` |

## 📁 目录结构

```
caoliao-feishu-connector/
├── dist/
│   ├── index.html              ← 飞书连接器配置页面（必须在 dist 根目录）
│   └── js/
│       └── connector-api.mjs   ← @lark-base-open/connector-api SDK (本地化)
├── src/
│   └── index.js                ← Worker 源码
├── references/                 ← 参考文件目录
├── README.md                   ← 项目说明
└── wrangler.toml               ← Cloudflare Workers 配置
```

## 🚀 快速开始

### 1. 前置要求

- ✅ Cloudflare 账号
- ✅ 已部署 Cloudflare Worker
- ✅ 已配置自定义域名（需要 HTTPS）
- ✅ 草料二维码 API Key 或 MySQL 数据库连接信息

### 2. 部署到 Cloudflare Workers

```bash
# 克隆仓库
git clone https://github.com/xiaohuoshuan123/caoliao-feishu-connector.git
cd caoliao-feishu-connector

# 安装依赖
npm install

# 配置 wrangler.toml
# 修改 database_id 为你的 D1 数据库 ID

# 部署
wrangler deploy
```

### 3. 配置自定义域名

在 Cloudflare Dashboard 中：
1. Workers & Pages → caoliao-feishu-connector
2. Settings → Domains & Routes → Add
3. 添加自定义域名：`feishu.yingjideng.dpdns.org`

### 4. 在飞书连接器中心配置

1. 打开飞书多维表格
2. 进入「连接器中心」→「从其他数据源同步」→「自定义同步应用」
3. 填入应用服务地址：`https://feishu.yingjideng.dpdns.org`
4. 填入 Verification token：`caoliao-connector-2026`
5. 点击「确定」进入配置页面

### 5. 前端配置步骤

#### 步骤一：配置数据源

**选项 A：草料二维码 OpenAPI**
1. 选择数据源类型：草料二维码 OpenAPI
2. 输入 API Key（从草料二维码开放平台获取）
3. 可选：修改 API 地址（默认 `https://open.cli.im/api/v2/rpc`）
4. 点击「测试连接」验证配置

**选项 B：MySQL 数据库**
1. 选择数据源类型：MySQL 数据库
2. 填写连接信息：
   - 主机地址（localhost 或 IP）
   - 端口（默认 3306）
   - 用户名
   - 密码
   - 数据库名
   - 字符集（推荐 utf8mb4）
3. 点击「测试连接」验证配置

#### 步骤二：配置同步

1. 选择要同步的表
2. 设置同步周期（分钟）
3. 选择同步模式：
   - **增量同步**：只更新变化的数据（推荐）
   - **全量覆盖**：清空后重新写入
4. 点击「保存配置并开始同步」

## ⚠️ 重要说明：MySQL 连接限制

**Cloudflare Workers 不能直接连接 MySQL 数据库**，有以下几种解决方案：

| 方案 | 说明 | 推荐度 |
|------|------|--------|
| **PlanetScale / TiDB Serverless** | 兼容 MySQL 协议的 Serverless 数据库，支持 HTTP 连接 | ⭐⭐⭐⭐⭐ |
| **Cloudflare D1** | 使用 D1 作为中间存储层，定时从 MySQL 同步数据 | ⭐⭐⭐⭐ |
| **Cloudflare TCP 连接** | 需要企业版，支持直接 TCP 连接 | ⭐⭐ |
| **自建 MySQL 代理** | 部署一个代理服务，将 MySQL 查询转为 HTTP API | ⭐⭐⭐ |

### 推荐实现方案

```
用户前端 → 飞书连接器 → Cloudflare Worker
                              ↓
                    草料 OpenAPI ← 直接调用
                              ↓
                    MySQL 数据库 ← 通过 PlanetScale / TiDB 代理
                              ↓
                    飞书多维表格 ← 写入数据
```

## 📝 API 接口

### POST /api/test-connection

测试数据源连接，返回表列表。

**请求体：**

```json
{
  "sourceType": "caoliao",
  "caoliaoApiKey": "your-api-key",
  "caoliaoApiUrl": "https://open.cli.im/api/v2/rpc"
}
```

或

```json
{
  "sourceType": "mysql",
  "mysqlHost": "localhost",
  "mysqlPort": 3306,
  "mysqlUser": "root",
  "mysqlPassword": "password",
  "mysqlDatabase": "mydb",
  "mysqlCharset": "utf8mb4"
}
```

**响应：**

```json
{
  "success": true,
  "tables": [
    { "name": "table1", "comment": "表1说明" },
    { "name": "table2", "comment": "表2说明" }
  ]
}
```

### GET /api/tables

获取可用表列表。

### POST /api/table_meta

获取表结构。

### POST /api/records

获取记录数据。

## 🔧 配置 wrangler.toml

```toml
name = "caoliao-feishu-connector"
main = "src/index.js"
compatibility_date = "2024-01-01"

# 定时同步（每5分钟）
[triggers]
crons = ["*/5 * * * *"]

# D1 数据库
[[d1_databases]]
binding = "D1"
database_name = "caoliao-db"
database_id = "your-d1-database-id"

# 环境变量
[vars]
CAOLIAO_API_KEY = ""
FEISHU_APP_ID = ""
FEISHU_APP_SECRET = ""
```

## 📋 飞书插件上架检查清单

| 要求 | 状态 | 说明 |
|------|------|------|
| **GitHub 仓库** | ✅ | https://github.com/xiaohuoshuan123/caoliao-feishu-connector |
| **Public 状态** | ✅ | 仓库已设为 Public |
| **index.html 在 dist 根目录** | ✅ | `dist/index.html` |
| **资源引用使用相对路径** | ✅ | SDK 已本地化，使用 `./js/connector-api.mjs` |
| **自行部署运行地址** | ✅ | `https://feishu.yingjideng.dpdns.org` |
| **插件名称不重复** | ❓ | 需要在飞书插件市场确认 |

## ⚠️ 注意事项

1. **资源引用使用相对路径**：所有资源引用都使用相对路径，符合飞书要求
2. **SDK 本地化**：`@lark-base-open/connector-api` SDK 已下载到本地 `dist/js/` 目录
3. **HTTPS 必需**：飞书要求应用服务地址必须使用 HTTPS
4. **插件名称**：上架后按全称搜索，不要和已有插件重名

## 📄 License

MIT

## 👤 作者

- **GitHub**: [@xiaohuoshuan123](https://github.com/xiaohuoshuan123)
- **Email**: fanhaobin@gmail.com
