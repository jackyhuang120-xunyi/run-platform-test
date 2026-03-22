import React, { useEffect, useState } from 'react'
import { getTrainRecords, getUsers } from '../services/api'
import { Link, useNavigate } from 'react-router-dom'

export default function TrainList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [uid, setUid] = useState('')
  const [userName, setUserName] = useState('')
  const [type, setType] = useState('')
  const [group, setGroup] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [selectedRecords, setSelectedRecords] = useState([])
  const [users, setUsers] = useState([])
  const [userGroups, setUserGroups] = useState({})
  const [sortField, setSortField] = useState('begin_time') // 默认按开始时间排序
  const [sortOrder, setSortOrder] = useState('desc') // 默认降序

  // 局部加载状态
  const [usersLoading, setUsersLoading] = useState(true)
  const [trainRecordsLoading, setTrainRecordsLoading] = useState(true)

  useEffect(() => {
    // 获取用户数据
    getUsers().then(data => {
      if (Array.isArray(data)) {
        setUsers(data)
        // 创建用户ID到用户组别的映射
        const groups = {}
        data.forEach(user => {
          groups[user.id] = user.user_group
        })
        setUserGroups(groups)
      }
    }).catch(err => console.error('获取用户数据失败:', err))
    .finally(() => setUsersLoading(false))
  }, [])

  useEffect(() => {
    let mounted = true
    setTrainRecordsLoading(true)
    const params = { page, pageSize }
    if (uid) params.uid = uid
    if (userName) params.user_name = userName
    if (type) params.type = type
    if (group) params.group = group
    if (start) params.start = start
    if (end) params.end = end

    // 添加排序参数
    params.sortField = sortField
    params.sortOrder = sortOrder
    
    getTrainRecords(params).then((res) => {
      if (!mounted) return
      const data = Array.isArray(res) ? res : (res.data || res)
      setRows(data)
      setTotal(res.total || (Array.isArray(res) ? data.length : data.length))
    }).catch(() => { if (mounted) setRows([]) })
    .finally(() => { if (mounted) setTrainRecordsLoading(false) })
    return () => { mounted = false }
  }, [page, pageSize, uid, userName, type, group, start, end, sortField, sortOrder])

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize))

  // 处理排序
  const handleSort = (field) => {
    if (sortField === field) {
      // 如果点击的是当前排序字段，则切换排序顺序
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // 如果点击的是新字段，则设置新字段并默认降序
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
    if (selectedRecords.length === rows.length) {
      setSelectedRecords([])
    } else {
      setSelectedRecords(rows.map(r => r.id))
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

  const handleFilter = () => {
    setPage(1);
    // 滚动到表格位置
    const tableSection = document.querySelector('[data-section="train-table"]');
    if (tableSection) {
      tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // 处理排序并滚动到表格
  const handleSortWithScroll = (field) => {
    handleSort(field);
    // 排序后也滚动到表格位置
    setTimeout(() => {
      const tableSection = document.querySelector('[data-section="train-table"]');
      if (tableSection) {
        tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 0);
  }

  const handleExport = async () => {
    const qp = new URLSearchParams()
    if (uid) qp.set('uid', uid)
    if (userName) qp.set('user_name', userName)
    if (type) qp.set('type', type)
    if (group) qp.set('group', group)
    if (start) qp.set('start', start)
    if (end) qp.set('end', end)
    const token = localStorage.getItem('admin_token')
    if (!token) { alert('请先登录管理员账号以导出'); window.location.href='/login'; return }
    try {
      const res = await fetch(`/api/trains/export?${qp.toString()}`, { headers: { Authorization: 'Bearer '+token } })
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

  const getUserGroupText = (groupId) => {
    const groupStr = String(groupId || '').trim();
    switch(groupStr) {
      case '1': return '组别1'
      case '2': return '组别2'
      case '3': return '组别3'
      case '4': return '组别4'
      case '5': return '组别5'
      default: return groupStr ? `组别${groupStr}` : '未知'
    }
  }

  const getUserGroupBadge = (groupId) => {
    const groupStr = String(groupId || '').trim();
    switch(groupStr) {
      case '1': return '1组'
      case '2': return '2组'
      case '3': return '3组'
      case '4': return '4组'
      case '5': return '5组'
      default: return groupStr ? `${groupStr}组` : '未知'
    }
  }

  return (
    <div className="container">
      <h2>训练记录</h2>

      {/* 筛选表单 */}
      <div className="card">
        <h3>筛选条件</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
          <div>
            <label>用户ID</label>
            <input
              type="number"
              value={uid}
              onChange={e=>setUid(e.target.value)}
              placeholder="输入用户ID"
              className="form-control"
            />
          </div>
          <div>
            <label>用户名</label>
            <input
              type="text"
              value={userName}
              onChange={e=>{
                console.log('用户名输入框值改变:', e.target.value);
                setUserName(e.target.value);
              }}
              placeholder="输入用户名"
              className="form-control"
            />
          </div>
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
            <label>用户组别</label>
            <select value={group} onChange={e=>setGroup(e.target.value)} className="form-control" style={{color: "#333", backgroundColor: "#fff"}}>
              <option value="">全部组别</option>
              <option value="1">1组</option>
              <option value="2">2组</option>
              <option value="3">3组</option>
              <option value="4">4组</option>
              <option value="5">5组</option>
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
          <button className="btn btn-secondary" onClick={() => { setUid(''); setUserName(''); setType(''); setGroup(''); setStart(''); setEnd(''); setPage(1) }}>重置</button>
          <button className="btn btn-success" onClick={handleExport}>导出筛选结果</button>
        </div>
      </div>

      {/* 训练记录表格 */}
      <div className="card" data-section="train-table">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
          <h3>训练记录列表</h3>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <button 
              className={`btn ${selectedRecords.length === rows.length && rows.length > 0 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleSelectAll}
              disabled={rows.length === 0}
            >
              {selectedRecords.length === rows.length && rows.length > 0 ? '取消全选' : '全选'}
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
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-xxl)' }}>没有找到符合条件的训练记录</div>
        ) : (
          <>
            <div className="data-table">
              <table style={{ fontSize: 'var(--font-size-md)', tableLayout: 'fixed', width: '100%' }}>
                <thead>
                  <tr style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold' }}>
                    <th style={{ width: '50px' }}>
                      <input
                        type="checkbox"
                        checked={selectedRecords.length === rows.length && rows.length > 0}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th style={{ width: '80px' }}>训练ID</th>
                    <th style={{ width: '120px' }}>用户ID</th>
                    <th style={{ width: '100px' }}>用户组别</th>
                    <th style={{ width: '100px' }}>训练类型</th>
                    <th 
                      style={{ width: '160px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSortWithScroll('begin_time')}
                    >
                      开始时间 {sortField === 'begin_time' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      style={{ width: '100px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSortWithScroll('peak_speed')}
                    >
                      峰值速度(m/s) {sortField === 'peak_speed' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      style={{ width: '100px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSortWithScroll('train_dis')}
                    >
                      训练距离(m) {sortField === 'train_dis' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th style={{ width: '80px' }}>阻力(kg)</th>
                    <th 
                      style={{ width: '80px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSortWithScroll('total_time')}
                    >
                      用时(s) {sortField === 'total_time' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th style={{ width: '100px' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={{ fontSize: 'var(--font-size-md)', padding: '8px' }}>
                      <td style={{ width: '50px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedRecords.includes(r.id)}
                          onChange={() => handleSelectRecord(r.id)}
                        />
                      </td>
                      <td style={{ width: '80px' }}>{r.id}</td>
                      <td style={{ width: '120px' }}>{r.uid} {r.user_name ? `(${r.user_name})` : ''}</td>
                      <td style={{ width: '100px' }}>{userGroups[r.uid] ? `${userGroups[r.uid]}组` : '未知'}</td>
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

            {/* 分页控件 */}
            <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                上一页
              </button>
              <span style={{ margin: '0 var(--spacing-sm)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-md)' }}>
                第 {page} 页，共 {totalPages} 页 | 总计 {total} 条记录
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--text-secondary)' }}>跳转至</span>
                <select
                  value={page}
                  onChange={(e) => setPage(parseInt(e.target.value, 10))}
                  style={{ padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#333', backgroundColor: '#fff' }}
                >
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
                <span style={{ color: 'var(--text-secondary)' }}>页</span>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                下一页
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}