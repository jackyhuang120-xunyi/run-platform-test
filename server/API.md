# 后端 API 规范（示例）

基础路径：`/api`

1) GET /api/trains
 - 描述：获取训练记录列表（分页、过滤）。
 - 参数：
    - `page` (int, 可选, 默认1)
    - `pageSize` (int, 可选, 默认20)
    - `uid` (int, 可选) — 按用户过滤
    - `type` (int, 可选) — 按训练类型过滤
 - 响应：
```
{
  data: [ { id, uid, type, part, start_force, end_force, train_dis, max_speed, total_time, begin_time, end_time, log, user_name, ... } ],
  page: 1,
  pageSize: 20,
  total: 123
}
```

2) GET /api/trains/:id
 - 描述：获取单条训练记录详情
 - 响应：单个记录对象，404 当未找到

3) GET /api/users
 - 描述：获取用户列表（默认仅返回 `is_deleted=0` 的用户）
 - 响应：数组：`[{ id, name, group, is_deleted }]`

错误处理：统一返回 JSON 格式：`{ error: 'code', message: 'human readable' }`。

过滤与业务规则：
- 默认只返回已完成训练（`end_time IS NOT NULL`）且排除测试用户 `uid=0`。
- 支持 `uid=0` 的显式查询（若需要包含测试数据）。

认证：示例未实现；生产环境建议添加 JWT 或基于会话的认证，并对写入/删除类操作做权限控制。
