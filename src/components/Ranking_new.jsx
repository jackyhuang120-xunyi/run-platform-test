import React, { useEffect, useState } from 'react'
import { getRankings } from '../services/api'

export default function Ranking() {
  const [rankings, setRankings] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('peak_speed')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    getRankings()
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
  }, [])

  // 当切换标签时重置页码
  useEffect(() => {
    setPage(1)
  }, [activeTab])

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <h2>加载排行榜数据中...</h2>
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
        </div>
      </div>
    )
  }

  // 渲染排行榜表格
  const renderRankingTable = (data, title) => {
    if (!data || data.length === 0) {
      return <p>暂无数据</p>
    }

    // 计算分页
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = data.slice(startIndex, endIndex);
    const totalPages = Math.ceil(data.length / pageSize);

    return (
      <div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>排名</th>
                <th>用户</th>
                <th>数值</th>
                <th>训练时间</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((item, index) => (
                <tr key={index}>
                  <td>{startIndex + index + 1}</td>
                  <td>{item.user_name || '未知用户'}</td>
                  <td>{item.value}</td>
                  <td>{item.begin_time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页控件 */}
        {totalPages > 1 && (
          <div className="pagination" style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              上一页
            </button>
            <span style={{ margin: '0 15px', display: 'flex', alignItems: 'center' }}>
              第 {page} / {totalPages} 页
            </span>
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

  // 获取指标的中文名称
  const getMetricName = (key) => {
    const names = {
      'peak_speed': '峰值速度',
      'avg_speed_5m': '5米平均速度',
      'avg_speed_10m': '10米平均速度',
      'avg_speed_15m': '15米平均速度',
      'avg_speed_20m': '20米平均速度',
      'avg_speed_25m': '25米平均速度',
      'avg_speed_30m': '30米平均速度',
      'peak_acceleration': '峰值加速度',
      'peak_power': '峰值功率',
      'peak_force': '峰值力量'
    }
    return names[key] || key
  }

  return (
    <div className="container">
      <h2>训练排行榜</h2>

      {/* 标签页导航 */}
      <div className="tabs">
        <button 
          className={`tab-btn ${activeTab === 'peak_speed' ? 'active' : ''}`}
          onClick={() => setActiveTab('peak_speed')}
        >
          峰值速度
        </button>
        <button 
          className={`tab-btn ${activeTab === 'avg_speed_5m' ? 'active' : ''}`}
          onClick={() => setActiveTab('avg_speed_5m')}
        >
          5米平均速度
        </button>
        <button 
          className={`tab-btn ${activeTab === 'avg_speed_10m' ? 'active' : ''}`}
          onClick={() => setActiveTab('avg_speed_10m')}
        >
          10米平均速度
        </button>
        <button 
          className={`tab-btn ${activeTab === 'avg_speed_15m' ? 'active' : ''}`}
          onClick={() => setActiveTab('avg_speed_15m')}
        >
          15米平均速度
        </button>
        <button 
          className={`tab-btn ${activeTab === 'avg_speed_20m' ? 'active' : ''}`}
          onClick={() => setActiveTab('avg_speed_20m')}
        >
          20米平均速度
        </button>
        <button 
          className={`tab-btn ${activeTab === 'avg_speed_25m' ? 'active' : ''}`}
          onClick={() => setActiveTab('avg_speed_25m')}
        >
          25米平均速度
        </button>
        <button 
          className={`tab-btn ${activeTab === 'avg_speed_30m' ? 'active' : ''}`}
          onClick={() => setActiveTab('avg_speed_30m')}
        >
          30米平均速度
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
      </div>

      {/* 标签页内容 */}
      <div className="tab-content">
        <div className="card">
          <h3>{getMetricName(activeTab)}排行榜</h3>
          {renderRankingTable(rankings[activeTab], getMetricName(activeTab))}
        </div>
      </div>
    </div>
  )
}
