import express from 'express'
import cors from 'cors'
import pool from './db.js'
import dotenv from 'dotenv'
import { query, param, validationResult } from 'express-validator'
import morgan from 'morgan'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())
app.use(morgan('tiny'))

// 对外暴露本地的 log 文件夹给前端下载 CSV 从而画曲线图
app.use('/log', express.static(path.join(__dirname, '../log')))

const PORT = process.env.PORT || 4000

// 配置 multer 处理边缘设备上传的大型 CSV 文件
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 根据传入的 begin_time 或者当前时间，计算 YYYY-MM-DD
    let begin_time = req.body.begin_time ? new Date(req.body.begin_time) : new Date()
    if (isNaN(begin_time.getTime())) begin_time = new Date()
    
    const year = begin_time.getFullYear()
    const month = String(begin_time.getMonth() + 1).padStart(2, '0')
    const day = String(begin_time.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    
    // 我们将其放在上层目录 run-platform 下的 log 文件夹中
    const logDir = path.join(__dirname, '../log', dateStr)
    
    // 如果文件夹不存在，同步级联创建
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    
    cb(null, logDir)
  },
  filename: function (req, file, cb) {
    // 使用 HH-MM-SS.csv 格式存放
    let begin_time = req.body.begin_time ? new Date(req.body.begin_time) : new Date()
    if (isNaN(begin_time.getTime())) begin_time = new Date()
    
    const hours = String(begin_time.getHours()).padStart(2, '0')
    const minutes = String(begin_time.getMinutes()).padStart(2, '0')
    const seconds = String(begin_time.getSeconds()).padStart(2, '0')
    const timeStr = `${hours}-${minutes}-${seconds}`
    
    cb(null, `${timeStr}.csv`)
  }
})

const upload = multer({ storage: storage })

// Format Date-like values to `YYYY-MM-DD HH:mm:ss` in local time
function fmtDate(v) {
  if (v === null || v === undefined || v === '') return ''
  const d = new Date(v)
  if (isNaN(d)) return String(v)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function handleValidation(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'invalid_parameters', details: errors.array() })
  }
  next()
}

