import mysql.connector
import pandas as pd
import numpy as np
import os

# === 数据库配置（请修改为你的实际信息）===
db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': 'pass2004',
    'database': 'jy_data_test2'
}

# === 连接数据库 ===
conn = mysql.connector.connect(**db_config)
cursor = conn.cursor()

# 只处理有效记录（end_time 不为空），且至少有一个平均速度列为 NULL
query = """
SELECT id, log 
FROM train_record 
WHERE end_time IS NOT NULL 
  AND (
      avg_speed_5m IS NULL OR
      avg_speed_10m IS NULL OR
      avg_speed_15m IS NULL OR
      avg_speed_20m IS NULL OR
      avg_speed_25m IS NULL OR
      avg_speed_30m IS NULL
  )
"""
cursor.execute(query)
rows = cursor.fetchall()

print(f"找到 {len(rows)} 条需要更新的记录")

distances = [5, 10, 15, 20, 25, 30]  # 目标距离（米）

for row in rows:
    record_id = row[0]
    log_path = row[1]
    
    if not os.path.exists(log_path):
        print(f"文件不存在，跳过 → ID: {record_id}  |  {log_path}")
        continue
    
    try:
        df = pd.read_csv(log_path)
        df.columns = df.columns.str.strip().str.lower()
        
        required = ['cnt', 'pos', 'speed']
        if not all(col in df.columns for col in required):
            print(f"缺少必要列，跳过 → ID: {record_id}")
            continue
        
        df = df.sort_values('cnt').reset_index(drop=True)
        
        # 时间（假设 cnt 单位为毫秒，转换为秒）
        times = df['cnt'].values * 0.001
        
        # 相对位移（从起点开始）
        start_pos = df['pos'].iloc[0]
        df['rel_pos'] = df['pos'] - start_pos
        
        # 调试：显示总距离
        max_dist = df['rel_pos'].max()
        if max_dist < 5:
            print(f"ID {record_id} | 总距离仅 {max_dist:.3f}m → 所有平均速度将为 NULL")
        
        # 为每个目标距离计算平均速度 = 位移 / 时间
        avg_speeds = {}
        
        for d in distances:
            # 找到第一个 >= d 的点
            reached = df[df['rel_pos'] >= d]
            
            if len(reached) == 0:
                # 总距离不足 d 米
                avg_speeds[d] = None
            else:
                # 取第一个达到或超过 d 的点
                idx = reached.index[0]
                end_time = times[idx]
                end_pos = df['rel_pos'].iloc[idx]
                
                start_time = times[0]
                start_pos = df['rel_pos'].iloc[0]
                
                actual_dist = end_pos - start_pos
                total_time = end_time - start_time
                
                if total_time > 0:
                    avg_speed = actual_dist / total_time
                    avg_speeds[d] = avg_speed
                    
                    # 如果距离明显不足，打印提示
                    if actual_dist < d * 0.95:  # 允许5%误差
                        print(f"ID {record_id} | 前{d}m 只跑到 {actual_dist:.2f}m → 平均速度={avg_speed:.4f}")
                else:
                    avg_speeds[d] = None
        
        # 计算完 avg_speeds 之后，准备更新参数
        # 强制转换为 Python 原生 float / None，彻底解决 numpy 类型问题
        params = (
            float(avg_speeds[5])   if avg_speeds[5] is not None and not np.isnan(avg_speeds[5])   else None,
            float(avg_speeds[10])  if avg_speeds[10] is not None and not np.isnan(avg_speeds[10])  else None,
            float(avg_speeds[15])  if avg_speeds[15] is not None and not np.isnan(avg_speeds[15])  else None,
            float(avg_speeds[20])  if avg_speeds[20] is not None and not np.isnan(avg_speeds[20])  else None,
            float(avg_speeds[25])  if avg_speeds[25] is not None and not np.isnan(avg_speeds[25])  else None,
            float(avg_speeds[30])  if avg_speeds[30] is not None and not np.isnan(avg_speeds[30])  else None,
            record_id   # id 通常是 int，不需要转
        )
        
        update_query = """
        UPDATE train_record
        SET 
            avg_speed_5m  = %s,
            avg_speed_10m = %s,
            avg_speed_15m = %s,
            avg_speed_20m = %s,
            avg_speed_25m = %s,
            avg_speed_30m = %s
        WHERE id = %s
        """
        
        cursor.execute(update_query, params)
        conn.commit()
        
        # 打印结果 - 使用安全方式
        print(f"更新成功 ID {record_id} | max_dist:{max_dist:.2f}m")
        for d, val in zip([5,10,15,20,25,30], params[:-1]):
            if val is not None:
                print(f"  {d}m: {val:.4f}", end=' | ')
            else:
                print(f"  {d}m: NULL", end=' | ')
        print()  # 换行
        
    except Exception as e:
        print(f"处理失败 ID {record_id} | {log_path} → {str(e)}")
        continue
cursor.close()
conn.close()
print("\n所有更新完成！")