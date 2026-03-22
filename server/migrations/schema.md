# 数据库结构文档

> 生成时间: 2026-03-22 10:32:12

> 数据库: jy_data_test2

## body_part

### 字段列表

| 字段名 | 类型 | 允许NULL | 键 | 默认值 | 额外 |
|--------|------|----------|-----|--------|------|
| id | tinyint | NO | PRI | - | - |
| name | varchar(32) | NO | - | - | - |

### 建表语句

```sql
CREATE TABLE `body_part` (
  `id` tinyint NOT NULL,
  `name` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

### 索引信息

| 索引名 | 列名 | 唯一 | 类型 |
|--------|------|------|------|
| PRIMARY | id | 是 | BTREE |

---

## gender

### 字段列表

| 字段名 | 类型 | 允许NULL | 键 | 默认值 | 额外 |
|--------|------|----------|-----|--------|------|
| id | tinyint | NO | PRI | - | - |
| name | varchar(32) | NO | - | - | - |

### 建表语句

```sql
CREATE TABLE `gender` (
  `id` tinyint NOT NULL,
  `name` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

### 索引信息

| 索引名 | 列名 | 唯一 | 类型 |
|--------|------|------|------|
| PRIMARY | id | 是 | BTREE |

---

## group

### 字段列表

| 字段名 | 类型 | 允许NULL | 键 | 默认值 | 额外 |
|--------|------|----------|-----|--------|------|
| id | tinyint | NO | PRI | - | - |
| name | varchar(32) | NO | - | - | - |

### 建表语句

```sql
CREATE TABLE `group` (
  `id` tinyint NOT NULL,
  `name` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

### 索引信息

| 索引名 | 列名 | 唯一 | 类型 |
|--------|------|------|------|
| PRIMARY | id | 是 | BTREE |

---

## train_record

### 字段列表

| 字段名 | 类型 | 允许NULL | 键 | 默认值 | 额外 |
|--------|------|----------|-----|--------|------|
| id | int | NO | PRI | - | auto_increment |
| uid | int | NO | MUL | - | - |
| type | tinyint | NO | MUL | - | - |
| part | tinyint | NO | MUL | 1 | - |
| start_force | int | YES | - | - | - |
| end_force | int | YES | - | - | - |
| train_dis | int | YES | - | - | - |
| change_dis | int | YES | - | - | - |
| safe_dis | int | YES | - | - | - |
| max_speed | float | YES | - | - | - |
| total_time | float | YES | - | - | - |
| peak_time | float | YES | - | - | - |
| peak_pos | float | YES | - | - | - |
| peak_speed | float | YES | - | - | - |
| peak_acceleration | decimal(12,4) | YES | - | - | - |
| peak_force | decimal(12,2) | YES | - | - | - |
| peak_power | decimal(15,2) | YES | - | - | - |
| avg_step_frequency | decimal(10,4) | YES | - | - | - |
| avg_step_length | decimal(10,4) | YES | - | - | - |
| time_5m | decimal(10,4) | YES | - | - | - |
| time_10m | decimal(10,4) | YES | - | - | - |
| time_15m | decimal(10,4) | YES | - | - | - |
| time_20m | decimal(10,4) | YES | - | - | - |
| time_25m | decimal(10,4) | YES | - | - | - |
| time_30m | decimal(10,4) | YES | - | - | - |
| time_50m | decimal(10,4) | YES | - | - | - |
| time_60m | decimal(10,4) | YES | - | - | - |
| time_100m | decimal(10,4) | YES | - | - | - |
| result | int | YES | - | - | - |
| begin_time | timestamp | NO | - | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| end_time | timestamp | YES | - | - | - |
| log | varchar(255) | YES | - | - | - |
| video | varchar(255) | YES | - | - | - |

### 建表语句

```sql
CREATE TABLE `train_record` (
  `id` int NOT NULL AUTO_INCREMENT,
  `uid` int NOT NULL,
  `type` tinyint NOT NULL,
  `part` tinyint NOT NULL DEFAULT '1',
  `start_force` int DEFAULT NULL,
  `end_force` int DEFAULT NULL,
  `train_dis` int DEFAULT NULL,
  `change_dis` int DEFAULT NULL,
  `safe_dis` int DEFAULT NULL,
  `max_speed` float DEFAULT NULL,
  `total_time` float DEFAULT NULL,
  `peak_time` float DEFAULT NULL,
  `peak_pos` float DEFAULT NULL,
  `peak_speed` float DEFAULT NULL,
  `peak_acceleration` decimal(12,4) DEFAULT NULL COMMENT '峰值加速度 (m/s², 99.5% 分位数，绝对值)',
  `peak_force` decimal(12,2) DEFAULT NULL COMMENT '峰值力量 (kg, 99.5% 分位数，绝对值)',
  `peak_power` decimal(15,2) DEFAULT NULL COMMENT '峰值功率 (W, 99.5% 分位数)',
  `avg_step_frequency` decimal(10,4) DEFAULT NULL,
  `avg_step_length` decimal(10,4) DEFAULT NULL,
  `time_5m` decimal(10,4) DEFAULT NULL COMMENT '前5米用时(秒)',
  `time_10m` decimal(10,4) DEFAULT NULL COMMENT '前10米用时(秒)',
  `time_15m` decimal(10,4) DEFAULT NULL COMMENT '前15米用时(秒)',
  `time_20m` decimal(10,4) DEFAULT NULL COMMENT '前20米用时(秒)',
  `time_25m` decimal(10,4) DEFAULT NULL COMMENT '前25米用时(秒)',
  `time_30m` decimal(10,4) DEFAULT NULL COMMENT '前30米用时(秒)',
  `time_50m` decimal(10,4) DEFAULT NULL COMMENT '前50米用时(秒)',
  `time_60m` decimal(10,4) DEFAULT NULL COMMENT '前60米用时(秒)',
  `time_100m` decimal(10,4) DEFAULT NULL COMMENT '前100米用时(秒)',
  `result` int DEFAULT NULL,
  `begin_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `end_time` timestamp NULL DEFAULT NULL,
  `log` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `video` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `uid` (`uid`),
  KEY `type` (`type`),
  KEY `part` (`part`),
  CONSTRAINT `train_record_ibfk_1` FOREIGN KEY (`uid`) REFERENCES `user` (`id`),
  CONSTRAINT `train_record_ibfk_2` FOREIGN KEY (`type`) REFERENCES `train_type` (`id`),
  CONSTRAINT `train_record_ibfk_3` FOREIGN KEY (`part`) REFERENCES `body_part` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=758 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

### 索引信息

| 索引名 | 列名 | 唯一 | 类型 |
|--------|------|------|------|
| PRIMARY | id | 是 | BTREE |
| uid | uid | 否 | BTREE |
| type | type | 否 | BTREE |
| part | part | 否 | BTREE |

---

## train_record_view

### 字段列表

| 字段名 | 类型 | 允许NULL | 键 | 默认值 | 额外 |
|--------|------|----------|-----|--------|------|
| id | int | NO | - | 0 | - |
| name | varchar(255) | NO | - | - | - |
| id_number | varchar(255) | YES | - | - | - |
| group | varchar(32) | NO | - | - | - |
| type | varchar(255) | NO | - | - | - |
| force | int | YES | - | - | - |
| train_dis | int | YES | - | - | - |
| time | timestamp | NO | - | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| uid | int | NO | - | - | - |
| group_id | tinyint | YES | - | - | - |
| part_id | tinyint | NO | - | 1 | - |
| type_id | tinyint | NO | - | - | - |

### 建表语句

```sql
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `train_record_view` (`id`,`name`,`id_number`,`group`,`type`,`force`,`train_dis`,`time`,`uid`,`group_id`,`part_id`,`type_id`) AS select `tr`.`id` AS `id`,`u`.`name` AS `name`,`u`.`id_number` AS `id_number`,`g`.`name` AS `group`,`tt`.`name` AS `type`,`tr`.`end_force` AS `force`,`tr`.`train_dis` AS `train_dis`,`tr`.`begin_time` AS `time`,`tr`.`uid` AS `uid`,`u`.`group` AS `group_id`,`tr`.`part` AS `part_id`,`tr`.`type` AS `type_id` from ((((`user` `u` join `train_record` `tr` on((`u`.`id` = `tr`.`uid`))) join `train_type` `tt` on((`tr`.`type` = `tt`.`id`))) join `body_part` `bp` on((`tr`.`part` = `bp`.`id`))) join `group` `g` on((`u`.`group` = `g`.`id`))) where ((`tr`.`end_time` is not null) and (`u`.`is_deleted` = 0))
```

---

## train_type

### 字段列表

| 字段名 | 类型 | 允许NULL | 键 | 默认值 | 额外 |
|--------|------|----------|-----|--------|------|
| id | tinyint | NO | PRI | - | - |
| name | varchar(255) | NO | - | - | - |

### 建表语句

```sql
CREATE TABLE `train_type` (
  `id` tinyint NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

### 索引信息

| 索引名 | 列名 | 唯一 | 类型 |
|--------|------|------|------|
| PRIMARY | id | 是 | BTREE |

---

## user

### 字段列表

| 字段名 | 类型 | 允许NULL | 键 | 默认值 | 额外 |
|--------|------|----------|-----|--------|------|
| id | int | NO | PRI | - | auto_increment |
| name | varchar(255) | NO | - | - | - |
| gender | tinyint | YES | MUL | - | - |
| age | smallint unsigned | YES | - | - | - |
| height | smallint unsigned | YES | - | - | - |
| weight | smallint unsigned | YES | - | - | - |
| phone | varchar(255) | YES | - | - | - |
| id_number | varchar(255) | YES | - | - | - |
| group | tinyint | YES | MUL | - | - |
| birthday | date | YES | - | - | - |
| remark | varchar(255) | YES | - | - | - |
| description | varchar(255) | YES | - | - | - |
| create_time | timestamp | NO | - | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| modified_time | timestamp | NO | - | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| is_deleted | tinyint | NO | - | 0 | - |

### 建表语句

```sql
CREATE TABLE `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `gender` tinyint DEFAULT NULL,
  `age` smallint unsigned DEFAULT NULL,
  `height` smallint unsigned DEFAULT NULL,
  `weight` smallint unsigned DEFAULT NULL,
  `phone` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_number` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `group` tinyint DEFAULT NULL,
  `birthday` date DEFAULT NULL,
  `remark` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_deleted` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `gender` (`gender`),
  KEY `group` (`group`),
  CONSTRAINT `user_ibfk_1` FOREIGN KEY (`gender`) REFERENCES `gender` (`id`),
  CONSTRAINT `user_ibfk_2` FOREIGN KEY (`group`) REFERENCES `group` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=101 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

### 索引信息

| 索引名 | 列名 | 唯一 | 类型 |
|--------|------|------|------|
| PRIMARY | id | 是 | BTREE |
| gender | gender | 否 | BTREE |
| group | group | 否 | BTREE |

---

## user_view

### 字段列表

| 字段名 | 类型 | 允许NULL | 键 | 默认值 | 额外 |
|--------|------|----------|-----|--------|------|
| id | int | NO | - | 0 | - |
| name | varchar(255) | NO | - | - | - |
| gender | varchar(32) | YES | - | - | - |
| age | bigint | YES | - | - | - |
| weight | smallint unsigned | YES | - | - | - |
| height | smallint unsigned | YES | - | - | - |
| id_number | varchar(255) | YES | - | - | - |
| group_id | tinyint | YES | - | - | - |
| gender_id | tinyint | YES | - | - | - |
| group_name | varchar(32) | YES | - | - | - |
| birthday | date | YES | - | - | - |

### 建表语句

```sql
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `user_view` (`id`,`name`,`gender`,`age`,`weight`,`height`,`id_number`,`group_id`,`gender_id`,`group_name`,`birthday`) AS select `u`.`id` AS `id`,`u`.`name` AS `name`,`gd`.`name` AS `gender`,timestampdiff(YEAR,`u`.`birthday`,curdate()) AS `age`,`u`.`weight` AS `weight`,`u`.`height` AS `height`,`u`.`id_number` AS `id_number`,`u`.`group` AS `group_id`,`u`.`gender` AS `gender_id`,`gr`.`name` AS `group_name`,`u`.`birthday` AS `birthday` from ((`user` `u` left join `gender` `gd` on((`u`.`gender` = `gd`.`id`))) left join `group` `gr` on((`u`.`group` = `gr`.`id`))) where (`u`.`is_deleted` = 0)
```

---

