# 项目深度代码级拆解文档

本项目是一套集成了传感器数据采集、高精度运动算法分析、多维数据可视化及工业级容器化部署的体能训练分析系统。本文档旨在对系统的核心板块进行深度的代码级解析。

---

## 板块 1：核心算法与信号处理引擎 (前端 JSX 生产级实现)

在本项目架构中，前端（React）不仅负责 UI 渲染，还承担了“边缘计算”的重任：直接拉取原始 CSV 文件，在浏览器内存中运行复杂的数学模型和 DSP（数字信号处理）算法，从 1000Hz 的高频杂乱数据中提纯出竞技指标。

### 1.1 工业级 DSP：4阶巴特沃斯滤波与零相移技术
系统借助了 `fili` 这个专业的数字信号处理库来“净化”杂乱的传感器数据，滤除机械抖动。

*   **核心代码解析**（参考 `TrainingLogAnalysis.jsx`）：
    ```javascript
    const iirCalculator = new Fili.CalcCascades();
    const iirFilterCoeffs = iirCalculator.lowpass({
      order: 2,           // 2个双二阶(biquad)级联 = 4阶滤波器
      characteristic: 'butterworth',
      Fs: 1000,           // 采样率：1000Hz (1ms/点)
      Fc: 10.0            // 截止频率：10Hz
    });
    const iirFilter = new Fili.IirFilter(iirFilterCoeffs);

    // 【高阶实现】：零相移滤波 (Zero-phase filtering)
    let forward = iirFilter.multiStep(data);
    let reversedForward = forward.slice().reverse();
    let backward = iirFilter.multiStep(reversedForward);
    let result = backward.slice().reverse();
    ```
*   **深度技术剖析**：
    1.  **为什么在浏览器端跑 4 阶 Butterworth？**：Butterworth 滤波器的特性是“通带内最大平坦”。这意味着在 0-10Hz 的有效人体运动频段内，信号幅值不会被扭曲，同时 10Hz 以上的机械高频噪声会被干脆利落地切断。
    2.  **什么是零相移（Zero-phase）？**：任何 IIR 低通滤波器在过滤噪声时，都会产生“相位延迟”。代码通过**“正向滤一遍 -> 数组反转 -> 反向再滤一遍 -> 再次反转”**，精妙地抵消了这层延迟，确保了前端图表上的速度峰值与运动员实际发力的毫秒级时刻**绝对对齐**。

### 1.2 自适应状态机：动态步幅/步频检测算法
摒弃了传统的固定阈值，系统实现了一套基于运动表现“水涨船高”的启发式寻峰算法。

*   **核心代码解析**（参考 `TrainDetail_new.jsx` 的 `calculateStrideAndFrequency`）：
    ```javascript
    // 1. 自适应状态触发：采用 70% 极值作为进入稳态的判定
    const maxSpeed = Math.max(...speeds);
    const highSpeedThreshold = maxSpeed * 0.70; 

    // 2. 局部突出度 (Prominence) 校验
    const minDistanceSamples = Math.floor(0.20 / sampleInterval); 
    for (let i = 1; i < subSpeeds.length - 1; i++) {
        const leftMin = Math.min(...subSpeeds.slice(Math.max(0, i - minDistanceSamples), i));
        const rightMin = Math.min(...subSpeeds.slice(i + 1, i + minDistanceSamples + 1));
        const prominence = subSpeeds[i] - Math.max(leftMin, rightMin);
        
        if (prominence <= 0.1) continue; // 约束1：突起高度不足，判定为假峰
        
        if (peaks.length > 0) {
            const timeDiff = subTimes[i] - subTimes[peaks[peaks.length - 1]];
            if (timeDiff <= 0.18) continue; // 约束2：时间死区，人类步频不可能快于 0.18s
        }
        // ...加入有效峰值队列
    }
    ```
*   **深度技术剖析**：
    *   **动态激活机制**：无论用户最高速度是 4m/s 还是 9m/s，算法只关注其个人极速的 70% 以上区间，完美兼容了康复慢走与国家队冲刺两种极端场景。
    *   **突出度 (Prominence)**：不关心波峰的绝对高度，只关心它比周围的谷底高出多少。这有效过滤了运动员在滑行过程中产生的“基线上的小波动”，只提取真实的“蹬地推力”。

