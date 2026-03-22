-- MySQL 初始化脚本（简化，自带必要表与基础种子）
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS `body_part` (
  `id` TINYINT NOT NULL PRIMARY KEY,
  `name` VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS `gender` (
  `id` TINYINT NOT NULL PRIMARY KEY,
  `name` VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS `group_table` (
  `id` TINYINT NOT NULL PRIMARY KEY,
  `name` VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS `train_type` (
  `id` TINYINT NOT NULL PRIMARY KEY,
  `name` VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS `user` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `gender` TINYINT,
  `age` TINYINT,
  `height` SMALLINT,
  `weight` SMALLINT,
  `phone` VARCHAR(64),
  `id_number` VARCHAR(64),
  `group` TINYINT,
  `birthday` DATE,
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `modified_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` TINYINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `train_record` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` INT NOT NULL,
  `type` TINYINT NOT NULL,
  `part` TINYINT NOT NULL DEFAULT 1,
  `start_force` INT,
  `end_force` INT,
  `train_dis` INT,
  `change_dis` INT,
  `safe_dis` INT,
  `max_speed` DOUBLE,
  `total_time` DOUBLE,
  `peak_time` DOUBLE,
  `peak_pos` DOUBLE,
  `peak_speed` DOUBLE,
  `result` INT,
  `begin_time` DATETIME NOT NULL,
  `end_time` DATETIME DEFAULT NULL,
  `log` VARCHAR(512),
  `video` VARCHAR(512),
  INDEX `idx_uid_type_endtime` (`uid`,`type`,`end_time`),
  CONSTRAINT `fk_tr_uid` FOREIGN KEY (`uid`) REFERENCES `user`(`id`)
);

-- 种子数据
INSERT IGNORE INTO `body_part` (`id`,`name`) VALUES (1,'双腿'),(2,'左腿'),(3,'右腿');
INSERT IGNORE INTO `gender` (`id`,`name`) VALUES (1,'男'),(2,'女');
INSERT IGNORE INTO `group_table` (`id`,`name`) VALUES (1,'1组'),(2,'2组'),(3,'3组'),(4,'4组'),(5,'5组');
INSERT IGNORE INTO `train_type` (`id`,`name`) VALUES (1,'抗阻训练'),(2,'牵引训练'),(3,'折返训练');

SET FOREIGN_KEY_CHECKS=1;
