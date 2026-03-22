
import csv
import os
import shutil
import numpy as np
import pandas as pd
from datetime import datetime
import mysql.connector
from mysql.connector import Error

# 数据库配置
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'pass2004',  # 请替换为实际密码
    'database': 'jy_data_test2'   # 请替换为实际数据库名
}

# CSV文件存储路径
CSV_STORAGE_PATH = r'c:\Jonny\test-jueying2\run-platform'  # run-platform目录，CSV文件将存储在log子目录下

def apply_low_pass_filter(data, dt, cutoff_freq=10.0):
    """
    应用低通滤波器
    :param data: 数据数组
    :param dt: 采样时间间隔
    :param cutoff_freq: 截止频率
    :return: 滤波后的数据
    """
    if not data or len(data) == 0:
        return []

    fs = 1.0 / dt  # 采样频率

    # 简单的低通滤波器实现
    RC = 1.0 / (2 * np.pi * cutoff_freq)
    alpha = dt / (RC + dt)

    filtered = [data[0]]
    for i in range(1, len(data)):
        filtered.append(alpha * data[i] + (1 - alpha) * filtered[i-1])

    return filtered

def calculate_segment_data(data, segment_distance):
    """
    计算分段数据
    :param data: 数据数组
    :param segment_distance: 分段距离
    :return: 分段数据列表
    """
    segments = []
    max_pos = max(row['pos'] for row in data)

    for i in range(0, int(max_pos), segment_distance):
        start_pos = i
        end_pos = i + segment_distance

        # 找到对应的数据点
        start_index = next((idx for idx, row in enumerate(data) if row['pos'] >= start_pos), None)
        end_index = next((idx for idx, row in enumerate(data) if row['pos'] >= end_pos), None)

        if start_index is None or end_index is None:
            continue

        segment_data = data[start_index:end_index+1]
        if len(segment_data) == 0:
            continue

        segment_time = segment_data[-1]['time'] - segment_data[0]['time']
        avg_speed = segment_distance / segment_time if segment_time > 0 else 0

        segments.append({
            'segment': f"{start_pos}-{end_pos}",
            'time': segment_time or 0,
            'cumulative_time': segment_data[-1]['time'] or 0,
            'avg_speed': avg_speed or 0
        })

    return segments

def calculate_stride_and_frequency(data, sample_interval=0.001):
    """
    计算步长和步频 - 针对恒阻牵引跑步设备优化版
    :param data: 数据数组
    :param sample_interval: 采样间隔
    :return: 包含步长、步频和备注的字典
    """
    if not data or len(data) < 200:
        return {'stride_length': None, 'stride_frequency': None, 'note': '数据不足'}

    positions = [row['pos'] for row in data]
    speeds = [row.get('speed_filtered', row['speed']) for row in data]
    times = [row['time'] for row in data]

    total_distance = positions[-1] - positions[0]
    total_time = times[-1] - times[0]
    avg_speed = total_distance / total_time if total_time > 0 else 0

    stride_length = None
    stride_frequency = None
    note = '估算值（典型步频）'

    # 第一优先：后半段高速度区间的峰值检测
    max_speed = max(speeds)
    high_speed_threshold = max_speed * 0.70  # 70%最大速度以上

    high_speed_indices = [idx for idx, v in enumerate(speeds) if v >= high_speed_threshold]

    if len(high_speed_indices) >= 80:  # 至少0.08秒匀速段
        sub_speeds = [speeds[idx] for idx in high_speed_indices]
        sub_pos = [positions[idx] for idx in high_speed_indices]
        sub_times = [times[idx] for idx in high_speed_indices]

        peaks = []
        min_distance_samples = int(0.20 / sample_interval)  # 从0.18调整到0.20s，减少假峰
        min_peak_height = high_speed_threshold * 0.05  # 最小峰值高度

        for i in range(1, len(sub_speeds) - 1):
            if sub_speeds[i] > sub_speeds[i - 1] and sub_speeds[i] > sub_speeds[i + 1]:
                # 检查是否满足最小峰值高度
                if sub_speeds[i] <= min_peak_height:
                    continue

                # 检查是否满足最小距离要求
                if len(peaks) > 0:
                    time_diff = sub_times[i] - sub_times[peaks[-1]]
                    if time_diff <= 0.18:  # 0.18秒是最小步周期
                        continue

                # 计算突出度（prominence）
                left_min = min(sub_speeds[max(0, i - min_distance_samples):i])
                right_min = min(sub_speeds[i+1:i+min_distance_samples+1])
                prominence = sub_speeds[i] - max(left_min, right_min)

                # 检查是否满足突出度要求
                if prominence <= 0.1:
                    continue

                # 所有条件都满足，添加到峰值列表
                peaks.append(i)

        if len(peaks) >= 4:  # 至少4个峰
            stride_lengths = []
            stride_periods = []

            for k in range(len(peaks) - 1):
                p1 = peaks[k]
                p2 = peaks[k + 1]
                d_pos = abs(sub_pos[p2] - sub_pos[p1])
                d_time = sub_times[p2] - sub_times[p1]

                if 0.6 < d_pos < 2.4 and 0.18 < d_time < 1.3:  # 过滤范围
                    stride_lengths.append(d_pos)
                    stride_periods.append(d_time)

            if len(stride_lengths) >= 3:
                stride_length = sum(stride_lengths) / len(stride_lengths)
                stride_frequency = 1 / (sum(stride_periods) / len(stride_periods))
                note = '后半段速度峰值计算'

    # 第二优先：如果上面失败，不显示数值
    if stride_length is None:
        stride_length = None
        stride_frequency = None
        note = '峰值检测失败'

    return {
        'stride_length': round(stride_length, 2) if stride_length is not None else None,
        'stride_frequency': round(stride_frequency, 2) if stride_frequency is not None else None,
        'note': note
    }

