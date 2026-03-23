import requests
import os

# 配置本地测试地址
URL = "http://localhost:4000/api/trains/upload"
LOGIN_URL = "http://localhost:4000/api/login"

def test_jwt_auth():
    print("=== 开始 JWT 鉴权有效性测试 ===")
    
    # 1. 模拟无 Token 上传
    print("\n[测试 1] 尝试无 Token 上传...")
    try:
        res = requests.post(URL, data={"uid": 1}, timeout=5)
        print(f"结果: 状态码 {res.status_code}, 响应: {res.json()}")
        if res.status_code == 401:
            print("✅ 成功拦截：无 Token 请求被拒绝。")
        else:
            print("❌ 失败：无 Token 请求被允许入库。")
    except Exception as e:
        print(f"请求出错: {e}")

    # 2. 模拟 错误 Token 上传
    print("\n[测试 2] 尝试错误 Token 上传...")
    try:
        headers = {"Authorization": "Bearer some-fake-token"}
        res = requests.post(URL, data={"uid": 1}, headers=headers, timeout=5)
        print(f"结果: 状态码 {res.status_code}, 响应: {res.json()}")
        if res.status_code == 401:
            print("✅ 成功拦截：错误 Token 请求被拒绝。")
        else:
            print("❌ 失败：错误 Token 请求未被拦截。")
    except Exception as e:
        print(f"请求出错: {e}")

    # 3. 模拟 正确登录后上传
    print("\n[测试 3] 尝试正确登录并获取 Token 上传...")
    try:
        # 先登录
        login_res = requests.post(LOGIN_URL, json={"username": "admin", "password": "123456"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            print(f"登录成功，获取到 Token")
            
            # 带 Token 上传
            headers = {"Authorization": f"Bearer {token}"}
            # 这里由于没传文件，会被 multer 或 后续逻辑校验挡住，但只要过了 JWT 拦截器即代表有效
            res = requests.post(URL, data={"uid": 1, "type": 1, "begin_time": "2026-03-23 09:00:00"}, headers=headers, timeout=5)
            print(f"结果: 状态码 {res.status_code}, 响应: {res.json()}")
            
            if res.status_code != 401:
                print("✅ 验证通过：合法 Token 已通过 JWT 拦截层。")
            else:
                print("❌ 失败：合法 Token 被 JWT 拦截层拒绝。")
        else:
            print(f"登录预测试失败，请检查后端运行状态。")
    except Exception as e:
        print(f"请求出错: {e}")

if __name__ == "__main__":
    test_jwt_auth()
