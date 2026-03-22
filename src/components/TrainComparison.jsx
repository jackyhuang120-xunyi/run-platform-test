import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getTrainById } from '../services/api'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'
import Fili from 'fili'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

export default function TrainComparison() {
  const navigate = useNavigate()
  const location = useLocation()
  const [trainIds, setTrainIds] = useState([])
  const [trainData, setTrainData] = useState([])
  const [trainMetrics, setTrainMetrics] = useState([]) // 存储每个训练的指标
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chartData, setChartData] = useState([])

  // 从URL参数获取训练ID
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const ids = params.get('ids')
    if (ids) {
      const idArray = ids.split(',').map(id => parseInt(id))
      setTrainIds(idArray)
    } else {
      setError('缺少训练记录ID参数')
      setLoading(false)
    }
  }, [location])

  // 应用低通滤波器 - 使用简单的一阶RC低通滤波器
  const applyLowPassFilter = (data, dt, cutoffFreq = 10.0) => {
    if (!data || data.length === 0) return []

    // 简单的低通滤波器实现
    const RC = 1.0 / (2 * Math.PI * cutoffFreq)
    const alpha = dt / (RC + dt)

    const filtered = [data[0]]
    for (let i = 1; i < data.length; i++) {
      filtered.push(alpha * data[i] + (1 - alpha) * filtered[i-1])
    }

    return filtered
  }

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

  // 计算训练指标
  const calculateMetrics = (data) => {
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

    // 计算实际作用力和功率
    const initialForce = dataWithAcceleration[0]?.Force || 0 // 使用起始力量作为结束力量
    const dataWithPower = dataWithAcceleration.map(row => {
      const actualForce = initialForce + 0.34 * (row.acceleration || 0)
      const forceNewton = actualForce * gravity
      const power = forceNewton * (row.speed || 0)

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
    const endForce = dataWithPower[dataWithPower.length - 1].Force
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

    // 峰值力量计算：起始阻力 + 0.34 * 峰值加速度
    const peakForce = initialForce + 0.34 * peakAcceleration

    // 峰值功率（使用99.5%分位数）
    const powerData = dataWithPower.map(row => row.power || 0)
    const powerPercentileIndex = Math.floor(powerData.length * 0.995)
    const sortedPower = [...powerData].sort((a, b) => a - b)
    const peakPower = sortedPower[powerPercentileIndex]

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

  // 获取所有训练记录数据
  useEffect(() => {
    if (trainIds.length > 0) {
      console.log('开始获取训练记录，IDs:', trainIds);
      setLoading(true)
      Promise.all(trainIds.map(id => {
        console.log('获取训练记录ID:', id);
        return getTrainById(id)
      }))
        .then(data => {
          console.log('成功获取训练记录数据:', data);
          setTrainData(data)
          // 如果有日志文件，获取日志数据
          const logPromises = data.filter(train => train.log).map(train => {
            console.log('获取训练日志:', train.log);
            // 添加API前缀到日志文件路径
            const logUrl = train.log.startsWith('./') ? train.log.replace('./', '/') : train.log;
            console.log('修改后的日志路径:', logUrl);
            return fetch(logUrl).then(res => {
              if (!res.ok) {
                console.error('获取日志失败:', train.log, res.status);
                throw new Error(`获取日志失败: ${res.status}`)
              }
              return res.text()
            }).then(csvText => {
              const lines = csvText.split('\n')
              const dataLines = lines.slice(1).filter(line => line.trim() !== '')
              const parsedData = dataLines.map((line, index) => {
                const cleanLine = line.replace(/\r/g, '');
                const parts = cleanLine.split(',')
                if (parts.length < 5) return null
                return {
                  cnt: parseInt(parts[0]) || 0,
                  pos: parseFloat(parts[1]) || 0,
                  speed: parseFloat(parts[2]) || 0,
                  Dir: parseInt(parts[3]) || 0,
                  Force: parseFloat(parts[4]) || 0
                }
              }).filter(row => row !== null)

              // 计算训练指标
              const metrics = calculateMetrics(parsedData)
              return {
                trainId: train.id,
                trainData: train,
                logData: parsedData,
                metrics: metrics
              }
            }).catch(err => {
              console.error(`获取训练 ${train.id} 日志失败:`, err)
              return {
                trainId: train.id,
                trainData: train,
                logData: null,
                metrics: null,
                error: err.message
              }
            })
          })

          Promise.all(logPromises).then(results => {
            const validResults = results.filter(result => result.metrics !== null)

            if (validResults.length > 0) {
              // 存储每个训练的指标
              setTrainMetrics(validResults)

              // 准备图表数据
              // 找到所有训练中最长的数据长度
              const maxDataLength = Math.max(...validResults.map(r => r.metrics.chartData.length))

              // 创建合并的图表数据
              const mergedChartData = []
              for (let i = 0; i < maxDataLength; i++) {
                const dataPoint = { time: i } // 使用索引作为时间点

                validResults.forEach(result => {
                  const chartData = result.metrics.chartData
                  if (i < chartData.length) {
                    const point = chartData[i]
                    // 为每个训练的每个指标添加数据
                    dataPoint[`time_${result.trainId}`] = point.time
                    dataPoint[`pos_${result.trainId}`] = point.pos
                    dataPoint[`speed_${result.trainId}`] = point.speed
                    dataPoint[`acceleration_${result.trainId}`] = point.acceleration
                    dataPoint[`force_${result.trainId}`] = point.force
                    dataPoint[`power_${result.trainId}`] = point.power
                  }
                })

                mergedChartData.push(dataPoint)
              }

              setChartData(mergedChartData)
            } else {
              setError('没有有效的日志数据可供分析')
            }
            setLoading(false)
          })
        })
        .catch(err => {
          console.error('获取训练记录失败:', err);
          console.error('错误详情:', err.response ? err.response.data : err.message);
          setError('获取训练记录失败: ' + err.message)
          setLoading(false)
        })
    }
  }, [trainIds])

  // 生成图表选项
  const getChartOptions = (title) => {
    // 根据标题确定x轴和y轴标签
    let xLabel = '时间 (s)';
    let yLabel = '';
    
    if (title.includes('位置')) {
      xLabel = '时间 (s)';
      yLabel = '位置 (m)';
    } else if (title.includes('速度')) {
      xLabel = '时间 (s)';
      yLabel = '速度 (m/s)';
    } else if (title.includes('加速度')) {
      xLabel = '时间 (s)';
      yLabel = '加速度 (m/s²)';
    } else if (title.includes('力量')) {
      xLabel = '时间 (s)';
      yLabel = '力量 (kg)';
    } else if (title.includes('功率')) {
      xLabel = '时间 (s)';
      yLabel = '功率 (W)';
    }
    
    // 获取训练ID用于标题
    const trainIds = trainMetrics.map(t => t.trainId).join('-');
    const fullTitle = `${title} (训练${trainIds})`;
    
    return {
      scales: {
        x: {
          title: {
            display: true,
            text: xLabel,
            color: '#fff',
            font: {
              size: 14,
              weight: 'bold'
            }
          },
          ticks: {
            color: '#fff',
            font: {
              size: 13,
              weight: 500
            }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        y: {
          title: {
            display: true,
            text: yLabel,
            color: '#fff',
            font: {
              size: 14,
              weight: 'bold'
            }
          },
          ticks: {
            color: '#fff',
            font: {
              size: 13,
              weight: 500
            }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
    },
    plugins: {
      legend: {
        labels: {
          color: '#fff',
          font: {
            size: 14,
            weight: 600
          }
        }
      },
      tooltip: {
        bodyFont: {
          size: 13
        },
        titleFont: {
          size: 14,
          weight: 600
        }
      },
      title: {
        display: true,
        text: fullTitle,
        color: '#fff',
        font: {
          size: 16,
          weight: 600
        }
      }
    },
    responsive: true,
    maintainAspectRatio: false
    };
  }

  // 计算所有训练的最大位移
  const calculateMaxPosition = () => {
    if (!trainMetrics || trainMetrics.length === 0) return 10
    let maxPos = 0
    trainMetrics.forEach(train => {
      if (train.metrics && train.metrics.chartData) {
        const trainMaxPos = Math.max(...train.metrics.chartData.map(d => parseFloat(d.pos) || 0))
        if (trainMaxPos > maxPos) {
          maxPos = trainMaxPos
        }
      }
    })
    return maxPos > 0 ? maxPos : 10
  }

  // 格式化时间函数
  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '-'
    try {
      const date = new Date(dateTimeStr)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
    } catch (e) {
      console.error('时间格式化错误:', e)
      return dateTimeStr
    }
  }

  // 获取训练类型文本
  const getTrainingTypeText = (type) => {
    const typeStr = String(type || '').trim()
    switch(typeStr) {
      case '1': return '抗阻训练'
      case '2': return '牵引训练'
      case '3': return '折返训练'
      default: return typeStr ? `类型${typeStr}` : '未知'
    }
  }

  // 获取训练类型徽章
  const getTrainingTypeBadge = (type) => {
    const typeStr = String(type || '').trim()
    switch(typeStr) {
      case '1': return <span className="status-badge" style={{background: '#FFF9C4', color: '#8D6E63', borderColor: '#F5F5DC'}}>{getTrainingTypeText(type)}</span>
      case '2': return <span className="status-badge" style={{background: '#E0F7FA', color: '#00838F', borderColor: '#B2EBF2'}}>{getTrainingTypeText(type)}</span>
      case '3': return <span className="status-badge" style={{background: '#EDE7F6', color: '#512DA8', borderColor: '#D1C4E9'}}>{getTrainingTypeText(type)}</span>
      default: return <span className="status-badge">{getTrainingTypeText(type)}</span>
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <h2>加载中...</h2>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="card">
          <h2>错误</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/trains')}>返回训练记录</button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
        <h2>训练记录对比分析</h2>
        <button className="btn btn-secondary" onClick={() => navigate('/trains')}>返回训练记录</button>
      </div>

      {/* 训练记录基本信息对比 */}
      <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h3>基本信息对比</h3>
        <div className="data-table" style={{ marginTop: 'var(--spacing-md)' }}>
          <table>
            <thead>
              <tr>
                <th>训练ID</th>
                <th>用户ID</th>
                <th>训练类型</th>
                <th>开始时间</th>
                <th>总用时(s)</th>
                <th>训练距离(m)</th>
                <th>峰值速度(m/s)</th>
                <th>达峰时间(s)</th>
                <th>达峰位置(m)</th>
              </tr>
            </thead>
            <tbody>
              {trainData.map(train => (
                <tr key={train.id}>
                  <td>{train.id}</td>
                  <td>{train.uid} {train.user_name ? `(${train.user_name})` : ''}</td>
                  <td>{getTrainingTypeBadge(train.type)}</td>
                  <td>{formatDateTime(train.begin_time)}</td>
                  <td>{train.total_time ? parseFloat(train.total_time).toFixed(2) : '-'}</td>
                  <td>{train.train_dis || '-'}</td>
                  <td>{(train.peak_speed || train.max_speed) ? parseFloat(train.peak_speed || train.max_speed).toFixed(2) : '-'}</td>
                  <td>{train.peak_time ? parseFloat(train.peak_time).toFixed(2) : '-'}</td>
                  <td>{train.peak_pos ? parseFloat(train.peak_pos).toFixed(2) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 训练指标对比 */}
      {trainMetrics.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
          <h3>训练指标对比</h3>
          <div className="data-table" style={{ marginTop: 'var(--spacing-md)' }}>
            <table>
              <thead>
                <tr>
                  <th>指标</th>
                  {trainMetrics.map(train => (
                    <th key={`train-${train.trainId}`}>
                      训练 {train.trainId} ({train.trainData.user_name ? `${train.trainData.user_name}` : ''})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>起始阻力 (kg)</td>
                  {trainMetrics.map(train => (
                    <td key={`start-force-${train.trainId}`}>{train.metrics.startForce}</td>
                  ))}
                </tr>
                <tr>
                  <td>结束阻力 (kg)</td>
                  {trainMetrics.map(train => (
                    <td key={`end-force-${train.trainId}`}>{train.metrics.endForce}</td>
                  ))}
                </tr>
                <tr>
                  <td>峰值速度 (m/s)</td>
                  {trainMetrics.map(train => (
                    <td key={`peak-speed-${train.trainId}`}>{train.metrics.peakSpeed}</td>
                  ))}
                </tr>
                <tr>
                  <td>峰值加速度 (m/s²)</td>
                  {trainMetrics.map(train => (
                    <td key={`peak-acceleration-${train.trainId}`}>{train.metrics.peakAcceleration}</td>
                  ))}
                </tr>
                {/* 删除总用时，因为基本信息中已经有了 */}
                <tr>
                  <td>峰值力量 (kg)</td>
                  {trainMetrics.map(train => (
                    <td key={`peak-force-${train.trainId}`}>{train.metrics.peakForce}</td>
                  ))}
                </tr>
                <tr>
                  <td>峰值功率 (W)</td>
                  {trainMetrics.map(train => (
                    <td key={`peak-power-${train.trainId}`}>{train.metrics.peakPower}</td>
                  ))}
                </tr>
                <tr>
                  <td>平均步长 (m)</td>
                  {trainMetrics.map(train => (
                    <td key={`avg-stride-length-${train.trainId}`}>{train.metrics.avgStrideLength}</td>
                  ))}
                </tr>
                <tr>
                  <td>平均步频 (Hz)</td>
                  {trainMetrics.map(train => (
                    <td key={`avg-stride-frequency-${train.trainId}`}>{train.metrics.avgStrideFrequency}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 分段数据对比 */}
      {trainMetrics.length > 0 && trainMetrics[0].metrics.segment5mData && trainMetrics[0].metrics.segment5mData.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
          <h3>5米分段数据对比</h3>
          <div className="data-table" style={{ marginTop: 'var(--spacing-md)' }}>
            <table>
              <thead>
                <tr>
                  <th>分段</th>
                  {trainMetrics.map(train => (
                    <th key={`train-${train.trainId}`} colSpan="2">
                      训练 {train.trainId} ({train.trainData.user_name ? `${train.trainData.user_name}` : ''})
                    </th>
                  ))}
                </tr>
                <tr>
                  <th></th>
                  {trainMetrics.map(train => (
                    <React.Fragment key={`train-${train.trainId}-headers`}>
                      <th>用时(s)</th>
                      <th>平均速度(m/s)</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trainMetrics[0].metrics.segment5mData.map((segment, index) => (
                  <tr key={`segment-${index}`}>
                    <td>{segment.segment}</td>
                    {trainMetrics.map(train => {
                      const segmentData = train.metrics.segment5mData[index]
                      return (
                        <React.Fragment key={`train-${train.trainId}-segment-${index}`}>
                          <td>{segmentData ? segmentData.time : '-'}</td>
                          <td>{segmentData ? segmentData.avgSpeed : '-'}</td>
                        </React.Fragment>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 10米分段数据对比 */}
      {trainMetrics.length > 0 && trainMetrics[0].metrics.segment10mData && trainMetrics[0].metrics.segment10mData.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
          <h3>10米分段数据对比</h3>
          <div className="data-table" style={{ marginTop: 'var(--spacing-md)' }}>
            <table>
              <thead>
                <tr>
                  <th>分段</th>
                  {trainMetrics.map(train => (
                    <th key={`train-${train.trainId}`} colSpan="2">
                      训练 {train.trainId} ({train.trainData.user_name ? `${train.trainData.user_name}` : ''})
                    </th>
                  ))}
                </tr>
                <tr>
                  <th></th>
                  {trainMetrics.map(train => (
                    <React.Fragment key={`train-${train.trainId}-headers`}>
                      <th>用时(s)</th>
                      <th>平均速度(m/s)</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trainMetrics[0].metrics.segment10mData.map((segment, index) => (
                  <tr key={`segment10m-${index}`}>
                    <td>{segment.segment}</td>
                    {trainMetrics.map(train => {
                      const segmentData = train.metrics.segment10mData[index]
                      return (
                        <React.Fragment key={`train-${train.trainId}-segment10m-${index}`}>
                          <td>{segmentData ? segmentData.time : '-'}</td>
                          <td>{segmentData ? segmentData.avgSpeed : '-'}</td>
                        </React.Fragment>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 图表对比 */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
          <h3>指标对比图表</h3>
          <div style={{ height: '20px' }}></div>
          {/* 速度-位移对比 */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>

          <div style={{ marginTop: 'var(--spacing-md)', height: 400 }}>
            <Line 
              data={{
                labels: chartData.map((_, index) => index),
                datasets: trainMetrics.map((train, index) => ({
                  label: `训练 ${train.trainId} (${train.trainData.user_name || ''})`,
                  data: chartData.map(point => {
                    const x = point[`pos_${train.trainId}`];
                    const y = point[`speed_${train.trainId}`];
                    return x !== undefined && y !== undefined ? { x, y } : null;
                  }).filter(Boolean),
                  borderColor: [
                    '#2D9BFF', // 电光蓝
                    '#00E0B0', // 薄荷青
                    '#FF9A5A', // 活力橙
                    '#8AFF80', // 嫩芽绿
                    '#A68AFF', // 薰衣草紫
                    '#FF8AA3', // 灰调珊瑚
                    '#FF6B8B', // 珊瑚红
                    '#FFE066', // 柠檬黄
                    '#6FD6FF', // 冰晶蓝
                    '#4AE8C5'  // 数据青
                  ][index % 10],
                  backgroundColor: [
                    'rgba(45,155,255,0.2)', // 电光蓝
                    'rgba(0,224,176,0.2)',  // 薄荷青
                    'rgba(255,154,90,0.2)', // 活力橙
                    'rgba(138,255,128,0.2)',// 嫩芽绿
                    'rgba(166,138,255,0.2)',// 薰衣草紫
                    'rgba(255,138,163,0.2)',// 灰调珊瑚
                    'rgba(255,107,139,0.2)',// 珊瑚红
                    'rgba(255,224,102,0.2)',// 柠檬黄
                    'rgba(111,214,255,0.2)',// 冰晶蓝
                    'rgba(74,232,197,0.2)'  // 数据青
                  ][index % 10],
                  tension: 0.1,
                  showLine: true,
                  pointRadius: 0,
                  spanGaps: false
                }))
              }} 
              options={{
                scales: {
                  x: {
                    type: 'linear',
                    position: 'bottom',
                    min: 0,
                    max: calculateMaxPosition(),
                    title: {
                      display: true,
                      text: '位移 (m)',
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    },
                    ticks: {
                      color: '#fff',
                      font: {
                        size: 13,
                        weight: 500
                      },
                      callback: function(value) {
                        return Math.round(value);
                      }
                    },
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)'
                    }
                  },
                  y: {
                    title: {
                      display: true,
                      text: '速度 (m/s)',
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    },
                    ticks: {
                      color: '#fff',
                      font: {
                        size: 13,
                        weight: 500
                      },
                      callback: function(value) {
                        return Math.round(value);
                      }
                    },
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)'
                    }
                  }
                },
                parsing: {
                  xAxisKey: 'x',
                  yAxisKey: 'y'
                },
                plugins: {
                  legend: {
                    labels: {
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 600
                      }
                    }
                  },
                  tooltip: {
                    bodyFont: {
                      size: 13
                    },
                    titleFont: {
                      size: 14,
                      weight: 600
                    }
                  },
                  title: {
                    display: true,
                    text: '速度-位移对比',
                    color: '#fff',
                    font: {
                      size: 16,
                      weight: 600
                    }
                  }
                },
                responsive: true,
                maintainAspectRatio: false
              }} 
            />
          </div>
          </div>

          {/* 加速度-位移对比 */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div style={{ marginTop: 'var(--spacing-md)', height: 400 }}>
            <Line 
              data={{
                labels: chartData.map((_, index) => index),
                datasets: trainMetrics.map((train, index) => ({
                  label: `训练 ${train.trainId} (${train.trainData.user_name || ''})`,
                  data: chartData.map(point => {
                    const x = point[`pos_${train.trainId}`];
                    const y = point[`acceleration_${train.trainId}`];
                    return x !== undefined && y !== undefined ? { x, y } : null;
                  }).filter(Boolean),
                  borderColor: [
                    '#2D9BFF', // 电光蓝
                    '#00E0B0', // 薄荷青
                    '#FF9A5A', // 活力橙
                    '#8AFF80', // 嫩芽绿
                    '#A68AFF', // 薰衣草紫
                    '#FF8AA3', // 灰调珊瑚
                    '#FF6B8B', // 珊瑚红
                    '#FFE066', // 柠檬黄
                    '#6FD6FF', // 冰晶蓝
                    '#4AE8C5'  // 数据青
                  ][index % 10],
                  backgroundColor: [
                    'rgba(255,154,90,0.2)', // 活力橙
                    'rgba(138,255,128,0.2)',// 嫩芽绿
                    'rgba(166,138,255,0.2)',// 薰衣草紫
                    'rgba(255,138,163,0.2)',// 灰调珊瑚
                    'rgba(255,107,139,0.2)',// 珊瑚红
                    'rgba(255,224,102,0.2)',// 柠檬黄
                    'rgba(111,214,255,0.2)',// 冰晶蓝
                    'rgba(74,232,197,0.2)', // 数据青
                    'rgba(45,155,255,0.2)', // 电光蓝
                    'rgba(0,224,176,0.2)'  // 薄荷青
                  ][index % 10],
                  tension: 0.1,
                  spanGaps: false,
                  pointRadius: 0
                }))
              }} 
              options={{
                scales: {
                  x: {
                    type: 'linear',
                    position: 'bottom',
                    min: 0,
                    max: calculateMaxPosition(),
                    title: {
                      display: true,
                      text: '位移 (m)',
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    },
                    ticks: {
                      color: '#fff',
                      font: {
                        size: 13,
                        weight: 500
                      },
                      callback: function(value) {
                        return Math.round(value);
                      }
                    },
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)'
                    }
                  },
                  y: {
                    title: {
                      display: true,
                      text: '加速度 (m/s²)',
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    },
                    ticks: {
                      color: '#fff',
                      font: {
                        size: 13,
                        weight: 500
                      },
                      callback: function(value) {
                        return Math.round(value);
                      }
                    },
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)'
                    }
                  }
                },
                parsing: {
                  xAxisKey: 'x',
                  yAxisKey: 'y'
                },
                plugins: {
                  legend: {
                    labels: {
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 600
                      }
                    }
                  },
                  tooltip: {
                    bodyFont: {
                      size: 13
                    },
                    titleFont: {
                      size: 14,
                      weight: 600
                    }
                  },
                  title: {
                    display: true,
                    text: '加速度-位移对比',
                    color: '#fff',
                    font: {
                      size: 16,
                      weight: 600
                    }
                  }
                },
                responsive: true,
                maintainAspectRatio: false
              }} 
            />
          </div>
          </div>

          {/* 力量-位移对比 */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div style={{ marginTop: 'var(--spacing-md)', height: 400 }}>
            <Line 
              data={{
                labels: chartData.map((_, index) => index),
                datasets: trainMetrics.map((train, index) => ({
                  label: `训练 ${train.trainId} (${train.trainData.user_name || ''})`,
                  data: chartData.map(point => {
                    const x = point[`pos_${train.trainId}`];
                    const y = point[`force_${train.trainId}`];
                    return x !== undefined && y !== undefined ? { x, y } : null;
                  }).filter(Boolean),
                  borderColor: [
                    '#2D9BFF', // 电光蓝
                    '#00E0B0', // 薄荷青
                    '#FF9A5A', // 活力橙
                    '#8AFF80', // 嫩芽绿
                    '#A68AFF', // 薰衣草紫
                    '#FF8AA3', // 灰调珊瑚
                    '#FF6B8B', // 珊瑚红
                    '#FFE066', // 柠檬黄
                    '#6FD6FF', // 冰晶蓝
                    '#4AE8C5'  // 数据青
                  ][index % 10],
                  backgroundColor: [
                    'rgba(166,138,255,0.2)',// 薰衣草紫
                    'rgba(255,138,163,0.2)',// 灰调珊瑚
                    'rgba(255,107,139,0.2)',// 珊瑚红
                    'rgba(255,224,102,0.2)',// 柠檬黄
                    'rgba(111,214,255,0.2)',// 冰晶蓝
                    'rgba(74,232,197,0.2)', // 数据青
                    'rgba(45,155,255,0.2)', // 电光蓝
                    'rgba(0,224,176,0.2)',  // 薄荷青
                    'rgba(255,154,90,0.2)', // 活力橙
                    'rgba(138,255,128,0.2)' // 嫩芽绿
                  ][index % 10],
                  tension: 0.1,
                  spanGaps: false,
                  pointRadius: 0
                }))
              }} 
              options={{
                scales: {
                  x: {
                    type: 'linear',
                    position: 'bottom',
                    min: 0,
                    max: calculateMaxPosition(),
                    title: {
                      display: true,
                      text: '位移 (m)',
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    },
                    ticks: {
                      color: '#fff',
                      font: {
                        size: 13,
                        weight: 500
                      },
                      callback: function(value) {
                        return Math.round(value);
                      }
                    },
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)'
                    }
                  },
                  y: {
                    title: {
                      display: true,
                      text: '力量 (kg)',
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    },
                    ticks: {
                      color: '#fff',
                      font: {
                        size: 13,
                        weight: 500
                      },
                      callback: function(value) {
                        return Math.round(value);
                      }
                    },
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)'
                    }
                  }
                },
                parsing: {
                  xAxisKey: 'x',
                  yAxisKey: 'y'
                },
                plugins: {
                  legend: {
                    labels: {
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 600
                      }
                    }
                  },
                  tooltip: {
                    bodyFont: {
                      size: 13
                    },
                    titleFont: {
                      size: 14,
                      weight: 600
                    }
                  },
                  title: {
                    display: true,
                    text: '力量-位移对比',
                    color: '#fff',
                    font: {
                      size: 16,
                      weight: 600
                    }
                  }
                },
                responsive: true,
                maintainAspectRatio: false
              }} 
            />
          </div>
          </div>

          {/* 功率-位移对比 */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div style={{ marginTop: 'var(--spacing-md)', height: 400 }}>
            <Line 
              data={{
                labels: chartData.map((_, index) => index),
                datasets: trainMetrics.map((train, index) => ({
                  label: `训练 ${train.trainId} (${train.trainData.user_name || ''})`,
                  data: chartData.map(point => {
                    const x = point[`pos_${train.trainId}`];
                    const y = point[`power_${train.trainId}`];
                    return x !== undefined && y !== undefined ? { x, y } : null;
                  }).filter(Boolean),
                  borderColor: [
                    '#2D9BFF', // 电光蓝
                    '#00E0B0', // 薄荷青
                    '#FF9A5A', // 活力橙
                    '#8AFF80', // 嫩芽绿
                    '#A68AFF', // 薰衣草紫
                    '#FF8AA3', // 灰调珊瑚
                    '#FF6B8B', // 珊瑚红
                    '#FFE066', // 柠檬黄
                    '#6FD6FF', // 冰晶蓝
                    '#4AE8C5'  // 数据青
                  ][index % 10],
                  backgroundColor: [
                    'rgba(255,107,139,0.2)',// 珊瑚红
                    'rgba(255,224,102,0.2)',// 柠檬黄
                    'rgba(111,214,255,0.2)',// 冰晶蓝
                    'rgba(74,232,197,0.2)', // 数据青
                    'rgba(45,155,255,0.2)', // 电光蓝
                    'rgba(0,224,176,0.2)',  // 薄荷青
                    'rgba(255,154,90,0.2)', // 活力橙
                    'rgba(138,255,128,0.2)',// 嫩芽绿
                    'rgba(166,138,255,0.2)',// 薰衣草紫
                    'rgba(255,138,163,0.2)' // 灰调珊瑚
                  ][index % 10],
                  tension: 0.1,
                  spanGaps: false,
                  pointRadius: 0
                }))
              }} 
              options={{
                scales: {
                  x: {
                    type: 'linear',
                    position: 'bottom',
                    min: 0,
                    max: calculateMaxPosition(),
                    title: {
                      display: true,
                      text: '位移 (m)',
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    },
                    ticks: {
                      color: '#fff',
                      font: {
                        size: 13,
                        weight: 500
                      },
                      callback: function(value) {
                        return Math.round(value);
                      }
                    },
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)'
                    }
                  },
                  y: {
                    title: {
                      display: true,
                      text: '功率 (W)',
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    },
                    ticks: {
                      color: '#fff',
                      font: {
                        size: 13,
                        weight: 500
                      },
                      callback: function(value) {
                        return Math.round(value);
                      }
                    },
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)'
                    }
                  }
                },
                parsing: {
                  xAxisKey: 'x',
                  yAxisKey: 'y'
                },
                plugins: {
                  legend: {
                    labels: {
                      color: '#fff',
                      font: {
                        size: 14,
                        weight: 600
                      }
                    }
                  },
                  tooltip: {
                    bodyFont: {
                      size: 13
                    },
                    titleFont: {
                      size: 14,
                      weight: 600
                    }
                  },
                  title: {
                    display: true,
                    text: '功率-位移对比',
                    color: '#fff',
                    font: {
                      size: 16,
                      weight: 600
                    }
                  }
                },
                responsive: true,
                maintainAspectRatio: false
              }} 
            />
          </div>
          </div>


          
        </div>
      )}
    </div>
  )
}
