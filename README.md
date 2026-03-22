# React + Vite
注意：本示例使用本地 mock 数据（`src/api/mockData.js`），未包含后端 MySQL 连接。你可以将 `src/services/api.js` 替换为实际的 Axios 请求来对接 `jy_data_test1` 数据库的 API。

----

## 前后端一键运行与测试

项目已包含一个简单的后端示例（`run-platform/server`），以及 Docker Compose 配置用于本地快速启动 MySQL 和后端服务。后端提供分页查询、导出 CSV 与简单的 JWT 登录用于保护导出接口。

本地运行（手动方式）：

```bash
# 启动后端（可选，若不启动则前端使用本地 mock 数据）
cd run-platform/server
npm install
# 复制 .env.example 为 .env 并填写数据库连接以及 ADMIN_USER/ADMIN_PASS/JWT_SECRET
npm run dev

# 启动前端（开发服务器，已配置 /api 代理）
cd ../
npm install
npm run dev
```

使用 Docker Compose（一键启动 MySQL + 后端）：

```bash
cd run-platform
docker-compose up --build
```

登录与导出测试：

1. 登录获取 token：

```bash
curl -X POST http://localhost:4000/api/login -H "Content-Type: application/json" -d '{"username":"admin","password":"secret"}'
```

2. 在前端访问 `/login` 页面输入管理员账号/密码（或直接使用 `curl` 上面的登录命令）获取 `token`，前端会把 token 存入 `localStorage`。

3. 前端页面：
- 概览页 `/`：展示训练次数与峰值速度曲线，提供导出全部 CSV（需登录）。
- 训练记录 `/trains`：分页列表、筛选（UID/类型/开始-结束日期）、导出当前筛选结果（需登录）。
- 训练详情 `/trains/:id`：查看单条记录并导出单条 CSV（需登录）。

注意：导出接口受 JWT 保护（`Authorization: Bearer <token>`），仅用于开发/测试场景；生产环境请完善权限与审计。

----

如果你需要，我可以：
- 把导出改为流式输出以支持大数据量（推荐生产环境使用）；
- 添加更完善的用户认证与权限分层（基于 `user` 表）；
- 把前端进一步美化并添加更多报表（如 5m/10m 分段统计）。

````
