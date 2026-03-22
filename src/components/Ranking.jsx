import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRankings, getGroups } from '../services/api'
import '../styles/Ranking.css'

export default function Ranking() {
  const navigate = useNavigate()
  const [rankings, setRankings] = useState({})
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('peak_speed')
  const [trainType, setTrainType] = useState('resistance') // 默认显示抗阻训练
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [selectedGroup, setSelectedGroup] = useState('') // 选中的组别，空字符串表示全部

  // 获取组别列表
  useEffect(() => {
    let mounted = true

    getGroups()
      .then((res) => {
        if (!mounted) return
        setGroups(res || [])
      })
      .catch((err) => {
        if (!mounted) return
        console.error('获取组别列表失败:', err)
      })

    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    getRankings({ group: selectedGroup })
      .then((res) => {
        if (!mounted) return
        setRankings(res.data || {})
      })
      .catch((err) => {
        if (!mounted) return
        setError(err.message || '获取排行榜数据失败')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => { mounted = false }
  }, [selectedGroup])

  useEffect(() => {
    setPage(1)
  }, [activeTab, trainType])

  if (loading) {
    return (
      <div className="ranking-container">
        <div className="ranking-card">
          <h2>加载排行榜数据中...</h2>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ranking-container">
        <div className="ranking-card">
          <h2>错误</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const renderRankingTable = (data, title) => {
    if (!data || data.length === 0) {
      return <p className="no-data">暂无数据</p>
    }

    // 分离前三名和其余数据
    const heroData = data.slice(0, 3)
    const restData = data.slice(3)
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const paginatedRestData = restData.slice(startIndex, endIndex)
    // 计算总页数：第一页显示前三名+7条，其他页每页10条
    // 修复：确保只有在restData有剩余数据时才计算第二页
    const restDataCount = restData.length
    const firstPageRestCount = pageSize - heroData.length
    const remainingRestData = restDataCount - firstPageRestCount
    const totalPages = remainingRestData > 0 
      ? Math.ceil(remainingRestData / pageSize) + 1 
      : 1

    // 每页只显示pageSize条记录，第一页包含前三名
    let displayData, paginatedData

    if (page === 1) {
      // 第一页：显示前三名，然后补足到pageSize条记录
      const remainingSlots = pageSize - heroData.length
      paginatedData = restData.slice(0, remainingSlots)
      displayData = [...heroData, ...paginatedData]
    } else {
      // 其他页：从第(page-1)*pageSize-heroData.length个位置开始取pageSize条记录
      const startIndex = (page - 1) * pageSize - heroData.length
      displayData = restData.slice(startIndex, startIndex + pageSize)
      // 如果第二页没有数据，返回空数组
      if (displayData.length === 0) {
        displayData = []
      }
    }

    // 计算每项的实际排名
    const getActualRank = (index) => {
      if (page === 1) {
        return index + 1  // 第一页：前三名 + 分页数据
      } else {
        // 其他页：排名 = 前三名数量 + (页码-1)*每页大小 - 前三名数量 + 当前索引
        // 简化后：排名 = (页码-1)*每页大小 + 当前索引 + 1
        return (page - 1) * pageSize + index + 1
      }
    }

    // 根据指标类型确定单位
    const getUnit = (key) => {
      if (key.startsWith('time_')) {
        return 's'
      } else if (key === 'peak_speed') {
        return 'm/s'
      } else if (key === 'peak_acceleration') {
        return 'm/s²'
      } else if (key === 'peak_power') {
        return 'W'
      } else if (key === 'peak_force') {
        return 'kg'
      } else if (key === 'avg_step_length') {
        return 'm'
      } else if (key === 'avg_step_frequency') {
        return 'Hz'
      }
      return ''
    }
    const unit = getUnit(activeTab)

    return (
      <div className="ranking-content">
        {/* 英雄区：前三名 */}
        {heroData.length >= 3 && (
          <div className="hero-section">
            <h3 className="hero-title">{title}</h3>
            <div className="hero-cards-row">
              {/* 第2名 */}
              <div className="hero-card-wrapper">
                <div className="hero-card rank-2">
                  <div className="laurel-wreath">
                    <img src="/assets/第二.svg" alt="第二名桂冠" />
                  </div>
                  <img src="/assets/人物剪影白色.svg" className="silhouette" alt="人物剪影" />
                </div>
                <div className="hero-info">
                  <p className="hero-name">{heroData[1].user_name || '未知'}</p>
                  <p className="hero-score">{formatValue(heroData[1].value)} <span className="unit">{unit}</span></p>
                </div>
              </div>

              {/* 第1名 */}
              <div className="hero-card-wrapper">
                <div className="hero-card rank-1">
                  <div className="laurel-wreath laurel-wreath-first">
                    <img src="/assets/第一.svg" alt="第一名桂冠" />
                  </div>
                  <img src="/assets/人物剪影白色.svg" className="silhouette" alt="人物剪影" />
                </div>
                <div className="hero-info">
                  <p className="hero-name">{heroData[0].user_name || '未知'}</p>
                  <p className="hero-score">{formatValue(heroData[0].value)} <span className="unit">{unit}</span></p>
                </div>
              </div>

              {/* 第3名 */}
              <div className="hero-card-wrapper">
                <div className="hero-card rank-3">
                  <div className="laurel-wreath">
                    <img src="/assets/第三.svg" alt="第三名桂冠" />
                  </div>
                  <img src="/assets/人物剪影白色.svg" className="silhouette" alt="人物剪影" />
                </div>
                <div className="hero-info">
                  <p className="hero-name">{heroData[2].user_name || '未知'}</p>
                  <p className="hero-score">{formatValue(heroData[2].value)} <span className="unit">{unit}</span></p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 排名列表（包含前三名） */}
        <div className="ranking-list">
          {displayData.map((item, index) => (
            <div 
              key={index} 
              className={`ranking-card ${getActualRank(index) <= 3 ? 'top-three' : ''}`}
              onClick={() => navigate(`/trains/${item.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div className="rank-number">
                {getActualRank(index)}
              </div>
              <div className="card-content">
                <div className="left-section">
                  <div className="user-info">
                    <div className="username">{item.user_name || '未知用户'}</div>
                    <div className="time">{formatTime(item.begin_time)}</div>
                  </div>
                  <div className="details">
                    <span className="detail-item">用时 {formatDuration(item.total_time)}</span>
                    <span className="detail-item">距离 {item.train_dis ? `${item.train_dis}m` : '-'}</span>
                    <span className="detail-item">阻力：{getResistance(item)}</span>
                  </div>
                </div>
                <div className="right-section">
                  <div className="main-value">
                    <span className="value-number">{formatValue(item.value)}</span>
                    <span className="unit">{unit}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 分页控件 */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="btn btn-secondary"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              上一页
            </button>
            <span>第 {page} / {totalPages} 页</span>
            <button
              className="btn btn-secondary"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              下一页
            </button>
          </div>
        )}
      </div>
    )
  }

  const getMetricName = (key) => {
    const names = {
      'peak_speed': '峰值速度',
      'time_5m': '5米用时',
      'time_10m': '10米用时',
      'time_15m': '15米用时',
      'time_20m': '20米用时',
      'time_25m': '25米用时',
      'time_30m': '30米用时',
      'time_50m': '50米用时',
      'time_60m': '60米用时',
      'time_100m': '100米用时',
      'peak_acceleration': '峰值加速度',
      'peak_power': '峰值功率',
      'peak_force': '峰值力量',
      'avg_step_length': '平均步长',
      'avg_step_frequency': '平均步频'
    }
    return names[key] || key
  }

  // 格式化数值，最多保留2位小数
  const formatValue = (value) => {
    if (value === null || value === undefined) return '-'
    const num = Number(value)
    if (isNaN(num)) return '-'
    return num.toFixed(2)
  }

  // 格式化时间
  const formatTime = (timeStr) => {
    if (!timeStr) return '-'
    try {
      const date = new Date(timeStr)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    } catch (e) {
      return timeStr
    }
  }

  // 格式化用时（秒转分:秒.毫秒）
  const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined || seconds === 0) return '-'
    const num = Number(seconds)
    if (isNaN(num)) return '-'
    const mins = Math.floor(num / 60)
    const secs = (num % 60).toFixed(2)
    // 如果分钟为0，只显示秒
    if (mins === 0) {
      return `${secs}秒`
    }
    return `${String(mins).padStart(2, '0')}:${secs}`
  }

  // 获取阻力显示
  const getResistance = (item) => {
    if (trainType === 'resistance') {
      // 抗阻训练：显示结束阻力
      const endForce = item.end_force || 0
      return `${endForce}kg`
    } else {
      // 牵引训练：显示牵引力
      const force = item.start_force || 0
      return `${force}kg`
    }
  }

  return (
    <div className="ranking-container">
      <h2 className="ranking-title">训练排行榜</h2>

      {/* 训练类型切换 */}
      <div className="train-type-tabs">
        <button
          className={`train-type-btn ${trainType === 'resistance' ? 'active' : ''}`}
          onClick={() => setTrainType('resistance')}
        >
          抗阻训练
        </button>
        <button
          className={`train-type-btn ${trainType === 'towing' ? 'active' : ''}`}
          onClick={() => setTrainType('towing')}
        >
          牵引训练
        </button>
      </div>

      {/* 组别选择器 */}
      <div className="group-selector">
        <label>组别：</label>
        <select 
          value={selectedGroup} 
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="group-select"
        >
          <option value="">全部组别</option>
          {groups.map(group => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      {/* 标签页导航 */}
      <div className="tabs">
        <div className="tabs-row">
          <button
            className={`tab-btn ${activeTab === 'time_5m' ? 'active' : ''}`}
            onClick={() => setActiveTab('time_5m')}
          >
            5米用时
          </button>
          <button
            className={`tab-btn ${activeTab === 'time_10m' ? 'active' : ''}`}
            onClick={() => setActiveTab('time_10m')}
          >
            10米用时
          </button>
          <button
            className={`tab-btn ${activeTab === 'time_15m' ? 'active' : ''}`}
            onClick={() => setActiveTab('time_15m')}
          >
            15米用时
          </button>
          <button
            className={`tab-btn ${activeTab === 'time_20m' ? 'active' : ''}`}
            onClick={() => setActiveTab('time_20m')}
          >
            20米用时
          </button>
          <button
            className={`tab-btn ${activeTab === 'time_25m' ? 'active' : ''}`}
            onClick={() => setActiveTab('time_25m')}
          >
            25米用时
          </button>
          <button
            className={`tab-btn ${activeTab === 'time_30m' ? 'active' : ''}`}
            onClick={() => setActiveTab('time_30m')}
          >
            30米用时
          </button>
          <button
            className={`tab-btn ${activeTab === 'time_50m' ? 'active' : ''}`}
            onClick={() => setActiveTab('time_50m')}
          >
            50米用时
          </button>
          <button
            className={`tab-btn ${activeTab === 'time_60m' ? 'active' : ''}`}
            onClick={() => setActiveTab('time_60m')}
          >
            60米用时
          </button>
          <button
            className={`tab-btn ${activeTab === 'time_100m' ? 'active' : ''}`}
            onClick={() => setActiveTab('time_100m')}
          >
            100米用时
          </button>
        </div>
        <div className="tabs-row">
          <button
            className={`tab-btn ${activeTab === 'peak_speed' ? 'active' : ''}`}
            onClick={() => setActiveTab('peak_speed')}
          >
            峰值速度
          </button>
          <button
            className={`tab-btn ${activeTab === 'peak_acceleration' ? 'active' : ''}`}
            onClick={() => setActiveTab('peak_acceleration')}
          >
            峰值加速度
          </button>
          <button
            className={`tab-btn ${activeTab === 'peak_power' ? 'active' : ''}`}
            onClick={() => setActiveTab('peak_power')}
          >
            峰值功率
          </button>
          <button
            className={`tab-btn ${activeTab === 'peak_force' ? 'active' : ''}`}
            onClick={() => setActiveTab('peak_force')}
          >
            峰值力量
          </button>
          <button
            className={`tab-btn ${activeTab === 'avg_step_length' ? 'active' : ''}`}
            onClick={() => setActiveTab('avg_step_length')}
          >
            平均步长
          </button>
          <button
            className={`tab-btn ${activeTab === 'avg_step_frequency' ? 'active' : ''}`}
            onClick={() => setActiveTab('avg_step_frequency')}
          >
            平均步频
          </button>
        </div>
      </div>

      {/* 标签页内容 */}
      <div className="tab-content">
        {renderRankingTable(rankings[trainType]?.[activeTab], getMetricName(activeTab))}
      </div>
    </div>
  )
}
