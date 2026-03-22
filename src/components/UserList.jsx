import React, { useEffect, useState } from 'react'
import { getUsers } from '../services/api'

export default function UserList() {
  const [users, setUsers] = useState([])
  useEffect(() => { 
    getUsers().then(data => {
      setUsers(data);
    }) 
  }, [])

  // 将分组数字转换为分组名称
  const getGroupName = (groupId) => {
    const groups = {
      1: '普通组',
      2: '进阶组',
      3: '专业组',
      4: '教练组',
      5: '高级组'
    }
    return groups[groupId] || `未知分组(${groupId})`
  }

  return (
    <div>
      <h2 style={{ fontSize: 'var(--font-size-h2)' }}>用户列表</h2>
      <table className="table">
        <thead>
          <tr><th>ID</th><th>姓名</th><th>分组</th></tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.name}</td>
              <td>{u.user_group || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
