import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, FileText, CheckCircle, Library } from 'lucide-react';

export default function Dashboard() {
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  const [units, setUnits] = useState<any[]>([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [myFeedbacks, setMyFeedbacks] = useState<any[]>([]);
  const [myFeedbacksLoading, setMyFeedbacksLoading] = useState(false);
  const [progressReminder, setProgressReminder] = useState<any>(null);
  const [showProgressReminder, setShowProgressReminder] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    fetch(`${API_BASE_URL}/api/units`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setUnits(data))
      .catch(console.error);

    if (user.role === 'student') {
      setMyFeedbacksLoading(true);
      fetch(`${API_BASE_URL}/api/feedback/mine`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setMyFeedbacks(Array.isArray(data) ? data : []))
        .catch(console.error)
        .finally(() => setMyFeedbacksLoading(false));

      fetch(`${API_BASE_URL}/api/progress/reminder`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          setProgressReminder(data);
          if (data?.should_remind) {
            setShowProgressReminder(true);
          }
        })
        .catch(console.error);
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('请完整填写旧密码和新密码');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('新密码至少需要6位');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '修改密码失败');

      setPasswordMessage(data.message || '密码修改成功');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || '修改密码失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError('');
    setFeedbackMessage('');

    const content = feedbackText.trim();
    if (!content) {
      setFeedbackError('请先填写反馈内容');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    setFeedbackLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失败');

      setFeedbackMessage(data.message || '反馈提交成功');
      setFeedbackText('');
      const listRes = await fetch(`${API_BASE_URL}/api/feedback/mine`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const listData = await listRes.json();
      setMyFeedbacks(Array.isArray(listData) ? listData : []);
    } catch (err: any) {
      setFeedbackError(err.message || '提交失败');
    } finally {
      setFeedbackLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <BookOpen className="w-6 h-6 text-indigo-600 mr-2" />
              <span className="font-semibold text-xl text-slate-900">计算机视觉基础</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-slate-600">你好, {user.username}</span>
              {user.role === 'student' && (
                <button
                  onClick={() => {
                    setShowPasswordModal(true);
                    setPasswordError('');
                    setPasswordMessage('');
                  }}
                  className="text-indigo-600 hover:text-indigo-800 text-sm font-medium transition"
                >
                  修改密码
                </button>
              )}
              {user.role === 'admin' && (
                <button
                  onClick={() => navigate('/admin')}
                  className="text-indigo-600 hover:text-indigo-800 text-sm font-medium transition"
                >
                  管理后台
                </button>
              )}
              <button
                onClick={handleLogout}
                className="text-slate-500 hover:text-slate-700 flex items-center transition"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 max-w-3xl">
          <h2 className="text-xl font-semibold text-slate-900">平台改进反馈</h2>
          <p className="text-slate-600 mt-1 text-sm">欢迎提交你对平台功能和体验的改进建议，管理员会在后台查看。</p>

          {feedbackError && <div className="mt-3 bg-red-50 text-red-600 p-2 rounded text-sm">{feedbackError}</div>}
          {feedbackMessage && <div className="mt-3 bg-green-50 text-green-700 p-2 rounded text-sm">{feedbackMessage}</div>}

          <form onSubmit={handleSubmitFeedback} className="mt-4">
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={3}
              placeholder="例如：希望增加学习进度可视化、优化移动端排版、补充更多实践案例..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="mt-3">
              <button
                type="submit"
                disabled={feedbackLoading}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {feedbackLoading ? '提交中...' : '提交反馈'}
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">我的反馈与管理员回复</h3>
            {myFeedbacksLoading ? (
              <div className="text-sm text-slate-500">加载中...</div>
            ) : myFeedbacks.length === 0 ? (
              <div className="text-sm text-slate-500">你还没有提交反馈。</div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {myFeedbacks.map((item: any) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                    <div className="text-xs text-slate-500">提交时间：{new Date(item.created_at).toLocaleString()}</div>
                    <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{item.content}</div>
                    {item.admin_reply ? (
                      <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50 p-2">
                        <div className="text-xs text-emerald-700 mb-1">
                          管理员回复{item.replied_by_username ? `（${item.replied_by_username}）` : ''}
                          {item.replied_at ? ` · ${new Date(item.replied_at).toLocaleString()}` : ''}
                        </div>
                        <div className="text-sm text-emerald-800 whitespace-pre-wrap">{item.admin_reply}</div>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">管理员暂未回复</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          onClick={() => navigate('/resources')}
          className="mb-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 cursor-pointer hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 flex items-center">
                <Library className="w-5 h-5 mr-2 text-indigo-600" /> 课程资源总览
              </h2>
              <p className="text-slate-600 mt-1 text-sm">
                汇总核心理论、课程、实操代码库与前置知识补丁，点击进入资源页。
              </p>
            </div>
            <span className="text-indigo-600 text-sm font-medium group-hover:text-indigo-800 transition">进入资源页 &rarr;</span>
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">课程单元</h1>
          <p className="text-slate-600 mt-2">按照顺序完成以下单元的学习任务。</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {units.map((unit, index) => (
            <div
              key={unit.id}
              onClick={() => navigate(`/unit/${unit.id}`)}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 cursor-pointer hover:shadow-md transition group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="bg-indigo-50 text-indigo-700 text-sm font-medium px-3 py-1 rounded-full">
                  第 {unit.week_range} 周
                </div>
                <div className="text-slate-300 group-hover:text-indigo-500 transition">
                  <FileText className="w-6 h-6" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {index + 1}. {unit.title}
              </h3>
              <p className="text-slate-600 text-sm line-clamp-2 mb-4">
                {unit.description}
              </p>
              <div className="flex items-center text-sm text-indigo-600 font-medium">
                进入学习 &rarr;
              </div>
            </div>
          ))}
        </div>
      </main>

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">修改密码</h3>

            {passwordError && (
              <div className="mb-3 bg-red-50 text-red-600 p-2 rounded text-sm">{passwordError}</div>
            )}
            {passwordMessage && (
              <div className="mb-3 bg-green-50 text-green-700 p-2 rounded text-sm">{passwordMessage}</div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1">旧密码</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setPasswordError('');
                    setPasswordMessage('');
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {passwordLoading ? '提交中...' : '确认修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProgressReminder && progressReminder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-xl border border-rose-200">
            <h3 className="text-lg font-semibold text-rose-700 mb-2">学习进度提醒</h3>
            <p className="text-sm text-slate-600 mb-3">
              检测时间：{progressReminder.checked_at ? new Date(progressReminder.checked_at).toLocaleString() : '-'}
              {progressReminder.course_weekday ? `（${progressReminder.course_weekday}）` : ''}
            </p>
            <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-sm text-rose-700 mb-3">
              当前估计进度滞后 <strong>{Number(progressReminder.lag_days || 0)}</strong> 天。
            </div>
            <p className="text-sm text-slate-700 mb-2"><strong>原因：</strong>{progressReminder.reason || '暂无'}</p>
            <p className="text-sm text-slate-700"><strong>建议：</strong>{progressReminder.suggestion || '请及时对照计划补齐学习任务。'}</p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowProgressReminder(false)}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
