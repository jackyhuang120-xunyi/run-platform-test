"""
数据库结构生成脚本

使用方法：
python scripts/generate_schema.py

此脚本会连接数据库并生成完整的数据库结构文档
"""

import os
import sys
from datetime import datetime
from pathlib import Path

# 添加父目录到路径，以便导入 db.js 中的配置
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import pymysql
except ImportError:
    print("错误: 需要安装 pymysql 库")
    print("请运行: pip install pymysql")
    sys.exit(1)


def load_db_config():
    """从 .env 文件加载数据库配置"""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass  # 如果没有 python-dotenv，就使用默认值

    return {
        'host': os.getenv('DB_HOST', '127.0.0.1'),
        'port': int(os.getenv('DB_PORT', 3306)),
        'user': os.getenv('DB_USER', 'root'),
        'password': os.getenv('DB_PASS', ''),
        'database': os.getenv('DB_NAME', 'jy_data_test1'),
        'charset': 'utf8mb4'
    }


def generate_schema():
    """生成数据库结构文档"""
    config = load_db_config()
    output_path = Path(__file__).parent.parent / 'migrations' / 'schema.md'

    try:
        # 连接数据库
        print('正在连接数据库...')
        connection = pymysql.connect(**config)
        cursor = connection.cursor()
        print('数据库连接成功')

        # 获取所有表
        print('正在获取表列表...')
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        table_names = [t[0] for t in tables]
        print(f'找到 {len(table_names)} 个表')

        # 生成文档内容
        markdown = '# 数据库结构文档\n\n'
        markdown += f'> 生成时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n\n'
        markdown += f'> 数据库: {config["database"]}\n\n'

        # 为每个表生成结构说明
        for table_name in table_names:
            print(f'正在处理表: {table_name}')

            markdown += f'## {table_name}\n\n'

            # 获取表结构
            cursor.execute(f"DESCRIBE `{table_name}`")
            columns = cursor.fetchall()

            markdown += '### 字段列表\n\n'
            markdown += '| 字段名 | 类型 | 允许NULL | 键 | 默认值 | 额外 |\n'
            markdown += '|--------|------|----------|-----|--------|------|\n'

            for col in columns:
                field, type_, null, key, default, extra = col
                markdown += f'| {field} | {type_} | {null} | {key or "-"} | {default or "-"} | {extra or "-"} |\n'

            markdown += '\n'

            # 获取建表语句
            cursor.execute(f"SHOW CREATE TABLE `{table_name}`")
            create_table = cursor.fetchone()
            if create_table and create_table[1]:
                markdown += '### 建表语句\n\n'
                markdown += '```sql\n'
                markdown += create_table[1]
                markdown += '\n```\n\n'

            # 获取索引信息
            cursor.execute(f"SHOW INDEX FROM `{table_name}`")
            indexes = cursor.fetchall()
            if indexes:
                markdown += '### 索引信息\n\n'
                markdown += '| 索引名 | 列名 | 唯一 | 类型 |\n'
                markdown += '|--------|------|------|------|\n'

                for idx in indexes:
                    key_name, column, non_unique, idx_type = idx[2], idx[4], idx[1], idx[10]
                    markdown += f'| {key_name} | {column} | {"否" if non_unique else "是"} | {idx_type} |\n'

                markdown += '\n'

            markdown += '---\n\n'

        # 写入文件
        print('正在写入文档...')
        output_path.write_text(markdown, encoding='utf-8')
        print(f'文档已生成: {output_path}')

    except Exception as error:
        print(f'生成文档失败: {error}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        if 'connection' in locals():
            connection.close()


if __name__ == '__main__':
    generate_schema()