### 1.3 前端的高频数据防抖与微积分
在将速度转化为加速度（微分操作）时，噪声会被成倍放大。JSX 代码中进行了严密的双重防抖与降噪处理。

*   **核心代码解析**：
    ```javascript
    // 第一重：中心差分法求导 (Central Difference)
    const dt_forward = times[index + 1] - times[index];
    const dt_backward = times[index] - times[index - 1];
    acceleration = ((speeds[index + 1] - speeds[index]) / dt_forward +
                    (speeds[index] - speeds[index - 1]) / dt_backward) / 2;

    // 第二重：对求导后的加速度进行窗口大小为 31 的移动平均滤波
    const smoothedAcceleration = smoothAcceleration(rawAcceleration, 31);
    ```
*   **深度技术剖析**：
    *   **中心差分**：综合了 $t_{-1}$ 和 $t_{+1}$ 的状态来决定 $t_0$ 的切线斜率，比简单的向后相减具有更高的数值稳定性。
    *   **移动平均（Moving Average）**：在 1000Hz 采样率下，窗口为 31 意味着取前后各 15ms 的数据进行抹平。这抹平了尖锐的电磁毛刺，同时完美保留了肌肉发力时的宏观包络线。
    *   **统计学置信度**：在提取“峰值功率”时，代码不使用 `max()`，而是使用 `99.5% Percentile`（分位数），彻底排除了极少数异常点的干扰，保证了结果的工业级稳健性。

---

## 板块 2：前端架构与高阶可视化 (React & Recharts 生产级实现)

在本项目中，前端不仅仅是“展示数据的页面”，而是一个具备数据清洗、状态计算和高性能交互渲染的“轻量级客户端引擎”。

### 2.1 脏数据清洗与动态值域计算 (Data Cleansing & Domain)
传感器在高频震动时，偶尔会产生物理意义上不可能的数据（如 `NaN` 或无穷大 `Infinity`）。系统在图表渲染前建立了一道“数据防火墙”。

*   **核心代码解析**（参考 `TrainDetail_new.jsx`）：
    ```javascript
    // 清洗数据，将 NaN/Infinity 转为 null，防止 Canvas 渲染崩溃
    const cleanChartData = logChartData.map(d => ({
      ...d,
      acceleration: safeValue(d.acceleration),
      force: safeValue(d.force)
    }));

    // 动态计算 Y 轴显示范围 (Domain)
    const accDomain = calcDomain(cleanChartData, 'acceleration', [-30, 30]);
    ```
*   **深度技术剖析**：
    *   **`safeValue` 屏障**：在除以零（如静止状态下求导）等边界情况时会产生非法数值。`safeValue` 拦截了这些数值，保证了 React 渲染周期的安全性。
    *   **自适应 Y 轴 (`calcDomain`)**：不同运动员的力量表现差异极大。固定的 Y 轴比例会导致曲线“顶破天际”或“缩成直线”。`calcDomain` 通过遍历 Min/Max，并增加 `20%` 的缓冲边距（Padding），确保每条曲线都能在视觉中心完美呈现。

### 2.2 专业级交互：局部放大与区间聚焦 (`Brush` 组件)
由于一次训练会产生数以千计的数据点，系统巧妙地引入了局部放缩机制，使教练能够观察毫秒级的发力细节。

*   **核心代码解析**：
    ```javascript
    <LineChart data={cleanChartData}>
      {/* 核心曲线：关闭普通节点点迹，仅保留悬停激活点，提升上千个数据点的渲染性能 */}
      <Line type="monotone" dataKey="speed" stroke="#4285F4" dot={false} activeDot={{ r: 6 }} />
      
      {/* 底部缩放交互刷：允许用户框选特定数据范围 */}
      <Brush dataKey="pos" height={30} stroke="#4285F4" fill="rgba(240,248,255,0.6)" />
    </LineChart>
    ```
*   **深度技术剖析**：
    *   **渲染性能优化 (`dot={false}`)**：在几百上千个数据点的折线图中，开启圆点渲染不仅使图表变成一团墨迹，还会极大地拖慢浏览器的绘制帧率。关闭节点后，仅依靠 `activeDot` 提供交互反馈。
    *   **微观诊断能力**：教练可以通过拖拽 `Brush`，将 20 米的全局视野瞬间聚焦到“10米 - 12米”这两米区间，清晰观察运动员在此区间内每一步的加速度微小起伏，用以诊断左右腿发力是否对称。

