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

# === 只处理有效且尚未完全填充的记录 ===
query = """
SELECT id, log 
FROM train_record 
WHERE end_time IS NOT NULL 
  AND (peak_acceleration IS NULL OR peak_power IS NULL OR peak_force IS NULL)
"""
cursor.execute(query)
rows = cursor.fetchall()

def smooth_acceleration(acc, window_size=31):
    """移动平均滤波，边界使用可用点"""
    return pd.Series(acc).rolling(window=window_size, min_periods=1, center=True).mean().values

for row in rows:
    record_id = row[0]
    log_path = row[1]
    
    if not os.path.exists(log_path):
        print(f"Warning: 文件不存在 {log_path} (ID: {record_id})，跳过。")
        continue
    
    try:
        # 读取 CSV（假设有表头 cnt pos speed Dir Force）
        df = pd.read_csv(log_path)
        df.columns = df.columns.str.strip().str.lower()  # 统一小写去空格
        
        required = ['cnt', 'pos', 'speed', 'dir', 'force']
        if not all(col in df.columns for col in required):
            print(f"Warning: 缺少列 {log_path} (ID: {record_id})，实际: {list(df.columns)}")
            continue
        
        df = df.sort_values('cnt').reset_index(drop=True)
        
        # 时间序列（假设 cnt 均匀递增，间隔 1ms = 0.001s）
        times = df['cnt'].values * 0.001
        speeds = df['speed'].values.astype(float)
        force_raw = df['force'].values.astype(float)
        
        if len(df) < 2:
            print(f"Warning: 数据点太少 {log_path} (ID: {record_id})")
            continue
        
        # === 计算加速度（严格按你描述的差分方法）===
        acc = np.zeros(len(speeds))
        
        # 第一个点：前向差分
        dt = times[1] - times[0]
        acc[0] = (speeds[1] - speeds[0]) / dt
        
        # 中间点：中心差分
        for i in range(1, len(speeds)-1):
            dt_forward = times[i+1] - times[i]
            dt_backward = times[i] - times[i-1]
            forward = (speeds[i+1] - speeds[i]) / dt_forward
            backward = (speeds[i] - speeds[i-1]) / dt_backward
            acc[i] = (forward + backward) / 2
        
        # 最后一个点：后向差分
        dt = times[-1] - times[-2]
        acc[-1] = (speeds[-1] - speeds[-2]) / dt
        
        # === 加速度滤波（31点移动平均，中心+边界处理）===
        acc_smooth = smooth_acceleration(acc, 31)
        
        # === 力量调整（kg）===
        force_adj = force_raw + 0.34 * acc_smooth
        
        # === 功率（W）===
        power = speeds * force_adj * 9.8
        
        # === 峰值指标（99.5% 分位数）===
        peak_acc = np.percentile(np.abs(acc_smooth), 99.5)
        peak_force_kg = np.percentile(np.abs(force_adj), 99.5)  # 假设已经是kg单位
        peak_power_val = np.percentile(power, 99.5)  # 功率通常取正向峰值，如果有负可改abs
        
        # === 前 Xm 平均速度 ===
        # 假设 pos 是累计距离（m），计算相对距离
        start_pos = df['pos'].iloc[0]
        df['rel_pos'] = df['pos'] - start_pos
        
        avg_speeds = {}
        distances = [5, 10, 15, 20, 25, 30]
        for d in distances:
            segment = df[df['rel_pos'] <= d]
            if len(segment) == 0 or segment['rel_pos'].max() < d:
                avg_speeds[d] = None
            else:
                # 取达到或超过 d 前所有点的平均速度
                avg_speeds[d] = segment['speed'].mean()
        
        # === 更新数据库 ===
        update_query = """
        UPDATE train_record
        SET peak_acceleration = %s,
            peak_force = %s,
            peak_power = %s,
            avg_speed_5m = %s,
            avg_speed_10m = %s,
            avg_speed_15m = %s,
            avg_speed_20m = %s,
            avg_speed_25m = %s,
            avg_speed_30m = %s
        WHERE id = %s
        """

        # 强制转换为 Python 原生类型
        params = (
            float(peak_acc) if not np.isnan(peak_acc) else None,
            float(peak_force_kg) if not np.isnan(peak_force_kg) else None,
            float(peak_power_val) if not np.isnan(peak_power_val) else None,
            float(avg_speeds[5]) if avg_speeds[5] is not None and not np.isnan(avg_speeds[5]) else None,
            float(avg_speeds[10]) if avg_speeds[10] is not None and not np.isnan(avg_speeds[10]) else None,
            float(avg_speeds[15]) if avg_speeds[15] is not None and not np.isnan(avg_speeds[15]) else None,
            float(avg_speeds[20]) if avg_speeds[20] is not None and not np.isnan(avg_speeds[20]) else None,
            float(avg_speeds[25]) if avg_speeds[25] is not None and not np.isnan(avg_speeds[25]) else None,
            float(avg_speeds[30]) if avg_speeds[30] is not None and not np.isnan(avg_speeds[30]) else None,
            record_id
        )

        cursor.execute(update_query, params)
        conn.commit()
        print(f"成功更新 ID {record_id}: 峰值加速度={peak_acc:.4f} m/s², 峰值力量={peak_force_kg:.2f} kg, 峰值功率={peak_power_val:.2f} W")        
    except Exception as e:
        print(f"处理失败 {log_path} (ID: {record_id}): {e}")
        continue

cursor.close()
conn.close()
print("所有有效记录处理完成！")