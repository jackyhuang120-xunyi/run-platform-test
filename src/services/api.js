import axios from 'axios'
import { trainRecords, users } from '../api/mockData'

const api = axios.create({ baseURL: (import.meta.env.VITE_API_BASE_URL || '') || '' })

// 判断是否启用mock数据
const enableMock = import.meta.env.VITE_ENABLE_MOCK === 'true'

async function tryFetch(url, fallback) {
  console.log(`[API] 请求URL: ${url}`);
  console.log(`[API] Mock状态: ${enableMock ? '启用' : '禁用'}`);

  try {
    console.log('[API] 发送请求...');
    const res = await api.get(url);
    console.log('[API] 请求成功');
    console.log('[API] 响应数据:', res.data);
    return res.data;
  } catch (e) {
    console.error('[API] 请求失败:', e);
    console.error('[API] 请求URL:', url);
    console.error('[API] 错误状态码:', e.response ? e.response.status : '未知');
    
    // 打印详细的错误信息
    if (e.response && e.response.data) {
      console.error('[API] 错误详情:', e.response.data);
      if (e.response.data.details) {
        console.error('[API] 错误参数详情:', e.response.data.details);
      }
    } else {
      console.error('[API] 错误消息:', e.message);
    }
    
    // 打印完整的错误对象
    console.error('[API] 完整错误对象:', JSON.stringify(e, null, 2));

    // 如果启用了mock且有fallback数据，则使用mock数据
    if (enableMock && fallback !== undefined) {
      console.warn('[API] API 失败，使用 mock 数据');
      return fallback;
    }
    // 否则抛出错误
    console.error('[API] 抛出错误，不使用mock数据');
    throw e;
  }
}

export async function getTrainRecords(params = { page: 1, pageSize: 50 }) {
  // 统一pageSize值
  const pageSize = Number(params.pageSize) || 10;
  const page = Number(params.page) || 1;

  // 准备fallback数据（仅在API请求失败时使用）
  let fallbackRecords = trainRecords.filter(r => r.end_time !== null);
  
  // 对fallback数据应用筛选（模拟后端筛选）
  if (params.uid) {
    const uid = Number(params.uid);
    fallbackRecords = fallbackRecords.filter(r => r.uid === uid);
  }

  if (params.user_name) {
    // 获取所有用户
    const allUsers = users.filter(u => u.is_deleted === 0);

    // 找到匹配用户名的用户
    const matchedUsers = allUsers.filter(u =>
      u.name && u.name.toLowerCase().includes(params.user_name.toLowerCase())
    );

    if (matchedUsers.length > 0) {
      // 获取匹配用户的ID列表
      const matchedUserIds = matchedUsers.map(u => u.id);
      // 只保留这些用户的训练记录
      fallbackRecords = fallbackRecords.filter(r => matchedUserIds.includes(r.uid));
    } else {
      fallbackRecords = [];
    }
  }
  
  if (params.type) {
    fallbackRecords = fallbackRecords.filter(r => r.type === params.type);
  }

  // 对用户组别应用筛选
  if (params.group) {
    const group = Number(params.group);
    // 获取所有用户
    const allUsers = users.filter(u => u.is_deleted === 0);
    // 找到匹配组别的用户
    const matchedUsers = allUsers.filter(u => u.user_group === group);
    if (matchedUsers.length > 0) {
      // 获取匹配用户的ID列表
      const matchedUserIds = matchedUsers.map(u => u.id);
      // 只保留这些用户的训练记录
      fallbackRecords = fallbackRecords.filter(r => matchedUserIds.includes(r.uid));
    } else {
      fallbackRecords = [];
    }
  }

  // 对fallback数据应用日期筛选
  if (params.start) {
    const startDate = new Date(params.start);
    fallbackRecords = fallbackRecords.filter(r => {
      const recordDate = new Date(r.begin_time);
      return recordDate >= startDate;
    });
  }

  if (params.end) {
    const endDate = new Date(params.end);
    endDate.setHours(23, 59, 59, 999); // 包含整天
    fallbackRecords = fallbackRecords.filter(r => {
      const recordDate = new Date(r.begin_time);
      return recordDate <= endDate;
    });
  }


  // 对fallback数据应用分页
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedFallbackRecords = fallbackRecords.slice(startIndex, endIndex);

  const fallback = { data: paginatedFallbackRecords, page, pageSize, total: fallbackRecords.length };

  // 把所有参数传给后端，让后端处理筛选和分页
  const qp = new URLSearchParams();
  qp.set('page', page);
  qp.set('pageSize', pageSize);
  
  // 只在 uid 有实际值时才传（不能是 '' 或 undefined）
  if (params.uid !== undefined && params.uid !== '' && params.uid !== null) {
    qp.set('uid', params.uid);
  }
  
  // user_name 有内容才传（去掉前后空格）
  if (params.user_name && params.user_name.trim() !== '') {
    qp.set('user_name', params.user_name.trim());
  }
  
  // type 同 uid
  if (params.type !== undefined && params.type !== '' && params.type !== null) {
    qp.set('type', params.type);
  }

  // 处理用户组别参数
  if (params.group !== undefined && params.group !== '' && params.group !== null) {
    qp.set('group', params.group);
  }

  // 处理排序参数
  if (params.sortField) {
    qp.set('sortField', params.sortField);
  }
  if (params.sortOrder) {
    qp.set('sortOrder', params.sortOrder);
  }

  // 处理日期范围参数
  if (params.start && params.start.trim() !== '') {
    qp.set('start', params.start.trim());
  }

  if (params.end && params.end.trim() !== '') {
    qp.set('end', params.end.trim());
  }

  const query = qp.toString() ? `?${qp.toString()}` : '';
  
  const response = await tryFetch(`/api/trains${query}`, fallback);

  return {
    data: response.data || [],
    page,
    pageSize,
    total: response.total || 0
  };
}