### 2.3 维度降维与多轨数据融合 (Train Comparison)
在对比两名不同运动员（或不同场次）时，由于他们的“总时间”和“总位移”绝不相同，直接绘制会导致 X 轴错位、曲线错乱。

*   **核心代码解析**（参考 `TrainComparison.jsx`）：
    ```javascript
    // 宽表合并策略 (Wide Table Merge)
    const mergedChartData = []
    for (let i = 0; i < maxDataLength; i++) {
      const dataPoint = { time: i } // 虚拟通用索引
      validResults.forEach(result => {
        // 动态生成 Object Key，如 'pos_101', 'speed_101'
        dataPoint[`pos_${result.trainId}`] = point.pos
        dataPoint[`speed_${result.trainId}`] = point.speed
      })
      mergedChartData.push(dataPoint)
    }

    // 动态分离渲染
    datasets: trainMetrics.map((train, index) => ({
      data: chartData.map(point => ({ 
        x: point[`pos_${train.trainId}`], 
        y: point[`speed_${train.trainId}`] 
      })).filter(Boolean)
    }))
    ```
*   **深度技术剖析**：
    系统没有使用传统的层叠数组，而是独创了一种**宽表合并策略**。通过动态拼接 `trainId` 作为键值，将多场次不同维度的数据平铺进同一个大型 JSON 字典中。渲染时，通过显式指定各自的 `x` 和 `y` 映射，强行在同一个物理位移网格下对齐了不同人的速度曲线。这使得 10 条对比曲线能够完美重叠，直观暴露落后者的“速度衰减点”。

---

## 板块 3：后端服务与安全体系 (Node.js & Express 源码级实现)

后端的职责不仅是“提供数据”，更在于“聚合高阶业务逻辑”并“守卫系统安全”。这部分代码写得非常精炼且工业化。

### 3.1 业务逻辑层：复杂排名与聚合计算引擎 (SQL Window Functions)
为了避免把几十万条训练记录拉到前端去算排名，后端在 `/api/rankings` 路由中实现了非常高级的 SQL 聚合运算。

*   **核心代码解析**（参考 `server/index.js`）：
    ```sql
    -- 核心 SQL：使用 ROW_NUMBER() 窗口函数提取每个用户的「个人历史最佳」
    SELECT best.id, best.${field} as value, u.name as user_name, best.begin_time
    FROM (
      SELECT tr.id, tr.uid, tr.${field}, tr.begin_time,
             ROW_NUMBER() OVER (PARTITION BY tr.uid ORDER BY CAST(tr.${field} AS DECIMAL(10,2)) DESC) as rn
      FROM train_record tr
      WHERE tr.${field} IS NOT NULL AND tr.end_time IS NOT NULL AND tr.type = ?
    ) best
    LEFT JOIN \`user\` u ON u.id = best.uid
    WHERE best.rn = 1  -- 过滤：只取每个人的第 1 名成绩
    ORDER BY CAST(best.${field} AS DECIMAL(10,2)) DESC
    ```
*   **深度技术剖析**：
    *   **个人极值去重 (`ROW_NUMBER() OVER PARTITION BY`)**：这是一个极其高效的 MySQL 8.0 窗口函数应用。数据库引擎一次性算出了每个人（`PARTITION BY uid`）按某项指标排名的序号（`rn`），外层查询只需 `rn=1` 即可过滤掉同一个人的其余成绩，保证了排行榜上的公平性，免去了业务代码层的复杂哈希去重。
    *   **强类型转换 (`CAST AS DECIMAL`)**：针对 `peak_speed` 等浮点数字段，代码刻意加上了 `CAST`。这保证了在进行数值比大小时，不会因为字符串字典序（如 `"9.9" > "10.1"`）而导致排行榜错乱。

### 3.2 安全架构：JWT 无状态鉴权防线
系统采用了 JWT（JSON Web Token）作为核心鉴权方案，有效保护了系统的敏感数据（如大批量 CSV 导出）不被非法爬取。

