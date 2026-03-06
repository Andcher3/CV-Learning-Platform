import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, CheckCircle, Clock, BookOpen, MessageSquare, Send, Paperclip, Link as LinkIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import SidebarAI from './SidebarAI';
import { marked } from 'marked';

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
  return marked.parse(normalized) as string;
};

const wrapPlanTablesForScroll = (html: string) => {
  const source = String(html || '');
  return source
    .replace(/<table>/g, '<div class="plan-table-scroll"><table>')
    .replace(/<\/table>/g, '</table></div>');
};

const optimizePlanTablesLayout = (html: string) => {
  const source = String(html || '');
  if (!source.includes('<table')) return source;
  if (typeof window === 'undefined') return wrapPlanTablesForScroll(source);

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="plan-root">${source}</div>`, 'text/html');
    const root = doc.querySelector('#plan-root');
    if (!root) return wrapPlanTablesForScroll(source);

    root.querySelectorAll('table').forEach((table) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      let colCount = 0;
      for (const row of rows) {
        let count = 0;
        for (const cell of Array.from(row.children) as HTMLTableCellElement[]) {
          count += Math.max(1, Number(cell.colSpan || 1));
        }
        colCount = Math.max(colCount, count);
      }
      if (colCount <= 0) return;

      const scores = new Array(colCount).fill(1);
      rows.forEach((row, rowIndex) => {
        let cursor = 0;
        for (const cell of Array.from(row.children) as HTMLTableCellElement[]) {
          const span = Math.max(1, Number(cell.colSpan || 1));
          const text = String(cell.textContent || '').replace(/\s+/g, ' ').trim();
          const textLength = text.length;
          const lineHint = Math.max(1, Math.ceil(textLength / 24));
          let score = Math.min(220, Math.max(6, Math.sqrt(Math.max(1, textLength)) * 8 + lineHint * 2));
          if (rowIndex === 0 || cell.tagName.toLowerCase() === 'th') {
            score *= 0.75;
          }
          const perCol = score / span;
          for (let index = 0; index < span && cursor + index < scores.length; index++) {
            scores[cursor + index] += perCol;
          }
          cursor += span;
        }
      });

      if (rows.length > 0) {
        let cursor = 0;
        for (const headerCell of Array.from(rows[0].children) as HTMLTableCellElement[]) {
          const span = Math.max(1, Number(headerCell.colSpan || 1));
          const title = String(headerCell.textContent || '').trim();
          if (span === 1 && /(ID|序号|工时|耗时|时间)/i.test(title)) {
            scores[cursor] = Math.min(scores[cursor], 10);
          }
          cursor += span;
        }
      }

      const total = scores.reduce((sum, current) => sum + current, 0) || 1;
      let widths = scores.map((score) => (score / total) * 100);
      widths = widths.map((width) => Math.min(46, Math.max(8, width)));
      const normalizedTotal = widths.reduce((sum, current) => sum + current, 0) || 1;
      widths = widths.map((width) => (width / normalizedTotal) * 100);

      table.querySelector('colgroup')?.remove();
      const colgroup = doc.createElement('colgroup');
      widths.forEach((width) => {
        const col = doc.createElement('col');
        col.setAttribute('style', `width:${width.toFixed(2)}%`);
        colgroup.appendChild(col);
      });
      table.insertBefore(colgroup, table.firstChild);

      const parent = table.parentElement;
      if (!parent || !parent.classList.contains('plan-table-scroll')) {
        const wrapper = doc.createElement('div');
        wrapper.className = 'plan-table-scroll';
        parent?.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    });

    return root.innerHTML;
  } catch (err) {
    return wrapPlanTablesForScroll(source);
  }
};

export default function UnitDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  const [unit, setUnit] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState<any>(null);
  const [gradeActionError, setGradeActionError] = useState('');
  const [gradeStreamStatus, setGradeStreamStatus] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [planActionMessage, setPlanActionMessage] = useState('');
  const [planActionError, setPlanActionError] = useState('');
  const [showPretestModal, setShowPretestModal] = useState(false);
  const [pretestQuestion, setPretestQuestion] = useState('');
  const [pretestAnswer, setPretestAnswer] = useState('');
  const [loadingPretest, setLoadingPretest] = useState(false);
  const [submittingPretest, setSubmittingPretest] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerateContext, setRegenerateContext] = useState('');
  const [planStreamStatus, setPlanStreamStatus] = useState('');
  const [noteStreamStatus, setNoteStreamStatus] = useState('');
  const [quizAssignment, setQuizAssignment] = useState<any>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [quizMessage, setQuizMessage] = useState('');
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [planHistory, setPlanHistory] = useState<any[]>([]);
  const [planViewIndex, setPlanViewIndex] = useState(0);
  const planVersions = useMemo(() => {
    const versions: any[] = [];
    if (plan?.plan_content) {
      versions.push({
        id: `current-${plan?.id || 'na'}-${plan?.updated_at || ''}`,
        plan_content: plan.plan_content,
        source: 'current',
        created_at: plan?.updated_at || plan?.created_at || '',
      });
    }
    for (const item of planHistory) {
      if (item?.plan_content) {
        versions.push(item);
      }
    }
    return versions;
  }, [plan, planHistory]);
  const displayedPlan = planVersions[planViewIndex] || null;
  const displayedPlanContent = String(displayedPlan?.plan_content || '');
  const renderedPlan = useMemo(() => optimizePlanTablesLayout(renderMarkdownHtml(displayedPlanContent)), [displayedPlanContent]);
  const renderedPretestQuestion = useMemo(() => marked.parse(pretestQuestion || ''), [pretestQuestion]);

  const loadPlanHistory = async (token: string) => {
    const res = await fetch(`${API_BASE_URL}/api/plans/history/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || '计划历史加载失败');
    }
    setPlanHistory(Array.isArray(data?.history) ? data.history : []);
  };

  useEffect(() => {
    setPlanViewIndex((prev) => {
      if (planVersions.length === 0) return 0;
      return Math.min(prev, planVersions.length - 1);
    });
  }, [planVersions.length]);

  const consumeEventStream = async (
    res: Response,
    handlers: {
      onStage?: (payload: any) => void;
      onDelta?: (payload: any) => void;
      onFinal?: (payload: any) => void;
      onError?: (payload: any) => void;
    }
  ) => {
    if (!res.body) throw new Error('流式响应不可用');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processEventBlock = (rawBlock: string) => {
      const lines = rawBlock.split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length === 0) return;

      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      let payload: any = {};
      if (dataLines.length > 0) {
        const dataText = dataLines.join('\n');
        try {
          payload = JSON.parse(dataText);
        } catch (err) {
          payload = { raw: dataText };
        }
      }

      if (eventName === 'stage') {
        handlers.onStage?.(payload);
      } else if (eventName === 'delta') {
        handlers.onDelta?.(payload);
      } else if (eventName === 'final') {
        handlers.onFinal?.(payload);
      } else if (eventName === 'error') {
        handlers.onError?.(payload);
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

    if (buffer.trim()) {
      processEventBlock(buffer);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    fetch(`${API_BASE_URL}/api/units/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setUnit(data));

    fetch(`${API_BASE_URL}/api/plans/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setPlan(data));

    loadPlanHistory(token).catch(console.error);

    fetch(`${API_BASE_URL}/api/notes/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setNotes(data));

    setQuizLoading(true);
    fetch(`${API_BASE_URL}/api/quiz/unit/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setQuizAssignment(data);
        setQuizAnswers(data?.student_answers && typeof data.student_answers === 'object' ? data.student_answers : {});
      })
      .catch(() => setQuizError('测试数据加载失败'))
      .finally(() => setQuizLoading(false));
  }, [id, navigate]);

  const loadQuizAssignment = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setQuizLoading(true);
    setQuizError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/quiz/unit/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setQuizAssignment(data);
      setQuizAnswers(data?.student_answers && typeof data.student_answers === 'object' ? data.student_answers : {});
    } catch (err: any) {
      setQuizError(err?.message || '测试数据加载失败');
    } finally {
      setQuizLoading(false);
    }
  };

  const submitQuiz = async () => {
    if (!quizAssignment?.id) return;
    const questions = Array.isArray(quizAssignment?.questions) ? quizAssignment.questions : [];
    const unanswered = questions.filter((item: any) => !String(quizAnswers[item.id] || '').trim());
    if (unanswered.length > 0) {
      setQuizError(`还有 ${unanswered.length} 题未作答`);
      return;
    }

    setQuizSubmitting(true);
    setQuizError('');
    setQuizMessage('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/quiz/${quizAssignment.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ answers: quizAnswers })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '提交失败');
      }
      setQuizMessage(`提交成功，得分 ${data?.score ?? 0} 分（${data?.correct_count ?? 0}/${data?.total_questions ?? 0}）`);
      await loadQuizAssignment();
    } catch (err: any) {
      setQuizError(err?.message || '提交失败');
    } finally {
      setQuizSubmitting(false);
    }
  };

  const generatePlan = async (inputPretestAnswer = '', inputRegenerateContext = '') => {
    setLoadingPlan(true);
    setPlanActionError('');
    setPlanActionMessage('');
    setPlanStreamStatus('正在初始化生成任务...');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/plans/generate?stream=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          unitId: id,
          pretestAnswer: inputPretestAnswer,
          regenerateContext: inputRegenerateContext
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream') && res.body) {
        let finalPayload: any = null;
        let streamError = '';
        await consumeEventStream(res, {
          onStage: (payload) => setPlanStreamStatus(String(payload?.message || 'AI 正在处理中...')),
          onDelta: (payload) => {
            const deltaText = String(payload?.content || '');
            if (!deltaText) return;
            setPlan((prev: any) => ({ ...(prev || {}), plan_content: `${prev?.plan_content || ''}${deltaText}` }));
          },
          onFinal: (payload) => {
            finalPayload = payload;
          },
          onError: (payload) => {
            streamError = String(payload?.error || '学习计划生成失败');
          }
        });

        if (streamError) {
          throw new Error(streamError);
        }

        if (!finalPayload) {
          throw new Error('学习计划生成失败：未收到最终结果');
        }

        setPlan(finalPayload);
        setPlanViewIndex(0);
        if (token) loadPlanHistory(token).catch(console.error);
        if (typeof finalPayload.remaining_generate_count === 'number') {
          setPlanActionMessage(`学习计划已更新。剩余可重生成次数：${finalPayload.remaining_generate_count}`);
        }
      } else {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || '学习计划生成失败');
        }
        setPlan(data);
        setPlanViewIndex(0);
        if (token) loadPlanHistory(token).catch(console.error);
        if (typeof data.remaining_generate_count === 'number') {
          setPlanActionMessage(`学习计划已更新。剩余可重生成次数：${data.remaining_generate_count}`);
        }
      }
    } catch (err) {
      console.error(err);
      setPlanActionError(err instanceof Error ? err.message : '学习计划生成失败');
      throw err;
    } finally {
      setPlanStreamStatus('');
      setLoadingPlan(false);
    }
  };

  const openRegenerateModal = () => {
    setPlanActionError('');
    setPlanActionMessage('');
    setRegenerateContext('');
    setShowRegenerateModal(true);
  };

  const handleFirstGenerateClick = async () => {

    setLoadingPretest(true);
    setPlanActionError('');
    setPlanActionMessage('');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/plans/pretest/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '无法加载测评题');
      }

      setPretestQuestion(data?.question || '');
      setPretestAnswer('');
      setShowPretestModal(true);
    } catch (err) {
      console.error(err);
      setPlanActionError(err instanceof Error ? err.message : '无法加载测评题');
    } finally {
      setLoadingPretest(false);
    }
  };

  const submitPretestAndGenerate = async () => {
    const answer = pretestAnswer.trim();
    if (!answer) {
      setPlanActionError('请先填写测评答案后再生成学习计划。');
      return;
    }

    setSubmittingPretest(true);
    try {
      setShowPretestModal(false);
      await generatePlan(answer);
      setPretestQuestion('');
      setPretestAnswer('');
    } catch (err) {
      setShowPretestModal(true);
      throw err;
    } finally {
      setSubmittingPretest(false);
    }
  };

  const submitRegenerateAndGenerate = async () => {
    const brief = regenerateContext.trim();
    setShowRegenerateModal(false);
    await generatePlan('', brief);
  };

  const submitNote = async () => {
    if (!newNote.trim() && files.length === 0) return;
    setSubmittingNote(true);
    setNoteStreamStatus('正在上传并保存笔记...');
    setPlanActionError('');
    setPlanActionMessage('');
    const token = localStorage.getItem('token');
    try {
      const formData = new FormData();
      formData.append('unitId', id!);
      formData.append('week', unit.week_range);
      formData.append('content', newNote);
      for (const file of files) {
        formData.append('files', file);
      }

      const noteRes = await fetch(`${API_BASE_URL}/api/notes?stream=1`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`
        },
        body: formData,
      });
      const contentType = noteRes.headers.get('content-type') || '';
      let noteData: any = null;

      if (contentType.includes('text/event-stream') && noteRes.body) {
        let streamError = '';
        await consumeEventStream(noteRes, {
          onStage: (payload) => {
            setNoteStreamStatus(String(payload?.message || '正在处理中...'));
          },
          onDelta: (payload) => {
            const deltaText = String(payload?.content || '');
            if (!deltaText) return;
            setPlan((prev: any) => ({ ...(prev || {}), plan_content: `${prev?.plan_content || ''}${deltaText}` }));
          },
          onFinal: (payload) => {
            noteData = payload;
          },
          onError: (payload) => {
            streamError = String(payload?.error || '笔记提交失败');
          }
        });

        if (streamError) {
          throw new Error(streamError);
        }
        if (!noteData) {
          throw new Error('笔记提交失败：未收到最终结果');
        }
      } else {
        noteData = await noteRes.json();
        if (!noteRes.ok) {
          throw new Error(noteData?.error || '笔记提交失败');
        }
      }

      if (noteData?.plan_adjusted) {
        setPlanActionMessage(`已根据笔记更新计划。今日剩余可调整次数：${noteData.remaining_adjust_count ?? '-'} `);
        setPlanActionError('');
      } else if (noteData?.adjust_skipped_reason) {
        setPlanActionError(noteData.adjust_skipped_reason);
      }
      if (noteData?.plan_content) {
        setPlan((prev: any) => ({ ...(prev || {}), plan_content: noteData.plan_content }));
        setPlanViewIndex(0);
      }
      setNewNote('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      // Refresh notes and plan
      fetch(`${API_BASE_URL}/api/notes/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setNotes(data));
      fetch(`${API_BASE_URL}/api/plans/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          setPlan(data);
          setPlanViewIndex(0);
        });
      loadPlanHistory(token).catch(console.error);
    } catch (err) {
      console.error(err);
      setPlanActionError(err instanceof Error ? err.message : '笔记提交失败');
    } finally {
      setNoteStreamStatus('');
      setSubmittingNote(false);
    }
  };

  const gradeUnit = async () => {
    setGrading(true);
    setGradeActionError('');
    setGradeStreamStatus('评分请求已发送，正在准备中...');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/grade/${id}?stream=1`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`
        },
      });

      const contentType = res.headers.get('content-type') || '';
      let gradeData: any = null;

      if (contentType.includes('text/event-stream') && res.body) {
        let streamError = '';
        await consumeEventStream(res, {
          onStage: (payload) => {
            setGradeStreamStatus(String(payload?.message || 'AI 正在评分...'));
          },
          onFinal: (payload) => {
            gradeData = payload;
          },
          onError: (payload) => {
            streamError = String(payload?.error || '评分失败');
          }
        });

        if (streamError) {
          throw new Error(streamError);
        }
        if (!gradeData) {
          throw new Error('评分失败：未收到最终结果');
        }
      } else {
        gradeData = await res.json();
        if (!res.ok) {
          throw new Error(gradeData?.error || '评分失败');
        }
      }

      setGradeResult(gradeData);
      setGradeStreamStatus('评分完成');
      // Refresh notes to show grade
      fetch(`${API_BASE_URL}/api/notes/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setNotes(data));
    } catch (err) {
      console.error(err);
      setGradeActionError(err instanceof Error ? err.message : '评分失败');
    } finally {
      setGradeStreamStatus('');
      setGrading(false);
    }
  };

  if (!unit) return <div className="p-8 text-center text-slate-500">加载中...</div>;

  let resources = [];
  try {
    resources = JSON.parse(unit.resources || '[]');
  } catch (e) {}

  const maxGenerateCount = Number(plan?.max_generate_count ?? 3);
  const generateCount = Number(plan?.generate_count || 0);
  const remainingGenerateCount = plan
    ? Number(plan?.remaining_generate_count ?? Math.max(0, maxGenerateCount - generateCount))
    : maxGenerateCount;

  const maxAdjustCount = Number(plan?.max_adjust_count ?? 3);
  const adjustCount = Number(plan?.adjust_count || 0);
  const remainingAdjustCount = plan
    ? Number(plan?.remaining_adjust_count ?? Math.max(0, maxAdjustCount - adjustCount))
    : maxAdjustCount;

  const contextContent = `
单元名称：${unit.title}
单元描述：${unit.description}
学习目标：${unit.objectives}
相关学习资源：${resources.map((r: any) => r.title).join(', ')}
当前学习计划：${plan?.plan_content || '无'}
最近一次笔记：${notes[0]?.content || '无'}
`;

  const displayedPlanLabel = displayedPlan?.source === 'current' ? '当前计划' : `历史计划#${planViewIndex}`;
  const contextContentWithDisplayedPlan = `${contextContent}\n页面当前展示的计划版本：${displayedPlanLabel}\n页面当前展示的计划内容：${displayedPlanContent || '无'}\n`;
  const quizQuestions = Array.isArray(quizAssignment?.questions) ? quizAssignment.questions : [];
  const quizStatus = String(quizAssignment?.status || 'none');
  const quizDeadlineText = quizAssignment?.expires_at ? new Date(quizAssignment.expires_at).toLocaleString() : '-';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Main Content */}
      <div className="flex-1 max-w-5xl mx-auto p-8 pr-16 lg:pr-[26rem] transition-all duration-300">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center text-slate-500 hover:text-indigo-600 mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> 返回课程列表
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="text-indigo-600 font-medium mb-2">第 {unit.week_range} 周</div>
              <h1 className="text-3xl font-bold text-slate-900">{unit.title}</h1>
            </div>
            <div className="bg-slate-100 p-3 rounded-xl">
              <BookOpen className="w-8 h-8 text-slate-600" />
            </div>
          </div>
          <p className="text-slate-600 text-lg mb-6">{unit.description}</p>
          
          <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100 mb-6">
            <h3 className="text-indigo-900 font-semibold mb-2 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" /> 学习目标
            </h3>
            <p className="text-indigo-800">{unit.objectives}</p>
          </div>

          {resources.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <h3 className="text-slate-900 font-semibold mb-4 flex items-center">
                <LinkIcon className="w-5 h-5 mr-2 text-slate-600" /> 学习资源
              </h3>
              <ul className="space-y-3">
                {resources.map((res: any, idx: number) => (
                  <li key={idx} className="flex flex-col">
                    <div className="flex items-center">
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mr-2"></span>
                      {res.url ? (
                        <a href={res.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium">
                          {res.title}
                        </a>
                      ) : (
                        <span className="text-slate-800 font-medium">{res.title}</span>
                      )}
                    </div>
                    {res.description && (
                      <p className="text-sm text-slate-500 mt-1 ml-3.5">{res.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Study Plan Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center">
              <Clock className="w-6 h-6 mr-2 text-indigo-600" /> AI 学习计划
            </h2>
            <button
              onClick={plan ? openRegenerateModal : handleFirstGenerateClick}
              disabled={loadingPlan || loadingPretest || remainingGenerateCount <= 0}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {loadingPlan || submittingPretest ? '生成中...' : loadingPretest ? '加载测评题...' : plan ? '重新生成学习计划' : '生成学习计划'}
            </button>
          </div>

          <div className="text-sm text-slate-500 mb-4">
            学习计划生成次数：{generateCount}/{maxGenerateCount}（剩余 {remainingGenerateCount} 次）
          </div>
          {loadingPlan && planStreamStatus && <div className="text-sm text-indigo-600 mb-3">{planStreamStatus}</div>}
          {planActionMessage && <div className="text-sm text-emerald-600 mb-3">{planActionMessage}</div>}
          {planActionError && <div className="text-sm text-rose-600 mb-3">{planActionError}</div>}
          
          {plan ? (
            <div>
              <div
                className="max-w-none text-slate-700 leading-7 whitespace-normal break-words
                [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-slate-900 [&_h1]:mt-6 [&_h1]:mb-4
                [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mt-5 [&_h2]:mb-3
                [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-900 [&_h3]:mt-4 [&_h3]:mb-2
                [&_p]:my-3 [&_p]:break-words [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3
                [&_li]:my-1 [&_li]:break-words [&_a]:text-indigo-600 [&_a]:underline [&_a]:break-all [&_strong]:font-semibold [&_strong]:text-slate-900
                [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600 [&_blockquote]:italic [&_blockquote]:my-3
                [&_hr]:my-6 [&_hr]:border-slate-200
                [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.92em]
                [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:my-4
                [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit
                [&_.plan-table-scroll]:max-w-full [&_.plan-table-scroll]:overflow-x-auto [&_.plan-table-scroll]:pb-1 [&_.plan-table-scroll]:my-4
                [&_.plan-table-scroll_table]:table-fixed [&_.plan-table-scroll_table]:w-[clamp(920px,92vw,1400px)] [&_.plan-table-scroll_table]:border-collapse [&_.plan-table-scroll_table]:my-0
                [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:whitespace-nowrap
                [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2 [&_td]:whitespace-normal [&_td]:break-words"
                dangerouslySetInnerHTML={{ __html: renderedPlan as any }}
              />
              <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                <button
                  onClick={() => setPlanViewIndex(prev => Math.max(0, prev - 1))}
                  disabled={planViewIndex <= 0}
                  className="px-2 py-1.5 rounded-lg border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-slate-500">
                  {planVersions.length > 0 ? `${planViewIndex + 1} / ${planVersions.length}` : '0 / 0'}
                </span>
                <button
                  onClick={() => setPlanViewIndex(prev => Math.min(Math.max(planVersions.length - 1, 0), prev + 1))}
                  disabled={planViewIndex >= planVersions.length - 1 || planVersions.length === 0}
                  className="px-2 py-1.5 rounded-lg border bg-white text-slate-600 border-slate-300 hover:bg-slate-50 transition disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-slate-500 ml-1">{displayedPlanLabel}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              暂无学习计划，点击右上角按钮生成。
            </div>
          )}
        </div>

        {/* Quiz Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center">
              <CheckCircle className="w-6 h-6 mr-2 text-indigo-600" /> 单元测试
            </h2>
            <button onClick={loadQuizAssignment} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition">刷新</button>
          </div>

          {quizLoading ? (
            <div className="text-slate-500">测试加载中...</div>
          ) : !quizAssignment ? (
            <div className="text-slate-500">管理员暂未向你发放该单元测试。</div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-slate-600">
                截止时间：{quizDeadlineText}
                <span className="ml-3">
                  状态：
                  {quizStatus === 'submitted' ? '已提交' : quizStatus === 'expired' ? '已过期' : '待作答'}
                </span>
              </div>

              {quizMessage && <div className="text-sm text-emerald-700">{quizMessage}</div>}
              {quizError && <div className="text-sm text-rose-600">{quizError}</div>}

              {quizStatus === 'pending' ? (
                <>
                  <div className="space-y-5">
                    {quizQuestions.map((question: any, index: number) => (
                      <div key={question.id} className="border border-slate-200 rounded-xl p-4">
                        <div className="text-sm text-slate-500 mb-1">第 {index + 1} 题 · {question.difficulty}</div>
                        <div className="text-slate-900 whitespace-pre-wrap mb-3">{question.prompt}</div>
                        <div className="space-y-2">
                          {Object.entries(question.options || {}).map(([key, value]) => (
                            <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="radio"
                                name={`quiz-${question.id}`}
                                value={key}
                                checked={String(quizAnswers[question.id] || '') === key}
                                onChange={(e) => setQuizAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                              />
                              <span>{key}. {String(value)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={submitQuiz}
                    disabled={quizSubmitting || quizQuestions.length === 0}
                    className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    {quizSubmitting ? '提交中...' : '提交测试答案'}
                  </button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-slate-700">
                    成绩：{quizAssignment.score ?? '-'} 分，正确 {quizAssignment.correct_count ?? 0}/{quizAssignment.total_questions ?? quizQuestions.length}
                  </div>
                  <div className="space-y-3">
                    {(Array.isArray(quizAssignment.grading_detail) ? quizAssignment.grading_detail : []).map((item: any, idx: number) => (
                      <div key={`${item.id}-${idx}`} className="border border-slate-200 rounded-lg p-3">
                        <div className="text-sm text-slate-900">第 {idx + 1} 题：{item.prompt}</div>
                        <div className="text-sm text-slate-600 mt-1">你的答案：{item.user_answer || '-'}，正确答案：{item.correct_answer || '-'}</div>
                        <div className={`text-sm mt-1 ${item.is_correct ? 'text-emerald-600' : 'text-rose-600'}`}>{item.is_correct ? '回答正确' : '回答错误'}</div>
                        {item.explanation && <div className="text-sm text-slate-500 mt-1">解析：{item.explanation}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notes Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center mb-6">
            <FileText className="w-6 h-6 mr-2 text-indigo-600" /> 学习笔记
          </h2>
          
          <div className="mb-8">
            <label className="block text-sm font-medium text-slate-700 mb-2">提交新笔记 (提交后AI将动态调整计划)</label>
            <div className="text-sm text-slate-500 mb-2">
              今日计划自动调整次数：{adjustCount}/{maxAdjustCount}（今日剩余 {remainingAdjustCount} 次）
            </div>
            {submittingNote && noteStreamStatus && <div className="text-sm text-indigo-600 mb-2">{noteStreamStatus}</div>}
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="w-full h-32 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition resize-none mb-3"
              placeholder="在这里记录你的学习心得、遇到的问题..."
            />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  type="file"
                  id="note-file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.ipynb"
                  multiple
                  ref={fileInputRef}
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
                <label
                  htmlFor="note-file"
                  className="cursor-pointer flex items-center text-sm text-slate-600 hover:text-indigo-600 transition"
                >
                  <Paperclip className="w-4 h-4 mr-1" />
                  {files.length > 0 ? `已选择 ${files.length} 份附件` : '添加附件 (可多选：PDF, 图片等)'}
                </label>
                {files.length > 0 && (
                  <button
                    onClick={() => {
                      setFiles([]);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="ml-2 text-red-500 hover:text-red-700 text-sm"
                  >
                    清空
                  </button>
                )}
              </div>

              {files.length > 0 && (
                <div className="text-xs text-slate-500 mr-3 max-w-[28rem] truncate">
                  {files.map((item) => item.name).join('，')}
                </div>
              )}
              
              <button
                onClick={submitNote}
                disabled={(!newNote.trim() && files.length === 0) || submittingNote}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center"
              >
                <Send className="w-4 h-4 mr-2" /> {submittingNote ? '提交中...' : '提交笔记'}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-900 border-b pb-2">历史笔记</h3>
            {notes.length === 0 ? (
              <p className="text-slate-500 text-center py-4">暂无笔记记录。</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                  <div className="text-sm text-slate-500 mb-3 flex items-center">
                    <Clock className="w-4 h-4 mr-1" /> {new Date(note.created_at).toLocaleString()}
                  </div>
                  <p className="text-slate-800 whitespace-pre-wrap mb-4">{note.content}</p>

                  {((Array.isArray(note.file_urls) && note.file_urls.length > 0)
                    ? note.file_urls
                    : (note.file_url ? [note.file_url] : [])).length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs text-slate-500 mb-2">附件：</div>
                      <div className="flex flex-wrap gap-2">
                        {((Array.isArray(note.file_urls) && note.file_urls.length > 0)
                          ? note.file_urls
                          : (note.file_url ? [note.file_url] : [])).map((attachmentUrl: string, index: number) => (
                          <a
                            key={`${note.id}-att-${index}`}
                            href={attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg transition"
                          >
                            <Paperclip className="w-4 h-4 mr-1.5" />
                            查看附件 {index + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {note.grade && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <div className="flex items-center mb-2">
                        <span className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded">评分: {note.grade}</span>
                      </div>
                      <div className="text-sm text-slate-600 mb-2"><strong>AI反馈:</strong></div>
                      <div
                        className="text-sm text-slate-700 leading-7
                        [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
                        [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2
                        [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
                        [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
                        [&_li]:my-1 [&_a]:text-indigo-600 [&_a]:underline
                        [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.92em]
                        [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:rounded-xl [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-3
                        [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit"
                        dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(note.feedback || '') as any }}
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Grading Section */}
        {notes.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">单元结课评分</h3>
                <p className="text-slate-500 text-sm">根据最后一次提交的笔记和学习计划进行AI评分。</p>
              </div>
              <button
                onClick={gradeUnit}
                disabled={grading}
                className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {grading ? '评分中...' : '进行AI评分'}
              </button>
            </div>
            {gradeActionError && <div className="mt-3 text-sm text-rose-600">{gradeActionError}</div>}
            {grading && gradeStreamStatus && <div className="mt-3 text-sm text-slate-600">{gradeStreamStatus}</div>}
          </div>
        )}
      </div>

      {/* AI Sidebar */}
      <SidebarAI
        context={contextContentWithDisplayedPlan}
        unitId={id}
        displayedPlan={displayedPlanContent}
        displayedPlanMeta={displayedPlanLabel}
      />

      {showPretestModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200 p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-3">首次学习计划生成前测评</h3>
            <div
              className="prose prose-slate max-w-none text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 max-h-72 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: renderedPretestQuestion as any }}
            />

            <label className="block text-sm font-medium text-slate-700 mb-2">请输入你的答案（用于评估基础水平）</label>
            <textarea
              value={pretestAnswer}
              onChange={(e) => setPretestAnswer(e.target.value)}
              className="w-full h-36 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition resize-none"
              placeholder="请按题目要求作答，AI将根据你的基础水平制定计划。"
            />

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  if (submittingPretest || loadingPlan) return;
                  setShowPretestModal(false);
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                disabled={submittingPretest || loadingPlan}
              >
                取消
              </button>
              <button
                onClick={submitPretestAndGenerate}
                disabled={submittingPretest || loadingPlan || !pretestAnswer.trim()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {submittingPretest || loadingPlan ? '提交并生成中...' : '提交答案并生成计划'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRegenerateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-2">重新生成学习计划</h3>
            <p className="text-sm text-slate-600 mb-4">可选：简短说明你当前的学习情况（如时间安排、难点、目标），AI 会据此调整计划。</p>

            <label className="block text-sm font-medium text-slate-700 mb-2">你的情况说明（可留空）</label>
            <textarea
              value={regenerateContext}
              onChange={(e) => setRegenerateContext(e.target.value)}
              className="w-full h-32 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition resize-none"
              placeholder="例如：这周只有周末能学习；卷积部分还不理解；希望多一些练习题。"
            />

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  if (loadingPlan) return;
                  setShowRegenerateModal(false);
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                disabled={loadingPlan}
              >
                取消
              </button>
              <button
                onClick={submitRegenerateAndGenerate}
                disabled={loadingPlan}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {loadingPlan ? '生成中...' : '确认并生成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