def calculate_metrics(csv_data, train_info):
    """
    计算训练指标
    :param csv_data: CSV数据
    :param train_info: 训练信息
    :return: 计算后的指标字典
    """
    if not csv_data or len(csv_data) == 0:
        return None

    # 基本参数
    weight = 3.3  # 物体重量(kg)
    sampling_interval = 0.001  # 采样时间间隔(s)
    gravity = 9.81  # 重力加速度(m/s²)

    # 添加时间列
    data_with_time = []
    for index, row in enumerate(csv_data):
        data_with_time.append({
            **row,
            'time': index * sampling_interval
        })

    # 应用低通滤波器处理速度数据
    speed_data = [row['speed'] for row in data_with_time]
    filtered_speed = apply_low_pass_filter(speed_data, sampling_interval)

    data_with_filtered_speed = []
    for index, row in enumerate(data_with_time):
        data_with_filtered_speed.append({
            **row,
            'speed_filtered': filtered_speed[index] if index < len(filtered_speed) else 0
        })

    # 计算加速度（使用滤波后的速度数据）
    data_with_acceleration = []
    for index, row in enumerate(data_with_filtered_speed):
        acceleration = 0

        if index == 0:
            # 前向差分（第一个点）
            dt = data_with_filtered_speed[1]['time'] - data_with_filtered_speed[0]['time']
            acceleration = (data_with_filtered_speed[1]['speed_filtered'] - data_with_filtered_speed[0]['speed_filtered']) / dt
        elif index == len(data_with_filtered_speed) - 1:
            # 后向差分（最后一个点）
            dt = data_with_filtered_speed[index]['time'] - data_with_filtered_speed[index - 1]['time']
            acceleration = (data_with_filtered_speed[index]['speed_filtered'] - data_with_filtered_speed[index - 1]['speed_filtered']) / dt
        else:
            # 中心差分（简化版，使用平均dt以提高速度）
            dt_forward = data_with_filtered_speed[index + 1]['time'] - data_with_filtered_speed[index]['time']
            dt_backward = data_with_filtered_speed[index]['time'] - data_with_filtered_speed[index - 1]['time']
            acceleration = ((data_with_filtered_speed[index + 1]['speed_filtered'] - data_with_filtered_speed[index]['speed_filtered']) / dt_forward +
                            (data_with_filtered_speed[index]['speed_filtered'] - data_with_filtered_speed[index - 1]['speed_filtered']) / dt_backward) / 2

        data_with_acceleration.append({
            **row,
            'acceleration': acceleration
        })

    # 计算实际作用力和功率
    data_with_power = []
    for row in data_with_acceleration:
        end_force_value = train_info.get('end_force', 0)
        actual_force = end_force_value + 0.34 * (row.get('acceleration', 0))
        force_newton = actual_force * gravity
        power = force_newton * row.get('speed', 0)

        data_with_power.append({
            **row,
            'actual_force': actual_force,
            'force_newton': force_newton,
            'power': power
        })

    # 计算各项指标
    if not data_with_power or len(data_with_power) == 0:
        return None

    training_distance = data_with_power[-1]['pos'] - data_with_power[0]['pos']
    total_time = data_with_power[-1]['time'] - data_with_power[0]['time']
    start_force = data_with_power[0].get('Force', 0)
    end_force = train_info.get('end_force', 0)
    peak_speed = max(row['speed'] for row in data_with_power)

    # 峰值加速度（使用99.5%分位数）
    acc = [row['acceleration'] for row in data_with_power]
    percentile_index = int(len(acc) * 0.995)
    sorted_acc = sorted(acc)
    peak_acceleration = sorted_acc[percentile_index]

    # 峰值力量计算
    peak_force = train_info.get('end_force', 0) + 0.34 * peak_acceleration

    # 峰值功率（使用99.5%分位数）
    power_data = [row['power'] for row in data_with_power]
    power_percentile_index = int(len(power_data) * 0.995)
    sorted_power = sorted(power_data)
    peak_power = sorted_power[power_percentile_index]

    # 计算平均步长和步频
    stride_result = calculate_stride_and_frequency(data_with_power, sampling_interval)
    avg_stride_length = stride_result['stride_length']
    avg_stride_frequency = stride_result['stride_frequency']

    # 计算分段数据
    segment_5m_data = calculate_segment_data(data_with_power, 5)
    segment_10m_data = calculate_segment_data(data_with_power, 10)

    # 提取前5米、10米、15米、20米、25米、30米的用时
    time_5m = None
    time_10m = None
    time_15m = None
    time_20m = None
    time_25m = None
    time_30m = None

    # 从5米分段数据中提取累计时间
    if segment_5m_data and len(segment_5m_data) >= 1:
        time_5m = segment_5m_data[0]['cumulative_time']
    if segment_5m_data and len(segment_5m_data) >= 2:
        time_10m = segment_5m_data[1]['cumulative_time']
    if segment_5m_data and len(segment_5m_data) >= 3:
        time_15m = segment_5m_data[2]['cumulative_time']
    if segment_5m_data and len(segment_5m_data) >= 4:
        time_20m = segment_5m_data[3]['cumulative_time']
    if segment_5m_data and len(segment_5m_data) >= 5:
        time_25m = segment_5m_data[4]['cumulative_time']
    if segment_5m_data and len(segment_5m_data) >= 6:
        time_30m = segment_5m_data[5]['cumulative_time']

    return {
        'weight': weight,
        'sampling_interval': sampling_interval,
        'training_distance': round(training_distance, 2),
        'change_distance': round(training_distance * 0.4, 2),
        'total_time': round(total_time, 2),
        'start_force': round(start_force, 2),
        'end_force': round(end_force, 2),
        'peak_speed': round(peak_speed, 2),
        'peak_acceleration': round(peak_acceleration, 2),
        'peak_force': round(peak_force, 2),
        'peak_power': round(peak_power, 2),
        'avg_stride_length': round(avg_stride_length, 2) if avg_stride_length is not None else None,
        'avg_stride_frequency': round(avg_stride_frequency, 2) if avg_stride_frequency is not None else None,
        'time_5m': round(time_5m, 4) if time_5m is not None else None,
        'time_10m': round(time_10m, 4) if time_10m is not None else None,
        'time_15m': round(time_15m, 4) if time_15m is not None else None,
        'time_20m': round(time_20m, 4) if time_20m is not None else None,
        'time_25m': round(time_25m, 4) if time_25m is not None else None,
        'time_30m': round(time_30m, 4) if time_30m is not None else None,
        'segment_5m_data': segment_5m_data,
        'segment_10m_data': segment_10m_data
    }