*   **核心代码解析**：
    ```javascript
    // 受保护路由 (如 /api/trains/export) 的前置拦截器
    const auth = req.headers.authorization
    if (!auth) return res.status(401).json({ error: 'unauthorized' })
    
    const token = auth.split(' ')[1] // 提取 Bearer Token
    
    // 同步校验签名有效性，如果伪造或过期将直接 throw error 走 catch 分支
    try { 
        jwt.verify(token, process.env.JWT_SECRET || 'secret') 
    } catch (e) { 
        return res.status(401).json({ error: 'invalid_token' }) 
    }
    ```
*   **深度技术剖析**：
    *   **无状态 (Stateless) 的优势**：后端没有使用 `Redis` 或内存来存储 Session，而是直接验证 `token` 自身的签名（HMAC 算法）。这意味着无论后端横向扩展多少个 Docker 容器实例，只要 `JWT_SECRET` 一致，登录状态就是天然互通的。
    *   **精准打击权限越界**：在提供“分页查询”等常规数据接口时，系统允许查询呈现；但在涉及数据脱敏和核心资产流失的路由（如 `/export`）上，系统严格卡住了 JWT 检验。这种“按需设防”的设计非常符合现代安全开发规范。

### 3.3 动态 SQL 防注入与分页治理
在 `/api/trains` 中，后端采用了动态 SQL 组装器来应对前端复杂的多维查询需求。

*   **防注入实践**：
    ```javascript
    let where = 'WHERE tr.end_time IS NOT NULL'
    const params = []
    if (uid !== null) { where += ' AND tr.uid = ?'; params.push(uid) }
    if (type !== null) { where += ' AND tr.type = ?'; params.push(type) }
    ```
    这种写法避免了引入 ORM 框架带来的厚重感与性能损耗，同时利用底层 `mysql2` 驱动的 `?` 参数化查询功能，彻底斩断了 **SQL 注入 (SQL Injection)** 的物理可能。

---

## 板块 4：数据库 Schema 与数据建模 (MySQL 8.0)

本项目不仅是简单的数据堆砌，而是构建了一个支持多维度聚合的结构化数仓。系统通过 Schema 设计和视图抽象，实现了数据的高效存取。

### 4.1 核心表结构设计 (`train_record` 与 `user` 的 1:N 映射)
这是整个系统的基石，所有前端的可视化都依赖于这套底层 Schema。

*   **核心代码解析**（参考 `server/migrations/schema.md`）：
    ```sql
    CREATE TABLE `train_record` (
      `id` int NOT NULL AUTO_INCREMENT,
      `uid` int NOT NULL,                      -- 关联用户 ID，实现数据隔离
      `type` tinyint NOT NULL,                 -- 训练类型(1:抗阻, 2:牵引)
      `max_speed` float DEFAULT NULL,
      `peak_acceleration` decimal(12,4) DEFAULT NULL COMMENT '峰值加速度 (m/s², 99.5% 分位数)',
      `peak_force` decimal(12,2) DEFAULT NULL COMMENT '峰值力量 (kg)',
      `peak_power` decimal(15,2) DEFAULT NULL COMMENT '峰值功率 (W)',
      `avg_step_frequency` decimal(10,4) DEFAULT NULL,
      `log` varchar(255) DEFAULT NULL,         -- 原始 CSV 文件路径
      PRIMARY KEY (`id`),
      KEY `uid` (`uid`),
      CONSTRAINT `train_record_ibfk_1` FOREIGN KEY (`uid`) REFERENCES `user` (`id`)
    ) ENGINE=InnoDB;
    ```
*   **深度技术剖析**：
    *   **混合存储策略 (Hybrid Storage)**：系统并没有把百万级的 1000Hz 原始传感器点位全部存入 MySQL，而是采用了**“高价值聚合指标入库 + 原始波形外置（存为 CSV 并在 `log` 字段保存路径）”**的混合架构。这种设计极大地减轻了数据库的 I/O 压力，使得 `train_record` 表保持轻量，专门服务于高频的排行榜查询。
    *   **强精度控制 (`decimal`)**：虽然物理基础量（如 `max_speed`）使用 `float`，但在涉及衍生计算的高阶指标（如 `peak_acceleration` 和 `peak_power`）上，系统使用了 `decimal(12,4)`。这严格避免了浮点数在数据库层进行 SUM、AVG 运算时常见的精度丢失（Precision Loss）问题。

