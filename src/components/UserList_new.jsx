import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getUsers, createUser } from '../services/api'
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
  
  // 新建用户相关的状态
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newUserData, setNewUserData] = useState({ 
    name: '', gender: '', age: '', birthday: '', height: '', weight: '', group: '', phone: '' 
  })

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

  // 提交新建用户表单
  const handleCreateUser = async () => {
    if (!newUserData.name.trim()) {
      alert('请填写此用户的必填项: 姓名');
      return;
    }
    if (!newUserData.birthday) {
      alert('请填写此用户的必填项: 出生日期');
      return;
    }
    try {
      await createUser(newUserData);
      alert('新建用户成功！名单已更新。');
      setShowCreateModal(false);
      // 清空表单
      setNewUserData({ name: '', gender: '', age: '', birthday: '', height: '', weight: '', group: '', phone: '' });
      // 重新拉大名单
      const data = await getUsers();
      setUsers(data);
      setFilteredUsers(data);
    } catch (e) {
      alert('新建用户失败，已输出日志到控制台。');
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
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>新建受训用户</button>
            <button className="btn btn-secondary" onClick={() => setFilters({ id: '', name: '', group: '' })}>重置筛选</button>
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

      {/* 新建用户弹窗 */}
      {showCreateModal && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '500px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginBottom: '0', color: '#1a1a1a' }}>新建用户档案</h3>
            <p style={{ color: '#666', fontSize: '14px', marginTop: '4px', marginBottom: '20px' }}>录入的新用户将同步保存至云端名册中心</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333' }}>姓名 <span style={{color: 'red'}}>*</span></label>
                <input type="text" className="form-control" value={newUserData.name} onChange={e => setNewUserData({...newUserData, name: e.target.value})} placeholder="输入姓名" style={{color:'#333', backgroundColor:'#fff'}} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333' }}>性别</label>
                <select className="form-control" value={newUserData.gender} onChange={e => setNewUserData({...newUserData, gender: e.target.value})} style={{color:'#333', backgroundColor:'#fff'}}>
                  <option value="">请选择</option>
                  <option value="1">男</option>
                  <option value="2">女</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333' }}>年龄</label>
                <input type="number" className="form-control" value={newUserData.age} onChange={e => setNewUserData({...newUserData, age: e.target.value})} placeholder="输入年龄" style={{color:'#333', backgroundColor:'#fff'}} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333' }}>出生日期 <span style={{color: 'red'}}>*</span></label>
                <input type="date" className="form-control" value={newUserData.birthday} onChange={e => setNewUserData({...newUserData, birthday: e.target.value})} style={{color:'#333', backgroundColor:'#fff'}} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333' }}>归属组别</label>
                <select className="form-control" value={newUserData.group} onChange={e => setNewUserData({...newUserData, group: e.target.value})} style={{color:'#333', backgroundColor:'#fff'}}>
                  <option value="">选择组别</option>
                  <option value="1">1组</option>
                  <option value="2">2组</option>
                  <option value="3">3组</option>
                  <option value="4">4组</option>
                  <option value="5">5组</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333' }}>身高 (cm)</label>
                <input type="number" className="form-control" value={newUserData.height} onChange={e => setNewUserData({...newUserData, height: e.target.value})} placeholder="非必填" style={{color:'#333', backgroundColor:'#fff'}} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333' }}>体重 (kg)</label>
                <input type="number" className="form-control" value={newUserData.weight} onChange={e => setNewUserData({...newUserData, weight: e.target.value})} placeholder="非必填" style={{color:'#333', backgroundColor:'#fff'}} />
              </div>
              <div style={{gridColumn: '1 / -1'}}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333' }}>联系电话</label>
                <input type="text" className="form-control" value={newUserData.phone} onChange={e => setNewUserData({...newUserData, phone: e.target.value})} placeholder="输入联系方式" style={{color:'#333', backgroundColor:'#fff'}} />
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
              <button className="btn btn-secondary" style={{ backgroundColor: '#f5f5f5', color: '#333', border: '1px solid #ddd' }} onClick={() => setShowCreateModal(false)}>取消放弃</button>
              <button className="btn btn-primary" onClick={handleCreateUser}>确认新建档案</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