export async function getTrainStats(params = {}) {
  // 准备fallback数据：计算所有相关训练记录的统计
  let statsRecords = trainRecords.filter(r => r.end_time !== null)
  
  if (params.uid) {
    statsRecords = statsRecords.filter(r => r.uid === Number(params.uid))
  }

  if (params.type) {
    statsRecords = statsRecords.filter(r => r.type === params.type)
  }

  // 日期范围筛选
  if (params.start) {
    const startDate = new Date(params.start)
    statsRecords = statsRecords.filter(r => new Date(r.begin_time) >= startDate)
  }

  if (params.end) {
    const endDate = new Date(params.end)
    endDate.setHours(23, 59, 59, 999)
    statsRecords = statsRecords.filter(r => new Date(r.begin_time) <= endDate)
  }

  // 计算统计数据
  const resistanceRecords = statsRecords.filter(r => String(r.type) === '1')
  const tractionRecords = statsRecords.filter(r => String(r.type) === '2')

  const calculateTypeStats = (records) => {
    return {
      count: records.length,
      distance: records.reduce((sum, r) => sum + (r.train_dis || 0), 0),
      time: records.reduce((sum, r) => sum + (r.total_time || 0), 0),
      peakSpeed: records.length > 0 ? Math.max(...records.map(r => r.peak_speed || 0)) : 0,
      peakSpeedRecord: records.length > 0 ? records.reduce((max, r) => (r.peak_speed || 0) > (max.peak_speed || 0) ? r : max, records[0]) : null
    }
  }

  const fallback = {
    resistance: calculateTypeStats(resistanceRecords),
    traction: calculateTypeStats(tractionRecords),
    total: {
      count: statsRecords.length,
      distance: statsRecords.reduce((sum, r) => sum + (r.train_dis || 0), 0),
      time: statsRecords.reduce((sum, r) => sum + (r.total_time || 0), 0),
      peakSpeed: statsRecords.length > 0 ? Math.max(...statsRecords.map(r => r.peak_speed || 0)) : 0,
      peakSpeedRecord: statsRecords.length > 0 ? statsRecords.reduce((max, r) => (r.peak_speed || 0) > (max.peak_speed || 0) ? r : max, statsRecords[0]) : null
    }
  }

  // 构建查询参数
  const qp = new URLSearchParams()
  if (params.uid !== undefined && params.uid !== '' && params.uid !== null) {
    qp.set('uid', params.uid)
  }
  if (params.type !== undefined && params.type !== '' && params.type !== null) {
    qp.set('type', params.type)
  }
  if (params.start && params.start.trim() !== '') {
    qp.set('start', params.start.trim())
  }
  if (params.end && params.end.trim() !== '') {
    qp.set('end', params.end.trim())
  }

  const query = qp.toString() ? `?${qp.toString()}` : ''
  const data = await tryFetch(`/api/trains/stats${query}`, fallback)
  return data
}

export async function getTrainById(id) {
  const fallback = trainRecords.find((r) => r.id === Number(id)) || null
  const data = await tryFetch(`/api/trains/${id}`, fallback)
  console.log('API返回的训练记录:', data)
  console.log('API返回的end_force:', data?.end_force)
  console.log('API返回的所有字段:', Object.keys(data || {}))
  return data
}

export async function getUsers() {
  const fallback = users.filter((u) => u.is_deleted === 0)
  const data = await tryFetch('/api/users', fallback)
  return data
}

export async function getUserById(id) {
  const fallback = users.find((u) => u.id === Number(id)) || null
  const data = await tryFetch(`/api/users/${id}`, fallback)
  return data
}

export async function getGroups() {
  const fallback = [
    { id: 1, name: '1组' },
    { id: 2, name: '2组' },
    { id: 3, name: '3组' },
    { id: 4, name: '4组' },
    { id: 5, name: '5组' }
  ]
  const data = await tryFetch('/api/groups', fallback)
  return data
}

export async function getRankings(params = {}) {
  const fallback = {
    data: {
      peak_speed: [],
      time_5m: [],
      time_10m: [],
      time_15m: [],
      time_20m: [],
      time_25m: [],
      time_30m: [],
      time_50m: [],
      time_60m: [],
      time_100m: [],
      peak_acceleration: [],
      peak_power: [],
      peak_force: []
    }
  }

  // 构建查询参数
  const queryParams = [];
  if (params.group !== undefined && params.group !== null && params.group !== '') {
    queryParams.push(`group=${params.group}`);
  }

  const query = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
  const data = await tryFetch(`/api/rankings${query}`, fallback)
  return data
}