### 4.2 高阶视图抽象 (MySQL Views)
为了解耦前端展示层与底层关系表，系统采用了预计算视图。

*   **核心代码解析**：
    ```sql
    CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `user_view` AS 
    select `u`.`id`,`u`.`name`,
           `gd`.`name` AS `gender`,
           timestampdiff(YEAR,`u`.`birthday`,curdate()) AS `age`, -- 数据库端动态计算年龄
           `gr`.`name` AS `group_name`
    from ((`user` `u` 
           left join `gender` `gd` on((`u`.`gender` = `gd`.`id`))) 
           left join `group` `gr` on((`u`.`group` = `gr`.`id`))) 
    where (`u`.`is_deleted` = 0)
    ```
*   **深度技术剖析**：
    通过视图，Node.js 后端可以直接查询 `user_view` 拿到带着中文组名、且**实时计算出真实年龄**的用户列表，无需每次都在 API 层写复杂的跨表 JOIN 逻辑。这体现了“让数据库做它最擅长的集合运算”的高级架构哲学。

---

## 板块 5：工程化部署与异步离线计算 (DevOps & Batch Processing)

该系统具备工业级的交付能力。通过 Docker 和独立的数据清洗流，保障了系统的稳定性和可扩展性。

### 5.1 容器化微服务编排 (Docker Compose)
系统实现了“基础设施即代码”（IaC），确保在任何环境下都能 100% 还原系统状态。

*   **核心代码解析**（参考 `docker-compose.yml`）：
    ```yaml
    version: '3.8'
    services:
      db:
        image: mysql:8.0
        volumes:
          - db_data:/var/lib/mysql  # 核心1：数据持久化挂载
      api:
        build: ./server
        depends_on:
          - db                      # 核心2：容器启动时序锁
    ```
*   **深度技术剖析**：
    *   **启动时序隔离 (`depends_on`)**：保证了 Node.js 业务服务一定在 MySQL 引擎初始化并就绪之后才启动，彻底根除了微服务架构中典型的“启动期连接拒绝 (Connection Refused)”竞态问题。
    *   **无状态服务与有状态存储分离**：`api` 容器是无状态的，随时可以销毁重建以更新代码；而 `db` 容器通过 `volumes` 将 `/var/lib/mysql` 强行映射到宿主机物理磁盘。这确保了即使用户执行了 `docker-compose down`，几万条训练数据也绝不会随容器蒸发。

### 5.2 离线批处理与断点续传引擎 (Python Scripts)
系统中存在诸如 `update_step.py`、`update_avg_speeds.py` 等独立脚本，它们构成了强大的“离线修正引擎”。

*   **核心代码解析**：
    ```python
    # 只寻找未计算过步长指标的"增量"记录
    query = """
    SELECT id, log FROM train_record
    WHERE end_time IS NOT NULL 
      AND (avg_step_length IS NULL) AND log IS NOT NULL
    """
    cursor.execute(query)
    # ... 进行 4阶滤波与自适应特征提取的超大运算 ...
    # 写回数据库
    update_sql = "UPDATE train_record SET avg_step_length=%s WHERE id=%s"
    cursor.execute(update_sql, params)
    ```
*   **深度技术剖析**：
    这是一种极具前瞻性的**异步批处理架构 (Asynchronous Batch Processing)**。
    对于计算密集型任务（如读取几万行 CSV、执行 1000Hz 的滤波和步频 FFT 计算），系统没有把它放在前端上传数据的同步 API 接口里（这会必然导致浏览器超时卡死）。而是先将原始数据入库（指标置 `NULL`），再由后台 Python 引擎作为独立的 Worker，定时扫表找出增量数据进行离线重算。这种架构甚至支持：**当系统算法升级（如从 4 阶滤波改为 8 阶），只需将全表指标置空，脚本就会自动重新回溯计算过去几年的所有历史数据**，实现极低成本的算法版本迭代。

---

## 结论

本项目通过 **“底层信号处理算法 + 响应式前端可视化 + 稳健的后端 API + 容器化部署”**，构建了一个闭环的专业体能训练数据分析平台。其核心优势在于对物理规律的深度理解（状态机约束）以及对工程细节的严苛把控（4阶滤波、JWT 鉴权、容器化）。
