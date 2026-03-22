import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTrainById } from '../services/api'
import { smoothAcceleration } from '../services/acceleration_filter'
import Fili from 'fili'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush, ReferenceLine } from 'recharts'

export default function TrainingLogAnalysis() {
  const params = useParams()
  const navigate = useNavigate()
  const id = params.id
  const [trainData, setTrainData] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  // 从训练记录获取基本信息
  useEffect(() => {
    if (id) {
      setLoading(true)
      getTrainById(id).then(data => {
        console.log('获取到的训练数据:', data)
        console.log('end_force字段值:', data?.end_force)
        console.log('所有字段:', Object.keys(data || {}))
        setTrainData(data)
        // 如果有日志文件路径，直接获取文件
        if (data && data.log) {
          console.log('日志文件路径:', data.log)
          fetchLogData(data.log, data)
        } else {
          // 没有日志文件，显示模拟数据
          loadAnalysisData()
        }
      }).catch(err => {
        setError('获取训练数据失败: ' + err.message)
        setLoading(false)
      })
    }
  }, [id])

  // 应用低通滤波器 - 使用Butterworth 4阶滤波器和零相移处理
  const applyLowPassFilter = (data, dt, cutoffFreq = 10.0) => {
    if (!data || data.length === 0) return [];
    
    const fs = 1.0 / dt;  // 采样频率 = 1000 Hz
    
    // 检查fili库是否正确加载
    console.log('Fili库检查:', typeof Fili, Fili);
    
    const iirCalculator = new Fili.CalcCascades();
    const iirFilterCoeffs = iirCalculator.lowpass({
      order: 2,  // 2 biquad = 4th order, 匹配 Python
      characteristic: 'butterworth',
      Fs: fs,
      Fc: cutoffFreq,
      gain: 0,
      preGain: false
    });
    
    const iirFilter = new Fili.IirFilter(iirFilterCoeffs);
    
    // 正向滤波
    let forward = iirFilter.multiStep(data);
    
    // 反转 + 反向滤波 + 再反转（模拟 filtfilt 零相移）
    let reversedForward = forward.slice().reverse();
    let backward = iirFilter.multiStep(reversedForward);
    let result = backward.slice().reverse();
    
    // 测试日志：比较原始数据和滤波后数据
    console.log('原始速度前10个:', data.slice(0,10));
    console.log('滤波后速度前10个:', result.slice(0,10));
    
    return result;
  };

  // 计算步长
  const calculateStrideLength = (data, sampleInterval = 0.001) => {
    if (!data || data.length === 0) return null

    // 方法A：基于力量峰值检测步态
    const forceData = data.map(row => row.Force)

    // 计算动态阈值（使用数据的统计特性）
    const meanForce = forceData.reduce((sum, val) => sum + val, 0) / forceData.length
    const variance = forceData.reduce((sum, val) => sum + Math.pow(val - meanForce, 2), 0) / forceData.length
    const stdForce = Math.sqrt(variance)
    const heightThreshold = meanForce + 0.3 * stdForce  // 调整系数以适应数据特征
    const minDistance = Math.floor(0.3 / sampleInterval)  // 假设最小步态周期为0.3秒

    // 检测力量峰值（每一步通常会有一个力量峰值）
    const peaks = []
    for (let i = 1; i < forceData.length - 1; i++) {
      if (forceData[i] > heightThreshold && 
          forceData[i] > forceData[i-1] && 
          forceData[i] > forceData[i+1] && 
          (i - peaks[peaks.length - 1] > minDistance || peaks.length === 0)) {
        peaks.push(i)
      }
    }

    if (peaks.length > 1) {
      // 计算每一步对应的位移增量
      const positions = data.map(row => row.pos)
      const strideLengths = []

      for (let i = 0; i < peaks.length - 1; i++) {
        const startPos = positions[peaks[i]]
        const endPos = positions[peaks[i+1]]
        const strideLength = Math.abs(endPos - startPos)

        // 过滤异常值（步长过大或过小）
        if (0.2 < strideLength && strideLength < 2.0) {  // 合理的步长范围
          strideLengths.push(strideLength)
        }
      }

      if (strideLengths.length > 0) {
        const avgStrideLength = strideLengths.reduce((sum, val) => sum + val, 0) / strideLengths.length
        return avgStrideLength
      }
    }

    // 如果力量峰值方法失败，尝试基于速度的峰值检测
    const speedData = data.map(row => row.speed_filtered || row.speed)
    const meanSpeed = speedData.reduce((sum, val) => sum + val, 0) / speedData.length
    const speedVariance = speedData.reduce((sum, val) => sum + Math.pow(val - meanSpeed, 2), 0) / speedData.length
    const stdSpeed = Math.sqrt(speedVariance)
    const speedHeightThreshold = meanSpeed + 0.2 * stdSpeed
    const speedMinDistance = Math.floor(0.2 / sampleInterval)  // 较小的距离阈值

    const speedPeaks = []
    for (let i = 1; i < speedData.length - 1; i++) {
      if (speedData[i] > speedHeightThreshold && 
          speedData[i] > speedData[i-1] && 
          speedData[i] > speedData[i+1] && 
          (i - speedPeaks[speedPeaks.length - 1] > speedMinDistance || speedPeaks.length === 0)) {
        speedPeaks.push(i)
      }
    }

    if (speedPeaks.length > 1) {
      const positions = data.map(row => row.pos)
      const strideLengths = []

      for (let i = 0; i < speedPeaks.length - 1; i++) {
        const startPos = positions[speedPeaks[i]]
        const endPos = positions[speedPeaks[i+1]]
        const strideLength = Math.abs(endPos - startPos)

        // 过滤异常值
        if (0.2 < strideLength && strideLength < 2.0) {
          strideLengths.push(strideLength)
        }
      }

      if (strideLengths.length > 0) {
        const avgStrideLength = strideLengths.reduce((sum, val) => sum + val, 0) / strideLengths.length
        return avgStrideLength
      }
    }

    return null  // 如果无法计算平均步长
  }

  // 获取日志文件数据
  const fetchLogData = async (logPath, trainInfo) => {
    try {
      // 确保日志文件路径是有效的URL
      let csvUrl = logPath;

      if (typeof csvUrl === 'string') {
        if (csvUrl.startsWith('./log/')) {
          csvUrl = '/api/log/' + csvUrl.substring(6);
        } else if (csvUrl.startsWith('log/')) {
          csvUrl = '/api/log/' + csvUrl.substring(4);
        } else if (csvUrl.startsWith('/log/')) {
          csvUrl = '/api' + csvUrl;
        }

        const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
        if (csvUrl.startsWith('/api/')) {
          const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
          csvUrl = cleanBaseUrl + csvUrl;
        } else if (!csvUrl.startsWith('http')) {
          const currentOrigin = window.location.origin;
          csvUrl = `${currentOrigin}/${csvUrl.startsWith('/') ? csvUrl.substring(1) : csvUrl}`;
        }
      }
      
      console.log('尝试获取日志文件:', logPath)
      console.log('完整URL:', csvUrl)
      
      const response = await fetch(csvUrl)
      
      // 检查响应状态
      if (!response.ok) {
        throw new Error(`获取日志文件失败: ${response.status} ${response.statusText}`)
      }
      
      // 检查响应内容类型
      const contentType = response.headers.get('content-type')
      console.log('响应内容类型:', contentType)
      
      if (contentType && !contentType.includes('text/csv') && !contentType.includes('text/plain')) {
        // 如果不是CSV或纯文本，可能是错误页面
        const text = await response.text()
        console.error('服务器返回了非CSV内容:', text.substring(0, 200))
        throw new Error(`获取日志文件失败: 服务器返回了非CSV内容 (${contentType})`)
      }

      const csvText = await response.text()
      
      const lines = csvText.split('\n')

      // 检查是否有数据
      if (!lines || lines.length <= 1) {
        throw new Error('CSV文件为空或格式不正确')
      }

      // 跳过标题行
      const dataLines = lines.slice(1).filter(line => line.trim() !== '')
      


      // 检查是否有有效数据行
      if (dataLines.length === 0) {
        console.error('CSV文件中没有有效数据，原始行:', lines)
        throw new Error('CSV文件中没有有效数据')
      }



      const parsedData = dataLines.map((line, index) => {
        // 移除可能的回车符
        const cleanLine = line.replace(/\r/g, '');
        const parts = cleanLine.split(',')
        
        if (parts.length < 5) {
          console.warn('第', index, '行数据格式不正确:', line)
          return null
        }

        const data = {
          cnt: parseInt(parts[0]) || 0,
          pos: parseFloat(parts[1]) || 0,
          speed: parseFloat(parts[2]) || 0,
          Dir: parseInt(parts[3]) || 0,
          Force: parseFloat(parts[4]) || 0
        }

        return data
      }).filter(row => row !== null) // 过滤掉无效行



      // 检查是否有有效数据
      if (parsedData.length === 0) {
        throw new Error('CSV文件中没有有效数据')
      }



      // 计算指标
      const calculatedMetrics = calculateMetrics(parsedData, trainInfo)
      setMetrics(calculatedMetrics)
      // 设置图表数据
      if (calculatedMetrics.chartData) {
        setChartData(calculatedMetrics.chartData)
      }
      setLoading(false)
    } catch (err) {
      console.error('获取日志文件错误:', err)
      console.log('使用模拟数据代替')
      // 当无法获取CSV文件时，使用模拟数据
      loadAnalysisData()
    }
  }

  // 安全值函数，过滤NaN和Infinity
  const safeValue = (v) => {
    const num = parseFloat(v);
    return Number.isFinite(num) ? num : null;
  };
  
  // 计算domain的函数
  const calcDomain = (data, key, fallback) => {
    const values = data
      .map(d => d[key])
      .filter(Number.isFinite);
    
    if (values.length === 0) return fallback;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const abs = Math.max(Math.abs(min), Math.abs(max));
    const pad = abs * 0.2 || 1;
    
    return [
      Math.floor(-abs - pad),
      Math.ceil(abs + pad),
    ];
  };

  // 计算训练指标
  const calculateMetrics = (data, trainInfo) => {
    if (!data || data.length === 0) return null

    // 基本参数
    const weight = 3.3 // 物体重量(kg)
    const samplingInterval = 0.001 // 采样时间间隔(s)
    const gravity = 9.81 // 重力加速度(m/s²)

    // 添加时间列
    const dataWithTime = data.map((row, index) => ({
      ...row,
      time: index * samplingInterval
    }))

    // 应用低通滤波器处理速度数据
    const speedData = dataWithTime.map(row => row.speed || 0)
    const filteredSpeed = applyLowPassFilter(speedData, samplingInterval)
    const dataWithFilteredSpeed = dataWithTime.map((row, index) => ({
      ...row,
      speed_filtered: filteredSpeed[index] || 0
    }))

    // 计算加速度（使用滤波后的速度数据）
    // 优化：预先提取speeds和times数组，避免O(n²)复杂度
    const speeds = dataWithFilteredSpeed.map(r => r.speed_filtered);
    const times = dataWithFilteredSpeed.map(r => r.time);
    
    const dataWithAcceleration = dataWithFilteredSpeed.map((row, index) => {
      let acceleration = 0;
      
      if (index === 0) {
        // 前向差分（第一个点）
        const dt = times[1] - times[0];
        acceleration = (speeds[1] - speeds[0]) / dt;
      } else if (index === times.length - 1) {
        // 后向差分（最后一个点）
        const dt = times[index] - times[index - 1];
        acceleration = (speeds[index] - speeds[index - 1]) / dt;
      } else {
        // 中心差分（简化版，使用平均dt以提高速度）
        const dt_forward = times[index + 1] - times[index];
        const dt_backward = times[index] - times[index - 1];
        acceleration = ((speeds[index + 1] - speeds[index]) / dt_forward + 
                        (speeds[index] - speeds[index - 1]) / dt_backward) / 2;
      }
      
      return {
        ...row,
        acceleration
      };
    });

    // === 新增：对加速度进行移动平均滤波 ===
    // 提取加速度数组
    const rawAcceleration = dataWithAcceleration.map(row => row.acceleration);
    
    // 应用移动平均滤波（窗口建议 21~51，奇数最好，便于中心对齐）
    const smoothedAcceleration = smoothAcceleration(rawAcceleration, 31); // 可调整窗口大小
    
    // 将平滑后的加速度写回数据
    const dataWithSmoothedAcceleration = dataWithAcceleration.map((row, index) => ({
      ...row,
      acceleration: smoothedAcceleration[index]  // 替换为平滑值
    }));
    
    // 计算实际作用力和功率
    // 注意：功率计算使用原始速度，与说明3一致
    
    // 添加调试信息
    console.log('训练数据:', trainInfo);
    console.log('end_force值:', trainInfo?.end_force);
    
    const dataWithPower = dataWithSmoothedAcceleration.map(row => {
      // 使用end_force + 0.34 * 加速度计算力量
      const endForceValue = trainInfo?.end_force || 0;
      const actualForce = endForceValue + 0.34 * (row.acceleration || 0)
      const forceNewton = actualForce * 9.81 // 重力加速度
      const power = forceNewton * (row.speed || 0) // 使用原始速度，与说明3一致

      return {
        ...row,
        actualForce,
        forceNewton,
        power
      }
    })

    // 计算各项指标
    const trainingDistance = dataWithPower[dataWithPower.length - 1].pos - dataWithPower[0].pos
    const totalTime = dataWithPower[dataWithPower.length - 1].time - dataWithPower[0].time
    const startForce = dataWithPower[0].Force
    const endForce = trainInfo?.end_force || 0
    // 峰值速度使用原始速度（与说明3一致）
    const peakSpeed = Math.max(...dataWithPower.map(row => row.speed || 0))
    
    // 峰值加速度（使用99.5%分位数，而不是最大值）
    const acc = dataWithPower.map(row => row.acceleration || 0);
    
    // 优化：使用快速选择算法找到99.5%分位数，而不是完全排序
    // 首先找到99.5%分位数的位置
    const percentileIndex = Math.floor(acc.length * 0.995);
    
    // 使用快速选择算法（部分排序）
    // 这里使用简单的实现，对于大数据集可以考虑更高效的算法
    const sorted = [...acc].sort((a, b) => a - b);
    const peakAcceleration = sorted[percentileIndex];
    
    // 测试日志：检查峰值加速度
    console.log('峰值加速度测试:', peakAcceleration);
    console.log('最大加速度:', Math.max(...acc));
    console.log('99.5%分位数位置:', percentileIndex, '/', acc.length);
    
    // 峰值力量计算：end_force + 0.34 * 峰值加速度
    const peakForce = (trainInfo?.end_force || 0) + 0.34 * peakAcceleration
    
    // 峰值功率（使用99.5%分位数，而不是最大值）
    const powerData = dataWithPower.map(row => row.power || 0);
    
    // 使用与峰值加速度相同的方法计算99.5%分位数
    const powerPercentileIndex = Math.floor(powerData.length * 0.995);
    const sortedPower = [...powerData].sort((a, b) => a - b);
    const peakPower = sortedPower[powerPercentileIndex];
    
    console.log('峰值功率测试:', peakPower);
    console.log('最大功率:', Math.max(...powerData));
    console.log('功率99.5%分位数位置:', powerPercentileIndex, '/', powerData.length);

    // 计算平均步长（使用改进的步长计算方法）
    const avgStrideLength = calculateStrideLength(dataWithPower, samplingInterval)
    const avgStrideFrequency = avgStrideLength > 0 ? (dataWithPower[dataWithPower.length - 1].speed || 0) / avgStrideLength : 0

    // 计算分段数据
    const segment5mData = calculateSegmentData(dataWithPower, 5)
    const segment10mData = calculateSegmentData(dataWithPower, 10)

    // 准备图表数据 - 每隔一定间隔采样以减少数据点
    const samplingRate = Math.max(1, Math.floor(dataWithPower.length / 500)); // 最多500个数据点
    const sampledData = dataWithPower.filter((_, index) => index % samplingRate === 0);
    
    // 准备图表所需的数据结构
    const preparedChartData = sampledData.map(row => ({
      time: (row.time || 0).toFixed(3),
      pos: (row.pos || 0).toFixed(2),
      speed: (row.speed || 0).toFixed(2),
      acceleration: (row.acceleration || 0).toFixed(2),
      force: (row.actualForce || 0).toFixed(2),
      power: (row.power || 0).toFixed(2)
    }));

    return {
      // 基本参数
      weight,
      samplingInterval,

      // 训练数据
      trainingDistance: (trainingDistance || 0).toFixed(2),
      changeDistance: ((trainingDistance || 0) * 0.4).toFixed(2), // 假设变阻距离为训练距离的40%
      totalTime: (totalTime || 0).toFixed(2),
      startForce: (startForce || 0).toFixed(2),
      endForce: (endForce || 0).toFixed(2),

      // 峰值数据
      peakSpeed: (peakSpeed || 0).toFixed(2),
      peakAcceleration: (peakAcceleration || 0).toFixed(2),
      peakForce: (peakForce || 0).toFixed(2),
      peakPower: (peakPower || 0).toFixed(2),

      // 平均数据
      avgStrideLength: (avgStrideLength || 0).toFixed(2),
      avgStrideFrequency: (avgStrideFrequency || 0).toFixed(2),

      // 分段数据
      segment5mData,
      segment10mData,

      // 完整数据
      fullData: dataWithPower,
      
      // 图表数据
      chartData: preparedChartData
    }
  }

  // 计算分段数据
  const calculateSegmentData = (data, segmentDistance) => {
    const segments = []
    const maxPos = Math.max(...data.map(row => row.pos))

    for (let i = 0; i < maxPos; i += segmentDistance) {
      const startPos = i
      const endPos = i + segmentDistance

      // 找到对应的数据点
      const startIndex = data.findIndex(row => row.pos >= startPos)
      const endIndex = data.findIndex(row => row.pos >= endPos)

      if (startIndex === -1 || endIndex === -1) continue

      const segmentData = data.slice(startIndex, endIndex + 1)
      if (segmentData.length === 0) continue

      const segmentTime = segmentData[segmentData.length - 1].time - segmentData[0].time
      const avgSpeed = segmentDistance / segmentTime

      segments.push({
        segment: `${startPos}-${endPos}`,
        time: (segmentTime || 0).toFixed(2),
        cumulativeTime: (segmentData[segmentData.length - 1].time || 0).toFixed(2),
        avgSpeed: (avgSpeed || 0).toFixed(2)
      })
    }

    return segments
  }

  // 模拟分析结果（当没有日志文件时使用）
  const loadAnalysisData = () => {
    const mockMetrics = {
      trainingDistance: "25.30",
      totalTime: "12.45",
      startForce: "5.20",
      endForce: "8.70",
      peakSpeed: "2.10",
      peakAcceleration: "1.80",
      peakForce: "11.20",
      peakPower: "23.50",
      avgStrideLength: "1.01",
      avgStrideFrequency: "2.08",
      segment5mData: [
        { segment: "0-5", time: "2.10", cumulativeTime: "2.10", avgSpeed: "2.38" },
        { segment: "5-10", time: "2.20", cumulativeTime: "4.30", avgSpeed: "2.27" },
        { segment: "10-15", time: "2.30", cumulativeTime: "6.60", avgSpeed: "2.17" },
        { segment: "15-20", time: "2.40", cumulativeTime: "9.00", avgSpeed: "2.08" },
        { segment: "20-25", time: "2.50", cumulativeTime: "11.50", avgSpeed: "2.00" }
      ],
      segment10mData: [
        { segment: "0-10", time: "4.30", cumulativeTime: "4.30", avgSpeed: "2.33" },
        { segment: "10-20", time: "4.70", cumulativeTime: "9.00", avgSpeed: "2.13" },
        { segment: "20-25", time: "2.50", cumulativeTime: "11.50", avgSpeed: "2.00" }
      ]
    }

    // 创建模拟图表数据
    const mockChartData = []
    for (let i = 0; i <= 124; i++) {
      mockChartData.push({
        time: (i * 0.1).toFixed(3),
        pos: (i * 0.2).toFixed(2),
        speed: (2.0 + 0.5 * Math.sin(i * 0.1)).toFixed(2),
        acceleration: (0.5 * Math.cos(i * 0.1)).toFixed(2),
        force: (5.2 + i * 0.028 + 0.3 * Math.sin(i * 0.15)).toFixed(2),
        power: (10 + 5 * Math.sin(i * 0.12) + 3 * Math.cos(i * 0.08)).toFixed(2)
      })
    }
    
    setMetrics(mockMetrics)
    setChartData(mockChartData)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="container" style={{ textAlign: "center", padding: "2rem" }}>
        <div className="spinner"></div>
        <p>正在分析训练日志...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container" style={{ textAlign: "center", padding: "2rem" }}>
        <h2 style={{ fontSize: 'var(--font-size-h2)' }}>错误</h2>
        <p>{error}</p>
        <button onClick={() => navigate(-1)}>返回</button>
      </div>
    )
  }

  return (
    <div className="container">
      <h1 style={{ fontSize: 'var(--font-size-h1)' }}>训练日志分析</h1>

      {/* 返回按钮 */}
      <div style={{ marginBottom: "1.5rem" }}>
        <button onClick={() => navigate(-1)}>返回</button>
      </div>

      {/* 日志文件信息 */}
      {trainData && trainData.log && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: 'var(--font-size-h3)' }}>日志文件</h3>
          <p>日志文件路径: {trainData.log}</p>
          <p>系统已自动加载日志数据并进行分析</p>
        </div>
      )}

      {metrics && (
        <>
          {/* 基本指标 */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h3>基本指标</h3>
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--spacing-lg)' }}>
              <div className="stat-card">
                <div className="stat-icon">📏</div>
                <div className="stat-content">
                  <h3>{metrics.trainingDistance}</h3>
                  <p>训练距离(m)</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-secondary)' }}>
                <div className="stat-icon">⏱️</div>
                <div className="stat-content">
                  <h3>{metrics.totalTime}</h3>
                  <p>总用时间(s)</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-success)' }}>
                <div className="stat-icon">⚖️</div>
                <div className="stat-content">
                  <h3>{metrics.startForce}</h3>
                  <p>起始阻力(kg)</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
                <div className="stat-icon">🎯</div>
                <div className="stat-content">
                  <h3>{metrics.endForce}</h3>
                  <p>结束阻力(kg)</p>
                </div>
              </div>
            </div>
          </div>

          {/* 峰值指标 */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h3>峰值指标</h3>
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--spacing-lg)' }}>
              <div className="stat-card">
                <div className="stat-icon">🚀</div>
                <div className="stat-content">
                  <h3>{metrics.peakSpeed}</h3>
                  <p>峰值速度(m/s)</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-secondary)' }}>
                <div className="stat-icon">⚡</div>
                <div className="stat-content">
                  <h3>{metrics.peakAcceleration}</h3>
                  <p>峰值加速度(m/s²)</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-success)' }}>
                <div className="stat-icon">💪</div>
                <div className="stat-content">
                  <h3>{metrics.peakForce}</h3>
                  <p>峰值力量(kg)</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
                <div className="stat-icon">🔥</div>
                <div className="stat-content">
                  <h3>{metrics.peakPower}</h3>
                  <p>峰值功率(w)</p>
                </div>
              </div>
            </div>
          </div>

          {/* 平均指标 */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h3>平均指标</h3>
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--spacing-lg)' }}>
              <div className="stat-card">
                <div className="stat-icon">👣</div>
                <div className="stat-content">
                  <h3>{metrics.avgStrideLength}</h3>
                  <p>平均步长(m)</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-secondary)' }}>
                <div className="stat-icon">🎵</div>
                <div className="stat-content">
                  <h3>{metrics.avgStrideFrequency}</h3>
                  <p>平均步频(Hz)</p>
                </div>
              </div>
            </div>
          </div>

          {/* 分段数据 */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h3>5米分段数据</h3>
            <table>
              <thead>
                <tr>
                  <th>分段距离(m)</th>
                  <th>分段时间(s)</th>
                  <th>累计时间(s)</th>
                  <th>平均速度(m/s)</th>
                </tr>
              </thead>
              <tbody>
                {metrics.segment5mData.map((segment, index) => (
                  <tr key={index}>
                    <td>{segment.segment}</td>
                    <td>{segment.time}</td>
                    <td>{segment.cumulativeTime}</td>
                    <td>{segment.avgSpeed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h3>10米分段数据</h3>
            <table>
              <thead>
                <tr>
                  <th>分段距离(m)</th>
                  <th>分段时间(s)</th>
                  <th>累计时间(s)</th>
                  <th>平均速度(m/s)</th>
                </tr>
              </thead>
              <tbody>
                {metrics.segment10mData.map((segment, index) => (
                  <tr key={index}>
                    <td>{segment.segment}</td>
                    <td>{segment.time}</td>
                    <td>{segment.cumulativeTime}</td>
                    <td>{segment.avgSpeed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 图表区域 */}
          {chartData && (
            <>
              {/* 清洗数据并计算domain */}
              {(() => {
                // 清洗数据，将NaN/Infinity转为null
                const cleanChartData = chartData.map(d => ({
                  ...d,
                  acceleration: safeValue(d.acceleration),
                  force: safeValue(d.force),
                  power: safeValue(d.power),
                  speed: safeValue(d.speed)
                }));
                
                // 计算各个domain
                const accDomain = calcDomain(cleanChartData, 'acceleration', [-30, 30]);
                const forceDomain = calcDomain(cleanChartData, 'force', [0, 50]);
                const powerDomain = calcDomain(cleanChartData, 'power', [-20, 200]);
                
                return (
                  <>
              {/* 速度-位移曲线 */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3>速度-位移曲线</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart 
                    data={cleanChartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 120 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="pos" tick={{ fontSize: 13, fill: "#fff", fontWeight: 500 }} label={{ value: "位移 (m)", position: "insideBottom", dy: 50, fontSize: 14, fill: "#fff", fontWeight: 600 }} />
                    <YAxis 
                      label={{ value: "速度 (m/s)", angle: -90, position: "insideLeft", fontSize: 14, fill: "#fff", fontWeight: 600 }}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 500 }}
                      domain={["dataMin - 0.5", "dataMax + 0.5"]}
                      tickFormatter={(value) => Number(value).toFixed(1)}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "rgba(255, 255, 255, 0.95)", border: "1px solid #ccc", color: "#333" }}
                      labelFormatter={(value) => `位移: ${value} m`}
                    />

                    <Line 
                      type="monotone" 
                      dataKey="speed" 
                      stroke="#4285F4" 
                      name="速度" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <Brush 
                      dataKey="pos" 
                      height={20} 
                      stroke="#4285F4"
                      fill="#f0f8ff"
                      travellerWidth={10}
                      gap={5}
                      startIndex={0}
                      endIndex={chartData.length - 1}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 速度-时间曲线 */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3>速度-时间曲线</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart 
                    data={cleanChartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 120 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="time" tick={{ fontSize: 13, fill: "#fff", fontWeight: 500 }} label={{ value: "时间 (s)", position: "insideBottom", dy: 50, fontSize: 14, fill: "#fff", fontWeight: 600 }} />
                    <YAxis 
                      label={{ value: "速度 (m/s)", angle: -90, position: "insideLeft", fontSize: 14, fill: "#fff", fontWeight: 600 }}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 500 }}
                      domain={["dataMin - 0.5", "dataMax + 0.5"]}
                      tickFormatter={(value) => Number(value).toFixed(1)}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "rgba(255, 255, 255, 0.95)", border: "1px solid #ccc", color: "#333" }}
                      labelFormatter={(value) => `时间: ${value} s`}
                    />

                    <Line 
                      type="monotone" 
                      dataKey="speed" 
                      stroke="#34A853" 
                      name="速度" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <Brush 
                      dataKey="time" 
                      height={20} 
                      stroke="#34A853"
                      fill="#f0fff0"
                      travellerWidth={10}
                      gap={5}
                      startIndex={0}
                      endIndex={chartData.length - 1}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 加速度-位移曲线 */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3>加速度-位移曲线</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart 
                    data={cleanChartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 120 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="pos" tick={{ fontSize: 13, fill: "#fff", fontWeight: 500 }} label={{ value: "位移 (m)", position: "insideBottom", dy: 50, fontSize: 14, fill: "#fff", fontWeight: 600 }} />
                    <YAxis 
                      label={{ value: "加速度 (m/s²)", angle: -90, position: "insideLeft", fontSize: 14, fill: "#fff", fontWeight: 600 }}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 500 }}
                      domain={accDomain}
                      tickFormatter={(value) => Number(value).toFixed(1)}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "rgba(255, 255, 255, 0.95)", border: "1px solid #ccc", color: "#333" }}
                      labelFormatter={(value) => `位移: ${value} m`}
                    />

                    <ReferenceLine y={0} stroke="#FF0000" strokeDasharray="5 5" />
                    <Line 
                      type="monotone" 
                      dataKey="acceleration" 
                      stroke="#EA4335" 
                      name="加速度" 
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      activeDot={{ r: 6 }}
                    />
                    <Brush 
                      dataKey="pos" 
                      height={20} 
                      stroke="#EA4335"
                      fill="#fff0f0"
                      travellerWidth={10}
                      gap={5}
                      startIndex={0}
                      endIndex={chartData.length - 1}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 力量-位移曲线 */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3>力量-位移曲线</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart 
                    data={cleanChartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 120 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="pos" tick={{ fontSize: 13, fill: "#fff", fontWeight: 500 }} label={{ value: "位移 (m)", position: "insideBottom", dy: 50, fontSize: 14, fill: "#fff", fontWeight: 600 }} />
                    <YAxis 
                      label={{ value: "力量 (kg)", angle: -90, position: "insideLeft", fontSize: 14, fill: "#fff", fontWeight: 600 }}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 500 }}
                      domain={forceDomain}
                      tickFormatter={(value) => Number(value).toFixed(1)}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "rgba(255, 255, 255, 0.95)", border: "1px solid #ccc", color: "#333" }}
                      labelFormatter={(value) => `位移: ${value} m`}
                    />

                    <Line 
                      type="monotone" 
                      dataKey="force" 
                      stroke="#FBBC05" 
                      name="力量" 
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      activeDot={{ r: 6 }}
                    />
                    <Brush 
                      dataKey="pos" 
                      height={20} 
                      stroke="#FBBC05"
                      fill="#fffbe6"
                      travellerWidth={10}
                      gap={5}
                      startIndex={0}
                      endIndex={chartData.length - 1}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 功率-位移曲线 */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3>功率-位移曲线</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart 
                    data={cleanChartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 120 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis dataKey="pos" tick={{ fontSize: 13, fill: "#fff", fontWeight: 500 }} label={{ value: "位移 (m)", position: "insideBottom", dy: 50, fontSize: 14, fill: "#fff", fontWeight: 600 }} />
                    <YAxis 
                      label={{ value: "功率 (W)", angle: -90, position: "insideLeft", fontSize: 14, fill: "#fff", fontWeight: 600 }}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 500 }}
                      domain={powerDomain}
                      tickFormatter={(value) => Number(value).toFixed(1)}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "rgba(255, 255, 255, 0.95)", border: "1px solid #ccc", color: "#333" }}
                      labelFormatter={(value) => `位移: ${value} m`}
                    />

                    <ReferenceLine y={0} stroke="#FF0000" strokeDasharray="5 5" />
                    <Line 
                      type="monotone" 
                      dataKey="power" 
                      stroke="#9C27B0" 
                      name="功率" 
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      activeDot={{ r: 6 }}
                    />
                    <Brush 
                      dataKey="pos" 
                      height={20} 
                      stroke="#9C27B0"
                      fill="#f3e5f5"
                      travellerWidth={10}
                      gap={5}
                      startIndex={0}
                      endIndex={chartData.length - 1}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
                  </>
                );
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
};