def read_csv_file(file_path):
    """
    读取CSV文件
    :param file_path: CSV文件路径
    :return: 解析后的数据列表
    """
    print(f"正在读取CSV文件: {file_path}")
    data = []
    with open(file_path, 'r', encoding='utf-8') as file:
        csv_reader = csv.reader(file)
        next(csv_reader)  # 跳过标题行

        for row in csv_reader:
            # 跳过空行
            if not row or len(row) < 5:
                continue

            try:
                data.append({
                    'cnt': int(row[0]) if row[0] else 0,
                    'pos': float(row[1]) if row[1] else 0,
                    'speed': float(row[2]) if row[2] else 0,
                    'Dir': int(row[3]) if row[3] else 0,
                    'Force': float(row[4]) if row[4] else 0
                })
            except (ValueError, IndexError) as e:
                print(f"解析行时出错: {row}, 错误: {e}")
                continue

    return data

def save_csv_file(source_path, train_id, begin_time):
    """
    保存CSV文件到指定位置
    :param source_path: 源文件路径
    :param train_id: 训练记录ID
    :param begin_time: 开始时间
    :return: 保存后的文件路径（相对路径）
    """
    # 根据开始时间生成日期文件夹和时间文件名
    date_folder = begin_time.strftime('%Y-%m-%d')
    time_filename = begin_time.strftime('%H-%M-%S') + '.csv'

    # 构建相对路径
    relative_path = f'./log/{date_folder}/{time_filename}'

    # 规范化CSV存储路径，确保使用正确的路径分隔符
    storage_path = os.path.normpath(CSV_STORAGE_PATH)

    # 构建绝对路径
    absolute_path = os.path.join(storage_path, 'log', date_folder)

    # 确保目录存在
    if not os.path.exists(absolute_path):
        os.makedirs(absolute_path)

    # 完整的目标文件路径
    destination_path = os.path.join(absolute_path, time_filename)

    # 规范化路径
    destination_path = os.path.normpath(destination_path)

    print(f"准备保存CSV文件到: {destination_path}")

    # 复制文件
    shutil.copy(source_path, destination_path)

    print(f"CSV文件已成功保存到: {destination_path}")

    return relative_path

