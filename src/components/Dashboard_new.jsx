import React, { useEffect, useState } from 'react'
import { getTrainRecords } from '../services/api'
import Charts from './Charts'

export default function Dashboard() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getTrainRecords().then((res) => {
      if (!mounted) return
      const data = Array.isArray(res) ? res : (res && res.data) || []
      setRecords(data)
    }).catch(() => { if (mounted) setRecords([]) })
    .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  // 计算统计数据
  const totalRecords = records.length
  const avgTime = totalRecords ? (records.reduce((s,r)=>s+(r.total_time||0),0)/totalRecords).toFixed(2) : '0'
  const avgSpeed = totalRecords ? (records.reduce((s,r)=>s+(r.peak_speed ?? r.max_speed ?? 0),0)/totalRecords).toFixed(2) : '0'
  const maxSpeed = totalRecords ? Math.max(...records.map(r => r.peak_speed ?? r.max_speed ?? 0)).toFixed(2) : '0'

  const labels = records.map(r => r.begin_time)
  const speeds = records.map(r => r.peak_speed ?? r.max_speed ?? 0)

  const handleExportAll = async () => {
    const token = localStorage.getItem('admin_token')
    if (!token) { alert('请先登录管理员账号以导出'); window.location.href='/login'; return }
    try {
      const res = await fetch('/api/trains/export', { headers: { Authorization: 'Bearer '+token } })
      if (!res.ok) { const j = await res.json(); alert('导出失败: '+(j.error||res.status)); return }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `trains_export_${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) { alert('导出错误：'+e.message) }
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

  return (
    <div className="container">
      <h2>训练数据概览</h2>

      {/* 统计卡片区域 */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)' }}>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>{totalRecords}</h3>
            <p>训练次数</p>
          </div>
        </div>

        <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-secondary)' }}>
          <div className="stat-icon">⏱️</div>
          <div className="stat-content">
            <h3>{avgTime}</h3>
            <p>平均用时(秒)</p>
          </div>
        </div>

        <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-success)' }}>
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <h3>{avgSpeed}</h3>
            <p>平均速度(m/s)</p>
          </div>
        </div>

        <div className="stat-card" style={{ '--gradient-primary': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
          <div className="stat-icon">🚀</div>
          <div className="stat-content">
            <h3>{maxSpeed}</h3>
            <p>最高速度(m/s)</p>
          </div>
        </div>
      </div>

      {/* 操作按钮区域 */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>数据操作</h3>
        <button className="btn btn-primary" onClick={handleExportAll}>导出全部数据为CSV</button>
      </div>

      {/* 图表区域 */}
      <div className="chart-container">
        <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>峰值速度趋势图</h3>
        <Charts labels={labels} data={speeds} title="峰值速度（m/s）" />
      </div>
    </div>
  )
}
