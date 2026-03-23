import csv
import os
import requests
from datetime import datetime
import numpy as np

# ====== 配置信息 ======
# 云服务器的 API 地址（请替换为您真实的服务器 IP 或域名）
SERVER_URL = "http://39.103.69.142:90/api/trains/upload"

# 设备的 CSV 文件路径
FILE_PATH = "test.csv"

# 模拟的训练记录基础信息
TRAIN_DATA = {
    'uid': 101,               # 绑定的用户 ID
    'type': 1,              # 训练类型 (1:抗阻, 2:牵引, 3:折返)
    'part': 1,              # 训练部位
    'start_force': 10.5,    # 起始阻力 (kg)
    'end_force': 15.2,      # 结束阻力 (kg)
    'train_dis': 30.0,      # 训练距离 (m)
    'change_dis': 12.0,     # 变阻距离 (m)
    'safe_dis': 35.0,       # 安全距离 (m)
    'max_speed': 8.5,       # 最大速度
    'total_time': 5.2,      # 总耗时
    'peak_time': 2.3,       # 达峰时间
    'peak_pos': 15.5,       # 峰值位置
    'peak_speed': 8.5,      # 峰值速度
    'result': 1,
    'begin_time': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    'end_time': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
}

# ====== 特征算法 (模拟边缘设备的本地计算) ======
def apply_low_pass_filter(data, dt, cutoff_freq=10.0):
    if not data or len(data) == 0: return []
    fs = 1.0 / dt
    RC = 1.0 / (2 * np.pi * cutoff_freq)
    alpha = dt / (RC + dt)
    filtered = [data[0]]
    for i in range(1, len(data)):
        filtered.append(alpha * data[i] + (1 - alpha) * filtered[i-1])
    return filtered

def calculate_metrics(csv_data, train_info):
    if not csv_data or len(csv_data) == 0: return {}
    weight = 3.3
    sampling_interval = 0.001
    gravity = 9.81
    
    data_with_time = [{**row, 'time': i * sampling_interval} for i, row in enumerate(csv_data)]
    
    # 滤波和速度
    speed_data = [row['speed'] for row in data_with_time]
    filtered_speed = apply_low_pass_filter(speed_data, sampling_interval)
    for i, row in enumerate(data_with_time):
        row['speed_filtered'] = filtered_speed[i] if i < len(filtered_speed) else 0

    # 加速度与功率
    for i, row in enumerate(data_with_time):
        if i == 0:
            dt = data_with_time[1]['time'] - data_with_time[0]['time']
            acc = (data_with_time[1]['speed_filtered'] - data_with_time[0]['speed_filtered']) / dt
        elif i == len(data_with_time) - 1:
            dt = data_with_time[i]['time'] - data_with_time[i - 1]['time']
            acc = (data_with_time[i]['speed_filtered'] - data_with_time[i - 1]['speed_filtered']) / dt
        else:
            dt_f = data_with_time[i + 1]['time'] - data_with_time[i]['time']
            dt_b = data_with_time[i]['time'] - data_with_time[i - 1]['time']
            acc = ((data_with_time[i + 1]['speed_filtered'] - data_with_time[i]['speed_filtered']) / dt_f +
                   (data_with_time[i]['speed_filtered'] - data_with_time[i - 1]['speed_filtered']) / dt_b) / 2
        
        row['acceleration'] = acc
        actual_force = train_info.get('end_force', 0) + 0.34 * acc
        row['power'] = actual_force * gravity * row.get('speed', 0)

    # 取 99.5% 峰值
    accs = sorted([r['acceleration'] for r in data_with_time])
    powers = sorted([r['power'] for r in data_with_time])
    peak_acc = accs[int(len(accs) * 0.995)]
    peak_power = powers[int(len(powers) * 0.995)]
    peak_force = train_info.get('end_force', 0) + 0.34 * peak_acc

    # ====== 新增: 计算 5米、10米 等分段数据的指标 ======
    time_points = {'time_5m': None, 'time_10m': None, 'time_15m': None, 
                   'time_20m': None, 'time_25m': None, 'time_30m': None}
    
    segments = [5, 10, 15, 20, 25, 30]
    for seg in segments:
        # 在数据中寻找超过目标段位 (例如5米) 的第一个点
        for row in data_with_time:
            if row['pos'] >= seg:
                time_points[f'time_{seg}m'] = round(row['time'], 4)
                break

    return {
        'peak_acceleration': round(peak_acc, 2),
        'peak_force': round(peak_force, 2),
        'peak_power': round(peak_power, 2),
        **time_points
    }

def read_csv(path):
    data = []
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            if not row or len(row) < 5: continue
            data.append({
                'speed': float(row[2]) if row[2] else 0,
                'pos': float(row[1]) if row[1] else 0
            })
    return data

# ====== 主上传逻辑 ======
def get_auth_token():
    login_url = SERVER_URL.replace("/trains/upload", "/login")
    print(f"[*] 正在尝试登录获取 Token: {login_url}")
    # 填入您在 server/.env 中设置的 ADMIN_USER 和 ADMIN_PASS（默认 admin/123456）
    payload = {"username": "admin", "password": "123456"}
    try:
        res = requests.post(login_url, json=payload, timeout=10)
        if res.status_code == 200:
            token = res.json().get("token")
            if token:
                print("[*] 登录成功，拦截到有效 Token！")
                return token
        print(f"❌ 登录认证失败，请检查账号密码配置: {res.status_code} {res.text}")
    except Exception as e:
        print(f"❌ 网络请求登录失败: {e}")
    return None

def upload_record():
    if not os.path.exists(FILE_PATH):
        print(f"错误: 找不到文件 {FILE_PATH}。请检查路径。")
        return

    # 1. 登录取 Token
    token = get_auth_token()
    if not token:
        print("未获取到授权凭证，中断上传。")
        return
    headers = {"Authorization": f"Bearer {token}"}

    # 2. 边缘计算模拟（先读取CSV，算出特征，再带着结果一起发送给后端）
    print("1. 正在读取并分析 CSV 特征数据...")
    csv_data = read_csv(FILE_PATH)
    metrics = calculate_metrics(csv_data, TRAIN_DATA)
    
    # 将算好的数据并入上传 payload
    payload = {**TRAIN_DATA, **metrics}
    
    # ====== 调试代码：查看即将发送的 Payload 内容 ======
    print("\n[调试] 即将发送的业务参数清单:")
    for key, value in payload.items():
        print(f"  - {key}: {value} (类型: {type(value).__name__})")
    print("-" * 30 + "\n")

    # 3. 发起 Multipart HTTP POST 请求
    print("2. 正在向云服务器发送加密数据流...")

    try:
        with open(FILE_PATH, 'rb') as f:
            files = { 'file': (os.path.basename(FILE_PATH), f, 'text/csv') }
            response = requests.post(SERVER_URL, data=payload, files=files, headers=headers, timeout=30)
            
        # 4. 解析结果
        if response.status_code == 200:
            res_json = response.json()
            if res_json.get("success"):
                print("===========================")
                print("✅ 上传并入库成功！")
                print(f"云端记录 ID: {res_json.get('record_id')}")
                print(f"云端日志路径: {res_json.get('log_path')}")
                print("===========================")
            else:
                print(f"❌ 业务处理失败: {res_json}")
        elif response.status_code == 409:
            print(f"⚠️ {response.json().get('message')}")
        else:
            print(f"❌ 网络异常报错: HTTP {response.status_code}\n{response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ 连接服务器失败: {e}")

if __name__ == "__main__":
    print(f"正在准备上传设备数据。目标服务器: {SERVER_URL}")
    upload_record()
