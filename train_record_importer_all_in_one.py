import csv
import os
import shutil
import numpy as np
import pandas as pd
from datetime import datetime
import mysql.connector
from mysql.connector import Error
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

# 数据库配置
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'pass2004',  # 请替换为实际密码
    'database': 'jy_data_test2'   # 请替换为实际数据库名
}

# CSV文件存储路径
CSV_STORAGE_PATH = os.path.dirname(os.path.abspath(__file__))  # run-platform目录，CSV文件将存储在log子目录下

def get_user_map():
    """
    从数据库获取用户ID和名称映射
    :return: 用户ID和名称的字典
    """
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor()

        # 查询用户表（假设表名为user，字段为id和name）
        cursor.execute("SELECT id, name FROM user")
        users = cursor.fetchall()

        user_map = {user[0]: user[1] for user in users}

        cursor.close()
        connection.close()

        return user_map
    except Exception as e:
        print(f"获取用户列表时发生错误: {e}")
        return {}

def get_train_type_map():
    """
    从数据库获取运动类型ID和名称映射
    :return: 运动类型ID和名称的字典
    """
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor()

        # 查询运动类型表（假设表名为train_type，字段为id和name）
        cursor.execute("SELECT id, name FROM train_type")
        train_types = cursor.fetchall()

        train_type_map = {train_type[0]: train_type[1] for train_type in train_types}

        cursor.close()
        connection.close()

        return train_type_map
    except Exception as e:
        print(f"获取运动类型列表时发生错误: {e}")
        return {}

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

    # 计算相对位置（从起点0开始）
    start_pos = data_with_power[0]['pos']
    for row in data_with_power:
        row['rel_pos'] = row['pos'] - start_pos

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

    # 计算分段数据（保留用于其他用途）
    segment_5m_data = calculate_segment_data(data_with_power, 5)
    segment_10m_data = calculate_segment_data(data_with_power, 10)

    # === 使用精确查找法计算前XX米用时 ===
    target_distances = [5, 10, 15, 20, 25, 30, 50, 60, 100]
    times_to_distance = {}

    # 起点时间
    start_time = data_with_power[0]['time']

    for d in target_distances:
        # 找到第一个达到或超过目标距离的点
        target_index = None
        for idx, row in enumerate(data_with_power):
            if row['rel_pos'] >= d:
                target_index = idx
                break

        if target_index is not None:
            # 计算累计时间
            time_to_distance = data_with_power[target_index]['time'] - start_time
            times_to_distance[d] = time_to_distance
        else:
            times_to_distance[d] = None

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
        'time_5m': round(times_to_distance[5], 4) if times_to_distance[5] is not None else None,
        'time_10m': round(times_to_distance[10], 4) if times_to_distance[10] is not None else None,
        'time_15m': round(times_to_distance[15], 4) if times_to_distance[15] is not None else None,
        'time_20m': round(times_to_distance[20], 4) if times_to_distance[20] is not None else None,
        'time_25m': round(times_to_distance[25], 4) if times_to_distance[25] is not None else None,
        'time_30m': round(times_to_distance[30], 4) if times_to_distance[30] is not None else None,
        'time_50m': round(times_to_distance[50], 4) if times_to_distance[50] is not None else None,
        'time_60m': round(times_to_distance[60], 4) if times_to_distance[60] is not None else None,
        'time_100m': round(times_to_distance[100], 4) if times_to_distance[100] is not None else None,
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
            time_5m, time_10m, time_15m, time_20m, time_25m, time_30m, time_50m, time_60m, time_100m,
            peak_acceleration, peak_force, peak_power,
            avg_step_length, avg_step_frequency
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s,
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
            calculated_metrics['time_50m'],
            calculated_metrics['time_60m'],
            calculated_metrics['time_100m'],
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

class TrainRecordImporterGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("训练记录导入工具")
        self.root.geometry("800x700")

        # 从数据库加载用户和运动类型映射
        self.user_map = get_user_map()
        self.train_type_map = get_train_type_map()

        # 创建主框架
        self.main_frame = ttk.Frame(root, padding="10")
        self.main_frame.pack(fill=tk.BOTH, expand=True)

        # 创建滚动区域
        self.canvas = tk.Canvas(self.main_frame)
        self.scrollbar = ttk.Scrollbar(self.main_frame, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = ttk.Frame(self.canvas)

        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )

        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)

        self.canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")

        # 数据库配置区域
        self.create_db_config_section()

        # CSV文件选择区域
        self.create_csv_section()

        # 训练数据输入区域
        self.create_train_data_section()

        # 按钮区域
        self.create_button_section()

        # 状态栏
        self.status_var = tk.StringVar()
        self.status_var.set("就绪")
        self.status_bar = ttk.Label(self.main_frame, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W)
        self.status_bar.pack(side=tk.BOTTOM, fill=tk.X)

    def create_db_config_section(self):
        """创建数据库配置区域"""
        db_frame = ttk.LabelFrame(self.scrollable_frame, text="数据库配置", padding="10")
        db_frame.pack(fill=tk.X, pady=5)

        # 主机
        ttk.Label(db_frame, text="主机:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=5)
        self.host_entry = ttk.Entry(db_frame, width=30)
        self.host_entry.insert(0, DB_CONFIG.get('host', 'localhost'))
        self.host_entry.grid(row=0, column=1, padx=5, pady=5)

        # 用户名
        ttk.Label(db_frame, text="用户名:").grid(row=0, column=2, sticky=tk.W, padx=5, pady=5)
        self.user_entry = ttk.Entry(db_frame, width=30)
        self.user_entry.insert(0, DB_CONFIG.get('user', 'root'))
        self.user_entry.grid(row=0, column=3, padx=5, pady=5)

        # 密码
        ttk.Label(db_frame, text="密码:").grid(row=1, column=0, sticky=tk.W, padx=5, pady=5)
        self.password_entry = ttk.Entry(db_frame, width=30, show="*")
        self.password_entry.insert(0, DB_CONFIG.get('password', ''))
        self.password_entry.grid(row=1, column=1, padx=5, pady=5)

        # 数据库名
        ttk.Label(db_frame, text="数据库:").grid(row=1, column=2, sticky=tk.W, padx=5, pady=5)
        self.database_entry = ttk.Entry(db_frame, width=30)
        self.database_entry.insert(0, DB_CONFIG.get('database', ''))
        self.database_entry.grid(row=1, column=3, padx=5, pady=5)

    def create_csv_section(self):
        """创建CSV文件选择区域"""
        csv_frame = ttk.LabelFrame(self.scrollable_frame, text="CSV文件", padding="10")
        csv_frame.pack(fill=tk.X, pady=5)

        # CSV文件路径
        ttk.Label(csv_frame, text="CSV文件路径:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=5)
        self.csv_path_entry = ttk.Entry(csv_frame, width=50)
        self.csv_path_entry.grid(row=0, column=1, padx=5, pady=5)

        # 浏览按钮
        browse_button = ttk.Button(csv_frame, text="浏览...", command=self.browse_csv_file)
        browse_button.grid(row=0, column=2, padx=5, pady=5)

    def create_train_data_section(self):
        """创建训练数据输入区域"""
        train_frame = ttk.LabelFrame(self.scrollable_frame, text="训练数据", padding="10")
        train_frame.pack(fill=tk.X, pady=5)

        # 用户ID
        ttk.Label(train_frame, text="用户ID:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=5)
        self.uid_entry = ttk.Entry(train_frame, width=15)
        self.uid_entry.insert(0, "1")
        self.uid_entry.grid(row=0, column=1, padx=5, pady=5)
        self.uid_entry.bind('<KeyRelease>', self.update_user_name)

        # 用户名称显示
        default_user_name = self.user_map.get(1, '未知用户') if self.user_map else '未知用户'
        self.user_name_label = ttk.Label(train_frame, text=f"({default_user_name})", foreground="blue")
        self.user_name_label.grid(row=0, column=2, sticky=tk.W, padx=5, pady=5)

        # 训练类型
        ttk.Label(train_frame, text="训练类型:").grid(row=0, column=3, sticky=tk.W, padx=5, pady=5)
        self.type_entry = ttk.Entry(train_frame, width=15)
        self.type_entry.insert(0, "1")
        self.type_entry.grid(row=0, column=4, padx=5, pady=5)
        self.type_entry.bind('<KeyRelease>', self.update_train_type)

        # 训练类型显示
        default_type_name = self.train_type_map.get(1, '未知类型') if self.train_type_map else '未知类型'
        self.train_type_label = ttk.Label(train_frame, text=f"({default_type_name})", foreground="blue")
        self.train_type_label.grid(row=0, column=5, sticky=tk.W, padx=5, pady=5)

        # 部位
        ttk.Label(train_frame, text="部位:").grid(row=1, column=0, sticky=tk.W, padx=5, pady=5)
        self.part_entry = ttk.Entry(train_frame, width=15)
        self.part_entry.insert(0, "1")
        self.part_entry.grid(row=1, column=1, padx=5, pady=5)

        # 起始阻力
        ttk.Label(train_frame, text="起始阻力(kg):").grid(row=1, column=2, sticky=tk.W, padx=5, pady=5)
        self.start_force_entry = ttk.Entry(train_frame, width=15)
        self.start_force_entry.insert(0, "10.5")
        self.start_force_entry.grid(row=1, column=3, padx=5, pady=5)

        # 结束阻力
        ttk.Label(train_frame, text="结束阻力(kg):").grid(row=1, column=4, sticky=tk.W, padx=5, pady=5)
        self.end_force_entry = ttk.Entry(train_frame, width=15)
        self.end_force_entry.insert(0, "15.2")
        self.end_force_entry.grid(row=1, column=5, padx=5, pady=5)

        # 训练距离
        ttk.Label(train_frame, text="训练距离(m):").grid(row=2, column=0, sticky=tk.W, padx=5, pady=5)
        self.train_dis_entry = ttk.Entry(train_frame, width=15)
        self.train_dis_entry.insert(0, "30.0")
        self.train_dis_entry.grid(row=2, column=1, padx=5, pady=5)

        # 变阻距离
        ttk.Label(train_frame, text="变阻距离(m):").grid(row=2, column=2, sticky=tk.W, padx=5, pady=5)
        self.change_dis_entry = ttk.Entry(train_frame, width=15)
        self.change_dis_entry.insert(0, "12.0")
        self.change_dis_entry.grid(row=2, column=3, padx=5, pady=5)

        # 安全距离
        ttk.Label(train_frame, text="安全距离(m):").grid(row=2, column=4, sticky=tk.W, padx=5, pady=5)
        self.safe_dis_entry = ttk.Entry(train_frame, width=15)
        self.safe_dis_entry.insert(0, "35.0")
        self.safe_dis_entry.grid(row=2, column=5, padx=5, pady=5)

        # 最大速度
        ttk.Label(train_frame, text="最大速度(m/s):").grid(row=3, column=0, sticky=tk.W, padx=5, pady=5)
        self.max_speed_entry = ttk.Entry(train_frame, width=15)
        self.max_speed_entry.insert(0, "8.5")
        self.max_speed_entry.grid(row=3, column=1, padx=5, pady=5)

        # 总时间
        ttk.Label(train_frame, text="总时间(s):").grid(row=3, column=2, sticky=tk.W, padx=5, pady=5)
        self.total_time_entry = ttk.Entry(train_frame, width=15)
        self.total_time_entry.insert(0, "5.2")
        self.total_time_entry.grid(row=3, column=3, padx=5, pady=5)

        # 峰值时间
        ttk.Label(train_frame, text="峰值时间(s):").grid(row=3, column=4, sticky=tk.W, padx=5, pady=5)
        self.peak_time_entry = ttk.Entry(train_frame, width=15)
        self.peak_time_entry.insert(0, "2.3")
        self.peak_time_entry.grid(row=3, column=5, padx=5, pady=5)

        # 峰值位置
        ttk.Label(train_frame, text="峰值位置(m):").grid(row=4, column=0, sticky=tk.W, padx=5, pady=5)
        self.peak_pos_entry = ttk.Entry(train_frame, width=15)
        self.peak_pos_entry.insert(0, "15.5")
        self.peak_pos_entry.grid(row=4, column=1, padx=5, pady=5)

        # 峰值速度
        ttk.Label(train_frame, text="峰值速度(m/s):").grid(row=4, column=2, sticky=tk.W, padx=5, pady=5)
        self.peak_speed_entry = ttk.Entry(train_frame, width=15)
        self.peak_speed_entry.insert(0, "8.5")
        self.peak_speed_entry.grid(row=4, column=3, padx=5, pady=5)

        # 结果
        ttk.Label(train_frame, text="结果:").grid(row=4, column=4, sticky=tk.W, padx=5, pady=5)
        self.result_entry = ttk.Entry(train_frame, width=15)
        self.result_entry.insert(0, "1")
        self.result_entry.grid(row=4, column=5, padx=5, pady=5)

        # 开始时间
        ttk.Label(train_frame, text="开始时间:").grid(row=5, column=0, sticky=tk.W, padx=5, pady=5)
        self.begin_time_entry = ttk.Entry(train_frame, width=30)
        self.begin_time_entry.insert(0, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        self.begin_time_entry.grid(row=5, column=1, columnspan=2, padx=5, pady=5)

        # 结束时间
        ttk.Label(train_frame, text="结束时间:").grid(row=5, column=3, sticky=tk.W, padx=5, pady=5)
        self.end_time_entry = ttk.Entry(train_frame, width=30)
        self.end_time_entry.insert(0, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        self.end_time_entry.grid(row=5, column=4, columnspan=2, padx=5, pady=5)

    def create_button_section(self):
        """创建按钮区域"""
        button_frame = ttk.Frame(self.scrollable_frame, padding="10")
        button_frame.pack(fill=tk.X, pady=10)

        # 导入按钮
        import_button = ttk.Button(button_frame, text="导入训练记录", command=self.import_record)
        import_button.pack(side=tk.LEFT, padx=5)

        # 重置按钮
        reset_button = ttk.Button(button_frame, text="重置", command=self.reset_form)
        reset_button.pack(side=tk.LEFT, padx=5)

        # 退出按钮
        exit_button = ttk.Button(button_frame, text="退出", command=self.root.quit)
        exit_button.pack(side=tk.LEFT, padx=5)

    def browse_csv_file(self):
        """浏览CSV文件"""
        file_path = filedialog.askopenfilename(
            title="选择CSV文件",
            filetypes=[("CSV文件", "*.csv"), ("所有文件", "*.*")]
        )
        if file_path:
            self.csv_path_entry.delete(0, tk.END)
            self.csv_path_entry.insert(0, file_path)

    def update_user_name(self, event):
        """更新用户名称显示"""
        try:
            uid = int(self.uid_entry.get())
            user_name = self.user_map.get(uid, '未知用户') if self.user_map else '未知用户'
            self.user_name_label.config(text=f"({user_name})")
        except ValueError:
            self.user_name_label.config(text="(无效ID)")

    def update_train_type(self, event):
        """更新训练类型显示"""
        try:
            train_type = int(self.type_entry.get())
            type_name = self.train_type_map.get(train_type, '未知类型') if self.train_type_map else '未知类型'
            self.train_type_label.config(text=f"({type_name})")
        except ValueError:
            self.train_type_label.config(text="(无效类型)")

    def get_train_data(self):
        """获取训练数据"""
        try:
            train_data = {
                'uid': int(self.uid_entry.get()),
                'type': int(self.type_entry.get()),
                'part': int(self.part_entry.get()),
                'start_force': float(self.start_force_entry.get()),
                'end_force': float(self.end_force_entry.get()),
                'train_dis': float(self.train_dis_entry.get()),
                'change_dis': float(self.change_dis_entry.get()),
                'safe_dis': float(self.safe_dis_entry.get()),
                'max_speed': float(self.max_speed_entry.get()),
                'total_time': float(self.total_time_entry.get()),
                'peak_time': float(self.peak_time_entry.get()),
                'peak_pos': float(self.peak_pos_entry.get()),
                'peak_speed': float(self.peak_speed_entry.get()),
                'result': int(self.result_entry.get()),
                'begin_time': datetime.strptime(self.begin_time_entry.get(), "%Y-%m-%d %H:%M:%S"),
                'end_time': datetime.strptime(self.end_time_entry.get(), "%Y-%m-%d %H:%M:%S"),
                'log': ''
            }
            return train_data
        except ValueError as e:
            messagebox.showerror("输入错误", f"请检查输入的数据格式: {e}")
            return None

    def update_db_config(self):
        """更新数据库配置"""
        DB_CONFIG['host'] = self.host_entry.get()
        DB_CONFIG['user'] = self.user_entry.get()
        DB_CONFIG['password'] = self.password_entry.get()
        DB_CONFIG['database'] = self.database_entry.get()

    def import_record(self):
        """导入训练记录"""
        # 更新数据库配置
        self.update_db_config()

        # 获取CSV文件路径
        csv_file_path = self.csv_path_entry.get()
        if not csv_file_path:
            messagebox.showerror("错误", "请选择CSV文件")
            return

        # 检查文件是否存在
        if not os.path.exists(csv_file_path):
            messagebox.showerror("错误", f"文件不存在: {csv_file_path}")
            return

        # 获取训练数据
        train_data = self.get_train_data()
        if not train_data:
            return

        # 更新状态栏
        self.status_var.set("正在导入训练记录...")
        self.root.update()

        try:
            # 导入训练记录
            record_id = import_train_record(csv_file_path, train_data)

            if record_id:
                messagebox.showinfo("成功", f"训练记录导入成功，记录ID: {record_id}")
                self.status_var.set(f"训练记录导入成功，记录ID: {record_id}")
            else:
                messagebox.showerror("错误", "训练记录导入失败")
                self.status_var.set("训练记录导入失败")
        except Exception as e:
            messagebox.showerror("错误", f"导入训练记录时发生错误: {e}")
            self.status_var.set(f"导入失败: {e}")

    def reset_form(self):
        """重置表单"""
        # 重置训练数据
        self.uid_entry.delete(0, tk.END)
        self.uid_entry.insert(0, "1")
        default_user_name = self.user_map.get(1, '未知用户') if self.user_map else '未知用户'
        self.user_name_label.config(text=f"({default_user_name})")

        self.type_entry.delete(0, tk.END)
        self.type_entry.insert(0, "1")
        default_type_name = self.train_type_map.get(1, '未知类型') if self.train_type_map else '未知类型'
        self.train_type_label.config(text=f"({default_type_name})")

        self.part_entry.delete(0, tk.END)
        self.part_entry.insert(0, "1")

        self.start_force_entry.delete(0, tk.END)
        self.start_force_entry.insert(0, "10.5")

        self.end_force_entry.delete(0, tk.END)
        self.end_force_entry.insert(0, "15.2")

        self.train_dis_entry.delete(0, tk.END)
        self.train_dis_entry.insert(0, "30.0")

        self.change_dis_entry.delete(0, tk.END)
        self.change_dis_entry.insert(0, "12.0")

        self.safe_dis_entry.delete(0, tk.END)
        self.safe_dis_entry.insert(0, "35.0")

        self.max_speed_entry.delete(0, tk.END)
        self.max_speed_entry.insert(0, "8.5")

        self.total_time_entry.delete(0, tk.END)
        self.total_time_entry.insert(0, "5.2")

        self.peak_time_entry.delete(0, tk.END)
        self.peak_time_entry.insert(0, "2.3")

        self.peak_pos_entry.delete(0, tk.END)
        self.peak_pos_entry.insert(0, "15.5")

        self.peak_speed_entry.delete(0, tk.END)
        self.peak_speed_entry.insert(0, "8.5")

        self.result_entry.delete(0, tk.END)
        self.result_entry.insert(0, "1")

        self.begin_time_entry.delete(0, tk.END)
        self.begin_time_entry.insert(0, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

        self.end_time_entry.delete(0, tk.END)
        self.end_time_entry.insert(0, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

        # 重置CSV文件路径
        self.csv_path_entry.delete(0, tk.END)

        # 更新状态栏
        self.status_var.set("表单已重置")

def main():
    root = tk.Tk()
    app = TrainRecordImporterGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