// GET /api/trains?page=1&pageSize=20&uid=&type=&user_name=&group=
// GET /api/trains/stats 获取训练统计数据（完整，不分页）
app.get('/api/trains/stats', [
  query('uid').optional().isInt().toInt(),
  query('type').optional().isInt().toInt(),
  query('user_name').optional().isString(),
  query('group').optional().isInt().toInt(),
  query('start').optional().isString(),
  query('end').optional().isString()
], handleValidation, async (req, res) => {
  try {
    const uid = req.query.uid !== undefined ? Number(req.query.uid) : null
    const type = req.query.type !== undefined ? Number(req.query.type) : null
    const userName = req.query.user_name || null
    const group = req.query.group !== undefined ? Number(req.query.group) : null
    const start = req.query.start || null
    const end = req.query.end || null

    let where = 'WHERE tr.end_time IS NOT NULL'
    const params = []
    if (uid !== null) { where += ' AND tr.uid = ?'; params.push(uid) }
    if (type !== null) { where += ' AND tr.type = ?'; params.push(type) }
    if (userName !== null) { where += ' AND u.name LIKE ?'; params.push(`%${userName}%`) }
    if (group !== null) { where += ' AND u.`group` = ?'; params.push(group) }
    if (start !== null) { where += ' AND tr.begin_time >= ?'; params.push(start) }
    if (end !== null) { where += ' AND tr.begin_time <= ?'; params.push(end) }

    // 获取所有符合条件的训练记录（完整数据，不分页）
    const sql = `SELECT tr.* FROM train_record tr LEFT JOIN \`user\` u ON u.id = tr.uid ${where}`
    const [rows] = await pool.query(sql, params)

    // 计算统计数据
    const resistanceRecords = rows.filter(r => r.type === 1)
    const tractionRecords = rows.filter(r => r.type === 2)

    const calculateStats = (records) => {
      if (records.length === 0) {
        return {
          count: 0,
          distance: 0,
          time: 0,
          peakSpeed: 0,
          peakSpeedRecord: null
        }
      }

      const totalDistance = records.reduce((sum, r) => sum + (r.train_dis || 0), 0)
      const totalTime = records.reduce((sum, r) => sum + (r.total_time || 0), 0)
      const peakSpeedValue = Math.max(...records.map(r => r.peak_speed || 0))
      const peakSpeedRecord = records.reduce((max, r) => (r.peak_speed || 0) > (max.peak_speed || 0) ? r : max, records[0])

      return {
        count: records.length,
        distance: parseFloat(totalDistance.toFixed(2)),
        time: parseFloat(totalTime.toFixed(2)),
        peakSpeed: parseFloat(peakSpeedValue.toFixed(2)),
        peakSpeedRecord: peakSpeedRecord
      }
    }

    const resistanceStats = calculateStats(resistanceRecords)
    const tractionStats = calculateStats(tractionRecords)
    const totalStats = calculateStats(rows)

    res.json({
      resistance: resistanceStats,
      traction: tractionStats,
      total: totalStats
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal_error', message: err.message })
  }
})

app.get('/api/trains', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('uid').optional().isInt().toInt(),
  query('type').optional().isInt().toInt(),
  query('user_name').optional().isString(),
  query('group').optional().isInt().toInt(),
  query('start').optional().isString(),
  query('end').optional().isString()
], handleValidation, async (req, res) => {
  try {
    const page = req.query.page || 1
    const pageSize = req.query.pageSize || 20
    const uid = req.query.uid !== undefined ? Number(req.query.uid) : null
    const type = req.query.type !== undefined ? Number(req.query.type) : null
    const userName = req.query.user_name || null
    const group = req.query.group !== undefined ? Number(req.query.group) : null
    const start = req.query.start || null
    const end = req.query.end || null

    // 处理排序参数
    const sortField = req.query.sortField || 'begin_time'
    const sortOrder = req.query.sortOrder || 'desc'

    const offset = (page - 1) * pageSize

    let where = 'WHERE tr.end_time IS NOT NULL'
    const params = []
    if (uid !== null) { where += ' AND tr.uid = ?'; params.push(uid) }
    if (type !== null) { where += ' AND tr.type = ?'; params.push(type) }
    if (userName !== null) { where += ' AND u.name LIKE ?'; params.push(`%${userName}%`) }
    if (group !== null) { where += ' AND u.\`group\` = ?'; params.push(group) }
    if (start !== null) { where += ' AND tr.begin_time >= ?'; params.push(start) }
    if (end !== null) { where += ' AND tr.begin_time <= ?'; params.push(end) }

    const totalSql = `SELECT COUNT(*) as cnt FROM train_record tr LEFT JOIN \`user\` u ON u.id = tr.uid ${where}`
    const [totalRows] = await pool.query(totalSql, params)
    const total = totalRows[0].cnt || 0

    // 构建排序子句
    let orderClause;
    // 特殊处理peak_speed字段，确保它被当作数字排序
    if (sortField === 'peak_speed') {
      orderClause = `ORDER BY CAST(tr.${sortField} AS DECIMAL(10,2)) ${sortOrder.toUpperCase()}`;
    } else {
      orderClause = `ORDER BY tr.${sortField} ${sortOrder.toUpperCase()}`;
    }
    const sql = `SELECT tr.*, u.name as user_name, u.\`group\` as user_group FROM train_record tr LEFT JOIN \`user\` u ON u.id = tr.uid ${where} ${orderClause} LIMIT ? OFFSET ?`
    const finalParams = params.concat([pageSize, offset])
    const [rows] = await pool.query(sql, finalParams)

    res.json({ data: rows, page, pageSize, total })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal_error', message: err.message })
  }
})

// export multiple records as CSV (protected)
app.get('/api/trains/export', [
  query('uid').optional().isInt().toInt(),
  query('type').optional().isInt().toInt(),
  query('start').optional().isString(),
  query('end').optional().isString(),
], handleValidation, async (req, res) => {
  try {
    // simple auth: require valid JWT in Authorization header
    const auth = req.headers.authorization
    if (!auth) return res.status(401).json({ error: 'unauthorized' })
    const token = auth.split(' ')[1]
    try { jwt.verify(token, process.env.JWT_SECRET || 'secret') } catch (e) { return res.status(401).json({ error: 'invalid_token' }) }

    const uid = req.query.uid !== undefined ? Number(req.query.uid) : null
    const type = req.query.type !== undefined ? Number(req.query.type) : null
    const start = req.query.start || null
    const end = req.query.end || null
    let where = 'WHERE tr.end_time IS NOT NULL'
    const params = []
    if (uid !== null) { where += ' AND tr.uid = ?'; params.push(uid) }
    if (type !== null) { where += ' AND tr.type = ?'; params.push(type) }
    if (start !== null) { where += ' AND tr.begin_time >= ?'; params.push(start) }
    if (end !== null) { where += ' AND tr.begin_time <= ?'; params.push(end) }

    const sql = `SELECT tr.*, u.name as user_name FROM train_record tr LEFT JOIN \`user\` u ON u.id = tr.uid ${where} ORDER BY tr.begin_time DESC`
    const [rows] = await pool.query(sql, params)

        const cols = ['id','uid','user_name','type','part','start_force','end_force','train_dis','change_dis','safe_dis','max_speed','total_time','peak_time','peak_pos','peak_speed','begin_time','end_time','log']
        const lines = [cols.join(',')]
        for (const r of rows) {
          const vals = cols.map(c => {
            let v = r[c] === null || r[c] === undefined ? '' : r[c]
            if (c === 'begin_time' || c === 'end_time') v = fmtDate(v)
            v = String(v)
            return '"' + v.replace(/"/g, '""') + '"'
          })
          lines.push(vals.join(','))
        }

    const filename = `trains_export_${new Date().toISOString().slice(0,10)}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    // Prepend UTF-8 BOM so Excel on Windows recognizes UTF-8 encoding
    res.send('\uFEFF' + lines.join('\n'))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal_error', message: err.message })
  }
})

// export single record as CSV (protected)
app.get('/api/trains/:id/export', [param('id').isInt().toInt()], handleValidation, async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth) return res.status(401).json({ error: 'unauthorized' })
    const token = auth.split(' ')[1]
    try { jwt.verify(token, process.env.JWT_SECRET || 'secret') } catch (e) { return res.status(401).json({ error: 'invalid_token' }) }

    const id = Number(req.params.id)
    const sql = `SELECT tr.*, u.name as user_name FROM train_record tr LEFT JOIN \`user\` u ON u.id = tr.uid WHERE tr.id = ?`
    const [rows] = await pool.query(sql, [id])
    if (!rows.length) return res.status(404).json({ error: 'not_found' })
    const r = rows[0]
    const cols = ['field','value']
        const pairs = Object.entries(r).map(([k,v]) => {
          let val = v === null ? '' : v
          if (k === 'begin_time' || k === 'end_time') val = fmtDate(val)
          return '"'+k+'","'+String(val).replace(/"/g,'""')+'"'
        })
    const filename = `train_${id}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    // Prepend UTF-8 BOM for Excel compatibility
    res.send('\uFEFF' + ['field,value', ...pairs].join('\n'))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal_error', message: err.message })
  }
})

// simple login to issue JWT
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    const adminUser = process.env.ADMIN_USER || 'admin'
    const adminPass = process.env.ADMIN_PASS || '123456'
    if (username === adminUser && password === adminPass) {
      const token = jwt.sign({ username }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' })
      return res.json({ token })
    }
    return res.status(401).json({ error: 'invalid_credentials' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal_error', message: err.message })
  }
})

app.get('/api/trains/:id', [param('id').isInt().toInt()], handleValidation, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const sql = `SELECT tr.*, u.name as user_name, u.gender, u.weight, u.birthday, u.id_number, u.\`group\` as user_group, g.name as gender_name FROM train_record tr LEFT JOIN \`user\` u ON u.id = tr.uid LEFT JOIN gender g ON u.gender = g.id WHERE tr.id = ?`
    const [rows] = await pool.query(sql, [id])
    if (!rows.length) return res.status(404).json({ error: 'not_found' })
    
    // 转换性别ID为名称
    const trainRecord = rows[0]
    if (trainRecord.gender !== null && trainRecord.gender_name) {
      trainRecord.gender = trainRecord.gender_name
    }
    
    res.json(trainRecord)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal_error', message: err.message })
  }
})

app.get('/api/users', async (req, res) => {
  try {
    const sql = `SELECT u.id, u.name, u.gender, u.\`group\` as user_group, u.is_deleted, u.birthday, g.name as gender_name FROM \`user\` u LEFT JOIN gender g ON u.gender = g.id WHERE u.is_deleted = 0`
    const [rows] = await pool.query(sql)
    
    // 转换性别ID为名称
    const users = rows.map(user => {
      if (user.gender !== null && user.gender_name) {
        user.gender = user.gender_name
      }
      return user
    })
    
    res.json(users)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal_error', message: err.message })
  }
})

app.get('/api/users/:id', [param('id').isInt().toInt()], handleValidation, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const sql = `SELECT u.id, u.name, u.gender, u.\`group\` as user_group, u.weight, u.birthday, u.id_number, g.name as gender_name FROM \`user\` u LEFT JOIN gender g ON u.gender = g.id WHERE u.id = ? AND u.is_deleted = 0`
    const [rows] = await pool.query(sql, [id])
    if (!rows.length) return res.status(404).json({ error: 'not_found' })
    
    // 转换性别ID为名称
    const user = rows[0]
    if (user.gender !== null && user.gender_name) {
      user.gender = user.gender_name
    }
    
    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal_error', message: err.message })
  }
})

// 获取所有组别
app.get('/api/groups', async (req, res) => {
  try {
    console.log('[API] 获取组别列表...')
    const sql = `SELECT id, name FROM \`group\` ORDER BY id`
    console.log('[API] SQL:', sql)
    const [rows] = await pool.query(sql)
    console.log('[API] 查询结果:', rows)
    res.json(rows)
  } catch (err) {
    console.error('[API] 获取组别列表失败:', err)
    console.error('[API] 错误详情:', {
      code: err.code,
      message: err.message,
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage
    })
    res.status(500).json({ 
      error: 'internal_error', 
      message: err.message,
      details: {
        code: err.code,
        sqlState: err.sqlState,
        sqlMessage: err.sqlMessage
      }
    })
  }
})

// 排行榜相关路由
app.get('/api/rankings', [
  query('group').optional().isInt().toInt()
], handleValidation, async (req, res) => {
  try {
    // 获取组别参数
    const groupId = req.query.group !== undefined ? Number(req.query.group) : null;

    // 定义需要排序的字段
    const fields = [
      'peak_speed',
      'time_5m',
      'time_10m',
      'time_15m',
      'time_20m',
      'time_25m',
      'time_30m',
      'time_50m',
      'time_60m',
      'time_100m',
      'peak_acceleration',
      'peak_power',
      'peak_force',
      'avg_step_length',
      'avg_step_frequency'
    ];

    // 定义训练类型
    const trainTypes = [
      { id: 1, name: 'resistance' },  // 抗阻训练
      { id: 2, name: 'towing' }       // 牵引训练
    ];

    // 为每个训练类型和每个字段获取排行榜数据
    const rankings = {};

    for (const type of trainTypes) {
      rankings[type.name] = {};

      for (const field of fields) {
        // 根据字段类型确定排序方向
        // 用时指标越短越好，其他指标越高越好
        const order = field.startsWith('time_') ? 'ASC' : 'DESC';

        // 构建SQL查询 - 使用子查询获取每个用户的最佳记录
        let sql;
        let queryParams = [type.id];

        // 添加组别过滤条件
        const groupCondition = groupId !== null ? 'AND u.`group` = ?' : '';
        if (groupId !== null) {
          queryParams.push(groupId);
        }

        if (field === 'peak_speed') {
          // 特殊处理peak_speed字段，确保它被当作数字排序
          sql = `
            SELECT best.id, best.${field} as value, u.name as user_name, best.begin_time,
                   best.train_dis, best.start_force, best.end_force, best.total_time
            FROM (
              SELECT tr.id, tr.uid, tr.${field}, tr.begin_time, tr.train_dis, tr.start_force, tr.end_force, tr.total_time,
                     ROW_NUMBER() OVER (PARTITION BY tr.uid ORDER BY CAST(tr.${field} AS DECIMAL(10,2)) DESC) as rn
              FROM train_record tr
              WHERE tr.${field} IS NOT NULL AND tr.end_time IS NOT NULL AND tr.type = ?
            ) best
            LEFT JOIN \`user\` u ON u.id = best.uid
            WHERE best.rn = 1 ${groupCondition}
            ORDER BY CAST(best.${field} AS DECIMAL(10,2)) ${order}
          `;
        } else if (field.startsWith('time_')) {
          // 用时指标的特殊处理
          sql = `
            SELECT best.id, best.${field} as value, u.name as user_name, best.begin_time,
                   best.train_dis, best.start_force, best.end_force, best.total_time
            FROM (
              SELECT tr.id, tr.uid, tr.${field}, tr.begin_time, tr.train_dis, tr.start_force, tr.end_force, tr.total_time,
                     ROW_NUMBER() OVER (PARTITION BY tr.uid ORDER BY tr.${field} ASC) as rn
              FROM train_record tr
              WHERE tr.${field} IS NOT NULL AND tr.end_time IS NOT NULL AND tr.type = ?
            ) best
            LEFT JOIN \`user\` u ON u.id = best.uid
            WHERE best.rn = 1 ${groupCondition}
            ORDER BY best.${field} ${order}
          `;
        } else {
          sql = `
            SELECT best.id, best.${field} as value, u.name as user_name, best.begin_time,
                   best.train_dis, best.start_force, best.end_force, best.total_time
            FROM (
              SELECT tr.id, tr.uid, tr.${field}, tr.begin_time, tr.train_dis, tr.start_force, tr.end_force, tr.total_time,
                     ROW_NUMBER() OVER (PARTITION BY tr.uid ORDER BY tr.${field} DESC) as rn
              FROM train_record tr
              WHERE tr.${field} IS NOT NULL AND tr.end_time IS NOT NULL AND tr.type = ?
            ) best
            LEFT JOIN \`user\` u ON u.id = best.uid
            WHERE best.rn = 1 ${groupCondition}
            ORDER BY best.${field} ${order}
          `;
        }

        const [rows] = await pool.query(sql, queryParams);
        rankings[type.name][field] = rows;
      }
    }

    res.json({ data: rankings });
  } catch (err) {
    console.error('获取排行榜数据失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
})

// == 设备端双重上传接口 == (支持 FormData，包括 CSV 文件 + 大量算好的性能参数)
app.post('/api/trains/upload', upload.single('file'), async (req, res) => {
  try {
    const data = req.body;
    
    // 参数解析：清洗字符串返回对应的数字
    const getValue = (val, isFloat = false) => {
      if (val === undefined || val === null || val === '') return null;
      return isFloat ? parseFloat(val) : parseInt(val, 10);
    };

    const uid = getValue(data.uid);
    const type = getValue(data.type);
    
    // 强制验证最基础的绑定关系
    if (!uid || !type || !data.begin_time) {
      return res.status(400).json({ error: 'invalid_parameters', message: '缺少 uid, type, 或者 begin_time。这些是构建数据流的核心。' });
    }

    // 数据库入库的核心组装
    const fields = [
      'uid', 'type', 'part', 'start_force', 'end_force', 'train_dis', 'change_dis', 'safe_dis',
      'max_speed', 'total_time', 'peak_time', 'peak_pos', 'peak_speed', 'result',
      'begin_time', 'end_time', 
      'time_5m', 'time_10m', 'time_15m', 'time_20m', 'time_25m', 'time_30m',
      'time_50m', 'time_60m', 'time_100m',
      'peak_acceleration', 'peak_force', 'peak_power',
      'avg_step_length', 'avg_step_frequency', 'log'
    ];
    
    // 还原相对文件路径：拼接类似 ./log/2026-03-22/10-25-00.csv 这个字符串，跟之前 Python 脚本对齐
    let logRelPath = null;
    if (req.file) {
      let begin_time = new Date(data.begin_time);
      if (isNaN(begin_time.getTime())) begin_time = new Date();
      const year = begin_time.getFullYear();
      const month = String(begin_time.getMonth() + 1).padStart(2, '0');
      const day = String(begin_time.getDate()).padStart(2, '0');
      const hours = String(begin_time.getHours()).padStart(2, '0');
      const minutes = String(begin_time.getMinutes()).padStart(2, '0');
      const seconds = String(begin_time.getSeconds()).padStart(2, '0');
      logRelPath = `./log/${year}-${month}-${day}/${hours}-${minutes}-${seconds}.csv`;
    }

    const values = [
      uid, type, 
      getValue(data.part) || 1, 
      getValue(data.start_force), getValue(data.end_force), getValue(data.train_dis), 
      getValue(data.change_dis), getValue(data.safe_dis),
      getValue(data.max_speed, true), getValue(data.total_time, true), 
      getValue(data.peak_time, true), getValue(data.peak_pos, true), getValue(data.peak_speed, true), 
      getValue(data.result),
      data.begin_time, 
      data.end_time || null,
      getValue(data.time_5m, true), getValue(data.time_10m, true), getValue(data.time_15m, true), 
      getValue(data.time_20m, true), getValue(data.time_25m, true), getValue(data.time_30m, true),
      getValue(data.time_50m, true), getValue(data.time_60m, true), getValue(data.time_100m, true),
      getValue(data.peak_acceleration, true), getValue(data.peak_force, true), getValue(data.peak_power, true),
      getValue(data.avg_step_length, true), getValue(data.avg_step_frequency, true),
      logRelPath
    ];

    const placeholders = fields.map(() => '?').join(', ');
    const sql = `INSERT INTO train_record (${fields.join(', ')}) VALUES (${placeholders})`;

    const [result] = await pool.query(sql, values);

    // 给设备端发出的确认信号
    res.json({ 
      success: true, 
      message: '记录和CSV流文件上传成功', 
      record_id: result.insertId,
      log_path: logRelPath 
    });

  } catch (err) {
    console.error('[API] 边缘计算设备上传失败:', err);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// generic error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'internal_error', message: err.message })
})

app.listen(PORT, () => console.log(`API server listening on port ${PORT}`))
