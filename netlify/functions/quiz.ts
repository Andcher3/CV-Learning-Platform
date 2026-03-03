import { Config } from '@netlify/functions';
import db from './db';
import { authenticate } from './utils';

const parseJson = <T = any>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    return fallback;
  }
};

const getQuizStatus = (assignment: any) => {
  if (!assignment) return 'none';
  if (assignment.submitted_at) return 'submitted';
  const expired = assignment.expires_at ? new Date(assignment.expires_at).getTime() < Date.now() : false;
  return expired ? 'expired' : 'pending';
};

export default async (req: Request) => {
  const url = new URL(req.url);
  let user: any;
  try {
    user = authenticate(req);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 401 });
  }

  if (req.method === 'GET') {
    const match = url.pathname.match(/^\/api\/quiz\/unit\/(\d+)$/);
    if (match) {
      const unitId = Number(match[1]);
      if (!Number.isFinite(unitId) || unitId <= 0) {
        return new Response(JSON.stringify({ error: '无效的单元ID' }), { status: 400 });
      }

      const assignment = db.prepare(`
        SELECT q.*, un.title AS unit_title
        FROM quiz_assignments q
        JOIN units un ON q.unit_id = un.id
        WHERE q.student_id = ? AND q.unit_id = ?
        ORDER BY q.created_at DESC, q.id DESC
        LIMIT 1
      `).get(user.id, unitId) as any;

      if (!assignment) {
        return new Response(JSON.stringify(null));
      }

      const quizPayload = parseJson<any[]>(assignment.quiz_payload, []);
      const studentAnswers = parseJson<Record<string, string>>(assignment.student_answers, {});
      const gradingDetail = parseJson<any[]>(assignment.grading_detail, []);
      const status = getQuizStatus(assignment);

      return new Response(JSON.stringify({
        id: assignment.id,
        unit_id: assignment.unit_id,
        unit_title: assignment.unit_title,
        created_at: assignment.created_at,
        expires_at: assignment.expires_at,
        submitted_at: assignment.submitted_at,
        total_questions: Number(assignment.total_questions || 0),
        correct_count: assignment.correct_count,
        score: assignment.score,
        status,
        questions: quizPayload,
        student_answers: studentAnswers,
        grading_detail: gradingDetail,
      }));
    }
  }

  if (req.method === 'POST') {
    const submitMatch = url.pathname.match(/^\/api\/quiz\/(\d+)\/submit$/);
    if (submitMatch) {
      const assignmentId = Number(submitMatch[1]);
      if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
        return new Response(JSON.stringify({ error: '无效的测试ID' }), { status: 400 });
      }

      const assignment = db.prepare('SELECT * FROM quiz_assignments WHERE id = ? AND student_id = ?').get(assignmentId, user.id) as any;
      if (!assignment) {
        return new Response(JSON.stringify({ error: '测试不存在' }), { status: 404 });
      }
      if (assignment.submitted_at) {
        return new Response(JSON.stringify({ error: '该测试已提交，不能重复提交' }), { status: 400 });
      }

      const now = Date.now();
      const expired = assignment.expires_at ? new Date(assignment.expires_at).getTime() < now : false;
      if (expired) {
        return new Response(JSON.stringify({ error: '测试已超过24小时作答时限' }), { status: 400 });
      }

      const body = await req.json();
      const submittedAnswers = body?.answers && typeof body.answers === 'object' ? body.answers : {};

      const questions = parseJson<any[]>(assignment.quiz_payload, []);
      const answerKeyRows = parseJson<any[]>(assignment.answer_key, []);
      const answerKey = new Map<string, { correctAnswer: string; explanation: string }>();
      for (const row of answerKeyRows) {
        const id = String(row?.id || '').trim();
        if (!id) continue;
        answerKey.set(id, {
          correctAnswer: String(row?.correctAnswer || '').toUpperCase(),
          explanation: String(row?.explanation || ''),
        });
      }

      const missing: string[] = [];
      for (const question of questions) {
        const qid = String(question?.id || '').trim();
        if (!qid) continue;
        const value = String(submittedAnswers[qid] || '').trim().toUpperCase();
        if (!value) missing.push(qid);
      }
      if (missing.length > 0) {
        return new Response(JSON.stringify({ error: `存在未作答题目，共 ${missing.length} 题` }), { status: 400 });
      }

      let correctCount = 0;
      const gradingDetail = questions.map((question) => {
        const id = String(question?.id || '');
        const userAnswer = String(submittedAnswers[id] || '').trim().toUpperCase();
        const answer = answerKey.get(id);
        const correctAnswer = String(answer?.correctAnswer || '').toUpperCase();
        const isCorrect = !!correctAnswer && userAnswer === correctAnswer;
        if (isCorrect) correctCount += 1;

        return {
          id,
          difficulty: question?.difficulty,
          sourceNumber: question?.sourceNumber,
          prompt: question?.prompt,
          user_answer: userAnswer,
          correct_answer: correctAnswer,
          is_correct: isCorrect,
          explanation: answer?.explanation || '',
        };
      });

      const totalQuestions = Number(assignment.total_questions || questions.length || 0);
      const safeTotal = totalQuestions > 0 ? totalQuestions : gradingDetail.length;
      const score = safeTotal > 0 ? Math.round((correctCount / safeTotal) * 100) : 0;

      db.prepare(`
        UPDATE quiz_assignments
        SET student_answers = ?, grading_detail = ?, correct_count = ?, score = ?, submitted_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        JSON.stringify(submittedAnswers),
        JSON.stringify(gradingDetail),
        correctCount,
        score,
        assignmentId
      );

      return new Response(JSON.stringify({
        success: true,
        assignment_id: assignmentId,
        total_questions: safeTotal,
        correct_count: correctCount,
        score,
        grading_detail: gradingDetail,
        submitted_at: new Date().toISOString(),
      }));
    }
  }

  return new Response('Not found', { status: 404 });
};

export const config: Config = {
  path: '/api/quiz/*'
};