def insert_train_record(train_data, calculated_metrics):
    """
    插入训练记录到MySQL数据库
    :param train_data: 训练数据
    :param calculated_metrics: 计算后的指标
    :return: 插入的记录ID
    """
    connection = None
    cursor = None

    try:
        # 连接数据库
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor()

        # 准备SQL语句
        sql = """
        INSERT INTO train_record (
            uid, type, part, start_force, end_force, train_dis, change_dis, safe_dis,
            max_speed, total_time, peak_time, peak_pos, peak_speed, result,
            begin_time, end_time, log,
            time_5m, time_10m, time_15m, time_20m, time_25m, time_30m,
            peak_acceleration, peak_force, peak_power,
            avg_step_length, avg_step_frequency
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s
        )
        """

        # 准备数据
        values = (
            train_data['uid'],
            train_data['type'],
            train_data['part'],
            train_data['start_force'],
            train_data['end_force'],
            train_data['train_dis'],
            train_data['change_dis'],
            train_data['safe_dis'],
            train_data['max_speed'],
            train_data['total_time'],
            train_data['peak_time'],
            train_data['peak_pos'],
            train_data['peak_speed'],
            train_data['result'],
            train_data['begin_time'],
            train_data['end_time'],
            train_data['log'],
            calculated_metrics['time_5m'],
            calculated_metrics['time_10m'],
            calculated_metrics['time_15m'],
            calculated_metrics['time_20m'],
            calculated_metrics['time_25m'],
            calculated_metrics['time_30m'],
            calculated_metrics['peak_acceleration'],
            calculated_metrics['peak_force'],
            calculated_metrics['peak_power'],
            calculated_metrics['avg_stride_length'],
            calculated_metrics['avg_stride_frequency']
        )

        # 执行SQL
        cursor.execute(sql, values)
        connection.commit()

        # 获取插入的记录ID
        record_id = cursor.lastrowid
        print(f"成功插入训练记录，ID: {record_id}")

        return record_id

    except Error as e:
        print(f"数据库错误: {e}")
        if connection:
            connection.rollback()
        return None

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

def import_train_record(csv_file_path, train_data):
    """
    导入训练记录
    :param csv_file_path: CSV文件路径
    :param train_data: 训练数据
    :return: 插入的记录ID
    """
    try:
        # 读取CSV文件
        csv_data = read_csv_file(csv_file_path)
        print(f"读取到 {len(csv_data) if csv_data else 0} 行数据")
        if not csv_data:
            print("CSV文件为空或格式不正确")
            return None

        # 计算指标
        calculated_metrics = calculate_metrics(csv_data, train_data)
        if not calculated_metrics:
            print("计算指标失败")
            return None
        print(f"计算指标成功: {calculated_metrics}")

        # 保存CSV文件
        saved_csv_path = save_csv_file(csv_file_path, train_data.get('id', 0), train_data.get('begin_time'))
        print(f"CSV文件已保存到: {saved_csv_path}")

        # 更新训练数据中的log字段
        train_data['log'] = saved_csv_path

        # 插入训练记录
        record_id = insert_train_record(train_data, calculated_metrics)

        return record_id

    except Exception as e:
        print(f"导入训练记录时发生错误: {e}")
        return None

if __name__ == "__main__":
    # 示例使用
    csv_file_path = "example.csv"  # 替换为实际的CSV文件路径

    # 训练数据
    train_data = {
        'uid': 1,  # 用户ID
        'type': 1,  # 训练类型
        'part': 1,  # 部位
        'start_force': 10.5,  # 起始阻力
        'end_force': 15.2,  # 结束阻力
        'train_dis': 30.0,  # 训练距离
        'change_dis': 12.0,  # 变阻距离
        'safe_dis': 35.0,  # 安全距离
        'max_speed': 8.5,  # 最大速度
        'total_time': 5.2,  # 总时间
        'peak_time': 2.3,  # 峰值时间
        'peak_pos': 15.5,  # 峰值位置
        'peak_speed': 8.5,  # 峰值速度
        'result': 1,  # 结果
        'begin_time': datetime.now(),  # 开始时间
        'end_time': datetime.now(),  # 结束时间
        'log': ''  # 日志文件路径（稍后填充）
    }

    # 导入训练记录
    record_id = import_train_record(csv_file_path, train_data)
    if record_id:
        print(f"训练记录导入成功，记录ID: {record_id}")
    else:
        print("训练记录导入失败")
