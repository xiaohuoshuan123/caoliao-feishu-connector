# 飞书连接器中心 - 草料二维码数据同步插件

## 📋 简介

将草料二维码（MySQL 数据库）的数据同步到飞书多维表格的自定义连接器插件。

## 🔧 配置信息

| 配置项 | 值 |
|--------|-----|
| **应用服务地址** | `https://feishu.yingjideng.dpdns.org` |
| **Verification token** | `caoliao-connector-2026` |
| **Cloudflare Worker** | `caoliao-feishu-connector` |

## 📁 目录结构

```
caoliao-feishu-connector/
├── dist/
│   └── index.html          ← 飞书连接器配置页面（必须在 dist 根目录）
├── src/
│   └── index.js            ← Worker 源码
├── references/             ← 参考文件目录
└── wrangler.toml           ← Cloudflare Workers 配置
```

## 🚀 部署

1. 确保 Cloudflare Workers 已部署 `caoliao-feishu-connector`
2. 自定义域名已配置：`feishu.yingjideng.dpdns.org`
3. 在飞书连接器中心配置应用服务地址和 Verification token

## 📝 使用说明

1. 在飞书多维表格中，进入「连接器中心」→「从其他数据源同步」→「自定义同步应用」
2. 填入应用服务地址：`https://feishu.yingjideng.dpdns.org`
3. 填入 Verification token：`caoliao-connector-2026`
4. 选择要同步的表，配置同步周期
5. 保存配置后，数据将自动同步到飞书多维表格

## ⚠️ 注意事项

- 资源引用使用相对路径
- `index.html` 必须在 `dist/` 根目录下
- 插件上架后按全称搜索，不要和已有插件重名

## 📄 License

MIT
