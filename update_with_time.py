import mysql.connector
import pandas as pd
import numpy as np
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

# 只处理有效且尚未完全填充的记录
query = """
SELECT id, log 
FROM train_record 
WHERE end_time IS NOT NULL 
  AND (
      peak_acceleration IS NULL OR 
      peak_power       IS NULL OR 
      peak_force       IS NULL OR
      time_5m          IS NULL OR
      time_10m         IS NULL OR
      time_15m         IS NULL OR
      time_20m         IS NULL OR
      time_25m         IS NULL OR
      time_30m         IS NULL
  )
"""
cursor.execute(query)
rows = cursor.fetchall()

print(f"找到 {len(rows)} 条需要更新的记录")

# 目标距离（米）
TARGET_DISTANCES = [5, 10, 15, 20, 25, 30]


def smooth_acceleration(acc, window_size=31):
    """中心移动平均，边界使用可用点"""
    return pd.Series(acc).rolling(window=window_size, min_periods=1, center=True).mean().values


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
        
        required = ['cnt', 'pos', 'speed', 'dir', 'force']
        if not all(col in df.columns for col in required):
            print(f"缺少必要列，跳过 → ID: {record_id} | 实际列: {list(df.columns)}")
            continue
        
        df = df.sort_values('cnt').reset_index(drop=True)
        
        if len(df) < 10:
            print(f"数据点太少，跳过 → ID: {record_id} | {len(df)} 行")
            continue
        
        # 时间（秒）
        times = df['cnt'].values * 0.001
        
        # 相对位移（从起点0开始）
        start_pos = df['pos'].iloc[0]
        df['rel_pos'] = df['pos'] - start_pos
        
        max_dist = df['rel_pos'].max()
        
        # =====================================
        # 1. 计算加速度（中心差分 + 边界前/后向）
        # =====================================
        speeds = df['speed'].values.astype(float)
        acc = np.zeros(len(speeds))
        
        # 首点：前向差分
        if len(speeds) >= 2:
            dt = times[1] - times[0]
            acc[0] = (speeds[1] - speeds[0]) / dt if dt > 0 else 0
        
        # 中间点：中心差分
        for i in range(1, len(speeds)-1):
            dt_f = times[i+1] - times[i]
            dt_b = times[i]   - times[i-1]
            forward  = (speeds[i+1] - speeds[i])   / dt_f if dt_f > 0 else 0
            backward = (speeds[i]   - speeds[i-1]) / dt_b if dt_b > 0 else 0
            acc[i] = (forward + backward) / 2
        
        # 尾点：后向差分
        if len(speeds) >= 2:
            dt = times[-1] - times[-2]
            acc[-1] = (speeds[-1] - speeds[-2]) / dt if dt > 0 else 0
        
        # 平滑加速度
        acc_smooth = smooth_acceleration(acc, 31)
        
        # =====================================
        # 2. 力量调整 + 功率
        # =====================================
        force_raw = df['force'].values.astype(float)
        force_adj = force_raw + 0.34 * acc_smooth           # kg
        power = speeds * force_adj * 9.8                    # W
        
        # =====================================
        # 3. 峰值指标（99.5% 分位数）
        # =====================================
        peak_acc   = float(np.percentile(np.abs(acc_smooth), 99.5))
        peak_force = float(np.percentile(np.abs(force_adj),  99.5))
        peak_power = float(np.percentile(power,             99.5))
        
        # =====================================
        # 4. 前 X 米用时
        # =====================================
        times_to_distance = {}
        
        for d in TARGET_DISTANCES:
            reached = df[df['rel_pos'] >= d]
            if len(reached) == 0:
                times_to_distance[d] = None
                continue
                
            idx = reached.index[0]
            end_time = times[idx]
            end_pos  = df['rel_pos'].iloc[idx]
            
            total_time = end_time - times[0]
            actual_dist = end_pos - df['rel_pos'].iloc[0]
            
            if total_time > 0:
                times_to_distance[d] = total_time
            else:
                times_to_distance[d] = None
            
            # 距离不足提示
            if actual_dist < d * 0.95:
                t = times_to_distance[d]
                print(f"ID {record_id} | 前 {d}m 只跑到 {actual_dist:.2f}m → "
                      f"time={t:.4f if t is not None else 'None'}s")
        
        # =====================================
        # 5. 准备更新参数
        # =====================================
        params = (
            peak_acc    if not np.isnan(peak_acc)    else None,
            peak_force  if not np.isnan(peak_force)  else None,
            peak_power  if not np.isnan(peak_power)  else None,
            
            times_to_distance.get(5)   if times_to_distance.get(5)   is not None else None,
            times_to_distance.get(10)  if times_to_distance.get(10)  is not None else None,
            times_to_distance.get(15)  if times_to_distance.get(15)  is not None else None,
            times_to_distance.get(20)  if times_to_distance.get(20)  is not None else None,
            times_to_distance.get(25)  if times_to_distance.get(25)  is not None else None,
            times_to_distance.get(30)  if times_to_distance.get(30)  is not None else None,
            
            record_id
        )
        
        # =====================================
        # 6. 执行更新
        # =====================================
        update_sql = """
        UPDATE train_record
        SET 
            peak_acceleration = %s,
            peak_force        = %s,
            peak_power        = %s,
            time_5m           = %s,
            time_10m          = %s,
            time_15m          = %s,
            time_20m          = %s,
            time_25m          = %s,
            time_30m          = %s
        WHERE id = %s
        """
        
        cursor.execute(update_sql, params)
        conn.commit()
        
        # 打印结果
        print(f"更新成功 ID {record_id} | max_dist: {max_dist:.2f}m")
        print(f"  peak_acc: {peak_acc:.4f} m/s² | peak_force: {peak_force:.2f} kg | peak_power: {peak_power:.1f} W")
        for d in TARGET_DISTANCES:
            t = times_to_distance.get(d)
            print(f"  {d:2}m 用时: {t:.4f if t is not None else 'None':<8}s", end=" | ")
        print()  # 换行
        
    except Exception as e:
        print(f"处理失败 ID {record_id} | {log_path} → {str(e)}")
        continue


cursor.close()
conn.close()
print("\n所有记录处理完成！")