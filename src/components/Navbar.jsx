
import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { getToken, logout } from '../services/auth'

export default function Navbar() {
  const [token, setToken] = useState(getToken())
  const nav = useNavigate()
  useEffect(() => { const onStorage = () => setToken(getToken()); window.addEventListener('storage', onStorage); return () => window.removeEventListener('storage', onStorage) }, [])

  const doLogout = () => { logout(); setToken(null); nav('/') }

  return (
    <nav className="nav">
      <NavLink to="/" end className={({isActive})=> isActive? 'active':''}>概览</NavLink>
      <NavLink to="/trains" className={({isActive})=> isActive? 'active':''}>训练记录</NavLink>
      <NavLink to="/ranking" className={({isActive})=> isActive? 'active':''}>排行榜</NavLink>
      <NavLink to="/users" className={({isActive})=> isActive? 'active':''}>用户</NavLink>
      {token ? 
        <button className="btn btn-secondary btn-sm" onClick={doLogout}>登出</button> : 
        <NavLink to="/login" className="btn btn-secondary btn-sm">登录</NavLink>
      }
    </nav>
  )
}

