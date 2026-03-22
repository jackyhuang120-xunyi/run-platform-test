import React, { useEffect, useState } from 'react'
import { getUsers } from '../services/api'
import { Link } from 'react-router-dom'

// 计算年龄的辅助函数
const calculateAge = (birthday) => {
  if (!birthday) return '-';
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export default function UserList() {
  const [users, setUsers] = useState([])
  const [filteredUsers, setFilteredUsers] = useState([])
  const [filters, setFilters] = useState({
    id: '',
    name: '',
    group: ''
  })
  const [sortField, setSortField] = useState('id') // 默认按ID排序
  const [sortOrder, setSortOrder] = useState('asc') // 默认升序

  useEffect(() => {
    getUsers().then(data => {
      console.log('获取到的用户数据:', data);
      if (data && data.length > 0) {
        console.log('第一个用户的数据:', data[0]);
      }
      setUsers(data);
      setFilteredUsers(data);
    })
  }, [])

  // 处理筛选条件变化
  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  // 应用筛选
  useEffect(() => {
    let filtered = users
    
    if (filters.id) {
      filtered = filtered.filter(u => String(u.id).includes(filters.id))
    }
    
    if (filters.name) {
      filtered = filtered.filter(u => u.name && u.name.toLowerCase().includes(filters.name.toLowerCase()))
    }
    
    if (filters.group) {
      filtered = filtered.filter(u => String(u.user_group) === filters.group)
    }
    
    // 应用排序
    filtered.sort((a, b) => {
      let valueA, valueB
      
      switch(sortField) {
        case 'id':
          valueA = a.id
          valueB = b.id
          break
        case 'name':
          valueA = a.name || ''
          valueB = b.name || ''
          break
        case 'gender':
          valueA = a.gender || ''
          valueB = b.gender || ''
          break
        case 'age':
          valueA = calculateAge(a.birthday)
          valueB = calculateAge(b.birthday)
          break
        case 'group':
          valueA = a.user_group || 0
          valueB = b.user_group || 0
          break
        default:
          return 0
      }
      
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return sortOrder === 'asc' 
          ? valueA.localeCompare(valueB, 'zh-CN')
          : valueB.localeCompare(valueA, 'zh-CN')
      }
      
      return sortOrder === 'asc' ? valueA - valueB : valueB - valueA
    })
    
    setFilteredUsers(filtered)
  }, [filters, users, sortField, sortOrder])

  // 处理排序
  const handleSort = (field) => {
    if (sortField === field) {
      // 如果点击的是当前排序字段，则切换排序顺序
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // 如果点击的是新字段，则设置新字段并默认升序
      setSortField(field)
      setSortOrder('asc')
    }
  }

  return (
    <div className="container">
      <h2>用户列表</h2>

      {/* 筛选表单 */}
      <div className="card">
        <h3>筛选条件</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
          <div>
            <label>用户ID</label>
            <input
              type="text"
              value={filters.id}
              onChange={(e) => handleFilterChange('id', e.target.value)}
              placeholder="输入ID"
              className="form-control"
            />
          </div>
          <div>
            <label>姓名</label>
            <input
              type="text"
              value={filters.name}
              onChange={(e) => handleFilterChange('name', e.target.value)}
              placeholder="输入姓名"
              className="form-control"
            />
          </div>
          <div>
            <label>用户组别</label>
            <select
              value={filters.group}
              onChange={(e) => handleFilterChange('group', e.target.value)}
              className="form-control"
              style={{ color: "#333", backgroundColor: "#fff" }}
            >
              <option value="">全部组别</option>
              <option value="1">1组</option>
              <option value="2">2组</option>
              <option value="3">3组</option>
              <option value="4">4组</option>
              <option value="5">5组</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 'var(--spacing-lg)', display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <button className="btn btn-secondary" onClick={() => setFilters({ id: '', name: '', group: '' })}>重置</button>
          </div>
          <span style={{ color: '#666' }}>共找到 {filteredUsers.length} 条记录</span>
        </div>
      </div>
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th onClick={() => handleSort('id')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                ID {sortField === 'id' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th>姓名</th>
              <th onClick={() => handleSort('gender')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                性别 {sortField === 'gender' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('age')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                年龄 {sortField === 'age' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('group')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                分组 {sortField === 'group' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(u => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.name}</td>
                <td>{u.gender || '-'}</td>
                <td>{calculateAge(u.birthday)}</td>
                <td>{u.user_group || '-'}</td>
                <td>
                  <Link to={`/users/${u.id}`} className="btn btn-secondary btn-sm">
                    详情
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
