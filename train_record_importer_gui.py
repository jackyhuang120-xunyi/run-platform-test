
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import os
import sys
from datetime import datetime
from train_record_importer import import_train_record, DB_CONFIG

class TrainRecordImporterGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("训练记录导入工具")
        self.root.geometry("800x700")

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

        # 训练类型
        ttk.Label(train_frame, text="训练类型:").grid(row=0, column=2, sticky=tk.W, padx=5, pady=5)
        self.type_entry = ttk.Entry(train_frame, width=15)
        self.type_entry.insert(0, "1")
        self.type_entry.grid(row=0, column=3, padx=5, pady=5)

        # 部位
        ttk.Label(train_frame, text="部位:").grid(row=0, column=4, sticky=tk.W, padx=5, pady=5)
        self.part_entry = ttk.Entry(train_frame, width=15)
        self.part_entry.insert(0, "1")
        self.part_entry.grid(row=0, column=5, padx=5, pady=5)

        # 起始阻力
        ttk.Label(train_frame, text="起始阻力(kg):").grid(row=1, column=0, sticky=tk.W, padx=5, pady=5)
        self.start_force_entry = ttk.Entry(train_frame, width=15)
        self.start_force_entry.insert(0, "10.5")
        self.start_force_entry.grid(row=1, column=1, padx=5, pady=5)

        # 结束阻力
        ttk.Label(train_frame, text="结束阻力(kg):").grid(row=1, column=2, sticky=tk.W, padx=5, pady=5)
        self.end_force_entry = ttk.Entry(train_frame, width=15)
        self.end_force_entry.insert(0, "15.2")
        self.end_force_entry.grid(row=1, column=3, padx=5, pady=5)

        # 训练距离
        ttk.Label(train_frame, text="训练距离(m):").grid(row=1, column=4, sticky=tk.W, padx=5, pady=5)
        self.train_dis_entry = ttk.Entry(train_frame, width=15)
        self.train_dis_entry.insert(0, "30.0")
        self.train_dis_entry.grid(row=1, column=5, padx=5, pady=5)

        # 变阻距离
        ttk.Label(train_frame, text="变阻距离(m):").grid(row=2, column=0, sticky=tk.W, padx=5, pady=5)
        self.change_dis_entry = ttk.Entry(train_frame, width=15)
        self.change_dis_entry.insert(0, "12.0")
        self.change_dis_entry.grid(row=2, column=1, padx=5, pady=5)

        # 安全距离
        ttk.Label(train_frame, text="安全距离(m):").grid(row=2, column=2, sticky=tk.W, padx=5, pady=5)
        self.safe_dis_entry = ttk.Entry(train_frame, width=15)
        self.safe_dis_entry.insert(0, "35.0")
        self.safe_dis_entry.grid(row=2, column=3, padx=5, pady=5)

        # 最大速度
        ttk.Label(train_frame, text="最大速度(m/s):").grid(row=2, column=4, sticky=tk.W, padx=5, pady=5)
        self.max_speed_entry = ttk.Entry(train_frame, width=15)
        self.max_speed_entry.insert(0, "8.5")
        self.max_speed_entry.grid(row=2, column=5, padx=5, pady=5)

        # 总时间
        ttk.Label(train_frame, text="总时间(s):").grid(row=3, column=0, sticky=tk.W, padx=5, pady=5)
        self.total_time_entry = ttk.Entry(train_frame, width=15)
        self.total_time_entry.insert(0, "5.2")
        self.total_time_entry.grid(row=3, column=1, padx=5, pady=5)

        # 峰值时间
        ttk.Label(train_frame, text="峰值时间(s):").grid(row=3, column=2, sticky=tk.W, padx=5, pady=5)
        self.peak_time_entry = ttk.Entry(train_frame, width=15)
        self.peak_time_entry.insert(0, "2.3")
        self.peak_time_entry.grid(row=3, column=3, padx=5, pady=5)

        # 峰值位置
        ttk.Label(train_frame, text="峰值位置(m):").grid(row=3, column=4, sticky=tk.W, padx=5, pady=5)
        self.peak_pos_entry = ttk.Entry(train_frame, width=15)
        self.peak_pos_entry.insert(0, "15.5")
        self.peak_pos_entry.grid(row=3, column=5, padx=5, pady=5)

        # 峰值速度
        ttk.Label(train_frame, text="峰值速度(m/s):").grid(row=4, column=0, sticky=tk.W, padx=5, pady=5)
        self.peak_speed_entry = ttk.Entry(train_frame, width=15)
        self.peak_speed_entry.insert(0, "8.5")
        self.peak_speed_entry.grid(row=4, column=1, padx=5, pady=5)

        # 结果
        ttk.Label(train_frame, text="结果:").grid(row=4, column=2, sticky=tk.W, padx=5, pady=5)
        self.result_entry = ttk.Entry(train_frame, width=15)
        self.result_entry.insert(0, "1")
        self.result_entry.grid(row=4, column=3, padx=5, pady=5)

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

        self.type_entry.delete(0, tk.END)
        self.type_entry.insert(0, "1")

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
