import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Settings, ArrowLeft, Plus, Edit, Trash2, Save, FileText, MessageSquare, Megaphone } from 'lucide-react';
import { marked } from 'marked';
import { formatDateTimeCn } from '../utils/datetime';

const unwrapOuterMarkdownFence = (text: string) => {
  const raw = String(text || '').trim();
  const matched = raw.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  if (matched) {
    return matched[1].trim();
  }
  return text || '';
};

const normalizeBareUrlBoundaries = (text: string) => {
  const source = String(text || '');
  return source.replace(/https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/g, (matched, offset, fullText) => {
    const start = Number(offset || 0);
    const prevChar = start > 0 ? fullText[start - 1] : '';
    const nextChar = fullText[start + matched.length] || '';

    if (prevChar === '<' && nextChar === '>') {
      return matched;
    }

    let url = matched;
    let suffix = '';
    while (url.length > 0 && /[)\]}>》）】」』’”"'、，。；：！？,.!?;:]/.test(url[url.length - 1])) {
      suffix = url[url.length - 1] + suffix;
      url = url.slice(0, -1);
    }

    if (!url) return matched;
    return `<${url}>${suffix}`;
  });
};

const renderMarkdownHtml = (text: string) => {
  const unwrapped = unwrapOuterMarkdownFence(text || '');
  const normalized = normalizeBareUrlBoundaries(unwrapped);
  return marked.parse(normalized);
};

type SortDirection = 'asc' | 'desc';

const normalizeSortValue = (value: any) => {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  const raw = String(value).trim();
  if (!raw) return '';
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  const time = Date.parse(raw);
  if (!Number.isNaN(time)) return time;
  return raw.toLowerCase();
};

const compareSortValues = (left: any, right: any) => {
  const a = normalizeSortValue(left);
  const b = normalizeSortValue(right);
  if (a === b) return 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'zh-CN');
};

