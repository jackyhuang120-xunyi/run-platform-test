import mysql.connector
import pandas as pd
import os

# === 数据库配置（请根据实际情况修改） ===
db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': 'pass2004',
    'database': 'jy_data_test2'
}

# === 连接数据库 ===
conn = mysql.connector.connect(**db_config)
cursor = conn.cursor()

# 只处理有效且 50m/60m/100m 尚未填充的记录
# （你可以根据需要加上 end_time IS NOT NULL 等条件）
query = """
SELECT id, log 
FROM train_record 
WHERE end_time IS NOT NULL 
  AND (
      time_50m  IS NULL 
   OR time_60m  IS NULL 
   OR time_100m IS NULL
  )
"""
cursor.execute(query)
rows = cursor.fetchall()

print(f"找到 {len(rows)} 条需要更新较长距离时间的记录")

# 目标距离（米）
TARGET_DISTANCES = [50, 60, 100]


def get_time_to_distance(df, target_m, start_time=0.0):
    """
    找到第一次达到或超过 target_m 的时间点
    返回：(用时秒数, 实际达到的距离)
          如果没跑到，返回 (None, max_dist)
    """
    reached = df[df['rel_pos'] >= target_m]
    if len(reached) == 0:
        max_dist = df['rel_pos'].max()
        return None, max_dist
    
    idx = reached.index[0]
    t = df['time'].iloc[idx] - start_time
    actual_dist = df['rel_pos'].iloc[idx]
    return t, actual_dist


for row in rows:
    record_id = row[0]
    log_path = row[1]
    
    if not os.path.exists(log_path):
        print(f"文件不存在，跳过 → ID: {record_id} | {log_path}")
        continue
    
    try:
        # 读取数据
        df = pd.read_csv(log_path)
        df.columns = df.columns.str.strip().str.lower()
        
        required = ['cnt', 'pos', 'speed']  # 其实只需要 cnt 和 pos 就能算时间和距离
        if not all(col in df.columns for col in required):
            print(f"缺少必要列，跳过 → ID: {record_id} | 实际列: {list(df.columns)}")
            continue
        
        df = df.sort_values('cnt').reset_index(drop=True)
        
        if len(df) < 10:
            print(f"数据点太少，跳过 → ID: {record_id} | {len(df)} 行")
            continue
        
        # 时间（秒）
        df['time'] = df['cnt'].values * 0.001
        
        # 相对位移（从起点0开始）
        start_pos = df['pos'].iloc[0]
        df['rel_pos'] = df['pos'] - start_pos
        
        max_dist = df['rel_pos'].max()
        
        # =====================================
        # 计算各个目标距离的用时
        # =====================================
        times_to_distance = {}
        actual_dists = {}
        
        start_time = df['time'].iloc[0]
        
        for d in TARGET_DISTANCES:
            t, actual = get_time_to_distance(df, d, start_time)
            times_to_distance[d] = t
            actual_dists[d] = actual
            
            if t is None:
                print(f"ID {record_id} | 前 {d:3}m 只跑到 {actual:.2f}m")
            elif actual < d * 0.98:  # 允许一点点误差
                print(f"ID {record_id} | 前 {d:3}m 达到 {actual:.2f}m → time={t:.4f}s （距离略不足）")
        
        # =====================================
        # 准备更新参数
        # =====================================
        params = (
            times_to_distance.get(50)   if times_to_distance.get(50)   is not None else None,
            times_to_distance.get(60)   if times_to_distance.get(60)   is not None else None,
            times_to_distance.get(100)  if times_to_distance.get(100)  is not None else None,
            record_id
        )
        
        # =====================================
        # 执行更新
        # =====================================
        update_sql = """
        UPDATE train_record
        SET 
            time_50m   = %s,
            time_60m   = %s,
            time_100m  = %s
        WHERE id = %s
        """
        
        cursor.execute(update_sql, params)
        conn.commit()
        
        # 打印结果
        print(f"更新成功 ID {record_id} | max_dist: {max_dist:.2f}m")
        for d in TARGET_DISTANCES:
            t = times_to_distance.get(d)
            actual = actual_dists.get(d)
            if t is not None:
                print(f"  {d:3}m 用时: {t:.4f}s  (实际 {actual:.2f}m)")
            else:
                print(f"  {d:3}m 未达到       (最大 {actual:.2f}m)")
        print("-" * 60)
        
    except Exception as e:
        print(f"处理失败 ID {record_id} | {log_path} → {str(e)}")
        continue


cursor.close()
conn.close()
print("\n所有较长距离时间更新完成！")