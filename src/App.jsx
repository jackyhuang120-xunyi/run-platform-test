
import React from 'react'
import './App.css'
import Navbar from './components/Navbar'
import Dashboard from './components/Dashboard_new'
import TrainList from './components/TrainList_updated'
import TrainDetail from './components/TrainDetail_new'
import ErrorBoundary from './components/ErrorBoundary'
// import UserList from './components/UserList'
import UserList from './components/UserList_new'
import UserSummary from './components/UserSummary'
import Login from './components/Login_updated'
import TrainComparison from './components/TrainComparison'
import Ranking from './components/Ranking'
import { Routes, Route } from 'react-router-dom'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>体育训练数据平台</h1>
        </div>
        <Navbar />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trains" element={<TrainList />} />
          <Route path="/trains/:id" element={
            <ErrorBoundary>
              <TrainDetail />
            </ErrorBoundary>
          } />
          <Route path="/users/:id" element={<UserSummary />} />
          <Route path="/trains/comparison" element={<TrainComparison />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/login" element={<Login />} />
          <Route path="/users" element={<UserList />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

