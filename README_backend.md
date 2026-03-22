后端示例（Express + MySQL）

项目包含一个简单的后端示例，路径：`run-platform/server`。它演示如何使用 `mysql2` 连接到 `jy_data_test1` 并提供 REST API。

启动后端：

```bash
cd run-platform/server
npm install
# 编辑 .env.example 为 .env，并填写数据库信息
npm run dev
```

后端默认监听 `PORT` 环境变量（示例为 4000），前端会向 `/api/*` 发起请求（开发时通过同源或代理）。

说明：如需前端通过代理访问，请在 Vite 配置中添加 dev proxy，或在生产环境将前端与后端部署在同域名下。

认证说明：后端包含一个简单的登录接口 `/api/login`，用于签发 JWT。
默认管理员账号可通过 `run-platform/server/.env` 中的 `ADMIN_USER` 和 `ADMIN_PASS` 配置。登录成功后会返回 `token`，用于调用导出接口：

```bash
curl -X POST http://localhost:4000/api/login -H "Content-Type: application/json" -d '{"username":"admin","password":"secret"}'
```

响应示例：
```json
{ "token": "..." }
```

然后在前端调用受保护的导出接口时需要在请求头中添加：
`Authorization: Bearer <token>`。

前端已提供登录页：`/login`，可在前端输入管理员账号密码并保存 token（LocalStorage），登录后即可使用导出功能。

