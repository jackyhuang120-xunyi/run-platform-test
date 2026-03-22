# 数据库迁移文档

## 目录说明

本目录包含数据库的初始化脚本和迁移文件。

## 文件说明

### init.sql
数据库初始化脚本，包含所有表的创建语句和基础种子数据。

## 如何生成数据库结构文档

如果您想生成数据库结构文档，可以按照以下步骤：

### 方法一：使用 MySQL 命令生成

```bash
# 生成完整的数据库结构
mysqldump -u root -p --no-data jy_data_test1 > migrations/schema.sql

# 生成包含数据的数据库结构
mysqldump -u root -p jy_data_test1 > migrations/full_dump.sql
```

### 方法二：使用 SQL 查询生成

```sql
-- 查看所有表
SHOW TABLES;

-- 查看表结构
DESCRIBE table_name;

-- 查看建表语句
SHOW CREATE TABLE table_name;
```

## 数据库表结构

### 表列表

1. `body_part` - 身体部位
2. `gender` - 性别
3. `group` - 组别
4. `train_type` - 训练类型
5. `user` - 用户表
6. `train_record` - 训练记录表

### 详细结构

请参考 `init.sql` 文件查看完整的表结构定义。

## 注意事项

1. 所有表名使用反引号包裹，避免与 MySQL 保留关键字冲突
2. 使用 `IF NOT EXISTS` 确保脚本可以重复执行
3. 外键约束使用 `CONSTRAINT` 命名，便于管理
4. 种子数据使用 `INSERT IGNORE` 避免重复插入
