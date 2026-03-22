import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, setToken } from '../services/auth'

export default function Login() {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const nav = useNavigate()

  const doLogin = async (e) => {
    e.preventDefault()
    if (!username || !password) {
      setError('请输入用户名和密码')
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await login(username, password)
      if (res && res.token) {
        setToken(res.token)
        nav('/')
      } else {
        setError('登录失败，请检查用户名和密码')
      }
    } catch (err) {
      setError('登录错误：' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <div className="form-card" style={{ width: '100%', maxWidth: '420px', padding: 'var(--spacing-xxl)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 'var(--spacing-xl)', background: 'var(--gradient-primary)', '-webkit-background-clip': 'text', '-webkit-text-fill-color': 'transparent', 'background-clip': 'text' }}>管理员登录</h2>

        {error && (
          <div className="status-badge" style={{
            backgroundColor: 'rgba(255, 69, 58, 0.15)',
            color: 'var(--error-color)',
            borderColor: 'rgba(255, 69, 58, 0.3)',
            width: '100%',
            justifyContent: 'center',
            marginBottom: 'var(--spacing-lg)'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={doLogin}>
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label>用户名</label>
            <input
              className="form-control"
              value={username}
              onChange={e=>setUsername(e.target.value)}
              placeholder="请输入用户名"
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: 'var(--spacing-xl)' }}>
            <label>密码</label>
            <input
              className="form-control"
              type="password"
              value={password}
              onChange={e=>setPassword(e.target.value)}
              placeholder="请输入密码"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="card" style={{
          marginTop: 'var(--spacing-xl)',
          padding: 'var(--spacing-lg)',
          backgroundColor: 'var(--bg-tertiary)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-muted)'
        }}>
          <p style={{ margin: '0 0 var(--spacing-sm)' }}>测试账号：</p>
          <p style={{ margin: '0' }}>用户名: admin</p>
          <p style={{ margin: '0' }}>密码: 123456</p>
        </div>
      </div>
    </div>
  )
}