const sortRows = <T,>(rows: T[], getter: (row: T) => any, direction: SortDirection) => {
  const list = [...rows];
  list.sort((a, b) => {
    const delta = compareSortValues(getter(a), getter(b));
    return direction === 'asc' ? delta : -delta;
  });
  return list;
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'users' | 'records' | 'feedbacks' | 'settings' | 'quizzes' | 'announcements'>('users');
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    if (user.role !== 'admin') {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col">
        <div className="flex items-center mb-8 px-2">
          <span className="font-bold text-xl text-slate-900">管理后台</span>
        </div>
        <nav className="space-y-1 flex-1">
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg ${activeTab === 'users' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <Users className="w-5 h-5 mr-3" /> 学生账户管理
          </button>
          <button
            onClick={() => setActiveTab('records')}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg ${activeTab === 'records' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <FileText className="w-5 h-5 mr-3" /> 学习记录
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg ${activeTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <Settings className="w-5 h-5 mr-3" /> AI 配置
          </button>
          <button
            onClick={() => setActiveTab('feedbacks')}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg ${activeTab === 'feedbacks' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <MessageSquare className="w-5 h-5 mr-3" /> 学生反馈
          </button>
          <button
            onClick={() => setActiveTab('quizzes')}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg ${activeTab === 'quizzes' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <FileText className="w-5 h-5 mr-3" /> 测试发放
          </button>
          <button
            onClick={() => setActiveTab('announcements')}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg ${activeTab === 'announcements' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <Megaphone className="w-5 h-5 mr-3" /> 公告发布
          </button>
        </nav>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition mt-auto"
        >
          <ArrowLeft className="w-5 h-5 mr-3" /> 返回前台
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        {activeTab === 'users' ? <UsersManagement /> : activeTab === 'records' ? <AdminRecords /> : activeTab === 'feedbacks' ? <AdminFeedbacks /> : activeTab === 'quizzes' ? <AdminQuizzes /> : activeTab === 'announcements' ? <AdminAnnouncements /> : <AISettings />}
      </div>
    </div>
  );
}

function AdminAnnouncements() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadAnnouncements = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/announcements`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '公告加载失败');
      }
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || '公告加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements().catch(console.error);
  }, []);

  const publish = async () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle) {
      setError('请输入公告标题');
      return;
    }
    if (!trimmedContent) {
      setError('请输入公告内容');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/announcements/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ title: trimmedTitle, content: trimmedContent })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '发布失败');
      }
      setMessage(data?.message || '公告已发布');
      setTitle('');
      setContent('');
      await loadAnnouncements();
    } catch (err: any) {
      setError(err?.message || '发布失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">公告发布</h2>
          <p className="text-slate-500 mt-1">学生首次登录后会依次弹出所有未读公告并要求确认。</p>
        </div>
        <button onClick={() => loadAnnouncements()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">刷新</button>
      </div>

      {error && <div className="bg-rose-50 text-rose-700 border border-rose-100 rounded-lg p-3 text-sm">{error}</div>}
      {message && <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg p-3 text-sm">{message}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">公告标题</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="例如：第2周学习任务提醒"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">公告内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="请输入要通知学生的内容..."
          />
        </div>
        <div>
          <button
            onClick={publish}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {saving ? '发布中...' : '发布公告'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">公告历史</h3>
        {loading ? (
          <div className="text-sm text-slate-500">加载中...</div>
        ) : announcements.length > 0 ? (
          <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
            {announcements.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-4">
                <div className="text-base font-semibold text-slate-900">{item.title}</div>
                <div className="text-xs text-slate-500 mt-1">
                  ID: {item.id} · 发布时间：{formatDateTimeCn(item.published_at)}
                  {item.created_by_username ? ` · 发布人：${item.created_by_username}` : ''}
                </div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap mt-2">{item.content}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500">暂无公告</div>
        )}
      </div>
    </div>
  );
}

function UsersManagement() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  const [users, setUsers] = useState<any[]>([]);
  const [userSortKey, setUserSortKey] = useState<'id' | 'username' | 'role'>('id');
  const [userSortDirection, setUserSortDirection] = useState<SortDirection>('asc');
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'student' });
  const [batchText, setBatchText] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);

  const fetchUsers = () => {
    fetch(`${API_BASE_URL}/api/admin/users`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(res => res.json())
      .then(data => setUsers(data));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const url = editingUser ? `${API_BASE_URL}/api/admin/users/${editingUser.id}` : `${API_BASE_URL}/api/admin/users`;
    const method = editingUser ? 'PUT' : 'POST';
    
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(formData)
    });
    
    setIsModalOpen(false);
    setEditingUser(null);
    setFormData({ username: '', password: '', role: 'student' });
    fetchUsers();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除该用户吗？')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || '删除失败');
      }
      fetchUsers();
    } catch (err: any) {
      alert(err?.message || '删除失败');
    }
  };

  const openEdit = (user: any) => {
    setEditingUser(user);
    setFormData({ username: user.username, password: '', role: user.role });
    setIsModalOpen(true);
  };

  const handleBatchImport = async () => {
    if (!batchText.trim()) return;
    setBatchLoading(true);
    setBatchResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ text: batchText })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '批量导入失败');
      }
      setBatchResult(data);
      fetchUsers();
    } catch (err: any) {
      setBatchResult({ error: err.message || '批量导入失败' });
    } finally {
      setBatchLoading(false);
    }
  };

  const sortedUsers = useMemo(() => {
    return sortRows(users, (row) => row?.[userSortKey], userSortDirection);
  }, [users, userSortDirection, userSortKey]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-900">学生账户管理</h2>
        <button
          onClick={() => { setEditingUser(null); setFormData({ username: '', password: '', role: 'student' }); setIsModalOpen(true); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center transition"
        >
          <Plus className="w-4 h-4 mr-2" /> 添加账户
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">批量注册学生账号</h3>
        <p className="text-sm text-slate-500 mb-3">每行格式：学号 姓名。姓名中的 * 会自动去掉；创建后账号=姓名，密码=学号。</p>
        <textarea
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          className="w-full h-36 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder={'20241018016\tliziyi*\n20241018018\twangqianfei*'}
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleBatchImport}
            disabled={batchLoading || !batchText.trim()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {batchLoading ? '导入中...' : '开始批量创建'}
          </button>
          <button
            onClick={() => { setBatchText(''); setBatchResult(null); }}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            清空
          </button>
        </div>

        {batchResult && (
          <div className="mt-4 text-sm">
            {batchResult.error ? (
              <div className="text-rose-600">{batchResult.error}</div>
            ) : (
              <>
                <div className="text-emerald-700">导入完成：成功 {batchResult.created}，跳过 {batchResult.skipped}，解析 {batchResult.parsed} 行。</div>
                {Array.isArray(batchResult.results) && batchResult.results.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-600">
                    {batchResult.results.map((item: any, idx: number) => (
                      <div key={idx} className="py-0.5">
                        第{item.line}行 - {item.username || '-'} - {item.status === 'created' ? '创建成功' : `已跳过（${item.reason || '未知原因'}）`}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <span className="text-xs text-slate-500">排序</span>
          <select
            value={userSortKey}
            onChange={(e) => setUserSortKey(e.target.value as 'id' | 'username' | 'role')}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="id">ID</option>
            <option value="username">账号</option>
            <option value="role">角色</option>
          </select>
          <select
            value={userSortDirection}
            onChange={(e) => setUserSortDirection(e.target.value as SortDirection)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="asc">升序</option>
            <option value="desc">降序</option>
          </select>
        </div>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">用户名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">角色</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {sortedUsers.map(user => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{user.username}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                    {user.role === 'admin' ? '管理员' : '学生'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => openEdit(user)} className="text-indigo-600 hover:text-indigo-900 mr-4"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-900" disabled={user.username === 'admin'}><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-bold mb-4">{editingUser ? '编辑账户' : '添加账户'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">用户名</label>
                <input required type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">密码 {editingUser && <span className="text-slate-400 text-xs">(留空表示不修改)</span>}</label>
                <input type="password" required={!editingUser} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">角色</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="student">学生</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">取消</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminRecords() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  const [notes, setNotes] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [progressRows, setProgressRows] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [unitScores, setUnitScores] = useState<any[]>([]);
  const [unitScoresLoading, setUnitScoresLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingProgress, setCheckingProgress] = useState(false);
  const [checkingStudentId, setCheckingStudentId] = useState<number | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressSortKey, setProgressSortKey] = useState<'student_id' | 'student_username' | 'status' | 'lag_days' | 'should_remind' | 'checked_at'>('lag_days');
  const [progressSortDirection, setProgressSortDirection] = useState<SortDirection>('desc');
  const [noteSortKey, setNoteSortKey] = useState<'student_id' | 'student_username' | 'unit_title' | 'created_at' | 'grade'>('created_at');
  const [noteSortDirection, setNoteSortDirection] = useState<SortDirection>('desc');
  const [planSortKey, setPlanSortKey] = useState<'student_id' | 'student_username' | 'unit_title' | 'updated_at'>('updated_at');
  const [planSortDirection, setPlanSortDirection] = useState<SortDirection>('desc');
  const [scoreSortKey, setScoreSortKey] = useState<'student_id' | 'student_username' | 'final_grade' | 'latest_note_created_at' | 'has_plan'>('student_id');
  const [scoreSortDirection, setScoreSortDirection] = useState<SortDirection>('asc');
  const [recordViewer, setRecordViewer] = useState<{
    open: boolean;
    title: string;
    content: string;
    mode: 'text' | 'markdown';
  }>({
    open: false,
    title: '',
    content: '',
    mode: 'text'
  });

  const resolveFileUrl = (fileUrl: string | null) => {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('http')) return fileUrl;
    return `${API_BASE_URL}${fileUrl}`;
  };

  const getNoteAttachmentUrls = (note: any): string[] => {
    if (Array.isArray(note?.file_urls) && note.file_urls.length > 0) {
      return note.file_urls.map((item: any) => String(item || '').trim()).filter(Boolean);
    }
    const single = String(note?.file_url || '').trim();
    return single ? [single] : [];
  };

  const loadUnitScores = async (unitId: string) => {
    if (!unitId) {
      setUnitScores([]);
      return;
    }
    setUnitScoresLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/unit-scores?unitId=${unitId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '单元成绩加载失败');
      }
      setUnitScores(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err: any) {
      setProgressMessage(err?.message || '单元成绩加载失败');
      setUnitScores([]);
    } finally {
      setUnitScoresLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [notesData, plansData, progressData, unitsData] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/notes`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json()),
        fetch(`${API_BASE_URL}/api/admin/plans`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json()),
        fetch(`${API_BASE_URL}/api/admin/progress`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json()),
        fetch(`${API_BASE_URL}/api/units`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json())
      ]);
      setNotes(Array.isArray(notesData) ? notesData : []);
      setPlans(Array.isArray(plansData) ? plansData : []);
      setProgressRows(Array.isArray(progressData) ? progressData : []);

      const unitList = Array.isArray(unitsData) ? unitsData : [];
      setUnits(unitList);
      const preferredUnitId = selectedUnitId || (unitList[0] ? String(unitList[0].id) : '');
      if (preferredUnitId && preferredUnitId !== selectedUnitId) {
        setSelectedUnitId(preferredUnitId);
      }
      await loadUnitScores(preferredUnitId);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckAllProgress = async () => {
    setCheckingProgress(true);
    setProgressMessage('');
    setProgressRows([]);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/progress/check-all?stream=1`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamError = '';

        const processEventBlock = (rawBlock: string) => {
          const lines = rawBlock.split('\n').map(line => line.trim()).filter(Boolean);
          if (lines.length === 0) return;

          let eventName = 'message';
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }

          let payload: any = {};
          if (dataLines.length > 0) {
            try {
              payload = JSON.parse(dataLines.join('\n'));
            } catch (err) {
              payload = { raw: dataLines.join('\n') };
            }
          }

          if (eventName === 'stage') {
            setProgressMessage(payload?.message ? `${payload.message}（共 ${payload.total ?? 0} 人）` : '检测中...');
            return;
          }

          if (eventName === 'result') {
            const row = payload?.row;
            if (!row) return;
            setProgressRows((prev) => {
              const idx = prev.findIndex(item => Number(item.student_id) === Number(row.student_id));
              if (idx >= 0) {
                const cloned = [...prev];
                cloned[idx] = row;
                return cloned;
              }
              return [...prev, row];
            });
            setProgressMessage(`检测进度：${payload?.index ?? 0}/${payload?.total ?? 0}`);
            return;
          }

          if (eventName === 'final') {
            setProgressMessage(`检测完成：共 ${payload?.total ?? 0} 名学生，需提醒 ${payload?.remind_count ?? 0} 人。`);
            return;
          }

          if (eventName === 'error') {
            streamError = String(payload?.error || '检测失败');
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';
          for (const block of blocks) {
            processEventBlock(block);
          }
        }

        if (buffer.trim()) processEventBlock(buffer);
        if (streamError) throw new Error(streamError);
      } else {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || '检测失败');
        }
        setProgressRows(Array.isArray(data?.results) ? data.results : []);
        setProgressMessage(`检测完成：共 ${data?.total ?? 0} 名学生，需提醒 ${data?.remind_count ?? 0} 人。`);
      }
    } catch (err: any) {
      setProgressMessage(err?.message || '检测失败');
    } finally {
      setCheckingProgress(false);
    }
  };

  const handleCheckSingleProgress = async (studentId: number) => {
    setCheckingStudentId(studentId);
    setProgressMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/progress/check/${studentId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '检测失败');
      }
      setProgressRows((prev) => {
        const idx = prev.findIndex(item => Number(item.student_id) === Number(studentId));
        if (idx >= 0) {
          const cloned = [...prev];
          cloned[idx] = data;
          return cloned;
        }
        return [...prev, data];
      });
      setProgressMessage(`已完成学生 ${data?.student_username || studentId} 的进度检测。`);
    } catch (err: any) {
      setProgressMessage(err?.message || '检测失败');
    } finally {
      setCheckingStudentId(null);
    }
  };

  useEffect(() => {
    loadData().catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedUnitId) return;
    loadUnitScores(selectedUnitId).catch(console.error);
  }, [selectedUnitId]);

  const sortedProgressRows = useMemo(() => {
    return sortRows(progressRows, (item) => item?.[progressSortKey], progressSortDirection);
  }, [progressRows, progressSortDirection, progressSortKey]);

  const sortedNotes = useMemo(() => {
    return sortRows(notes, (item) => item?.[noteSortKey], noteSortDirection);
  }, [noteSortDirection, noteSortKey, notes]);

  const sortedPlans = useMemo(() => {
    return sortRows(plans, (item) => item?.[planSortKey], planSortDirection);
  }, [planSortDirection, planSortKey, plans]);

  const sortedUnitScores = useMemo(() => {
    return sortRows(unitScores, (item) => item?.[scoreSortKey], scoreSortDirection);
  }, [scoreSortDirection, scoreSortKey, unitScores]);

  const formatDate = (value?: string) => {
    return formatDateTimeCn(value);
  };

  const openRecordViewer = (title: string, content: string, mode: 'text' | 'markdown' = 'text') => {
    setRecordViewer({
      open: true,
      title,
      content: String(content || '').trim(),
      mode
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">学习记录</h2>
          <p className="text-slate-500 mt-1">管理员可查看所有学生提交的历史笔记和学习计划，并下载附件。</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCheckAllProgress}
            disabled={checkingProgress}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
          >
            {checkingProgress ? '检测中...' : '主动检测全体进度'}
          </button>
          <button onClick={loadData} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">刷新</button>
        </div>
      </div>
      {progressMessage && <div className="text-sm text-slate-600">{progressMessage}</div>}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-slate-500">加载中...</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">单元最终分数总览</h3>
                <p className="text-sm text-slate-500">按单元查看每位学生最终分数（以该单元最后一次笔记成绩为准）。</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">单元</span>
                <select
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  className="border border-slate-300 rounded px-2 py-1 text-sm"
                >
                  <option value="">请选择单元</option>
                  {units.map((unit: any) => (
                    <option key={unit.id} value={unit.id}>{unit.title}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-500">排序</span>
                <select
                  value={scoreSortKey}
                  onChange={(e) => setScoreSortKey(e.target.value as 'student_id' | 'student_username' | 'final_grade' | 'latest_note_created_at' | 'has_plan')}
                  className="border border-slate-300 rounded px-2 py-1 text-sm"
                >
                  <option value="student_id">学生ID</option>
                  <option value="student_username">账号</option>
                  <option value="final_grade">分数</option>
                  <option value="latest_note_created_at">最近提交时间</option>
                  <option value="has_plan">计划有无</option>
                </select>
                <select
                  value={scoreSortDirection}
                  onChange={(e) => setScoreSortDirection(e.target.value as SortDirection)}
                  className="border border-slate-300 rounded px-2 py-1 text-sm"
                >
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学生ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">账号</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">最终分数</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">最近提交时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">AI评价</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学习计划</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {unitScoresLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">成绩加载中...</td>
                    </tr>
                  ) : sortedUnitScores.length > 0 ? (
                    sortedUnitScores.map((row: any) => (
                      <tr key={`${row.student_id}-${selectedUnitId}`}>
                        <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{row.student_id}</td>
                        <td className="px-4 py-3 text-sm text-slate-800 whitespace-nowrap">{row.student_username}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{row.final_grade ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(row.latest_note_created_at)}</td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          {row.final_feedback ? (
                            <button
                              onClick={() => openRecordViewer(
                                `${row.student_username} · ${units.find((item: any) => String(item.id) === String(selectedUnitId))?.title || '当前单元'} · AI评分评价`,
                                String(row.final_feedback || ''),
                                'markdown'
                              )}
                              className="text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              查看评价
                            </button>
                          ) : (
                            <span className="text-slate-400">无</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          {row.has_plan ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">有</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">无</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">暂无该单元成绩数据</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">学生进度滞后检测</h3>
                <p className="text-sm text-slate-500">展示每位学生最新一次进度评估结果。</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">排序</span>
                <select
                  value={progressSortKey}
                  onChange={(e) => setProgressSortKey(e.target.value as 'student_id' | 'student_username' | 'status' | 'lag_days' | 'should_remind' | 'checked_at')}
                  className="border border-slate-300 rounded px-2 py-1 text-sm"
                >
                  <option value="student_id">学生ID</option>
                  <option value="student_username">账号</option>
                  <option value="status">状态</option>
                  <option value="lag_days">滞后天数</option>
                  <option value="should_remind">提醒</option>
                  <option value="checked_at">检测时间</option>
                </select>
                <select
                  value={progressSortDirection}
                  onChange={(e) => setProgressSortDirection(e.target.value as SortDirection)}
                  className="border border-slate-300 rounded px-2 py-1 text-sm"
                >
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学生ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学生</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">滞后天数</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">提醒</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">检测时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">原因</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {sortedProgressRows.map((item: any, idx: number) => (
                    <tr key={`${item.student_id}-${idx}`}>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{item.student_id ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-800 whitespace-nowrap">{item.student_username || item.student_id}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{item.status || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{Number(item.lag_days || 0)}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {item.should_remind ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">需要提醒</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">正常</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(item.checked_at)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 max-w-md whitespace-pre-wrap">{item.reason || '-'}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <button
                          onClick={() => handleCheckSingleProgress(Number(item.student_id))}
                          disabled={checkingStudentId === Number(item.student_id)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
                        >
                          {checkingStudentId === Number(item.student_id) ? '检测中...' : '检测该学生'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sortedProgressRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-500">暂无进度检测结果</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">学习笔记</h3>
                <p className="text-sm text-slate-500">查看全部学生的笔记内容、附件与评分。</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">排序</span>
                <select
                  value={noteSortKey}
                  onChange={(e) => setNoteSortKey(e.target.value as 'student_id' | 'student_username' | 'unit_title' | 'created_at' | 'grade')}
                  className="border border-slate-300 rounded px-2 py-1 text-sm"
                >
                  <option value="student_id">学生ID</option>
                  <option value="student_username">账号</option>
                  <option value="unit_title">单元</option>
                  <option value="created_at">提交时间</option>
                  <option value="grade">评分</option>
                </select>
                <select
                  value={noteSortDirection}
                  onChange={(e) => setNoteSortDirection(e.target.value as SortDirection)}
                  className="border border-slate-300 rounded px-2 py-1 text-sm"
                >
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学生ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学生</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">单元</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">周次</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">提交时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">评分</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">附件</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">内容摘要</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {sortedNotes.map((note: any) => (
                    <tr key={note.id}>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{note.student_id ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-800">{note.student_username}</td>
                      <td className="px-4 py-3 text-sm text-slate-800">{note.unit_title}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{note.week || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(note.created_at)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{note.grade ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-indigo-600">
                        {getNoteAttachmentUrls(note).length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {getNoteAttachmentUrls(note).map((attachmentUrl, index) => (
                              <a key={`${note.id}-file-${index}`} className="hover:underline" href={resolveFileUrl(attachmentUrl)} target="_blank" rel="noreferrer">
                                下载{getNoteAttachmentUrls(note).length > 1 ? index + 1 : ''}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">无</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 max-w-xs">
                        {note.content ? (
                          <div className="space-y-1">
                            <div className="whitespace-pre-wrap">{`${note.content.slice(0, 100)}${note.content.length > 100 ? '...' : ''}`}</div>
                            <button
                              onClick={() => openRecordViewer(
                                `${note.student_username} · ${note.unit_title} · 学习笔记`,
                                String(note.content || ''),
                                'text'
                              )}
                              className="text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              查看全文
                            </button>
                          </div>
                        ) : (
                          '无'
                        )}
                      </td>
                    </tr>
                  ))}
                  {sortedNotes.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-500">暂无笔记记录</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">学习计划</h3>
                <p className="text-sm text-slate-500">按更新时间查看所有学生的学习计划。</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">排序</span>
                <select
                  value={planSortKey}
                  onChange={(e) => setPlanSortKey(e.target.value as 'student_id' | 'student_username' | 'unit_title' | 'updated_at')}
                  className="border border-slate-300 rounded px-2 py-1 text-sm"
                >
                  <option value="student_id">学生ID</option>
                  <option value="student_username">账号</option>
                  <option value="unit_title">单元</option>
                  <option value="updated_at">更新时间</option>
                </select>
                <select
                  value={planSortDirection}
                  onChange={(e) => setPlanSortDirection(e.target.value as SortDirection)}
                  className="border border-slate-300 rounded px-2 py-1 text-sm"
                >
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学生ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学生</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">单元</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">更新时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">计划内容</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {sortedPlans.map((plan: any) => (
                    <tr key={plan.id}>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{plan.student_id ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-800">{plan.student_username}</td>
                      <td className="px-4 py-3 text-sm text-slate-800">{plan.unit_title}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(plan.updated_at)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 max-w-lg min-w-[28rem]">
                        <div className="max-h-56 overflow-y-auto pr-2">
                          <div
                            className="leading-6
                            [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
                            [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2
                            [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
                            [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                            [&_li]:my-1 [&_a]:text-indigo-600 [&_a]:underline
                            [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.92em]
                            [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:rounded-xl [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-3
                            [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit
                            [&_table]:w-full [&_table]:min-w-max [&_table]:border-collapse [&_table]:my-3
                            [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left
                            [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1"
                            dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(plan.plan_content || '') as any }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedPlans.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">暂无学习计划</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {recordViewer.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">{recordViewer.title}</h4>
              <button
                onClick={() => setRecordViewer({ open: false, title: '', content: '', mode: 'text' })}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>
            <div className="p-5 overflow-y-auto text-sm text-slate-700">
              {recordViewer.content ? (
                recordViewer.mode === 'markdown' ? (
                  <div
                    className="leading-7
                    [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
                    [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2
                    [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
                    [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                    [&_li]:my-1 [&_a]:text-indigo-600 [&_a]:underline
                    [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.92em]
                    [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:rounded-xl [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-3
                    [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit
                    [&_table]:w-full [&_table]:min-w-max [&_table]:border-collapse [&_table]:my-3
                    [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left
                    [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1"
                    dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(recordViewer.content) as any }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap leading-7">{recordViewer.content}</div>
                )
              ) : (
                <div className="text-slate-500">暂无内容</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminFeedbacks() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [feedbackSortKey, setFeedbackSortKey] = useState<'student_username' | 'created_at' | 'replied_at'>('created_at');
  const [feedbackSortDirection, setFeedbackSortDirection] = useState<SortDirection>('desc');
  const [loading, setLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingReplyId, setSavingReplyId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadFeedbacks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/feedbacks`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setFeedbacks(list);
      setReplyDrafts((prev) => {
        const next = { ...prev };
        for (const item of list) {
          const key = String(item.id);
          if (typeof next[key] !== 'string') {
            next[key] = String(item.admin_reply || '');
          }
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedbacks();
  }, []);

  const handleReply = async (feedbackId: number) => {
    const reply = String(replyDrafts[String(feedbackId)] || '').trim();
    if (!reply) {
      setError('回复内容不能为空');
      setMessage('');
      return;
    }

    setSavingReplyId(feedbackId);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/feedbacks/${feedbackId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ reply })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '回复失败');
      }
      setFeedbacks((prev) => prev.map((item: any) => item.id === feedbackId ? data.feedback : item));
      setReplyDrafts((prev) => ({ ...prev, [String(feedbackId)]: String(data?.feedback?.admin_reply || reply) }));
      setMessage('回复已保存');
    } catch (err: any) {
      setError(err?.message || '回复失败');
    } finally {
      setSavingReplyId(null);
    }
  };

  const formatDate = (value?: string) => {
    return formatDateTimeCn(value);
  };

  const sortedFeedbacks = useMemo(() => {
    return sortRows(feedbacks, (item) => item?.[feedbackSortKey], feedbackSortDirection);
  }, [feedbackSortDirection, feedbackSortKey, feedbacks]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">学生反馈</h2>
          <p className="text-slate-500 mt-1">查看学生提交的平台改进建议，并可直接回复。</p>
        </div>
        <button onClick={loadFeedbacks} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">刷新</button>
      </div>

      {error && <div className="bg-rose-50 text-rose-700 border border-rose-100 rounded-lg p-3 text-sm">{error}</div>}
      {message && <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg p-3 text-sm">{message}</div>}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-slate-500">加载中...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
            <span className="text-xs text-slate-500">排序</span>
            <select
              value={feedbackSortKey}
              onChange={(e) => setFeedbackSortKey(e.target.value as 'student_username' | 'created_at' | 'replied_at')}
              className="border border-slate-300 rounded px-2 py-1 text-sm"
            >
              <option value="student_username">学生账号</option>
              <option value="created_at">提交时间</option>
              <option value="replied_at">回复时间</option>
            </select>
            <select
              value={feedbackSortDirection}
              onChange={(e) => setFeedbackSortDirection(e.target.value as SortDirection)}
              className="border border-slate-300 rounded px-2 py-1 text-sm"
            >
              <option value="asc">升序</option>
              <option value="desc">降序</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学生</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">提交时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">反馈内容</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">管理员回复</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {sortedFeedbacks.map((item: any) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm text-slate-800 whitespace-nowrap">{item.student_username}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">{item.content}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 min-w-[320px]">
                      {item.admin_reply && (
                        <div className="mb-2 rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-emerald-800 whitespace-pre-wrap">
                          {item.admin_reply}
                          <div className="mt-1 text-xs text-emerald-700">
                            {item.replied_by_username ? `回复人：${item.replied_by_username} · ` : ''}{formatDate(item.replied_at)}
                          </div>
                        </div>
                      )}
                      <textarea
                        value={replyDrafts[String(item.id)] ?? ''}
                        onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [String(item.id)]: e.target.value }))}
                        rows={3}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="输入管理员回复内容..."
                      />
                      <div className="mt-2">
                        <button
                          onClick={() => handleReply(Number(item.id))}
                          disabled={savingReplyId === Number(item.id)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {savingReplyId === Number(item.id) ? '保存中...' : '保存回复'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedFeedbacks.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">暂无学生反馈</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminQuizzes() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  const [units, setUnits] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [unitId, setUnitId] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'single'>('all');
  const [studentId, setStudentId] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quizSortKey, setQuizSortKey] = useState<'id' | 'unit_title' | 'student_username' | 'status' | 'score' | 'created_at' | 'expires_at'>('created_at');
  const [quizSortDirection, setQuizSortDirection] = useState<SortDirection>('desc');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const token = localStorage.getItem('token') || '';

  const loadData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [unitsRes, usersRes, recordsRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/units`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/users`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/quizzes`, { headers })
      ]);

      const unitsData = unitsRes.status === 'fulfilled' ? await unitsRes.value.json().catch(() => []) : [];
      const usersData = usersRes.status === 'fulfilled' ? await usersRes.value.json().catch(() => []) : [];
      const recordsData = recordsRes.status === 'fulfilled' ? await recordsRes.value.json().catch(() => []) : [];

      setUnits(Array.isArray(unitsData) ? unitsData : []);
      setStudents(Array.isArray(usersData) ? usersData.filter((u: any) => u.role === 'student') : []);
      setRecords(Array.isArray(recordsData) ? recordsData : []);
      if (!unitId && Array.isArray(unitsData) && unitsData.length > 0) {
        setUnitId(String(unitsData[0].id));
      }
      if (recordsRes.status === 'rejected') {
        setError('测试记录接口暂不可用，但单元和学生可正常加载。');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData().catch(console.error);
  }, []);

  const formatDate = (value?: string) => {
    return formatDateTimeCn(value);
  };

  const sortedQuizRecords = useMemo(() => {
    return sortRows(records, (item) => item?.[quizSortKey], quizSortDirection);
  }, [quizSortDirection, quizSortKey, records]);

  const handleAssign = async () => {
    setMessage('');
    setError('');

    if (!unitId) {
      setError('请选择单元');
      return;
    }
    if (targetType === 'single' && !studentId) {
      setError('请选择学生');
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/quizzes/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          unitId: Number(unitId),
          targetType,
          studentId: targetType === 'single' ? Number(studentId) : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '发送失败');
      }

      setMessage(`发送成功：已向 ${data?.assigned_count || 0} 名学生发出测试，作答时限24小时。`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || '发送失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">测试发放</h2>
          <p className="text-slate-500 mt-1">为全体或单个学生发送单元测试（简单4题/中等3题/困难3题，24小时内提交）。</p>
        </div>
        <button onClick={() => loadData()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">刷新</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">单元</label>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">请选择单元</option>
              {units.map((unit: any) => (
                <option key={unit.id} value={unit.id}>{unit.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">发送对象</label>
            <select value={targetType} onChange={(e) => setTargetType(e.target.value as 'all' | 'single')} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="all">全体学生</option>
              <option value="single">单个学生</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">学生</label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              disabled={targetType !== 'single'}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
            >
              <option value="">请选择学生</option>
              {students.map((student: any) => (
                <option key={student.id} value={student.id}>{student.username}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAssign}
            disabled={sending || !unitId || (targetType === 'single' && !studentId)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {sending ? '发送中...' : '发送测试'}
          </button>
          {message && <span className="text-sm text-emerald-700">{message}</span>}
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">测试记录与成绩</h3>
        </div>
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <span className="text-xs text-slate-500">排序</span>
          <select
            value={quizSortKey}
            onChange={(e) => setQuizSortKey(e.target.value as 'id' | 'unit_title' | 'student_username' | 'status' | 'score' | 'created_at' | 'expires_at')}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="id">ID</option>
            <option value="unit_title">单元</option>
            <option value="student_username">学生账号</option>
            <option value="status">状态</option>
            <option value="score">分数</option>
            <option value="created_at">发放时间</option>
            <option value="expires_at">截止时间</option>
          </select>
          <select
            value={quizSortDirection}
            onChange={(e) => setQuizSortDirection(e.target.value as SortDirection)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="asc">升序</option>
            <option value="desc">降序</option>
          </select>
        </div>
        {loading ? (
          <div className="p-6 text-slate-500">加载中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">单元</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">学生</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">分数</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">正确题数</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">发放时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">截止时间</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {sortedQuizRecords.map((item: any) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{item.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-800 whitespace-nowrap">{item.unit_title}</td>
                    <td className="px-4 py-3 text-sm text-slate-800 whitespace-nowrap">{item.student_username}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {item.status === 'submitted' ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">已提交</span>
                      ) : item.status === 'expired' ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">已过期</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">待作答</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{item.score ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{typeof item.correct_count === 'number' ? `${item.correct_count}/${item.total_questions}` : '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(item.expires_at)}</td>
                  </tr>
                ))}
                {sortedQuizRecords.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500">暂无测试记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AISettings() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  const [settings, setSettings] = useState({ ai_api_key: '', ai_base_url: '', ai_model: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState('你好，这是测试消息');
  const [testResult, setTestResult] = useState('');
  const [clearingFiles, setClearingFiles] = useState(false);
  const [clearResult, setClearResult] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/settings`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(res => res.json())
      .then(data => {
        const newSettings = { ...settings };
        data.forEach((item: any) => {
          if (item.key in newSettings) {
            (newSettings as any)[item.key] = item.value;
          }
        });
        setSettings(newSettings);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const payload = Object.entries(settings).map(([key, value]) => ({ key, value }));
    try {
      await fetch(`${API_BASE_URL}/api/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ settings: payload })
      });
      setMessage('保存成功！');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/ai/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ message: testMessage })
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || '测试失败');
      }
      setTestResult(data.reply || 'AI 已响应，但无返回文本');
    } catch (err: any) {
      setTestResult(`错误: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleClearCloudFiles = async () => {
    const confirmed = window.confirm('确定清空当前 AI 服务商（如 KIMI）中的所有已上传文件吗？该操作不可撤销。');
    if (!confirmed) return;

    setClearingFiles(true);
    setClearResult('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/ai/files/clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '清空失败');
      }

      const failedPreview = Array.isArray(data?.failed) && data.failed.length > 0
        ? `\n失败样例：${data.failed.slice(0, 5).map((item: any) => `${item.id}(${item.status})`).join('，')}`
        : '';
      setClearResult(`已处理完成：扫描 ${data?.listed_count ?? 0} 份，删除成功 ${data?.deleted_count ?? 0} 份，失败 ${data?.failed_count ?? 0} 份。${failedPreview}`);
    } catch (err: any) {
      setClearResult(`错误: ${err?.message || '清空失败'}`);
    } finally {
      setClearingFiles(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">AI 配置</h2>
        <p className="text-slate-500 mt-1">配置网站使用的 AI 模型参数。</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">API Key</label>
          <input 
            type="password" 
            value={settings.ai_api_key} 
            onChange={e => setSettings({...settings, ai_api_key: e.target.value})} 
            placeholder="留空则使用环境变量中的 KEY"
            className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none transition" 
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Base URL</label>
          <input 
            type="text" 
            value={settings.ai_base_url} 
            onChange={e => setSettings({...settings, ai_base_url: e.target.value})} 
            placeholder="例如: https://generativelanguage.googleapis.com"
            className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none transition" 
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">模型名称</label>
          <input 
            type="text" 
            value={settings.ai_model} 
            onChange={e => setSettings({...settings, ai_model: e.target.value})} 
            placeholder="例如: -3-flash-prgeminieview"
            className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none transition" 
          />
        </div>

        <div className="pt-4 flex flex-col gap-3">
          <div className="flex items-center">
            <button 
              onClick={handleSave} 
              disabled={saving}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 flex items-center disabled:opacity-50 transition"
            >
              <Save className="w-4 h-4 mr-2" /> {saving ? '保存中...' : '保存配置'}
            </button>
            {message && <span className="ml-4 text-emerald-600 text-sm font-medium">{message}</span>}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="w-64 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="测试消息"
            />
            <button
              onClick={handleTest}
              disabled={testing}
              className="bg-slate-100 text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
            >
              {testing ? '测试中...' : '发送测试消息'}
            </button>
          </div>
          {testResult && (
            <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap">
              {testResult}
            </div>
          )}

          <div className="mt-2 pt-4 border-t border-slate-200">
            <div className="text-sm font-medium text-slate-900 mb-2">KIMI 云端文件维护</div>
            <p className="text-xs text-slate-500 mb-3">
              清空 AI 平台云端文件池（不影响服务器本地保存的学生附件）。适用于处理 KIMI 文件数上限问题。
            </p>
            <button
              onClick={handleClearCloudFiles}
              disabled={clearingFiles}
              className="bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition disabled:opacity-50"
            >
              {clearingFiles ? '清空中...' : '清空 KIMI 云端文件'}
            </button>
            {clearResult && (
              <div className="mt-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap">
                {clearResult}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
