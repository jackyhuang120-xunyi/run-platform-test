import React, { useEffect, useState } from 'react'
import { getTrainById, getUserById } from '../services/api'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush, ReferenceLine } from 'recharts'

export default function TrainDetail({ id: propId }) {
  const params = useParams()
  const navigate = useNavigate()
  const id = propId || params.id
  const [rec, setRec] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 日志分析相关状态
  const [logMetrics, setLogMetrics] = useState(null)
  const [logChartData, setLogChartData] = useState(null)
  const [logLoading, setLogLoading] = useState(false)
  const [logError, setLogError] = useState('')

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
      Math.floor(min - pad),
      Math.ceil(max + pad),
    ];
  };

  // 应用低通滤波器
  const applyLowPassFilter = (data, dt, cutoffFreq = 10.0) => {
    if (!data || data.length === 0) return []

    const fs = 1.0 / dt  // 采样频率

    // 简单的低通滤波器实现
    const RC = 1.0 / (2 * Math.PI * cutoffFreq)
    const alpha = dt / (RC + dt)
    
    const filtered = [data[0]]
    for (let i = 1; i < data.length; i++) {
      filtered.push(alpha * data[i] + (1 - alpha) * filtered[i-1])
    }
    
    return filtered
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

  // 计算整数刻度的辅助函数
  const getIntegerTicks = (data, dataKey = 'pos') => {
    if (!data || data.length === 0) return []
    const values = data.map(d => d[dataKey])
    const min = Math.floor(Math.min(...values))
    const max = Math.ceil(Math.max(...values))
    const ticks = []
    // 生成从min到max的所有整数
    for (let i = min; i <= max; i++) {
      ticks.push(i)
    }
    return ticks
  }

  // 确保显示的数值非负的辅助函数
  const formatNonNegative = (value, precision = 2) => {
    if (value === null || value === undefined || value === '-') return '-'
    const num = parseFloat(value)
    if (isNaN(num)) return '-'
    return Math.abs(num).toFixed(precision)
  }

  // 计算步长和步频 - 针对恒阻牵引跑步设备优化版
  const calculateStrideAndFrequency = (data, sampleInterval = 0.001) => {
    if (!data || data.length < 200) {
      return { strideLength: null, strideFrequency: null, note: '数据不足' };
    }

    const positions = data.map(row => row.pos);
    const speeds = data.map(row => row.speed_filtered || row.speed);
    const times = data.map(row => row.time);

    const totalDistance = positions[positions.length - 1] - positions[0];
    const totalTime = times[times.length - 1] - times[0];
    const avgSpeed = totalDistance / totalTime || 0;

    let strideLength = null;
    let strideFrequency = null;
    let note = '估算值（典型步频）';

    // ─── 第一优先：后半段高速度区间的峰值检测 ───
    const maxSpeed = Math.max(...speeds);
    const highSpeedThreshold = maxSpeed * 0.70;  // 70%最大速度以上（可调0.7～0.85）

    const highSpeedIndices = speeds
      .map((v, idx) => (v >= highSpeedThreshold ? idx : -1))
      .filter(idx => idx >= 0);

    if (highSpeedIndices.length >= 80) {  // 至少0.08秒匀速段
      const subSpeeds = highSpeedIndices.map(idx => speeds[idx]);
      const subPos = highSpeedIndices.map(idx => positions[idx]);
      const subTimes = highSpeedIndices.map(idx => times[idx]);

      const peaks = [];
      const minDistanceSamples = Math.floor(0.20 / sampleInterval);  // 从 0.18 调整到 0.20s，减少假峰
      const minPeakHeight = highSpeedThreshold * 0.05;  // 新增：最小峰值高度（5% 的高速度阈值，过滤小波动）
      // 调试信息：记录被过滤的峰值
      const filteredPeaks = [];

      for (let i = 1; i < subSpeeds.length - 1; i++) {
        if (
          subSpeeds[i] > subSpeeds[i - 1] &&
          subSpeeds[i] > subSpeeds[i + 1]
        ) {
          // 检查是否满足最小峰值高度
          if (subSpeeds[i] <= minPeakHeight) {
            filteredPeaks.push({
              index: i,
              position: subPos[i],
              time: subTimes[i],
              speed: subSpeeds[i],
              reason: `峰值高度不足 (${subSpeeds[i].toFixed(2)} m/s < ${minPeakHeight.toFixed(2)} m/s)`
            });
            continue;
          }

          // 检查是否满足最小距离要求
          if (peaks.length > 0) {
            const timeDiff = subTimes[i] - subTimes[peaks[peaks.length - 1]];
            if (timeDiff <= 0.18) {  // 0.18秒是最小步周期
              filteredPeaks.push({
                index: i,
                position: subPos[i],
                time: subTimes[i],
                speed: subSpeeds[i],
                reason: `距离上一个峰值太近 (${(timeDiff * 1000).toFixed(0)} ms < 180 ms)`
              });
              continue;
            }
          }

          // 计算突出度（prominence）
          const leftMin = Math.min(...subSpeeds.slice(Math.max(0, i - minDistanceSamples), i));
          const rightMin = Math.min(...subSpeeds.slice(i + 1, i + minDistanceSamples + 1));
          const prominence = subSpeeds[i] - Math.max(leftMin, rightMin);

          // 检查是否满足突出度要求
          if (prominence <= 0.1) {
            filteredPeaks.push({
              index: i,
              position: subPos[i],
              time: subTimes[i],
              speed: subSpeeds[i],
              reason: `峰值突出度不足 (${prominence.toFixed(3)} m/s <= 0.1 m/s)`
            });
            continue;
          }

          // 所有条件都满足，添加到峰值列表
          peaks.push(i);
        }
      }

      console.log('后半段峰值数量:', peaks.length);  // 测试用，实际可删
      // 输出峰值的位置信息
      const peakPositions = peaks.map(idx => ({
        position: subPos[idx],
        time: subTimes[idx],
        speed: subSpeeds[idx]
      }));
      console.log('峰值位置信息:', peakPositions);
      
      // 输出调试信息
      console.log('=== 峰值检测调试信息 ===');
      console.log(`检测到的峰值总数: ${peaks.length}`);
      console.log(`被过滤的峰值总数: ${filteredPeaks.length}`);
      
      if (filteredPeaks.length > 0) {
        console.log('\n被过滤的峰值详情:');
        filteredPeaks.forEach((peak, idx) => {
          console.log(`${idx + 1}. 位置: ${peak.position.toFixed(2)}m, 时间: ${peak.time.toFixed(3)}s, 速度: ${peak.speed.toFixed(2)}m/s, 原因: ${peak.reason}`);
        });
      }
      
      console.log('\n最终保留的峰值:');
      peaks.forEach((idx, i) => {
        console.log(`${i + 1}. 位置: ${subPos[idx].toFixed(2)}m, 时间: ${subTimes[idx].toFixed(3)}s, 速度: ${subSpeeds[idx].toFixed(2)}m/s`);
      });
      console.log('=====================');

      if (peaks.length >= 4) {  // 至少4个峰
        console.log('\n=== 步长和步频计算调试信息 ===');
        const strideLengths = [];
        const stridePeriods = [];
        const filteredStrides = [];

        for (let k = 0; k < peaks.length - 1; k++) {
          const p1 = peaks[k];
          const p2 = peaks[k + 1];
          const dPos = Math.abs(subPos[p2] - subPos[p1]);
          const dTime = subTimes[p2] - subTimes[p1];

          if (dPos > 0.6 && dPos < 2.4 && dTime > 0.18 && dTime < 1.3) {  // 过滤范围（可调）
            strideLengths.push(dPos);
            stridePeriods.push(dTime);
            console.log(`步长 ${strideLengths.length}: ${dPos.toFixed(2)}m, 周期: ${dTime.toFixed(3)}s, 频率: ${(1/dTime).toFixed(2)}Hz`);
          } else {
            let reason = '';
            if (dPos <= 0.6) reason += `步长过短 (${dPos.toFixed(2)}m <= 0.6m)`;
            else if (dPos >= 2.4) reason += `步长过长 (${dPos.toFixed(2)}m >= 2.4m)`;
            if (dTime <= 0.18) reason += (reason ? ', ' : '') + `周期过短 (${(dTime*1000).toFixed(0)}ms <= 180ms)`;
            else if (dTime >= 1.3) reason += (reason ? ', ' : '') + `周期过长 (${(dTime*1000).toFixed(0)}ms >= 1300ms)`;
            filteredStrides.push({
              index: k,
              dPos,
              dTime,
              reason
            });
          }
        }

        console.log(`\n有效步长数量: ${strideLengths.length}`);
        console.log(`被过滤的步长数量: ${filteredStrides.length}`);

        if (filteredStrides.length > 0) {
          console.log('\n被过滤的步长详情:');
          filteredStrides.forEach((stride, idx) => {
            console.log(`${idx + 1}. 步长: ${stride.dPos.toFixed(2)}m, 周期: ${stride.dTime.toFixed(3)}s, 频率: ${(1/stride.dTime).toFixed(2)}Hz, 原因: ${stride.reason}`);
          });
        }

        if (strideLengths.length >= 3) {
          strideLength = strideLengths.reduce((a, b) => a + b, 0) / strideLengths.length;
          strideFrequency = 1 / (stridePeriods.reduce((a, b) => a + b, 0) / stridePeriods.length);
          note = '后半段速度峰值计算';
          console.log(`\n最终计算结果:`);
          console.log(`平均步长: ${strideLength.toFixed(2)}m`);
          console.log(`平均步频: ${strideFrequency.toFixed(2)}Hz`);
          console.log(`计算方法: ${note}`);
        } else {
          console.log(`\n有效步长数量不足 (${strideLengths.length} < 3)，无法计算步长和步频`);
        }
        console.log('===============================');
      }
    }

    // ─── 第二优先：如果上面失败，不显示数值 ───
    if (strideLength === null) {
      strideLength = null;
      strideFrequency = null;
      note = '峰值检测失败';
    }

    return {
      strideLength: strideLength ? Number(strideLength.toFixed(2)) : null,
      strideFrequency: strideFrequency ? Number(strideFrequency.toFixed(2)) : null,
      note
    };
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

    // 计算实际作用力和功率
    const dataWithPower = dataWithAcceleration.map(row => {
      const endForceValue = trainInfo?.end_force || 0
      const actualForce = endForceValue + 0.34 * (row.acceleration || 0)
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
    if (!dataWithPower || dataWithPower.length === 0) return null

    const trainingDistance = dataWithPower[dataWithPower.length - 1].pos - dataWithPower[0].pos
    const totalTime = dataWithPower[dataWithPower.length - 1].time - dataWithPower[0].time
    const startForce = dataWithPower[0]?.Force || 0
    const endForce = trainInfo?.end_force || 0
    const peakSpeed = Math.max(...dataWithPower.map(row => row.speed || 0))

    // 峰值加速度（使用99.5%分位数）
    const acc = dataWithPower.map(row => row.acceleration || 0)
    const percentileIndex = Math.floor(acc.length * 0.995)
    const sorted = [...acc].sort((a, b) => a - b)
    const peakAcceleration = sorted[percentileIndex]

    // 峰值力量计算
    const peakForce = (trainInfo?.end_force || 0) + 0.34 * peakAcceleration

    // 峰值功率（使用99.5%分位数）
    const powerData = dataWithPower.map(row => row.power || 0)
    const powerPercentileIndex = Math.floor(powerData.length * 0.995)
    const sortedPower = [...powerData].sort((a, b) => a - b)
    const peakPower = sortedPower[powerPercentileIndex]

    // 计算平均步长和步频（替换原代码）
    const strideResult = calculateStrideAndFrequency(dataWithPower, samplingInterval);
    const avgStrideLength = strideResult.strideLength;
    const avgStrideFrequency = strideResult.strideFrequency;

    // 计算分段数据
    const segment5mData = calculateSegmentData(dataWithPower, 5)
    const segment10mData = calculateSegmentData(dataWithPower, 10)

    // 准备图表数据
    const samplingRate = Math.max(1, Math.floor(dataWithPower.length / 500))
    const sampledData = dataWithPower.filter((_, index) => index % samplingRate === 0)

    const preparedChartData = sampledData.map(row => ({
      time: (row.time || 0).toFixed(3),
      pos: (row.pos || 0).toFixed(2),
      speed: (row.speed || 0).toFixed(2),
      acceleration: (row.acceleration || 0).toFixed(2),
      force: (row.actualForce || 0).toFixed(2),
      power: (row.power || 0).toFixed(2)
    }))

    return {
      weight,
      samplingInterval,
      trainingDistance: (trainingDistance || 0).toFixed(2),
      changeDistance: ((trainingDistance || 0) * 0.4).toFixed(2),
      totalTime: (totalTime || 0).toFixed(2),
      startForce: (startForce || 0).toFixed(2),
      endForce: (endForce || 0).toFixed(2),
      peakSpeed: (peakSpeed || 0).toFixed(2),
      peakAcceleration: (peakAcceleration || 0).toFixed(2),
      peakForce: (peakForce || 0).toFixed(2),
      peakPower: (peakPower || 0).toFixed(2),
      // 平均数据
      avgStrideLength: avgStrideLength ? avgStrideLength.toFixed(2) : null,
      avgStrideFrequency: avgStrideFrequency ? avgStrideFrequency.toFixed(2) : null,
      // 分段数据
      segment5mData,
      segment10mData,
      fullData: dataWithPower,
      chartData: preparedChartData
    }
  }

  // 获取日志文件数据
  const fetchLogData = async (logPath, trainInfo) => {
    try {
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

      const response = await fetch(csvUrl)

      if (!response.ok) {
        throw new Error(`获取日志文件失败: ${response.status} ${response.statusText}`)
      }

      const csvText = await response.text()
      const lines = csvText.split('\n')

      if (!lines || lines.length <= 1) {
        throw new Error('CSV文件为空或格式不正确')
      }

      const dataLines = lines.slice(1).filter(line => line.trim() !== '')

      if (dataLines.length === 0) {
        throw new Error('CSV文件中没有有效数据')
      }

      const parsedData = dataLines.map((line, index) => {
        const cleanLine = line.replace(/\r/g, '');
        const parts = cleanLine.split(',')

        if (parts.length < 5) {
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
      }).filter(row => row !== null)

      if (parsedData.length === 0) {
        throw new Error('CSV文件中没有有效数据')
      }

      const calculatedMetrics = calculateMetrics(parsedData, trainInfo)
      setLogMetrics(calculatedMetrics)
      if (calculatedMetrics.chartData) {
        setLogChartData(calculatedMetrics.chartData)
      }
      setLogLoading(false)
    } catch (err) {
      setLogError('获取日志文件错误: ' + err.message)
      setLogLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    
    if (id) {
      setLoading(true)
      getTrainById(id).then(data => {
        if (!isMounted) return
        
        setRec(data)
        // 获取用户信息
        if (data && data.uid) {
          getUserById(data.uid).then(userData => {
            if (!isMounted) return
            setUser(userData)
          }).catch(err => {
            if (!isMounted) return
            console.error('获取用户信息失败:', err)
            setUser(null)
          })
        }
        // 如果有日志文件，自动加载分析
        if (data && data.log) {
          setLogLoading(true)
          fetchLogData(data.log, data)
        }
      }).catch(() => {
        if (!isMounted) return
        setRec(null)
        setUser(null)
      }).finally(() => {
        if (!isMounted) return
        setLoading(false)
      })
    }
    
    return () => {
      isMounted = false
    }
  }, [id])

  // 格式化时间函数
  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '-';
    
    try {
      const date = new Date(dateTimeStr);
      // 处理时区问题
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      return `${year}/${month}/${day}  ${hours}:${minutes}:${seconds}`;
    } catch (e) {
      console.error('时间格式化错误:', e);
      return dateTimeStr;
    }
  };

  const handleExport = async () => {
    const token = localStorage.getItem('admin_token')
    if (!token) { alert('请先登录管理员账号以导出'); window.location.href='/login'; return }
    try {
      const res = await fetch(`/api/trains/${rec.id}/export`, { headers: { Authorization: 'Bearer '+token } })
      if (!res.ok) { const j=await res.json(); alert('导出失败: '+(j.error||res.status)); return }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `train_${rec.id}_${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) { alert('导出错误：'+e.message) }
  }

  const getTrainingTypeText = (type) => {
    // 处理数字类型和字符串类型
    const typeStr = String(type || '').trim();
    switch(typeStr) {
      case '1': return '抗阻训练'
      case '2': return '牵引训练'
      case '3': return '折返训练'
      default: return typeStr ? `类型${typeStr}` : '未知'
    }
  }

  const getTrainingTypeBadge = (type) => {
    // 处理数字类型和字符串类型
    const typeStr = String(type || '').trim();
    switch(typeStr) {
      case '1': return <span className="status-badge" style={{background: '#FFF9C4', color: '#8D6E63', borderColor: '#F5F5DC'}}>{getTrainingTypeText(type)}</span>
      case '2': return <span className="status-badge" style={{background: '#E0F7FA', color: '#00838F', borderColor: '#B2EBF2'}}>{getTrainingTypeText(type)}</span>
      case '3': return <span className="status-badge" style={{background: '#EDE7F6', color: '#512DA8', borderColor: '#D1C4E9'}}>{getTrainingTypeText(type)}</span>
      default: return <span className="status-badge">{getTrainingTypeText(type)}</span>
    }
  }

  if (!id) return <div className="container"><div className="card"><h2 style={{ fontSize: 'var(--font-size-h2)' }}>缺少记录 ID。</h2></div></div>

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <h2 style={{ fontSize: 'var(--font-size-h2)' }}>加载中...</h2>
        </div>
      </div>
    )
  }

  if (!rec) {
    return (
      <div className="container">
        <div className="card">
          <h2 style={{ fontSize: 'var(--font-size-h2)' }}>未找到训练记录</h2>
          <button className="btn btn-primary" onClick={() => navigate(-1)}>返回</button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
        <h2 style={{ fontSize: 'var(--font-size-h2)' }}>训练详情 #{rec.id}</h2>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>返回</button>
          <button className="btn btn-primary" onClick={handleExport}>导出 CSV</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h3 style={{ fontSize: 'var(--font-size-h3)' }}>基本信息</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
          <div>
            <label>用户ID</label>
            <div style={{ padding: 'var(--spacing-sm) 0', color: 'var(--text-secondary)' }}>{rec.uid} {rec.user_name ? `(${rec.user_name})` : ''}</div>
          </div>
          <div>
            <label>训练类型</label>
            <div style={{ padding: 'var(--spacing-sm) 0' }}>{getTrainingTypeBadge(rec.type)}</div>
          </div>
          <div>
            <label>开始时间</label>
            <div style={{ padding: 'var(--spacing-sm) 0', color: 'var(--text-secondary)' }}>{formatDateTime(rec.begin_time)}</div>
          </div>

        </div>
      </div>

      {/* 个人信息 */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: 'var(--font-size-h3)' }}>个人信息</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)', marginTop: 'var(--spacing-md)', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', minWidth: '150px' }}>
            <label style={{ marginRight: 'var(--spacing-sm)', minWidth: '50px' }}>姓名:</label>
            <span style={{ color: 'var(--text-secondary)' }}>{user?.name || rec.user_name || '-'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', minWidth: '150px' }}>
            <label style={{ marginRight: 'var(--spacing-sm)', minWidth: '50px' }}>性别:</label>
            <span style={{ color: 'var(--text-secondary)' }}>{user?.gender || rec.gender || '-'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', minWidth: '150px' }}>
            <label style={{ marginRight: 'var(--spacing-sm)', minWidth: '50px' }}>组别:</label>
            <span style={{ color: 'var(--text-secondary)' }}>{user?.user_group || rec.group || '-'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', minWidth: '150px' }}>
            <label style={{ marginRight: 'var(--spacing-sm)', minWidth: '50px' }}>用户ID:</label>
            <span style={{ color: 'var(--text-secondary)' }}>{user?.id || rec.uid || rec.user_id || '-'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', minWidth: '150px' }}>
            <label style={{ marginRight: 'var(--spacing-sm)', minWidth: '50px' }}>体重:</label>
            <span style={{ color: 'var(--text-secondary)' }}>{user?.weight ? `${user.weight} kg` : (rec.weight ? `${rec.weight} kg` : '-')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', minWidth: '150px' }}>
            <label style={{ marginRight: 'var(--spacing-sm)', minWidth: '50px' }}>年龄:</label>
            <span style={{ color: 'var(--text-secondary)' }}>
              {(() => {
                if (user?.birthday) {
                  const currentYear = new Date().getFullYear();
                  const birthYear = new Date(user.birthday).getFullYear();
                  return `${currentYear - birthYear}岁`;
                } else if (rec.age) {
                  return `${rec.age}岁`;
                } else {
                  return '-';
                }
              })()}
            </span>
          </div>
        </div>
      </div>

      {/* 训练信息 */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: 'var(--font-size-h3)' }}>训练信息</h3>
        <div style={{ height: '20px' }}></div>
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--spacing-lg)' }}>

          <div className="stat-card" style={{ '--gradient-primary': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
            <div className="stat-icon">⚖️</div>
            <div className="stat-content">
              <h3>{rec.start_force ? formatNonNegative(rec.start_force) : '-'}</h3>
              <p>起始阻力(kg)</p>
            </div>
          </div>
          <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-success)' }}>
            <div className="stat-icon">🎯</div>
            <div className="stat-content">
              <h3>{rec.end_force ? formatNonNegative(rec.end_force) : '-'}</h3>
              <p>结束阻力(kg)</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📏</div>
            <div className="stat-content">
              <h3>{rec.train_dis ? formatNonNegative(rec.train_dis) : '-'}</h3>
              <p>训练距离(m)</p>
            </div>
          </div>
          <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-secondary)' }}>
            <div className="stat-icon">📐</div>
            <div className="stat-content">
              <h3>{rec.change_dis ? formatNonNegative(rec.change_dis) : '-'}</h3>
              <p>变阻距离(m)</p>
            </div>
          </div>
          <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-success)' }}>
            <div className="stat-icon">🛡️</div>
            <div className="stat-content">
              <h3>{rec.safe_dis ? formatNonNegative(rec.safe_dis) : '-'}</h3>
              <p>安全距离(m)</p>
            </div>
          </div>
          <div className="stat-card" style={{ '--gradient-primary': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
            <div className="stat-icon">⏱️</div>
            <div className="stat-content">
              <h3>{rec.total_time ? formatNonNegative(rec.total_time) : '-'}</h3>
              <p>总计用时(s)</p>
            </div>
          </div>
        </div>
      </div>

      {/* 数据总结 */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: 'var(--font-size-h3)' }}>数据总结</h3>
        <div style={{ height: '20px' }}></div>
        
        {/* 峰值指标 */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h4 style={{ marginBottom: "1rem", color: "var(--text-secondary)", fontSize: 'var(--font-size-h4)' }}>峰值指标</h4>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--spacing-lg)' }}>
            <div className="stat-card">
              <div className="stat-icon">🚀</div>
              <div className="stat-content">
                <h3>{(rec.peak_speed || rec.max_speed) ? formatNonNegative(rec.peak_speed || rec.max_speed) : '-'}</h3>
                <p>峰值速度(m/s)</p>
              </div>
            </div>
            <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-secondary)' }}>
              <div className="stat-icon">⚡</div>
              <div className="stat-content">
                <h3>{logMetrics?.peakAcceleration ? formatNonNegative(logMetrics.peakAcceleration) : '-'}</h3>
                <p>峰值加速度(m/s²)</p>
              </div>
            </div>
            <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-success)' }}>
              <div className="stat-icon">💪</div>
              <div className="stat-content">
                <h3>{logMetrics?.peakForce ? formatNonNegative(logMetrics.peakForce) : '-'}</h3>
                <p>峰值力量(kg)</p>
              </div>
            </div>
            <div className="stat-card" style={{ '--gradient-primary': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
              <div className="stat-icon">🔥</div>
              <div className="stat-content">
                <h3>{logMetrics?.peakPower ? formatNonNegative(logMetrics.peakPower) : '-'}</h3>
                <p>峰值功率(w)</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">⏰</div>
              <div className="stat-content">
                <h3>{rec.peak_time ? formatNonNegative(rec.peak_time) : '-'}</h3>
                <p>达峰时间(s)</p>
              </div>
            </div>
            <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-secondary)' }}>
              <div className="stat-icon">📍</div>
              <div className="stat-content">
                <h3>{rec.peak_pos ? formatNonNegative(rec.peak_pos) : '-'}</h3>
                <p>达峰位置(m)</p>
              </div>
            </div>
          </div>
        </div>

        {/* 步长指标 */}
        <div>
          <h4 style={{ marginBottom: "1rem", color: "var(--text-secondary)", fontSize: 'var(--font-size-h4)' }}>步长指标</h4>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--spacing-lg)' }}>
            <div className="stat-card">
              <div className="stat-icon">👣</div>
              <div className="stat-content">
                <h3>{logMetrics?.avgStrideLength ? formatNonNegative(logMetrics.avgStrideLength) : '-'}</h3>
                <p>平均步长(m)</p>
              </div>
            </div>
            <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-secondary)' }}>
              <div className="stat-icon">🎵</div>
              <div className="stat-content">
                <h3>{logMetrics?.avgStrideFrequency ? formatNonNegative(logMetrics.avgStrideFrequency) : '-'}</h3>
                <p>平均步频(Hz)</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {rec.log && (
        <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
          <h3 style={{ fontSize: 'var(--font-size-h3)' }}>日志分析</h3>
          <div style={{ height: '20px' }}></div>
          {logLoading ? (
            <div>加载日志分析中...</div>
          ) : logError ? (
            <div style={{ color: 'red' }}>{logError}</div>
          ) : logMetrics && logChartData ? (() => {
                // 清洗数据，将NaN/Infinity转为null
                const cleanChartData = logChartData.map(d => ({
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
                
                // 计算最大速度的70%
                const maxSpeed = Math.max(...cleanChartData.map(d => d.speed || 0));
                const highSpeedThreshold = maxSpeed * 0.70;
                console.log('最大速度:', maxSpeed.toFixed(2), 'm/s');
                console.log('70%最大速度阈值:', highSpeedThreshold.toFixed(2), 'm/s');

                return (
                  <>
                    {/* 5米分段数据 */}
                    <div className="card" style={{ marginBottom: "1.5rem" }}>
                      <h3 style={{ fontSize: 'var(--font-size-h3)' }}>5米分段数据</h3>
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
                          {logMetrics.segment5mData && logMetrics.segment5mData.map((segment, index) => (
                            <tr key={index}>
                              <td>{segment.segment}</td>
                              <td>{formatNonNegative(segment.time)}</td>
                              <td>{formatNonNegative(segment.cumulativeTime)}</td>
                              <td>{formatNonNegative(segment.avgSpeed)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* 10米分段数据 */}
                    <div className="card" style={{ marginBottom: "1.5rem" }}>
                      <h3 style={{ fontSize: 'var(--font-size-h3)' }}>10米分段数据</h3>
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
                          {logMetrics.segment10mData && logMetrics.segment10mData.map((segment, index) => (
                            <tr key={index}>
                              <td>{segment.segment}</td>
                              <td>{formatNonNegative(segment.time)}</td>
                              <td>{formatNonNegative(segment.cumulativeTime)}</td>
                              <td>{formatNonNegative(segment.avgSpeed)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* 速度-位移曲线 */}
                    <div className="card" style={{ marginBottom: "1.5rem" }}>
                      <h3 style={{ fontSize: 'var(--font-size-h3)' }}>速度-位移曲线</h3>
                      <ResponsiveContainer width="100%" height={380}>
                        <LineChart
                          data={cleanChartData}
                          margin={{ top: 20, right: 30, left: 10, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                          <XAxis
                      height={70} 
                            dataKey="pos" 
       
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            ticks={getIntegerTicks(cleanChartData, 'pos')}
                            tick={{ fontSize: 13, fill: "#fff", fontWeight: 600 }}
                      label={{ value: "位移 (m)", position: "insideBottom", dy: -10, fontSize: 14, fill: "#fff", fontWeight: 600 }} 
                          />
                          <YAxis
                            label={{ value: "速度 (m/s)", angle: -90, position: "insideLeft", fontSize: 14, fill: "#fff", fontWeight: 600 }}
                            tick={{ fontSize: 13, fill: "#fff", fontWeight: 600 }}
      
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
                            height={30}
                            stroke="#4285F4"
                            fill="rgba(240,248,255,0.6)"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

              {/* 速度-时间曲线 */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: 'var(--font-size-h3)' }}>速度-时间曲线</h3>
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart
                    data={cleanChartData}
                    margin={{ top: 20, right: 30, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      height={70} 
                      dataKey="time" 
 
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      ticks={getIntegerTicks(cleanChartData, 'time')}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 600 }}
                      label={{ value: "时间 (s)", position: "insideBottom", dy: -10, fontSize: 14, fill: "#fff", fontWeight: 600 }} 
                    />
                    <YAxis
                      label={{ value: "速度 (m/s)", angle: -90, position: "insideLeft", fontSize: 14, fill: "#fff", fontWeight: 600 }}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 600 }}

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
                      height={30}
                      stroke="#34A853"
                      fill="rgba(240,255,240,0.6)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 加速度-位移曲线 */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: 'var(--font-size-h3)' }}>加速度-位移曲线</h3>
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart
                    data={cleanChartData}
                    margin={{ top: 20, right: 30, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      height={70} 
                      dataKey="pos" 
 
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      ticks={getIntegerTicks(cleanChartData, 'pos')}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 600 }}
                      label={{ value: "位移 (m)", position: "insideBottom", dy: -10, fontSize: 14, fill: "#fff", fontWeight: 600 }} 
                    />
                    <YAxis
                      label={{ value: "加速度 (m/s²)", angle: -90, position: "insideLeft", fontSize: 14, fill: "#fff", fontWeight: 600 }}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 600 }}

                      domain={accDomain}
                      tickFormatter={(value) => Number(value).toFixed(1)}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "rgba(255, 255, 255, 0.95)", border: "1px solid #ccc", color: "#333" }}
                      labelFormatter={(value) => `位移: ${value} m`}
                    />
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
                      height={30}
                      stroke="#EA4335"
                      fill="rgba(255,240,240,0.6)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 力量-位移曲线 */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: 'var(--font-size-h3)' }}>力量-位移曲线</h3>
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart
                    data={cleanChartData}
                    margin={{ top: 20, right: 30, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      height={70} 
                      dataKey="pos" 
 
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      ticks={getIntegerTicks(cleanChartData, 'pos')}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 600 }}
                      label={{ value: "位移 (m)", position: "insideBottom", dy: -10, fontSize: 14, fill: "#fff", fontWeight: 600 }} 
                    />
                    <YAxis
                      label={{ value: "力量 (kg)", angle: -90, position: "insideLeft", fontSize: 14, fill: "#fff", fontWeight: 600 }}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 600 }}

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
                      height={30}
                      stroke="#FBBC05"
                      fill="rgba(255,251,230,0.6)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 功率-位移曲线 */}
              <div className="card" style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: 'var(--font-size-h3)' }}>功率-位移曲线</h3>
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart
                    data={cleanChartData}
                    margin={{ top: 20, right: 30, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      height={70} 
                      dataKey="pos" 
 
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      ticks={getIntegerTicks(cleanChartData, 'pos')}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 600 }}
                      label={{ value: "位移 (m)", position: "insideBottom", dy: -10, fontSize: 14, fill: "#fff", fontWeight: 600 }} 
                    />
                    <YAxis
                      label={{ value: "功率 (W)", angle: -90, position: "insideLeft", fontSize: 14, fill: "#fff", fontWeight: 600 }}
                      tick={{ fontSize: 13, fill: "#fff", fontWeight: 600 }}

                      domain={powerDomain}
                      tickFormatter={(value) => Number(value).toFixed(1)}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "rgba(255, 255, 255, 0.95)", border: "1px solid #ccc", color: "#333" }}
                      labelFormatter={(value) => `位移: ${value} m`}
                    />
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
                      height={30}
                      stroke="#9C27B0"
                      fill="rgba(243,229,245,0.6)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
                  </>
                );
              })() : (
            <div>无日志数据可用</div>
          )}
        </div>
      )}


    </div>
  )
}
