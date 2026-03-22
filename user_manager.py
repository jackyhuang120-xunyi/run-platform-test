import tkinter as tk
from tkinter import ttk, messagebox
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

def get_required_fields(table_name='user'):
    """
    查询表中哪些字段是必填的
    :param table_name: 表名
    :return: 必填字段列表
    """
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor()

        # 查询表结构
        cursor.execute(f"DESCRIBE {table_name}")
        columns = cursor.fetchall()

        # 获取不允许NULL的字段（必填字段）
        required_fields = []
        for column in columns:
            field_name = column[0]
            is_nullable = column[2]  # Null列
            if is_nullable == 'NO':
                required_fields.append(field_name)

        cursor.close()
        connection.close()

        return required_fields
    except Exception as e:
        print(f"查询必填字段时发生错误: {e}")
        return []

class UserManagerGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("用户管理")
        self.root.geometry("800x700")

        # 查询必填字段
        self.required_fields = get_required_fields('user')

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

        # 用户信息输入区域
        self.create_user_info_section()

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

    def create_user_info_section(self):
        """创建用户信息输入区域"""
        user_frame = ttk.LabelFrame(self.scrollable_frame, text="用户信息", padding="10")
        user_frame.pack(fill=tk.X, pady=5)

        # 字段说明
        info_frame = ttk.Frame(user_frame)
        info_frame.grid(row=0, column=0, columnspan=4, sticky=tk.W, padx=5, pady=5)
        ttk.Label(info_frame, text="* 表示必填字段", foreground="red").pack(side=tk.LEFT)
        ttk.Label(info_frame, text="  |  ", foreground="gray").pack(side=tk.LEFT)
        ttk.Label(info_frame, text="其他字段为可选", foreground="gray").pack(side=tk.LEFT)

        # 姓名
        name_label = "姓名*:" if 'name' in self.required_fields else "姓名:"
        ttk.Label(user_frame, text=name_label, foreground="red" if 'name' in self.required_fields else "black").grid(row=1, column=0, sticky=tk.W, padx=5, pady=5)
        self.name_entry = ttk.Entry(user_frame, width=30)
        self.name_entry.grid(row=1, column=1, padx=5, pady=5)

        # 性别
        gender_label = "性别*:" if 'gender' in self.required_fields else "性别:"
        ttk.Label(user_frame, text=gender_label, foreground="red" if 'gender' in self.required_fields else "black").grid(row=1, column=2, sticky=tk.W, padx=5, pady=5)
        self.gender_var = tk.StringVar(value="1")
        gender_frame = ttk.Frame(user_frame)
        gender_frame.grid(row=1, column=3, padx=5, pady=5)
        ttk.Radiobutton(gender_frame, text="男", variable=self.gender_var, value="1").pack(side=tk.LEFT)
        ttk.Radiobutton(gender_frame, text="女", variable=self.gender_var, value="0").pack(side=tk.LEFT)

        # 年龄
        age_label = "年龄*:" if 'age' in self.required_fields else "年龄:"
        ttk.Label(user_frame, text=age_label, foreground="red" if 'age' in self.required_fields else "black").grid(row=2, column=0, sticky=tk.W, padx=5, pady=5)
        self.age_entry = ttk.Entry(user_frame, width=30)
        self.age_entry.grid(row=2, column=1, padx=5, pady=5)

        # 身高
        height_label = "身高*:" if 'height' in self.required_fields else "身高:"
        ttk.Label(user_frame, text=height_label, foreground="red" if 'height' in self.required_fields else "black").grid(row=2, column=2, sticky=tk.W, padx=5, pady=5)
        self.height_entry = ttk.Entry(user_frame, width=30)
        self.height_entry.grid(row=2, column=3, padx=5, pady=5)

        # 体重
        weight_label = "体重*:" if 'weight' in self.required_fields else "体重:"
        ttk.Label(user_frame, text=weight_label, foreground="red" if 'weight' in self.required_fields else "black").grid(row=3, column=0, sticky=tk.W, padx=5, pady=5)
        self.weight_entry = ttk.Entry(user_frame, width=30)
        self.weight_entry.grid(row=3, column=1, padx=5, pady=5)

        # 电话
        phone_label = "电话*:" if 'phone' in self.required_fields else "电话:"
        ttk.Label(user_frame, text=phone_label, foreground="red" if 'phone' in self.required_fields else "black").grid(row=3, column=2, sticky=tk.W, padx=5, pady=5)
        self.phone_entry = ttk.Entry(user_frame, width=30)
        self.phone_entry.grid(row=3, column=3, padx=5, pady=5)

        # 身份证号
        id_number_label = "身份证号*:" if 'id_number' in self.required_fields else "身份证号:"
        ttk.Label(user_frame, text=id_number_label, foreground="red" if 'id_number' in self.required_fields else "black").grid(row=4, column=0, sticky=tk.W, padx=5, pady=5)
        self.id_number_entry = ttk.Entry(user_frame, width=30)
        self.id_number_entry.grid(row=4, column=1, padx=5, pady=5)

        # 分组
        group_label = "分组*:" if 'group' in self.required_fields else "分组:"
        ttk.Label(user_frame, text=group_label, foreground="red" if 'group' in self.required_fields else "black").grid(row=4, column=2, sticky=tk.W, padx=5, pady=5)
        self.group_entry = ttk.Entry(user_frame, width=30)
        self.group_entry.grid(row=4, column=3, padx=5, pady=5)

        # 出生日期
        birthday_label = "出生日期*:" if 'birthday' in self.required_fields else "出生日期:"
        ttk.Label(user_frame, text=birthday_label, foreground="red" if 'birthday' in self.required_fields else "black").grid(row=5, column=0, sticky=tk.W, padx=5, pady=5)
        self.birthday_entry = ttk.Entry(user_frame, width=30)
        self.birthday_entry.insert(0, "1990-01-01")
        self.birthday_entry.grid(row=5, column=1, padx=5, pady=5)

        # 备注
        remark_label = "备注*:" if 'remark' in self.required_fields else "备注:"
        ttk.Label(user_frame, text=remark_label, foreground="red" if 'remark' in self.required_fields else "black").grid(row=5, column=2, sticky=tk.W, padx=5, pady=5)
        self.remark_entry = ttk.Entry(user_frame, width=30)
        self.remark_entry.grid(row=5, column=3, padx=5, pady=5)

        # 描述
        description_label = "描述*:" if 'description' in self.required_fields else "描述:"
        ttk.Label(user_frame, text=description_label, foreground="red" if 'description' in self.required_fields else "black").grid(row=6, column=0, sticky=tk.W, padx=5, pady=5)
        self.description_entry = ttk.Entry(user_frame, width=30)
        self.description_entry.grid(row=6, column=1, padx=5, pady=5)

    def create_button_section(self):
        """创建按钮区域"""
        button_frame = ttk.Frame(self.scrollable_frame, padding="10")
        button_frame.pack(fill=tk.X, pady=10)

        # 添加按钮
        add_button = ttk.Button(button_frame, text="添加用户", command=self.add_user)
        add_button.pack(side=tk.LEFT, padx=5)

        # 重置按钮
        reset_button = ttk.Button(button_frame, text="重置", command=self.reset_form)
        reset_button.pack(side=tk.LEFT, padx=5)

        # 退出按钮
        exit_button = ttk.Button(button_frame, text="退出", command=self.root.quit)
        exit_button.pack(side=tk.LEFT, padx=5)

    def update_db_config(self):
        """更新数据库配置"""
        DB_CONFIG['host'] = self.host_entry.get()
        DB_CONFIG['user'] = self.user_entry.get()
        DB_CONFIG['password'] = self.password_entry.get()
        DB_CONFIG['database'] = self.database_entry.get()

    def add_user(self):
        """添加用户"""
        # 更新数据库配置
        self.update_db_config()

        # 获取用户信息
        try:
            user_data = {
                'name': self.name_entry.get(),
                'gender': int(self.gender_var.get()),
                'age': int(self.age_entry.get()) if self.age_entry.get() else None,
                'height': int(self.height_entry.get()) if self.height_entry.get() else None,
                'weight': int(self.weight_entry.get()) if self.weight_entry.get() else None,
                'phone': self.phone_entry.get() if self.phone_entry.get() else None,
                'id_number': self.id_number_entry.get() if self.id_number_entry.get() else None,
                'group': int(self.group_entry.get()) if self.group_entry.get() else None,
                'birthday': datetime.strptime(self.birthday_entry.get(), "%Y-%m-%d") if self.birthday_entry.get() else None,
                'remark': self.remark_entry.get() if self.remark_entry.get() else None,
                'description': self.description_entry.get() if self.description_entry.get() else None,
                'create_time': datetime.now(),
                'modified_time': datetime.now(),
                'is_deleted': 0
            }

            # 验证必填字段
            if not user_data['name']:
                messagebox.showerror("错误", "姓名不能为空")
                return

            # 更新状态栏
            self.status_var.set("正在添加用户...")
            self.root.update()

            # 连接数据库
            connection = mysql.connector.connect(**DB_CONFIG)
            cursor = connection.cursor()

            # 准备SQL语句
            sql = """
            INSERT INTO user (
                name, gender, age, height, weight, phone, id_number, `group`,
                birthday, remark, description, create_time, modified_time, is_deleted
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            """

            # 准备数据
            values = (
                user_data['name'],
                user_data['gender'],
                user_data['age'],
                user_data['height'],
                user_data['weight'],
                user_data['phone'],
                user_data['id_number'],
                user_data['group'],
                user_data['birthday'],
                user_data['remark'],
                user_data['description'],
                user_data['create_time'],
                user_data['modified_time'],
                user_data['is_deleted']
            )

            # 执行SQL
            cursor.execute(sql, values)
            connection.commit()

            # 获取插入的用户ID
            user_id = cursor.lastrowid

            # 关闭连接
            cursor.close()
            connection.close()

            # 显示成功消息
            messagebox.showinfo("成功", f"用户添加成功，用户ID: {user_id}")
            self.status_var.set(f"用户添加成功，用户ID: {user_id}")

        except ValueError as e:
            messagebox.showerror("输入错误", f"请检查输入的数据格式: {e}")
            self.status_var.set(f"输入错误: {e}")
        except Error as e:
            messagebox.showerror("数据库错误", f"数据库操作失败: {e}")
            self.status_var.set(f"数据库错误: {e}")
        except Exception as e:
            messagebox.showerror("错误", f"添加用户时发生错误: {e}")
            self.status_var.set(f"错误: {e}")

    def reset_form(self):
        """重置表单"""
        self.name_entry.delete(0, tk.END)
        self.gender_var.set("1")
        self.age_entry.delete(0, tk.END)
        self.height_entry.delete(0, tk.END)
        self.weight_entry.delete(0, tk.END)
        self.phone_entry.delete(0, tk.END)
        self.id_number_entry.delete(0, tk.END)
        self.group_entry.delete(0, tk.END)
        self.birthday_entry.delete(0, tk.END)
        self.birthday_entry.insert(0, "1990-01-01")
        self.remark_entry.delete(0, tk.END)
        self.description_entry.delete(0, tk.END)
        self.status_var.set("表单已重置")

def main():
    root = tk.Tk()
    app = UserManagerGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
