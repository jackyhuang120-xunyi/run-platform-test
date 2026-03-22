
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getUserById, getTrainRecords, getRankings, getTrainStats } from '../services/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

export default function UserSummary() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [trainRecords, setTrainRecords] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [type, setType] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [selectedRecords, setSelectedRecords] = useState([])
  const [sortField, setSortField] = useState('begin_time')
  const [sortOrder, setSortOrder] = useState('desc')
  const [rankings, setRankings] = useState({})
  const [rankingScope, setRankingScope] = useState('global') // 'global' 或 'group'
  const [fullStats, setFullStats] = useState(null) // 用于存储完整统计数据

  // 局部加载状态
  const [userLoading, setUserLoading] = useState(true)
  const [trainRecordsLoading, setTrainRecordsLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [rankingsLoading, setRankingsLoading] = useState(true)

  // 训练类型映射
  const getTrainingTypeText = (type) => {
    const typeStr = String(type || '').trim()
    switch(typeStr) {
      case '1': return '抗阻训练'
      case '2': return '牵引训练'
      case '3': return '折返训练'
      default: return typeStr ? `类型${typeStr}` : '未知'
    }
  }

  // 训练类型徽章
  const getTrainingTypeBadge = (type) => {
    const typeStr = String(type || '').trim()
    switch(typeStr) {
      case '1': return <span className="status-badge" style={{background: '#FFF9C4', color: '#8D6E63', borderColor: '#F5F5DC'}}>{getTrainingTypeText(type)}</span>
      case '2': return <span className="status-badge" style={{background: '#E0F7FA', color: '#00838F', borderColor: '#B2EBF2'}}>{getTrainingTypeText(type)}</span>
      case '3': return <span className="status-badge" style={{background: '#EDE7F6', color: '#512DA8', borderColor: '#D1C4E9'}}>{getTrainingTypeText(type)}</span>
      default: return <span className="status-badge">{getTrainingTypeText(type)}</span>
    }
  }

  // 格式化时间
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

  // 格式化日期为年月日
  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    } catch (e) {
      return dateStr
    }
  }

  // 处理排序
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  // 处理记录选择
  const handleSelectRecord = (recordId) => {
    setSelectedRecords(prev => {
      if (prev.includes(recordId)) {
        return prev.filter(id => id !== recordId)
      } else {
        return [...prev, recordId]
      }
    })
  }

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedRecords.length === trainRecords.length) {
      setSelectedRecords([])
    } else {
      setSelectedRecords(trainRecords.map(r => r.id))
    }
  }

  // 跳转到对比页面
  const handleCompare = () => {
    if (selectedRecords.length < 2) {
      alert('请至少选择两条训练记录进行对比')
      return
    }
    navigate(`/trains/comparison?ids=${selectedRecords.join(',')}`)
  }

  // 处理筛选
  const handleFilter = () => {
    setPage(1)
    // 滚动到页面顶部的训练记录表格
    const recordsSection = document.querySelector('[data-section="train-records"]')
    if (recordsSection) {
      recordsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // 处理排序
  const handleSortWithScroll = (field) => {
    handleSort(field)
    // 排序后也滚动到表格位置
    setTimeout(() => {
      const recordsSection = document.querySelector('[data-section="train-records"]')
      if (recordsSection) {
        recordsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 0)
  }

  // 获取用户信息
  useEffect(() => {
    const fetchUser = async () => {
      try {
        setUserLoading(true)
        console.log('[UserSummary] 开始获取用户数据, ID:', id)
        const userData = await getUserById(id)
        console.log('[UserSummary] 获取到的用户数据:', userData)
        setUser(userData)
      } catch (error) {
        console.error('[UserSummary] 获取用户数据失败:', error)
      } finally {
        setUserLoading(false)
      }
    }

    fetchUser()
  }, [id])

  // 获取训练记录
  useEffect(() => {
    const fetchTrainRecords = async () => {
      try {
        setTrainRecordsLoading(true)
        console.log('[UserSummary] 开始获取训练记录')
        const params = { page, pageSize, uid: id }
        if (type) params.type = type
        if (start) params.start = start
        if (end) params.end = end
        params.sortField = sortField
        params.sortOrder = sortOrder
        console.log('[UserSummary] 请求参数:', params)
        
        const trainData = await getTrainRecords(params)
        console.log('[UserSummary] 获取到的训练数据:', trainData)
        
        const records = Array.isArray(trainData) ? trainData : (trainData.data || [])
        setTrainRecords(records)
        setTotal(trainData.total || records.length)
      } catch (error) {
        console.error('[UserSummary] 获取训练记录失败:', error)
        console.error('[UserSummary] 错误详情:', error.response?.data)
      } finally {
        setTrainRecordsLoading(false)
      }
    }

    fetchTrainRecords()
  }, [id, page, pageSize, type, start, end, sortField, sortOrder])

  // 获取完整的训练统计数据（不分页）
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true)
        console.log('[UserSummary] 开始获取完整训练统计数据')
        const statsParams = { uid: id }
        if (type) statsParams.type = type
        if (start) statsParams.start = start
        if (end) statsParams.end = end
        const statsData = await getTrainStats(statsParams)
        console.log('[UserSummary] 获取到的统计数据:', statsData)
        setFullStats(statsData)
      } catch (error) {
        console.error('[UserSummary] 获取统计数据失败:', error)
      } finally {
        setStatsLoading(false)
      }
    }

    fetchStats()
  }, [id, type, start, end])

  // 获取排行榜数据
  useEffect(() => {
    const fetchRankings = async () => {
      try {
        setRankingsLoading(true)
        const params = {}
        // 如果选择组内排名，传入用户所属组别
        if (rankingScope === 'group' && user?.user_group) {
          params.group = user.user_group
        }
        const rankingsData = await getRankings(params)
        setRankings(rankingsData.data || {})
      } catch (error) {
        console.error('[UserSummary] 获取排行榜数据失败:', error)
      } finally {
        setRankingsLoading(false)
      }
    }
    fetchRankings()
  }, [rankingScope, user?.user_group])

  // 计算统计数据
  const calculateStats = () => {
    // 如果已经有完整统计数据，直接使用
    if (fullStats) {
      return {
        totalTrainings: fullStats.total?.count || 0,
        totalDistance: (fullStats.total?.distance || 0).toFixed(2),
        totalTime: (fullStats.total?.time || 0).toFixed(2),
        peakSpeed: fullStats.total?.peakSpeed || 0,
        peakSpeedRecord: fullStats.total?.peakSpeedRecord || null,
        trainingTypes: [
          { name: getTrainingTypeText('1'), value: fullStats.resistance?.count || 0 },
          { name: getTrainingTypeText('2'), value: fullStats.traction?.count || 0 }
        ].filter(t => t.value > 0),
        resistance: {
          count: fullStats.resistance?.count || 0,
          distance: (fullStats.resistance?.distance || 0).toFixed(2),
          time: (fullStats.resistance?.time || 0).toFixed(2),
          peakSpeed: (fullStats.resistance?.peakSpeed || 0).toFixed(2),
          peakSpeedRecord: fullStats.resistance?.peakSpeedRecord || null
        },
        traction: {
          count: fullStats.traction?.count || 0,
          distance: (fullStats.traction?.distance || 0).toFixed(2),
          time: (fullStats.traction?.time || 0).toFixed(2),
          peakSpeed: (fullStats.traction?.peakSpeed || 0).toFixed(2),
          peakSpeedRecord: fullStats.traction?.peakSpeedRecord || null
        }
      }
    }

    // 如果没有完整统计数据，返回空统计（这种情况不应该发生）
    if (!trainRecords || trainRecords.length === 0) {
      return {
        totalTrainings: 0,
        totalDistance: 0,
        totalTime: 0,
        peakSpeed: 0,
        peakSpeedRecord: null,
        trainingTypes: [],
        resistance: {
          count: 0,
          distance: 0,
          time: 0,
          peakSpeed: 0,
          peakSpeedRecord: null
        },
        traction: {
          count: 0,
          distance: 0,
          time: 0,
          peakSpeed: 0,
          peakSpeedRecord: null
        }
      }
    }

    // 筛选抗阻训练(type=1)和牵引训练(type=2)
    const resistanceRecords = trainRecords.filter(r => String(r.type) === '1')
    const tractionRecords = trainRecords.filter(r => String(r.type) === '2')

    // 抗阻训练统计
    const resistanceStats = {
      count: resistanceRecords.length,
      distance: resistanceRecords.reduce((sum, r) => sum + (r.train_dis || 0), 0),
      time: resistanceRecords.reduce((sum, r) => sum + (r.total_time || 0), 0),
      peakSpeed: resistanceRecords.length > 0 ? Math.max(...resistanceRecords.map(r => r.peak_speed || 0)) : 0
    }

    // 找到抗阻训练的峰值速度记录
    const resistancePeakSpeedRecord = resistanceRecords.length > 0
      ? resistanceRecords.reduce((max, r) => (r.peak_speed || 0) > (max.peak_speed || 0) ? r : max, resistanceRecords[0])
      : null

    // 牵引训练统计
    const tractionStats = {
      count: tractionRecords.length,
      distance: tractionRecords.reduce((sum, r) => sum + (r.train_dis || 0), 0),
      time: tractionRecords.reduce((sum, r) => sum + (r.total_time || 0), 0),
      peakSpeed: tractionRecords.length > 0 ? Math.max(...tractionRecords.map(r => r.peak_speed || 0)) : 0
    }

    // 找到牵引训练的峰值速度记录
    const tractionPeakSpeedRecord = tractionRecords.length > 0
      ? tractionRecords.reduce((max, r) => (r.peak_speed || 0) > (max.peak_speed || 0) ? r : max, tractionRecords[0])
      : null

    const totalDistance = trainRecords.reduce((sum, r) => sum + (r.train_dis || 0), 0)
    const totalTime = trainRecords.reduce((sum, r) => sum + (r.total_time || 0), 0)

    // 找到峰值速度记录
    const peakSpeedRecord = trainRecords.reduce((max, r) => 
      (r.peak_speed || 0) > (max.peak_speed || 0) ? r : max, trainRecords[0])

    // 统计训练类型
    const typeCount = {}
    trainRecords.forEach(r => {
      const type = r.type || '未知'
      const typeName = getTrainingTypeText(type)
      typeCount[typeName] = (typeCount[typeName] || 0) + 1
    })

    const trainingTypes = Object.entries(typeCount).map(([type, count]) => ({
      name: type,
      value: count
    }))

    return {
      totalTrainings: trainRecords.length,
      totalDistance: totalDistance.toFixed(2),
      totalTime: totalTime.toFixed(2),
      peakSpeed: peakSpeedRecord.peak_speed || 0,
      peakSpeedRecord,
      trainingTypes,
      resistance: {
        count: resistanceStats.count,
        distance: resistanceStats.distance.toFixed(2),
        time: resistanceStats.time.toFixed(2),
        peakSpeed: resistanceStats.peakSpeed.toFixed(2),
        peakSpeedRecord: resistancePeakSpeedRecord
      },
      traction: {
        count: tractionStats.count,
        distance: tractionStats.distance.toFixed(2),
        time: tractionStats.time.toFixed(2),
        peakSpeed: tractionStats.peakSpeed.toFixed(2),
        peakSpeedRecord: tractionPeakSpeedRecord
      }
    }
  }

  // 计算用户排名和与第一名的对比
  const calculateUserRanking = (metricKey, trainType) => {
    console.log('[calculateUserRanking] metricKey:', metricKey, 'trainType:', trainType)
    console.log('[calculateUserRanking] rankings:', rankings)
    console.log('[calculateUserRanking] rankings[trainType]:', rankings[trainType])
    
    if (!rankings || !rankings[trainType] || !rankings[trainType][metricKey]) {
      console.log('[calculateUserRanking] 排行榜数据不存在')
      return {
        rank: null,
        userValue: null,
        firstValue: null,
        gap: null,
        percentage: null
      }
    }

    const rankingList = rankings[trainType][metricKey]
    console.log('[calculateUserRanking] rankingList:', rankingList)
    
    if (!rankingList || rankingList.length === 0) {
      console.log('[calculateUserRanking] 排行榜列表为空')
      return {
        rank: null,
        userValue: null,
        firstValue: null,
        gap: null,
        percentage: null
      }
    }

    // 找到用户的排名
    console.log('[calculateUserRanking] 查找用户ID:', Number(id))
    console.log('[calculateUserRanking] 当前用户名:', user?.name)
    console.log('[calculateUserRanking] rankingList第一个item的所有字段:', Object.keys(rankingList[0] || {}))
    const userRanking = rankingList.find(item => {
      console.log('[calculateUserRanking] 检查item:', item, 'item.user_name:', item.user_name, 'user?.name:', user?.name, 'item.user_name === user?.name:', item.user_name === user?.name)
      // 通过用户名来匹配用户
      return item.user_name === user?.name
    })
    
    if (!userRanking) {
      console.log('[calculateUserRanking] 未找到用户排名')
      return {
        rank: null,
        userValue: null,
        firstValue: null,
        gap: null,
        percentage: null
      }
    }

    const rank = rankingList.indexOf(userRanking) + 1
    const userValue = Number(userRanking.value)
    const firstValue = Number(rankingList[0].value)
    const gap = firstValue - userValue
    const percentage = firstValue > 0 ? ((userValue / firstValue) * 100).toFixed(2) : 0

    console.log('[calculateUserRanking] 用户排名:', rank, '用户数值:', userValue, '第一名数值:', firstValue)

    return {
      rank,
      userValue,
      firstValue,
      gap,
      percentage
    }
  }

  // 计算Y轴范围，添加边距
  const calculateYAxisDomain = (data, key) => {
    if (!data || data.length === 0) return [0, 1]

    const values = data.map(d => d[key]).filter(v => v !== undefined && v !== null)
    if (values.length === 0) return [0, 1]

    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min

    // 添加10%的边距
    const padding = range === 0 ? max * 0.1 : range * 0.1

    return [
      min - padding,
      max + padding
    ]
  }

  // 格式化Y轴刻度，智能处理小数位数
  const formatYAxisTick = (value) => {
    if (value === undefined || value === null) return ''
    const num = Number(value)
    // 如果是整数，不显示小数
    if (Number.isInteger(num)) {
      return num.toString()
    }
    // 否则最多保留2位小数
    return num.toFixed(2)
  }

  // 准备趋势图数据
  const prepareTrendData = () => {
    if (!trainRecords || trainRecords.length === 0) return []

    // 按时间排序
    const sorted = [...trainRecords].sort((a, b) => 
      new Date(a.begin_time) - new Date(b.begin_time)
    )

    return sorted.map(r => ({
      date: new Date(r.begin_time).toLocaleDateString('zh-CN'),
      speed: r.peak_speed || 0,
      distance: r.train_dis || 0,
      time: r.total_time || 0,
      acceleration: r.peak_acceleration || 0,
      force: r.peak_force || 0,
      power: r.peak_power || 0,
      resistance: r.end_force || 0,
      avg_step_length: r.avg_step_length || 0,
      avg_step_frequency: r.avg_step_frequency || 0
    }))
  }

  // 饼图颜色
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

  // 处理分页
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const stats = calculateStats()
  const trendData = prepareTrendData()

  if (userLoading) {
    return <div className="container">加载用户信息中...</div>
  }

  if (!user) {
    return <div className="container">用户不存在</div>
  }

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
          <h2 style={{ fontSize: 'var(--font-size-h2)' }}>用户个人总结</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/users')}>
            返回列表
          </button>
        </div>

        {/* 用户基本信息 */}
        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <h3 style={{ fontSize: 'var(--font-size-h3)' }}>基本信息</h3>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          {userLoading ? (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-lg)', color: 'var(--text-muted)' }}>加载用户信息中...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)' }}>
              <div>
                <strong>ID:</strong> {user.id}
              </div>
              <div>
                <strong>姓名:</strong> {user.name}
              </div>
              <div>
                <strong>分组:</strong> {user.user_group || '-'}
              </div>
              <div>
                <strong>性别:</strong> {user.gender || '-'}
              </div>
              <div>
                <strong>体重:</strong> {user.weight || '-'} kg
              </div>
              <div>
                <strong>生日:</strong> {formatDate(user.birthday)}
              </div>
            </div>
          )}
          </div>
        </div>

        {/* 训练统计 */}
        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <h3 style={{ fontSize: 'var(--font-size-h3)' }}>训练统计</h3>
          
          {statsLoading ? (
            <div className="card" style={{ padding: 'var(--spacing-lg)', textAlign: 'center', color: 'var(--text-muted)' }}>
              加载统计数据中...
            </div>
          ) : (
            <>
          {/* 抗阻训练统计 */}
          <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
            <h4 style={{ fontSize: 'var(--font-size-h4)', marginBottom: 'var(--spacing-md)' }}>抗阻训练</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--spacing-lg)' }}>
              <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-primary)' }}>
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <h3>{stats.resistance.count}</h3>
                  <p>训练次数</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
                <div className="stat-icon">📏</div>
                <div className="stat-content">
                  <h3>{stats.resistance.distance}</h3>
                  <p>总距离 (m)</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }}>
                <div className="stat-icon">⏱️</div>
                <div className="stat-content">
                  <h3>{stats.resistance.time}</h3>
                  <p>总用时 (s)</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-secondary)' }}>
                <div className="stat-icon">⚡</div>
                <div className="stat-content">
                  <h3>{stats.resistance.peakSpeed}</h3>
                  <p>峰值速度 (m/s)</p>
                </div>
              </div>
            </div>
          </div>

          {/* 牵引训练统计 */}
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <h4 style={{ fontSize: 'var(--font-size-h4)', marginBottom: 'var(--spacing-md)' }}>牵引训练</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--spacing-lg)' }}>
              <div className="stat-card" style={{ '--gradient-primary': 'var(--gradient-success)' }}>
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <h3>{stats.traction.count}</h3>
                  <p>训练次数</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' }}>
                <div className="stat-icon">📏</div>
                <div className="stat-content">
                  <h3>{stats.traction.distance}</h3>
                  <p>总距离 (m)</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' }}>
                <div className="stat-icon">⏱️</div>
                <div className="stat-content">
                  <h3>{stats.traction.time}</h3>
                  <p>总用时 (s)</p>
                </div>
              </div>
              <div className="stat-card" style={{ '--gradient-primary': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <div className="stat-icon">⚡</div>
                <div className="stat-content">
                  <h3>{stats.traction.peakSpeed}</h3>
                  <p>峰值速度 (m/s)</p>
                </div>
              </div>
            </div>
          </div>
            </>
          )}
        </div>

        {/* 排名信息 */}
        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
            <h3 style={{ fontSize: 'var(--font-size-h3)', margin: 0 }}>个人最佳排名</h3>
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
              <button
                className={`btn btn-sm ${rankingScope === 'global' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRankingScope('global')}
              >
                全局排名
              </button>
              <button
                className={`btn btn-sm ${rankingScope === 'group' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRankingScope('group')}
                disabled={!user?.user_group}
                title={!user?.user_group ? '该用户未分组' : ''}
              >
                组内排名
              </button>
            </div>
          </div>
          
          {rankingsLoading ? (
            <div className="card" style={{ padding: 'var(--spacing-lg)', textAlign: 'center', color: 'var(--text-muted)' }}>
              加载排行数据中...
            </div>
          ) : (
            <>
          {/* 抗阻训练排名 */}
          <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)' }}>
            <h4 style={{ fontSize: 'var(--font-size-h4)', marginBottom: 'var(--spacing-md)' }}>抗阻训练排名</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--spacing-md)' }}>
              {[
                { key: 'peak_speed', label: '峰值速度', unit: 'm/s', gradient: 'var(--gradient-primary)' },
                { key: 'peak_acceleration', label: '峰值加速度', unit: 'm/s²', gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
                { key: 'peak_power', label: '峰值功率', unit: 'W', gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
                { key: 'peak_force', label: '峰值力量', unit: 'kg', gradient: 'var(--gradient-secondary)' },
                { key: 'avg_step_length', label: '平均步长', unit: 'm', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
                { key: 'avg_step_frequency', label: '平均步频', unit: 'Hz', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }
              ].map(metric => {
                const ranking = calculateUserRanking(metric.key, 'resistance')
                return (
                  <div key={metric.key} className="stat-card" style={{ '--gradient-primary': metric.gradient }}>
                    <div className="stat-icon">🏆</div>
                    <div className="stat-content">
                      <h3>{ranking.rank !== null ? `第${ranking.rank}` : '-'}</h3>
                      <p>{metric.label} {ranking.rank !== null ? `${ranking.userValue?.toFixed(2)}/${ranking.firstValue?.toFixed(2)}` : ''}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 牵引训练排名 */}
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <h4 style={{ fontSize: 'var(--font-size-h4)', marginBottom: 'var(--spacing-md)' }}>牵引训练排名</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--spacing-md)' }}>
              {[
                { key: 'peak_speed', label: '峰值速度', unit: 'm/s', gradient: 'var(--gradient-success)' },
                { key: 'peak_acceleration', label: '峰值加速度', unit: 'm/s²', gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
                { key: 'peak_power', label: '峰值功率', unit: 'W', gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' },
                { key: 'peak_force', label: '峰值力量', unit: 'kg', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
                { key: 'avg_step_length', label: '平均步长', unit: 'm', gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
                { key: 'avg_step_frequency', label: '平均步频', unit: 'Hz', gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }
              ].map(metric => {
                const ranking = calculateUserRanking(metric.key, 'towing')
                return (
                  <div key={metric.key} className="stat-card" style={{ '--gradient-primary': metric.gradient }}>
                    <div className="stat-icon">🏆</div>
                    <div className="stat-content">
                      <h3>{ranking.rank !== null ? `第${ranking.rank}` : '-'}</h3>
                      <p>{metric.label} {ranking.rank !== null ? `${ranking.userValue?.toFixed(2)}/${ranking.firstValue?.toFixed(2)}` : ''}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
            </>
          )}
        </div>

        {/* 个人最佳时刻 */}
        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <h3 style={{ fontSize: 'var(--font-size-h3)' }}>个人最佳时刻</h3>
          
          {/* 抗阻训练最佳时刻 */}
          {stats.resistance.peakSpeedRecord && (
            <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                <h4 style={{ fontSize: 'var(--font-size-h4)', margin: 0 }}>抗阻训练最佳时刻</h4>
                <Link to={`/trains/${stats.resistance.peakSpeedRecord.id}`} className="btn btn-secondary btn-sm">
                  详情
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)' }}>
                <div>
                  <strong>训练ID:</strong> {stats.resistance.peakSpeedRecord.id}
                </div>
                <div>
                  <strong>峰值速度:</strong> {stats.resistance.peakSpeedRecord.peak_speed.toFixed(2)} m/s
                </div>
                <div>
                  <strong>训练距离:</strong> {stats.resistance.peakSpeedRecord.train_dis} m
                </div>
                <div>
                  <strong>训练时长:</strong> {stats.resistance.peakSpeedRecord.total_time.toFixed(2)} s
                </div>
                <div>
                  <strong>阻力:</strong> {stats.resistance.peakSpeedRecord.end_force ? stats.resistance.peakSpeedRecord.end_force.toFixed(2) : '-'} kg
                </div>
                <div style={{ whiteSpace: 'nowrap' }}>
                  <strong>训练时间:</strong> {formatDateTime(stats.resistance.peakSpeedRecord.begin_time)}
                </div>
              </div>
            </div>
          )}

          {/* 牵引训练最佳时刻 */}
          {stats.traction.peakSpeedRecord && (
            <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                <h4 style={{ fontSize: 'var(--font-size-h4)', margin: 0 }}>牵引训练最佳时刻</h4>
                <Link to={`/trains/${stats.traction.peakSpeedRecord.id}`} className="btn btn-secondary btn-sm">
                  详情
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)' }}>
                <div>
                  <strong>训练ID:</strong> {stats.traction.peakSpeedRecord.id}
                </div>
                <div>
                  <strong>峰值速度:</strong> {stats.traction.peakSpeedRecord.peak_speed.toFixed(2)} m/s
                </div>
                <div>
                  <strong>训练距离:</strong> {stats.traction.peakSpeedRecord.train_dis} m
                </div>
                <div>
                  <strong>训练时长:</strong> {stats.traction.peakSpeedRecord.total_time.toFixed(2)} s
                </div>
                <div>
                  <strong>阻力:</strong> {stats.traction.peakSpeedRecord.end_force ? stats.traction.peakSpeedRecord.end_force.toFixed(2) : '-'} kg
                </div>
                <div style={{ whiteSpace: 'nowrap' }}>
                  <strong>训练时间:</strong> {formatDateTime(stats.traction.peakSpeedRecord.begin_time)}
                </div>
              </div>
            </div>
          )}

          {/* 如果没有最佳时刻记录 */}
          {!stats.resistance.peakSpeedRecord && !stats.traction.peakSpeedRecord && (
            <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
              <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>暂无训练记录</p>
            </div>
          )}
        </div>

        {/* 指标变化趋势图 */}
        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <h3 style={{ fontSize: 'var(--font-size-h3)' }}>指标变化趋势</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--spacing-lg)' }}>
            {/* 峰值速度趋势 */}
            <div className="chart-container" style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#ffffff" />
                  <YAxis stroke="#ffffff" domain={calculateYAxisDomain(trendData, 'speed')} allowDataOverflow={false} tick={{ fill: '#ffffff' }} tickFormatter={formatYAxisTick} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="speed" stroke="#00E5FF" name="峰值速度 (m/s)" dot={false} strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* 峰值加速度趋势 */}
            <div className="chart-container" style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#ffffff" />
                  <YAxis stroke="#ffffff" domain={calculateYAxisDomain(trendData, 'acceleration')} allowDataOverflow={false} tick={{ fill: '#ffffff' }} tickFormatter={formatYAxisTick} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="acceleration" stroke="#FF4081" name="峰值加速度 (m/s²)" dot={false} strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* 峰值力量趋势 */}
            <div className="chart-container" style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#ffffff" />
                  <YAxis stroke="#ffffff" domain={calculateYAxisDomain(trendData, 'force')} allowDataOverflow={false} tick={{ fill: '#ffffff' }} tickFormatter={formatYAxisTick} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="force" stroke="#00E676" name="峰值力量 (N)" dot={false} strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* 峰值功率趋势 */}
            <div className="chart-container" style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#ffffff" />
                  <YAxis stroke="#ffffff" domain={calculateYAxisDomain(trendData, 'power')} allowDataOverflow={false} tick={{ fill: '#ffffff' }} tickFormatter={formatYAxisTick} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="power" stroke="#FFD740" name="峰值功率 (W)" dot={false} strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* 平均步长趋势 */}
            <div className="chart-container" style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#ffffff" />
                  <YAxis stroke="#ffffff" domain={calculateYAxisDomain(trendData, 'avg_step_length')} allowDataOverflow={false} tick={{ fill: '#ffffff' }} tickFormatter={formatYAxisTick} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="avg_step_length" stroke="#667eea" name="平均步长 (m)" dot={false} strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* 平均步频趋势 */}
            <div className="chart-container" style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#ffffff" />
                  <YAxis stroke="#ffffff" domain={calculateYAxisDomain(trendData, 'avg_step_frequency')} allowDataOverflow={false} tick={{ fill: '#ffffff' }} tickFormatter={formatYAxisTick} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="avg_step_frequency" stroke="#f093fb" name="平均步频 (Hz)" dot={false} strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 训练记录列表 */}
        <div data-section="train-records">
          <h3 style={{ fontSize: 'var(--font-size-h3)' }}>训练记录</h3>
          
          {/* 筛选表单 */}
          <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
            <h4 style={{ fontSize: 'var(--font-size-h4)', marginBottom: 'var(--spacing-md)' }}>筛选条件</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)' }}>
              <div>
                <label>训练类型</label>
                <select value={type} onChange={e=>setType(e.target.value)} className="form-control" style={{color: "#333", backgroundColor: "#fff"}}>
                  <option value="">全部类型</option>
                  <option value="1">抗阻训练</option>
                  <option value="2">牵引训练</option>
                  <option value="3">折返训练</option>
                </select>
              </div>
              <div>
                <label>开始日期</label>
                <input
                  type="date"
                  value={start}
                  onChange={e=>setStart(e.target.value)}
                  className="form-control"
                />
              </div>
              <div>
                <label>结束日期</label>
                <input
                  type="date"
                  value={end}
                  onChange={e=>setEnd(e.target.value)}
                  className="form-control"
                />
              </div>
            </div>
            <div style={{ marginTop: 'var(--spacing-lg)', display: 'flex', gap: 'var(--spacing-sm)' }}>
              <button className="btn btn-primary" onClick={handleFilter}>应用筛选</button>
              <button className="btn btn-secondary" onClick={() => { setType(''); setStart(''); setEnd(''); setPage(1) }}>重置</button>
            </div>
          </div>

          {/* 训练记录表格 */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
              <h4 style={{ fontSize: 'var(--font-size-h4)', margin: 0 }}>训练记录列表</h4>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                <button
                  className={`btn ${selectedRecords.length === trainRecords.length && trainRecords.length > 0 ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={handleSelectAll}
                  disabled={trainRecords.length === 0}
                >
                  {selectedRecords.length === trainRecords.length && trainRecords.length > 0 ? '取消全选' : '全选'}
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleCompare}
                  disabled={selectedRecords.length < 2}
                >
                  对比已选记录 ({selectedRecords.length})
                </button>
              </div>
            </div>
            {trainRecordsLoading ? (
              <div style={{ textAlign: 'center', padding: 'var(--spacing-xxl)' }}>加载训练记录中...</div>
            ) : trainRecords.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--spacing-xxl)' }}>没有找到符合条件的训练记录</div>
            ) : (
              <div className="data-table">
                <table style={{ fontSize: 'var(--font-size-md)', tableLayout: 'fixed', width: '100%' }}>
                  <thead>
                    <tr style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold' }}>
                      <th style={{ width: '50px', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={selectedRecords.length === trainRecords.length && trainRecords.length > 0}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th style={{ width: '80px', whiteSpace: 'nowrap' }}>训练ID</th>
                      <th style={{ width: '100px', whiteSpace: 'nowrap' }}>训练类型</th>
                      <th
                        style={{ width: '160px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        onClick={() => handleSortWithScroll('begin_time')}
                      >
                        开始时间 {sortField === 'begin_time' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        style={{ width: '100px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        onClick={() => handleSortWithScroll('peak_speed')}
                      >
                        峰值速度(m/s) {sortField === 'peak_speed' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        style={{ width: '100px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        onClick={() => handleSortWithScroll('train_dis')}
                      >
                        训练距离(m) {sortField === 'train_dis' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th style={{ width: '80px', whiteSpace: 'nowrap' }}>阻力(kg)</th>
                      <th
                        style={{ width: '80px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        onClick={() => handleSortWithScroll('total_time')}
                      >
                        用时(s) {sortField === 'total_time' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th style={{ width: '100px', whiteSpace: 'nowrap' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainRecords.map(r => (
                      <tr key={r.id} style={{ fontSize: 'var(--font-size-md)', padding: '8px' }}>
                        <td style={{ width: '50px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedRecords.includes(r.id)}
                            onChange={() => handleSelectRecord(r.id)}
                          />
                        </td>
                        <td style={{ width: '80px' }}>{r.id}</td>
                        <td style={{ width: '100px' }}>{getTrainingTypeBadge(r.type)}</td>
                        <td style={{ width: '160px' }}>{formatDateTime(r.begin_time)}</td>
                        <td style={{ width: '100px' }}>{r.peak_speed ? parseFloat(r.peak_speed).toFixed(2) : '-'}</td>
                        <td style={{ width: '100px' }}>{r.train_dis ?? '-'}</td>
                        <td style={{ width: '80px' }}>{r.end_force ?? '-'}</td>
                        <td style={{ width: '80px' }}>{r.total_time ? parseFloat(r.total_time).toFixed(2) : '-'}</td>
                        <td style={{ width: '100px', textAlign: 'center' }}>
                          <Link to={`/trains/${r.id}`}>
                            <button className="btn btn-primary" style={{padding: '10px 18px', fontSize: 'var(--font-size-sm)'}}>
                              详情
                            </button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 分页控件 */}
            {totalPages > 1 && (
              <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)' }}>
                <button 
                className="btn btn-secondary btn-sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                上一页
              </button>
              <span>第 {page} 页 / 共 {totalPages} 页</span>
              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                下一页
              </button>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
