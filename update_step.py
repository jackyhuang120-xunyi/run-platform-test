import mysql.connector
import pandas as pd
import numpy as np
import os

# ── 数据库配置 ────────────────────────────────────────
db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': 'pass2004',
    'database': 'jy_data_test2'
}

# ── 连接 ───────────────────────────────────────────────
conn = mysql.connector.connect(**db_config)
cursor = conn.cursor()

# 只找 avg_step_length 或 avg_step_frequency 为空的记录
query = """
SELECT id, log 
FROM train_record 
WHERE end_time IS NOT NULL 
  AND (avg_step_length IS NULL OR avg_step_frequency IS NULL)
  AND log IS NOT NULL
"""
cursor.execute(query)
rows = cursor.fetchall()

print(f"找到 {len(rows)} 条需要更新步长/步频的记录")

def apply_low_pass_filter(data, dt, cutoff_freq=10.0):
    """应用低通滤波器（与JS中的applyLowPassFilter一致）"""
    if len(data) == 0:
        return []
    
    fs = 1.0 / dt
    RC = 1.0 / (2 * np.pi * cutoff_freq)
    alpha = dt / (RC + dt)
    
    filtered = [data[0]]
    for i in range(1, len(data)):
        filtered.append(alpha * data[i] + (1 - alpha) * filtered[i-1])
    
    return np.array(filtered)

def calculate_stride_and_frequency(data, sample_interval=0.001):
    """计算平均步长和步频（严格按照TrainDetail_new.jsx中的calculateStrideAndFrequency实现）"""
    if len(data) < 200:
        return None, None  # 数据不足
    
    # 提取数组
    positions = data['pos'].values
    speeds = data['speed_filtered'].values  # 假设已滤波
    times = data['time'].values
    
    total_distance = positions[-1] - positions[0]
    total_time = times[-1] - times[0]
    avg_speed = total_distance / total_time if total_time > 0 else 0
    
    stride_length = None
    stride_frequency = None
    
    # ─── 第一优先：后半段高速度区间的峰值检测 ───
    max_speed = np.max(speeds)
    high_speed_threshold = max_speed * 0.70
    
    high_speed_indices = np.where(speeds >= high_speed_threshold)[0]
    
    if len(high_speed_indices) >= 80:
        sub_speeds = speeds[high_speed_indices]
        sub_pos = positions[high_speed_indices]
        sub_times = times[high_speed_indices]
        
        peaks = []
        min_distance_samples = int(0.20 / sample_interval)  # 0.20s
        min_peak_height = high_speed_threshold * 0.05
        
        for i in range(1, len(sub_speeds) - 1):
            if sub_speeds[i] > sub_speeds[i - 1] and sub_speeds[i] > sub_speeds[i + 1]:
                # 检查最小峰值高度
                if sub_speeds[i] <= min_peak_height:
                    continue
                
                # 检查时间差（与上一个峰）
                if peaks and (sub_times[i] - sub_times[peaks[-1]]) <= 0.18:
                    continue
                
                # 计算突出度（prominence）
                left_min = np.min(sub_speeds[max(0, i - min_distance_samples):i])
                right_min = np.min(sub_speeds[i + 1:i + min_distance_samples + 1])
                prominence = sub_speeds[i] - max(left_min, right_min)
                
                if prominence <= 0.1:
                    continue
                
                peaks.append(i)
        
        if len(peaks) >= 4:
            stride_lengths = []
            stride_periods = []
            
            for k in range(len(peaks) - 1):
                p1 = peaks[k]
                p2 = peaks[k + 1]
                d_pos = abs(sub_pos[p2] - sub_pos[p1])
                d_time = sub_times[p2] - sub_times[p1]
                
                if 0.4 < d_pos < 2.4 and 0.18 < d_time < 1.3:
                    stride_lengths.append(d_pos)
                    stride_periods.append(d_time)
            
            if len(stride_lengths) >= 4:
                stride_length = np.mean(stride_lengths)
                avg_period = np.mean(stride_periods)
                stride_frequency = 1 / avg_period if avg_period > 0 else None
    
    
    # 保留两位小数，并处理None，直接返回检测结果（失败时就是 None, None）
    stride_length = round(stride_length, 2) if stride_length is not None else None
    stride_frequency = round(stride_frequency, 2) if stride_frequency is not None else None    
    return stride_length, stride_frequency

for row in rows:
    record_id, log_path = row
    
    if not os.path.exists(log_path):
        print(f"文件不存在 → ID {record_id} | {log_path}")
        continue
    
    try:
        # 读取CSV
        df = pd.read_csv(log_path)
        df.columns = df.columns.str.strip().str.lower()
        
        required_cols = ['cnt', 'pos', 'speed', 'dir', 'force']
        if not all(col in df.columns for col in required_cols):
            print(f"缺少必要列 → ID {record_id} | 实际列: {list(df.columns)}")
            continue
        
        df = df.sort_values('cnt').reset_index(drop=True)
        
        if len(df) < 200:  # 与JS一致
            print(f"数据点太少 → ID {record_id} | {len(df)} 行")
            continue
        
        # 时间（秒）
        sample_interval = 0.001
        df['time'] = df['cnt'] * sample_interval
        
        # 相对位移
        df['pos'] = df['pos'] - df['pos'].iloc[0]
        
        # 应用低通滤波到速度
        speeds_raw = df['speed'].values.astype(float)
        speeds_filtered = apply_low_pass_filter(speeds_raw, sample_interval)
        df['speed_filtered'] = speeds_filtered
        
        # 计算步长和步频
        avg_step_length, avg_step_frequency = calculate_stride_and_frequency(df, sample_interval)
        
        # ── 更新数据库 ────────────────────────────────────
        update_sql = """
        UPDATE train_record
        SET 
            avg_step_length    = %s,
            avg_step_frequency = %s
        WHERE id = %s
        """
        params = (
            float(avg_step_length) if avg_step_length is not None else None,
            float(avg_step_frequency) if avg_step_frequency is not None else None,
            record_id
        )        
        cursor.execute(update_sql, params)
        conn.commit()
        
        print(f"更新成功 ID {record_id} | "
            f"步长: {f'{avg_step_length:.2f}' if avg_step_length is not None else 'None'} m | "
            f"步频: {f'{avg_step_frequency:.2f}' if avg_step_frequency is not None else 'None'} Hz")
    except Exception as e:
        print(f"处理失败 ID {record_id} | {log_path} → {str(e)}")
        continue

cursor.close()
conn.close()
print("\n步长/步频更新完成！")