import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { scheduleAPI, expoAPI } from '../api'
import { useAuth } from '../contexts/AuthContext'

const EMPTY_FORM = {
  title: '',
  description: '',
  startTime: '',
  endTime: '',
  location: '',
  setupMinutes: 15
}

// 后端返回的 ISO 时间转成 datetime-local 输入框需要的格式
const toLocalInputValue = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function SchedulePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [schedules, setSchedules] = useState([])
  const [expo, setExpo] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    loadSchedules()
    loadExpo()
  }, [id])

  const loadSchedules = async () => {
    try {
      const res = await scheduleAPI.getByExpo(id)
      setSchedules(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadExpo = async () => {
    try {
      const res = await expoAPI.getById(id)
      setExpo(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  const openCreateForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrorMsg('')
    setShowForm(true)
  }

  const openEditForm = (sched) => {
    setEditingId(sched._id)
    setForm({
      title: sched.title || '',
      description: sched.description || '',
      startTime: toLocalInputValue(sched.startTime),
      endTime: toLocalInputValue(sched.endTime),
      location: sched.location || '',
      setupMinutes: sched.setupMinutes ?? 0
    })
    setErrorMsg('')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrorMsg('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    // 前端先做一次基础校验，提交时以后端结果为准
    if (!form.startTime || !form.endTime) {
      setErrorMsg('请选择开始时间和结束时间')
      return
    }
    if (new Date(form.endTime) <= new Date(form.startTime)) {
      setErrorMsg('结束时间必须晚于开始时间')
      return
    }

    const payload = { ...form, expoId: id }
    try {
      if (editingId) {
        await scheduleAPI.update(editingId, payload)
      } else {
        await scheduleAPI.create(payload)
      }
      closeForm()
      loadSchedules()
    } catch (err) {
      const message = err.response?.data?.message || '保存失败，请稍后重试'
      setErrorMsg(message)
    }
  }

  const groupedSchedules = schedules.reduce((acc, sched) => {
    const date = new Date(sched.startTime).toLocaleDateString()
    if (!acc[date]) acc[date] = []
    acc[date].push(sched)
    return acc
  }, {})

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link to={`/expo/${id}`} className="text-purple-600 hover:underline">← 返回展会详情</Link>
        <div className="flex justify-between items-center mt-2">
          <h1 className="text-3xl font-bold text-gray-800">活动时间表</h1>
          {user && !showForm && (
            <button
              onClick={openCreateForm}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700"
            >
              + 添加活动
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow p-6 mb-8">
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            {editingId ? '编辑活动' : '添加新活动'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-700 mb-1">活动名称</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-1">描述</label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 mb-1">开始时间</label>
                <input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={e => setForm({ ...form, startTime: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 mb-1">结束时间</label>
                <input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={e => setForm({ ...form, endTime: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 mb-1">场地</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="例如：自由舞台"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 mb-1">布场时间（分钟）</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.setupMinutes}
                  onChange={e => setForm({ ...form, setupMinutes: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  required
                />
              </div>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg whitespace-pre-line">
                {errorMsg}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700"
              >
                {editingId ? '保存修改' : '创建'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {Object.keys(groupedSchedules).length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <p className="text-gray-500 text-lg">暂无活动安排</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedSchedules).map(([date, items]) => (
            <div key={date} className="bg-white rounded-xl shadow overflow-hidden">
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4 text-white">
                <h2 className="text-xl font-bold">{date}</h2>
              </div>
              <div className="divide-y">
                {items.sort((a, b) => new Date(a.startTime) - new Date(b.startTime)).map(sched => (
                  <div key={sched._id} className="p-6 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-800">{sched.title}</h3>
                        {sched.description && (
                          <p className="text-gray-600 mt-1">{sched.description}</p>
                        )}
                        <div className="flex gap-6 mt-3 text-sm text-gray-500 flex-wrap">
                          <span className="flex items-center">
                            <span className="mr-2">🕐</span>
                            {new Date(sched.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' - '}
                            {new Date(sched.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="flex items-center">
                            <span className="mr-2">📍</span>
                            {sched.location}
                          </span>
                          {Number(sched.setupMinutes) > 0 && (
                            <span className="flex items-center">
                              <span className="mr-2">🧹</span>
                              布场 {sched.setupMinutes} 分钟
                            </span>
                          )}
                        </div>
                      </div>
                      {user && (
                        <button
                          onClick={() => openEditForm(sched)}
                          className="text-purple-600 hover:text-purple-800 text-sm ml-4"
                        >
                          编辑
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
