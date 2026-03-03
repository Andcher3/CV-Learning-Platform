import { Config } from "@netlify/functions";
import db from './db';
import bcrypt from 'bcryptjs';
import { authenticate, getAiClient } from './utils';
import { buildRandomQuizForUnit } from './quiz-utils';

export default async (req: Request) => {
  const url = new URL(req.url);
  let user;
  try {
    user = authenticate(req);
    if (user.role !== 'admin') throw new Error('Forbidden');
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: err.message === 'Forbidden' ? 403 : 401 });
  }

  // Users API
  if (url.pathname === '/api/admin/users/batch' && req.method === 'POST') {
    const { text } = await req.json();
    const rawText = String(text || '');
    if (!rawText.trim()) {
      return new Response(JSON.stringify({ error: '请输入批量账号文本' }), { status: 400 });
    }

    const lines = rawText.split(/\r?\n/);
    const checkUserStmt = db.prepare('SELECT id FROM users WHERE username = ?');
    const insertStmt = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');

    const results: any[] = [];
    let parsed = 0;
    let created = 0;
    let skipped = 0;

    const createMany = db.transaction(() => {
      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();
        if (!line) continue;

        parsed += 1;
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length < 2) {
          skipped += 1;
          results.push({ line: i + 1, status: 'skipped', reason: '格式错误，应为“学号 姓名”' });
          continue;
        }

        const studentId = String(parts[0] || '').trim();
        const rawName = parts.slice(1).join(' ').trim();
        const username = rawName.replace(/\*/g, '').trim();

        if (!studentId || !username) {
          skipped += 1;
          results.push({ line: i + 1, status: 'skipped', reason: '学号或姓名为空' });
          continue;
        }

        if (checkUserStmt.get(username)) {
          skipped += 1;
          results.push({ line: i + 1, studentId, username, status: 'skipped', reason: '用户名已存在' });
          continue;
        }

        const hash = bcrypt.hashSync(studentId, 10);
        const insertResult = insertStmt.run(username, hash, 'student');
        created += 1;
        results.push({ line: i + 1, id: insertResult.lastInsertRowid, studentId, username, status: 'created' });
      }
    });

    try {
      createMany();
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err?.message || '批量创建失败' }), { status: 500 });
    }

    return new Response(JSON.stringify({
      total_lines: lines.length,
      parsed,
      created,
      skipped,
      results
    }));
  }

  if (url.pathname === '/api/admin/users') {
    if (req.method === 'GET') {
      const users = db.prepare('SELECT id, username, role FROM users').all();
      return new Response(JSON.stringify(users));
    }
    if (req.method === 'POST') {
      const { username, password, role } = await req.json();
      try {
        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, role || 'student');
        return new Response(JSON.stringify({ id: result.lastInsertRowid, username, role: role || 'student' }));
      } catch (err) {
        return new Response(JSON.stringify({ error: 'User already exists' }), { status: 400 });
      }
    }
  }

  const userMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch) {
    const id = userMatch[1];
    if (req.method === 'PUT') {
      const { username, password, role } = await req.json();
      try {
        if (password) {
          const hash = bcrypt.hashSync(password, 10);
          db.prepare('UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?').run(username, hash, role, id);
        } else {
          db.prepare('UPDATE users SET username = ?, role = ? WHERE id = ?').run(username, role, id);
        }
        return new Response(JSON.stringify({ success: true }));
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Update failed' }), { status: 400 });
      }
    }
    if (req.method === 'DELETE') {
      const targetId = Number(id);
      if (!Number.isFinite(targetId) || targetId <= 0) {
        return new Response(JSON.stringify({ error: '无效的用户ID' }), { status: 400 });
      }

      const targetUser = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(targetId) as any;
      if (!targetUser) {
        return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404 });
      }
      if (targetUser.username === 'admin' || targetUser.role === 'admin') {
        return new Response(JSON.stringify({ error: '不能删除管理员账号' }), { status: 400 });
      }

      try {
        const removeUser = db.transaction((studentId: number) => {
          db.prepare('DELETE FROM progress_checks WHERE student_id = ?').run(studentId);
          db.prepare('DELETE FROM feedbacks WHERE student_id = ?').run(studentId);
          db.prepare('DELETE FROM notes WHERE student_id = ?').run(studentId);
          db.prepare('DELETE FROM study_plans WHERE student_id = ?').run(studentId);
          db.prepare('DELETE FROM quiz_assignments WHERE student_id = ?').run(studentId);
          return db.prepare('DELETE FROM users WHERE id = ?').run(studentId);
        });
        const result = removeUser(targetId);
        if (!result?.changes) {
          return new Response(JSON.stringify({ error: '删除失败，未影响任何记录' }), { status: 500 });
        }
        return new Response(JSON.stringify({ success: true, deleted_user_id: targetId }));
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err?.message || '删除失败' }), { status: 500 });
      }
    }
  }

  // Settings API
  if (url.pathname === '/api/admin/settings') {
    if (req.method === 'GET') {
      const settings = db.prepare('SELECT * FROM settings').all();
      return new Response(JSON.stringify(settings));
    }
    if (req.method === 'POST') {
      const { settings } = await req.json();
      const updateStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      const settingsList = Array.isArray(settings) ? settings : [];
      const aiSettingKeys = new Set(['ai_api_key', 'ai_base_url', 'ai_model']);
      const hasCustomAiValue = settingsList.some((item: any) => {
        if (!item || !aiSettingKeys.has(item.key)) return false;
        return String(item.value ?? '').trim().length > 0;
      });

      const updateMany = db.transaction((list: any[]) => {
        for (const s of list) {
          if (!s || typeof s.key !== 'string') continue;
          updateStmt.run(s.key, String(s.value ?? ''));
        }
        updateStmt.run('ai_config_mode', hasCustomAiValue ? 'custom' : 'default');
      });
      updateMany(settingsList);
      return new Response(JSON.stringify({ success: true, ai_config_mode: hasCustomAiValue ? 'custom' : 'default' }));
    }
  }

  if (url.pathname === '/api/admin/ai/test' && req.method === 'POST') {
    try {
      const { message = '这是一次AI可用性测试，请简短回应。' } = await req.json();
      const { client, model } = getAiClient();
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: message }],
      });
      const reply = response.choices?.[0]?.message?.content?.trim() || '';
      return new Response(JSON.stringify({ ok: true, reply }));
    } catch (err: any) {
      return new Response(JSON.stringify({ ok: false, error: err.message || 'AI test failed' }), { status: 500 });
    }
  }

  // Records API
  if (url.pathname === '/api/admin/notes' && req.method === 'GET') {
    const notes = db.prepare(`
      SELECT n.*, u.username AS student_username, un.title AS unit_title
      FROM notes n
      JOIN users u ON n.student_id = u.id
      JOIN units un ON n.unit_id = un.id
      ORDER BY n.created_at DESC
    `).all();
    return new Response(JSON.stringify(notes));
  }

  if (url.pathname === '/api/admin/plans' && req.method === 'GET') {
    const plans = db.prepare(`
      SELECT p.*, u.username AS student_username, un.title AS unit_title
      FROM study_plans p
      JOIN users u ON p.student_id = u.id
      JOIN units un ON p.unit_id = un.id
      ORDER BY p.updated_at DESC
    `).all();
    return new Response(JSON.stringify(plans));
  }

  if (url.pathname === '/api/admin/feedbacks' && req.method === 'GET') {
    const feedbacks = db.prepare(`
      SELECT f.*, u.username AS student_username
      FROM feedbacks f
      JOIN users u ON f.student_id = u.id
      ORDER BY f.created_at DESC
    `).all();
    return new Response(JSON.stringify(feedbacks));
  }

  if (url.pathname === '/api/admin/quizzes' && req.method === 'GET') {
    const rows = db.prepare(`
      SELECT q.*, u.username AS student_username, un.title AS unit_title, a.username AS assigned_by_username
      FROM quiz_assignments q
      JOIN users u ON q.student_id = u.id
      JOIN units un ON q.unit_id = un.id
      LEFT JOIN users a ON q.assigned_by = a.id
      ORDER BY q.created_at DESC, q.id DESC
    `).all() as any[];

    const now = Date.now();
    const data = rows.map((row) => {
      const submitted = !!row.submitted_at;
      const expired = !submitted && row.expires_at ? new Date(row.expires_at).getTime() < now : false;
      const status = submitted ? 'submitted' : expired ? 'expired' : 'pending';
      return {
        ...row,
        status,
      };
    });

    return new Response(JSON.stringify(data));
  }

  if (url.pathname === '/api/admin/quizzes/assign' && req.method === 'POST') {
    try {
      const body = await req.json();
      const unitId = Number(body?.unitId);
      const targetType = String(body?.targetType || 'all');
      const studentId = Number(body?.studentId);

      if (!Number.isFinite(unitId) || unitId <= 0) {
        return new Response(JSON.stringify({ error: '无效的单元ID' }), { status: 400 });
      }

      const unit = db.prepare('SELECT id, title FROM units WHERE id = ?').get(unitId) as any;
      if (!unit) {
        return new Response(JSON.stringify({ error: '单元不存在' }), { status: 404 });
      }

      let students: any[] = [];
      if (targetType === 'single') {
        if (!Number.isFinite(studentId) || studentId <= 0) {
          return new Response(JSON.stringify({ error: '无效的学生ID' }), { status: 400 });
        }
        const target = db.prepare('SELECT id, username FROM users WHERE id = ? AND role = ?').get(studentId, 'student') as any;
        if (!target) {
          return new Response(JSON.stringify({ error: '目标学生不存在' }), { status: 404 });
        }
        students = [target];
      } else {
        students = db.prepare('SELECT id, username FROM users WHERE role = ? ORDER BY id ASC').all('student') as any[];
      }

      if (!students.length) {
        return new Response(JSON.stringify({ error: '没有可发送的学生账号' }), { status: 400 });
      }

      const { questions, quizDir, totalQuestions } = buildRandomQuizForUnit(unitId);
      const sanitizedQuestions = questions.map((question) => ({
        id: question.id,
        difficulty: question.difficulty,
        sourceNumber: question.sourceNumber,
        prompt: question.prompt,
        options: question.options,
      }));
      const answerKey = questions.map((question) => ({
        id: question.id,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
      }));

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const createdRows: any[] = [];
      const insert = db.prepare(`
        INSERT INTO quiz_assignments (unit_id, student_id, assigned_by, quiz_payload, answer_key, total_questions, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const assignTx = db.transaction((targets: any[]) => {
        for (const student of targets) {
          const result = insert.run(
            unitId,
            student.id,
            user.id,
            JSON.stringify(sanitizedQuestions),
            JSON.stringify(answerKey),
            totalQuestions,
            expiresAt
          );
          createdRows.push({
            assignment_id: result.lastInsertRowid,
            student_id: student.id,
            student_username: student.username,
            expires_at: expiresAt,
          });
        }
      });

      assignTx(students);

      return new Response(JSON.stringify({
        success: true,
        unit_id: unitId,
        unit_title: unit.title,
        target_type: targetType,
        quiz_dir: quizDir,
        total_questions: totalQuestions,
        assigned_count: createdRows.length,
        assignments: createdRows,
      }));
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err?.message || '发送测试题失败' }), { status: 500 });
    }
  }

  return new Response('Not found', { status: 404 });
};

export const config: Config = {
  path: "/api/admin/*"
};
