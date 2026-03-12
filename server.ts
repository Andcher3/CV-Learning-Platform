import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import db from './server/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { prompts } from './server/prompts';
import { buildRandomQuizForUnit } from './server/quiz-utils';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const REFRESH_JWT_SECRET = process.env.REFRESH_JWT_SECRET || `${JWT_SECRET}_refresh`;
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '6h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
const DATA_DIR = process.env.DATA_DIR || '/data';
const PLAN_DIR = path.join(DATA_DIR, 'plan');
const NOTES_DIR = path.join(DATA_DIR, 'notes');
const MAX_PLAN_GENERATIONS = Math.max(0, Number(process.env.MAX_PLAN_GENERATIONS || 3));
const MAX_PLAN_ADJUSTMENTS = Math.max(0, Number(process.env.MAX_PLAN_ADJUSTMENTS || 3));
const COURSE_START_UTC8_MS = Date.UTC(2026, 2, 1, 16, 0, 0);
const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const NOTE_ALLOWED_EXTENSIONS = new Set([
  '.md', '.txt', '.pdf', '.ipynb', '.py', '.js', '.ts', '.tsx', '.json', '.yaml', '.yml', '.csv', '.html', '.css', '.java', '.cpp', '.c', '.go', '.sh',
  '.doc', '.docx', '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.m4a'
]);
const toUtc8IsoString = (date: Date) => {
  const utc8Ms = date.getTime() + 8 * 60 * 60 * 1000;
  return new Date(utc8Ms).toISOString().replace('Z', '+08:00');
};
const getTodayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};


const getCourseWeekdayLabel = (date: Date) => {
  // COURSE_START_UTC8_MS already stores the UTC timestamp of 2026-03-02 00:00 (UTC+8).
  // Compare directly with epoch ms to avoid applying UTC+8 offset twice.
  const diffDays = Math.floor((date.getTime() - COURSE_START_UTC8_MS) / (24 * 60 * 60 * 1000));
  const safeDiffDays = Math.max(0, diffDays);
  const week = Math.floor(safeDiffDays / 7) + 1;
  const weekday = WEEKDAY_NAMES[safeDiffDays % 7];
  return `第${week}周${weekday}`;
};

const getCourseElapsedDays = (date: Date) => {
  const diffDays = Math.floor((date.getTime() - COURSE_START_UTC8_MS) / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays);
};

const getPretestFilePath = (unitId: number) => {
  const folder = path.join(DATA_DIR, `admin/plan_test`);
  const filename = `unit${unitId}.md`;
  return path.join(folder, filename);
};

const resolvePretestFilePath = (unitId: number) => {
  const primary = getPretestFilePath(unitId);
  if (fs.existsSync(primary)) return primary;

  const localDataRoot = path.join(process.cwd(), 'data');
  const fallback = path.join(localDataRoot, `admin/plan_test`, `unit${unitId}.md`);
  if (fs.existsSync(fallback)) return fallback;

  return primary;
};

// Ensure uploads directory exists
const uploadsDir = process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
if (!fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });
const notesUpload = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 20 }
]);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  const buildAuthPayload = (user: any) => {
    const safeUser = { id: user.id, username: user.username, role: user.role };
    const token = jwt.sign(safeUser, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN as any });
    const refreshToken = jwt.sign({ ...safeUser, type: 'refresh' }, REFRESH_JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN as any });
    return { token, refreshToken, user: safeUser };
  };

  app.use(cors()); // <--- 新增这一行

  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));
  app.use('/notes', express.static(NOTES_DIR));

  if (!fs.existsSync(PLAN_DIR)) {
    fs.mkdirSync(PLAN_DIR, { recursive: true });
  }

  // AI Setup
  const getAiClient = () => {
    const settings = db.prepare('SELECT * FROM settings').all() as any[];
    const config: Record<string, string> = {};
    settings.forEach(s => config[s.key] = typeof s.value === 'string' ? s.value.trim() : s.value);

    const defaultApiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || 'sk-mnVcHeOzlSwmJ2zO4n8hFdR1E9jyOUjZMmy5HrzByC8uaKRb';
    const defaultBaseURL = process.env.AI_BASE_URL || 'https://api.moonshot.cn/v1';
    const defaultModel = process.env.AI_MODEL || 'kimi-k2.5';
    const configMode = String(config.ai_config_mode || '').trim().toLowerCase();
    const useCustomConfig = configMode === 'custom';

    const apiKey = useCustomConfig ? (config.ai_api_key || defaultApiKey) : defaultApiKey;
    if (!apiKey) {
      throw new Error('API Key is missing. Please configure it in Admin Settings or environment variables.');
    }

    const baseURL = useCustomConfig ? (config.ai_base_url || defaultBaseURL) : defaultBaseURL;
    const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 60000);
    const client = new OpenAI({ apiKey, baseURL, timeout: timeoutMs, maxRetries: 2 });
    const model = useCustomConfig ? (config.ai_model || defaultModel) : defaultModel;

    return { client, model };
  };

  // Disabled plan file persistence per user request (was saving markdown to /data/plan)
  const savePlanFile = (studentId: number, unitId: number, content: string) => {
    if (!content?.trim()) return null;
    if (!fs.existsSync(PLAN_DIR)) {
      fs.mkdirSync(PLAN_DIR, { recursive: true });
    }

    const prefix = `plan-s${studentId}-u${unitId}-p`;
    const files = fs.readdirSync(PLAN_DIR);
    let maxVersion = 0;
    for (const file of files) {
      if (!file.startsWith(prefix) || !file.endsWith('.md')) continue;
      const matched = file.match(/-p(\d+)\.md$/);
      const version = matched ? Number(matched[1]) : 0;
      if (version > maxVersion) maxVersion = version;
    }

    const nextVersion = maxVersion + 1;
    const filename = `${prefix}${nextVersion}.md`;
    const absolutePath = path.join(PLAN_DIR, filename);
    fs.writeFileSync(absolutePath, content, 'utf-8');

    return {
      filename,
      filepath: absolutePath,
      version: nextVersion
    };
  };

  const savePlanHistorySnapshot = (studentId: number, unitId: number, planContent: string, source: string) => {
    const content = String(planContent || '').trim();
    if (!content) return;
    db.prepare('INSERT INTO study_plan_history (student_id, unit_id, plan_content, source) VALUES (?, ?, ?, ?)')
      .run(studentId, unitId, content, source || 'unknown');
  };

  const tryExtractPdfLocally = async (resolvedPath: string) => {
    try {
      const pdfParseModule: any = await import('pdf-parse');
      const pdfParse = pdfParseModule?.default || pdfParseModule;
      const buffer = fs.readFileSync(resolvedPath);
      const parsed = await pdfParse(buffer);
      return String(parsed?.text || '');
    } catch (err) {
      return '';
    }
  };

  const extractBinaryFileText = async (client: any, resolvedPath: string) => {
    try {
      const uploaded: any = await client.files.create({
        file: fs.createReadStream(resolvedPath),
        purpose: 'file-extract'
      });
      const contentResp: any = await client.files.content(uploaded.id);
      if (typeof contentResp?.text === 'function') {
        const text = await contentResp.text();
        return String(text || '');
      }
      if (typeof contentResp?.text === 'string') {
        return String(contentResp.text || '');
      }
      if (typeof contentResp === 'string') {
        return String(contentResp || '');
      }
      return '';
    } catch (err) {
      if (path.extname(resolvedPath).toLowerCase() === '.pdf') {
        return await tryExtractPdfLocally(resolvedPath);
      }
      return '';
    }
  };

  const resolveFilePathFromToken = (filePath: string) => {
    if (filePath.startsWith('/notes/')) return path.join(NOTES_DIR, path.basename(filePath));
    if (filePath.startsWith('/uploads/')) return path.join(uploadsDir, path.basename(filePath));
    return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(path.resolve(DATA_DIR), filePath);
  };

  const parseNoteFileUrls = (note: any): string[] => {
    const urlsFromJson = (() => {
      try {
        const parsed = JSON.parse(String(note?.file_urls || '[]'));
        return Array.isArray(parsed) ? parsed.map((item: any) => String(item || '').trim()).filter(Boolean) : [];
      } catch (err) {
        return [];
      }
    })();
    if (urlsFromJson.length > 0) return urlsFromJson;
    const single = String(note?.file_url || '').trim();
    return single ? [single] : [];
  };

  const withNoteFileUrls = (note: any) => {
    if (!note || typeof note !== 'object') return note;
    return { ...note, file_urls: parseNoteFileUrls(note) };
  };

  const resolveAttachmentPathsFromUrls = (fileUrls: string[]) => {
    return fileUrls
      .map((url) => {
        const normalized = String(url || '').trim();
        if (!normalized) return null;
        if (normalized.startsWith('/notes/')) return path.join(NOTES_DIR, path.basename(normalized));
        if (normalized.startsWith('/uploads/')) return path.join(uploadsDir, path.basename(normalized));
        return null;
      })
      .filter(Boolean) as string[];
  };

  const extractIpynbText = (resolvedPath: string) => {
    try {
      const raw = fs.readFileSync(resolvedPath, 'utf-8');
      const data = JSON.parse(raw);
      const cells = Array.isArray(data?.cells) ? data.cells : [];
      const lines: string[] = [];
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i] || {};
        const cellType = String(cell?.cell_type || '');
        const sourceArr = Array.isArray(cell?.source)
          ? cell.source.map((item: any) => String(item))
          : [String(cell?.source || '')];
        const sourceText = sourceArr.join('').trim();
        if (!sourceText) continue;
        if (cellType === 'markdown') {
          lines.push(`[Notebook Markdown Cell ${i + 1}]`);
          lines.push(sourceText);
        } else if (cellType === 'code') {
          lines.push(`[Notebook Code Cell ${i + 1}]`);
          lines.push(sourceText);
        } else {
          lines.push(`[Notebook Cell ${i + 1}]`);
          lines.push(sourceText);
        }
      }
      return lines.join('\n');
    } catch (err) {
      return '';
    }
  };

  const buildPromptWithFiles = async (basePrompt: string, client?: any) => {
    const files = Array.from(basePrompt.matchAll(/FILES:\s*([^\n]+)/ig))
      .flatMap(match => match[1].split(',').map(f => f.trim()))
      .filter(Boolean);
    const uniqueFiles = Array.from(new Set(files));

    const fileBlocks: string[] = [];
    const usedFiles: string[] = [];
    const dataRoot = path.resolve(DATA_DIR);
    const uploadsRoot = path.resolve(uploadsDir);
    const notesRoot = path.resolve(NOTES_DIR);
    const allowedTextExt = new Set(['.md', '.txt', '.json', '.csv', '.yaml', '.yml', '.ipynb']);

    for (const filePath of uniqueFiles) {
      const resolved = resolveFilePathFromToken(filePath);
      const isAllowedPath = resolved.startsWith(dataRoot) || resolved.startsWith(uploadsRoot) || resolved.startsWith(notesRoot);
      if (!isAllowedPath) continue;
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;

      const ext = path.extname(resolved).toLowerCase();
      const stat = fs.statSync(resolved);

      if (ext === '.ipynb') {
        const notebookText = extractIpynbText(resolved);
        if (notebookText) {
          fileBlocks.push(`[文件: ${resolved}][Jupyter Notebook 提取]\n${notebookText}`);
          usedFiles.push(resolved);
          continue;
        }
      }

      if (allowedTextExt.has(ext)) {
        const content = fs.readFileSync(resolved, 'utf-8');
        fileBlocks.push(`[文件: ${resolved}]\n${content}`);
        usedFiles.push(resolved);
        continue;
      }

      if (ext === '.pdf') {
        const fallbackPdfText = await tryExtractPdfLocally(resolved);
        if (fallbackPdfText) {
          fileBlocks.push(`[文件: ${resolved}][本地PDF提取]\n${fallbackPdfText}`);
          usedFiles.push(resolved);
          continue;
        }
      }

      if (client) {
        const extractedText = await extractBinaryFileText(client, resolved);
        if (extractedText) {
          fileBlocks.push(`[文件: ${resolved}][提取文本]\n${extractedText}`);
          usedFiles.push(resolved);
          continue;
        }
      }

      if (path.extname(resolved).toLowerCase() === '.pdf') {
        const fallbackPdfText = await tryExtractPdfLocally(resolved);
        if (fallbackPdfText) {
          fileBlocks.push(`[文件: ${resolved}][本地PDF提取]\n${fallbackPdfText}`);
          usedFiles.push(resolved);
        } else {
          fileBlocks.push(`[文件: ${resolved}] (尝试提取失败，可能是格式不支持或OCR失败)`);
        }
      } else {
        fileBlocks.push(`[文件: ${resolved}] (跳过附件，原因: 非文本且超过限制或未提供AI文件提取能力)`);
      }
    }

    const appended = fileBlocks.length > 0 ? `\n\n[附加文件内容]\n${fileBlocks.join('\n\n')}` : '';
    const prompt = `${basePrompt}${appended}`;
    return { prompt, files: usedFiles };
  };

  const parseGradeResult = (raw: string) => {
    if (!raw) return null;
    const trimmed = raw.trim();
    const withoutFence = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const candidates = [withoutFence];
    const objectMatch = withoutFence.match(/\{[\s\S]*\}/);
    if (objectMatch) candidates.push(objectMatch[0]);

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') return parsed as any;
      } catch (err) {}
    }
    return null;
  };

  const parseAiJsonObject = (raw: string) => {
    if (!raw) return null;
    const trimmed = raw.trim();
    const withoutFence = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const candidates = [withoutFence];
    const objectMatch = withoutFence.match(/\{[\s\S]*\}/);
    if (objectMatch) candidates.push(objectMatch[0]);

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') return parsed as any;
      } catch (err) {}
    }
    return null;
  };

  const normalizeProgressStatus = (value: string) => {
    const raw = String(value || '').trim();
    if (raw === 'seriously_behind' || raw === 'slightly_behind' || raw === 'on_track') return raw;
    if (raw.includes('serious') || raw.includes('严重')) return 'seriously_behind';
    if (raw.includes('slight') || raw.includes('轻')) return 'slightly_behind';
    return 'on_track';
  };

  const evaluateStudentProgress = async (studentId: number, triggerSource: string = 'daily-auto') => {
    const now = new Date();
    const dayKey = getTodayKey();
    const courseWeekday = getCourseWeekdayLabel(now);

    const latestPlan = db.prepare(`
      SELECT p.*, u.title AS unit_title
      FROM study_plans p
      LEFT JOIN units u ON u.id = p.unit_id
      WHERE p.student_id = ?
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.id DESC
      LIMIT 1
    `).get(studentId) as any;

    const latestNote = db.prepare(`
      SELECT n.*, u.title AS unit_title
      FROM notes n
      LEFT JOIN units u ON u.id = n.unit_id
      WHERE n.student_id = ?
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT 1
    `).get(studentId) as any;

    if (!latestPlan) {
      const lagDays = getCourseElapsedDays(now);
      const status = lagDays >= 4 ? 'seriously_behind' : lagDays >= 1 ? 'slightly_behind' : 'on_track';
      const hasNote = !!latestNote;
      const fallback = {
        student_id: studentId,
        day_key: dayKey,
        status,
        lag_days: lagDays,
        should_remind: lagDays >= 4 ? 1 : 0,
        reason: hasNote
          ? `当前已进入${courseWeekday}，但学生尚未生成学习计划；按“进度=0”计入，当前滞后约${lagDays}天。`
          : `当前已进入${courseWeekday}，且学生既未生成学习计划也未提交笔记；按“进度=0”计入，当前滞后约${lagDays}天。`,
        suggestion: lagDays >= 4
          ? '请立即生成本周学习计划，并先提交一次最小可交付学习笔记以恢复进度。'
          : '请尽快生成学习计划，并在当天提交首条学习笔记，避免继续滞后。',
        checked_at: toUtc8IsoString(now),
        trigger_source: triggerSource,
        course_weekday: courseWeekday,
        plan_id: null,
        note_id: latestNote?.id || null,
        detail_json: JSON.stringify({ fallback: true, no_plan: true, progress_as_zero: true, has_note: hasNote })
      };
      db.prepare(`
        INSERT INTO progress_checks (student_id, day_key, status, lag_days, should_remind, reason, suggestion, trigger_source, course_weekday, plan_id, note_id, detail_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fallback.student_id,
        fallback.day_key,
        fallback.status,
        fallback.lag_days,
        fallback.should_remind,
        fallback.reason,
        fallback.suggestion,
        fallback.trigger_source,
        fallback.course_weekday,
        fallback.plan_id,
        fallback.note_id,
        fallback.detail_json
      );
      return fallback;
    }

    const { client, model } = getAiClient();
    const auditPrompt = prompts.progressAudit({
      nowIso: toUtc8IsoString(now),
      courseWeekday,
      latestPlan: String(latestPlan?.plan_content || '无').slice(0, 6000),
      latestPlanUpdatedAt: latestPlan?.updated_at || latestPlan?.created_at || '未知',
      latestPlanUnit: latestPlan?.unit_title || `单元${latestPlan?.unit_id || ''}`,
      latestNote: String(latestNote?.content || '（该生暂无笔记）').slice(0, 4000),
      latestNoteCreatedAt: latestNote?.created_at || '无',
      latestNoteUnit: latestNote?.unit_title || (latestNote ? `单元${latestNote?.unit_id}` : '无')
    });

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: auditPrompt }],
      max_tokens: 1200,
    } as any);
    const aiRaw = response.choices?.[0]?.message?.content?.trim() || '';
    const parsed = parseAiJsonObject(aiRaw) || {};

    const lagDaysRaw = Number(parsed?.lag_days);
    const lagDays = Number.isFinite(lagDaysRaw) ? Math.max(0, Math.floor(lagDaysRaw)) : 0;
    const status = normalizeProgressStatus(String(parsed?.status || 'on_track'));
    const shouldRemindByAi = parsed?.should_remind === true || String(parsed?.should_remind).toLowerCase() === 'true';
    const shouldRemind = lagDays >= 4 || status === 'seriously_behind' || shouldRemindByAi;
    const reason = String(parsed?.reason || '未提供明确原因').trim() || '未提供明确原因';
    const suggestion = String(parsed?.suggestion || '请及时对照计划补齐最近几天的核心任务。').trim() || '请及时对照计划补齐最近几天的核心任务。';

    const result = {
      student_id: studentId,
      day_key: dayKey,
      status,
      lag_days: lagDays,
      should_remind: shouldRemind ? 1 : 0,
      reason,
      suggestion,
      checked_at: toUtc8IsoString(now),
      trigger_source: triggerSource,
      course_weekday: courseWeekday,
      plan_id: latestPlan?.id || null,
      note_id: latestNote?.id || null,
      detail_json: JSON.stringify({ ai_raw: aiRaw })
    };

    db.prepare(`
      INSERT INTO progress_checks (student_id, day_key, status, lag_days, should_remind, reason, suggestion, trigger_source, course_weekday, plan_id, note_id, detail_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.student_id,
      result.day_key,
      result.status,
      result.lag_days,
      result.should_remind,
      result.reason,
      result.suggestion,
      result.trigger_source,
      result.course_weekday,
      result.plan_id,
      result.note_id,
      result.detail_json
    );

    return result;
  };

  // Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  // Admin Middleware
  const requireAdmin = (req: any, res: any, next: any) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  };

  // Admin Users API
  app.get('/api/admin/users', authenticate, requireAdmin, (req: any, res: any) => {
    const users = db.prepare('SELECT id, username, role FROM users').all();
    res.json(users);
  });

  app.post('/api/admin/users/batch', authenticate, requireAdmin, (req: any, res: any) => {
    const text = String(req.body?.text || '');
    if (!text.trim()) {
      return res.status(400).json({ error: '请输入批量账号文本' });
    }

    const lines = text.split(/\r?\n/);
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
      return res.status(500).json({ error: err?.message || '批量创建失败' });
    }

    return res.json({
      total_lines: lines.length,
      parsed,
      created,
      skipped,
      results
    });
  });

  app.post('/api/admin/users', authenticate, requireAdmin, (req: any, res: any) => {
    const { username, password, role } = req.body;
    try {
      const hash = bcrypt.hashSync(password, 10);
      const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, role || 'student');
      res.json({ id: result.lastInsertRowid, username, role: role || 'student' });
    } catch (err) {
      res.status(400).json({ error: 'User already exists' });
    }
  });

  app.put('/api/admin/users/:id', authenticate, requireAdmin, (req: any, res: any) => {
    const { username, password, role } = req.body;
    try {
      if (password) {
        const hash = bcrypt.hashSync(password, 10);
        db.prepare('UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?').run(username, hash, role, req.params.id);
      } else {
        db.prepare('UPDATE users SET username = ?, role = ? WHERE id = ?').run(username, role, req.params.id);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'Update failed' });
    }
  });

  app.delete('/api/admin/users/:id', authenticate, requireAdmin, (req: any, res: any) => {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return res.status(400).json({ error: '无效的用户ID' });
    }

    const targetUser = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(targetId) as any;
    if (!targetUser) {
      return res.status(404).json({ error: '用户不存在' });
    }
    if (targetUser.username === 'admin' || targetUser.role === 'admin') {
      return res.status(400).json({ error: '不能删除管理员账号' });
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
        return res.status(500).json({ error: '删除失败，未影响任何记录' });
      }

      res.json({ success: true, deleted_user_id: targetId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '删除失败' });
    }
  });

  // Admin Settings API
  app.get('/api/admin/settings', authenticate, requireAdmin, (req: any, res: any) => {
    const settings = db.prepare('SELECT * FROM settings').all();
    res.json(settings);
  });

  app.post('/api/admin/settings', authenticate, requireAdmin, (req: any, res: any) => {
    const { settings } = req.body;
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
    res.json({ success: true, ai_config_mode: hasCustomAiValue ? 'custom' : 'default' });
  });

  // Admin AI connectivity test
  app.post('/api/admin/ai/test', authenticate, requireAdmin, async (req: any, res: any) => {
    const message = req.body?.message || '这是一次AI可用性测试，请简短回应。';
    try {
      const { client, model } = getAiClient();
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: message }],
      });
      const reply = response.choices?.[0]?.message?.content?.trim() || '';
      res.json({ ok: true, reply });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'AI test failed' });
    }
  });

  app.get('/api/admin/announcements/latest', authenticate, requireAdmin, (req: any, res: any) => {
    const latest = db.prepare(`
      SELECT a.*, u.username AS created_by_username
      FROM announcements a
      LEFT JOIN users u ON u.id = a.created_by
      ORDER BY a.id DESC
      LIMIT 1
    `).get() as any;
    res.json(latest || null);
  });

  app.get('/api/admin/announcements', authenticate, requireAdmin, (req: any, res: any) => {
    const rows = db.prepare(`
      SELECT a.*, u.username AS created_by_username
      FROM announcements a
      LEFT JOIN users u ON u.id = a.created_by
      ORDER BY a.id DESC
    `).all() as any[];
    res.json(rows);
  });

  app.post('/api/admin/announcements/publish', authenticate, requireAdmin, (req: any, res: any) => {
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    if (!title) {
      return res.status(400).json({ error: '公告标题不能为空' });
    }
    if (!content) {
      return res.status(400).json({ error: '公告内容不能为空' });
    }

    const result = db.prepare('INSERT INTO announcements (title, content, created_by) VALUES (?, ?, ?)')
      .run(title, content, req.user.id);
    const created = db.prepare(`
      SELECT a.*, u.username AS created_by_username
      FROM announcements a
      LEFT JOIN users u ON u.id = a.created_by
      WHERE a.id = ?
    `).get(result.lastInsertRowid) as any;
    res.json({ message: '公告已发布', announcement: created });
  });

  // Admin Records API
  app.get('/api/admin/notes', authenticate, requireAdmin, (req: any, res: any) => {
    const notes = db.prepare(`
      SELECT n.*, u.username AS student_username, un.title AS unit_title
      FROM notes n
      JOIN users u ON n.student_id = u.id
      JOIN units un ON n.unit_id = un.id
      ORDER BY n.created_at DESC
    `).all();
    res.json((notes as any[]).map(withNoteFileUrls));
  });

  app.get('/api/admin/plans', authenticate, requireAdmin, (req: any, res: any) => {
    const plans = db.prepare(`
      SELECT p.*, u.username AS student_username, un.title AS unit_title
      FROM study_plans p
      JOIN users u ON p.student_id = u.id
      JOIN units un ON p.unit_id = un.id
      ORDER BY p.updated_at DESC
    `).all();
    res.json(plans);
  });

  app.get('/api/admin/unit-scores', authenticate, requireAdmin, (req: any, res: any) => {
    const unitId = Number(req.query?.unitId);
    if (!Number.isFinite(unitId) || unitId <= 0) {
      return res.status(400).json({ error: '无效的单元ID' });
    }

    const unit = db.prepare('SELECT id, title FROM units WHERE id = ?').get(unitId) as any;
    if (!unit) {
      return res.status(404).json({ error: '单元不存在' });
    }

    const rows = db.prepare(`
      SELECT
        u.id AS student_id,
        u.username AS student_username,
        (
          SELECT n.id
          FROM notes n
          WHERE n.student_id = u.id AND n.unit_id = ?
          ORDER BY n.created_at DESC, n.id DESC
          LIMIT 1
        ) AS latest_note_id,
        (
          SELECT n.grade
          FROM notes n
          WHERE n.student_id = u.id AND n.unit_id = ?
          ORDER BY n.created_at DESC, n.id DESC
          LIMIT 1
        ) AS final_grade,
        (
          SELECT n.created_at
          FROM notes n
          WHERE n.student_id = u.id AND n.unit_id = ?
          ORDER BY n.created_at DESC, n.id DESC
          LIMIT 1
        ) AS latest_note_created_at,
        CASE WHEN EXISTS (
          SELECT 1 FROM study_plans p WHERE p.student_id = u.id AND p.unit_id = ?
        ) THEN 1 ELSE 0 END AS has_plan
      FROM users u
      WHERE u.role = 'student'
      ORDER BY u.id ASC
    `).all(unitId, unitId, unitId, unitId) as any[];

    const data = rows.map((row) => ({
      ...row,
      has_plan: Number(row.has_plan || 0) === 1,
      final_grade: row.final_grade == null || String(row.final_grade).trim() === '' ? null : Number(row.final_grade)
    }));

    res.json({
      unit_id: unit.id,
      unit_title: unit.title,
      rows: data
    });
  });

  app.get('/api/admin/feedbacks', authenticate, requireAdmin, (req: any, res: any) => {
    const feedbacks = db.prepare(`
      SELECT f.*, u.username AS student_username, ru.username AS replied_by_username
      FROM feedbacks f
      JOIN users u ON f.student_id = u.id
      LEFT JOIN users ru ON f.replied_by = ru.id
      ORDER BY f.created_at DESC
    `).all();
    res.json(feedbacks);
  });

  app.post('/api/admin/feedbacks/:id/reply', authenticate, requireAdmin, (req: any, res: any) => {
    const feedbackId = Number(req.params.id);
    const reply = String(req.body?.reply || '').trim();

    if (!Number.isFinite(feedbackId) || feedbackId <= 0) {
      return res.status(400).json({ error: '无效的反馈ID' });
    }
    if (!reply) {
      return res.status(400).json({ error: '回复内容不能为空' });
    }

    const existing = db.prepare('SELECT id FROM feedbacks WHERE id = ?').get(feedbackId) as any;
    if (!existing) {
      return res.status(404).json({ error: '反馈不存在' });
    }

    db.prepare('UPDATE feedbacks SET admin_reply = ?, replied_by = ?, replied_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(reply, req.user.id, feedbackId);

    const updated = db.prepare(`
      SELECT f.*, u.username AS student_username, ru.username AS replied_by_username
      FROM feedbacks f
      JOIN users u ON f.student_id = u.id
      LEFT JOIN users ru ON f.replied_by = ru.id
      WHERE f.id = ?
    `).get(feedbackId);

    res.json({ message: '回复已保存', feedback: updated });
  });

  app.get('/api/admin/quizzes', authenticate, requireAdmin, (req: any, res: any) => {
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
      return { ...row, status };
    });

    res.json(data);
  });

  app.post('/api/admin/quizzes/assign', authenticate, requireAdmin, (req: any, res: any) => {
    try {
      const unitId = Number(req.body?.unitId);
      const targetType = String(req.body?.targetType || 'all');
      const studentId = Number(req.body?.studentId);

      if (!Number.isFinite(unitId) || unitId <= 0) {
        return res.status(400).json({ error: '无效的单元ID' });
      }

      const unit = db.prepare('SELECT id, title FROM units WHERE id = ?').get(unitId) as any;
      if (!unit) {
        return res.status(404).json({ error: '单元不存在' });
      }

      let students: any[] = [];
      if (targetType === 'single') {
        if (!Number.isFinite(studentId) || studentId <= 0) {
          return res.status(400).json({ error: '无效的学生ID' });
        }
        const target = db.prepare('SELECT id, username FROM users WHERE id = ? AND role = ?').get(studentId, 'student') as any;
        if (!target) {
          return res.status(404).json({ error: '目标学生不存在' });
        }
        students = [target];
      } else {
        students = db.prepare('SELECT id, username FROM users WHERE role = ? ORDER BY id ASC').all('student') as any[];
      }

      if (!students.length) {
        return res.status(400).json({ error: '没有可发送的学生账号' });
      }

      const { questions, quizDir, totalQuestions } = buildRandomQuizForUnit(unitId);
      const sanitizedQuestions = questions.map((question: any) => ({
        id: question.id,
        difficulty: question.difficulty,
        sourceNumber: question.sourceNumber,
        prompt: question.prompt,
        options: question.options,
      }));
      const answerKey = questions.map((question: any) => ({
        id: question.id,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
      }));

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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
            req.user.id,
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

      res.json({
        success: true,
        unit_id: unitId,
        unit_title: unit.title,
        target_type: targetType,
        quiz_dir: quizDir,
        total_questions: totalQuestions,
        assigned_count: createdRows.length,
        assignments: createdRows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '发送测试题失败' });
    }
  });

  app.get('/api/quiz/unit/:id', authenticate, (req: any, res: any) => {
    const unitId = Number(req.params.id);
    if (!Number.isFinite(unitId) || unitId <= 0) {
      return res.status(400).json({ error: '无效的单元ID' });
    }

    const assignment = db.prepare(`
      SELECT q.*, un.title AS unit_title
      FROM quiz_assignments q
      JOIN units un ON q.unit_id = un.id
      WHERE q.student_id = ? AND q.unit_id = ?
      ORDER BY q.created_at DESC, q.id DESC
      LIMIT 1
    `).get(req.user.id, unitId) as any;

    if (!assignment) {
      return res.json(null);
    }

    const parseJson = (raw: string | null, fallback: any) => {
      if (!raw) return fallback;
      try {
        return JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    };

    const submitted = !!assignment.submitted_at;
    const expired = !submitted && assignment.expires_at ? new Date(assignment.expires_at).getTime() < Date.now() : false;
    const status = submitted ? 'submitted' : expired ? 'expired' : 'pending';

    res.json({
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
      questions: parseJson(assignment.quiz_payload, []),
      student_answers: parseJson(assignment.student_answers, {}),
      grading_detail: parseJson(assignment.grading_detail, []),
    });
  });

  app.get('/api/announcements/pending', authenticate, (req: any, res: any) => {
    if (req.user.role !== 'student') {
      return res.json({ pending: false, announcements: [], announcement: null });
    }

    const userRow = db.prepare('SELECT last_read_announcement_id FROM users WHERE id = ?').get(req.user.id) as any;
    const lastReadId = Number(userRow?.last_read_announcement_id || 0);
    const announcements = db.prepare(`
      SELECT a.*, u.username AS created_by_username
      FROM announcements a
      LEFT JOIN users u ON u.id = a.created_by
      WHERE a.id > ?
      ORDER BY a.id ASC
    `).all(lastReadId) as any[];
    const pending = announcements.length > 0;

    return res.json({
      pending,
      announcements,
      pending_count: announcements.length,
      announcement: pending ? announcements[0] : null
    });
  });

  app.get('/api/announcements/history', authenticate, (req: any, res: any) => {
    const userRow = db.prepare('SELECT role, last_read_announcement_id FROM users WHERE id = ?').get(req.user.id) as any;
    if (!userRow) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const lastReadId = Number(userRow?.last_read_announcement_id || 0);
    const rows = db.prepare(`
      SELECT a.*, u.username AS created_by_username
      FROM announcements a
      LEFT JOIN users u ON u.id = a.created_by
      ORDER BY a.id DESC
    `).all() as any[];

    const data = rows.map((item) => ({
      ...item,
      is_read: Number(item?.id || 0) <= lastReadId
    }));

    return res.json({
      announcements: data,
      unread_count: data.filter((item) => !item.is_read).length
    });
  });

  app.post('/api/announcements/ack', authenticate, (req: any, res: any) => {
    const announcementId = Number(req.body?.announcementId);
    if (!Number.isFinite(announcementId) || announcementId <= 0) {
      return res.status(400).json({ error: '无效的公告ID' });
    }

    const existing = db.prepare('SELECT id FROM announcements WHERE id = ?').get(announcementId) as any;
    if (!existing) {
      return res.status(404).json({ error: '公告不存在' });
    }

    const userRow = db.prepare('SELECT last_read_announcement_id FROM users WHERE id = ?').get(req.user.id) as any;
    const current = Number(userRow?.last_read_announcement_id || 0);
    const nextReadId = Math.max(current, announcementId);
    db.prepare('UPDATE users SET last_read_announcement_id = ? WHERE id = ?').run(nextReadId, req.user.id);

    res.json({ success: true, last_read_announcement_id: nextReadId });
  });

  app.post('/api/quiz/:id/submit', authenticate, (req: any, res: any) => {
    const assignmentId = Number(req.params.id);
    if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ error: '无效的测试ID' });
    }

    const assignment = db.prepare('SELECT * FROM quiz_assignments WHERE id = ? AND student_id = ?').get(assignmentId, req.user.id) as any;
    if (!assignment) {
      return res.status(404).json({ error: '测试不存在' });
    }
    if (assignment.submitted_at) {
      return res.status(400).json({ error: '该测试已提交，不能重复提交' });
    }

    const expired = assignment.expires_at ? new Date(assignment.expires_at).getTime() < Date.now() : false;
    if (expired) {
      return res.status(400).json({ error: '测试已超过24小时作答时限' });
    }

    const submittedAnswers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    const parseJson = (raw: string | null, fallback: any) => {
      if (!raw) return fallback;
      try {
        return JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    };

    const questions = parseJson(assignment.quiz_payload, [] as any[]);
    const answerRows = parseJson(assignment.answer_key, [] as any[]);
    const answerMap = new Map<string, { correctAnswer: string; explanation: string }>();
    for (const item of answerRows) {
      const key = String(item?.id || '').trim();
      if (!key) continue;
      answerMap.set(key, {
        correctAnswer: String(item?.correctAnswer || '').trim().toUpperCase(),
        explanation: String(item?.explanation || '').trim(),
      });
    }

    const unanswered = questions.filter((question: any) => !String(submittedAnswers[String(question?.id || '')] || '').trim());
    if (unanswered.length > 0) {
      return res.status(400).json({ error: `存在未作答题目，共 ${unanswered.length} 题` });
    }

    let correctCount = 0;
    const gradingDetail = questions.map((question: any) => {
      const id = String(question?.id || '');
      const userAnswer = String(submittedAnswers[id] || '').trim().toUpperCase();
      const answer = answerMap.get(id);
      const correctAnswer = String(answer?.correctAnswer || '').trim().toUpperCase();
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

    res.json({
      success: true,
      assignment_id: assignmentId,
      total_questions: safeTotal,
      correct_count: correctCount,
      score,
      grading_detail: gradingDetail,
      submitted_at: new Date().toISOString(),
    });
  });

  app.get('/api/admin/progress', authenticate, requireAdmin, (req: any, res: any) => {
    const rows = db.prepare(`
      SELECT pc.*, u.username AS student_username
      FROM progress_checks pc
      JOIN users u ON u.id = pc.student_id
      WHERE pc.id IN (
        SELECT MAX(id)
        FROM progress_checks
        GROUP BY student_id
      )
      ORDER BY pc.should_remind DESC, pc.lag_days DESC, pc.id DESC
    `).all() as any[];
    const normalized = rows.map((row) => ({
      ...row,
      should_remind: Number(row.should_remind || 0) === 1,
      lag_days: Number(row.lag_days || 0)
    }));
    res.json(normalized);
  });

  app.post('/api/admin/progress/check-all', authenticate, requireAdmin, async (req: any, res: any) => {
    const wantsStream = String(req.query?.stream || '') === '1' || String(req.headers.accept || '').includes('text/event-stream');
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let streamEnded = false;
    let clientDisconnected = false;

    const sendSse = (event: string, payload: any) => {
      if (!wantsStream || streamEnded || clientDisconnected) return;
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (err) {
        clientDisconnected = true;
      }
    };

    const closeSse = () => {
      if (!wantsStream || streamEnded) return;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      streamEnded = true;
      if (clientDisconnected) return;
      try {
        res.end();
      } catch (err) {}
    };

    const respondError = (status: number, error: string) => {
      if (wantsStream) {
        sendSse('error', { error, status });
        closeSse();
        return;
      }
      res.status(status).json({ error });
    };

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }

      heartbeatTimer = setInterval(() => {
        sendSse('ping', { ts: Date.now() });
      }, 10000);

      req.on('aborted', () => {
        clientDisconnected = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });

      res.on('close', () => {
        clientDisconnected = true;
        streamEnded = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });
    }

    try {
      const students = db.prepare("SELECT id, username FROM users WHERE role = 'student' ORDER BY id ASC").all() as any[];
      const results: any[] = [];
      let remindCount = 0;

      if (wantsStream) {
        sendSse('stage', { message: '开始检测学生进度...', total: students.length });
      }

      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        try {
          const checked = await evaluateStudentProgress(Number(student.id), 'manual-admin');
          const row = {
            student_id: student.id,
            student_username: student.username,
            status: checked.status,
            lag_days: checked.lag_days,
            should_remind: Number(checked.should_remind || 0) === 1,
            reason: checked.reason,
            suggestion: checked.suggestion,
            checked_at: checked.checked_at,
            trigger_source: checked.trigger_source,
            course_weekday: checked.course_weekday
          };
          results.push(row);
          if (row.should_remind) remindCount += 1;
          sendSse('result', { index: i + 1, total: students.length, row });
        } catch (err: any) {
          const row = {
            student_id: student.id,
            student_username: student.username,
            status: 'error',
            lag_days: 0,
            should_remind: false,
            reason: err?.message || '检测失败',
            suggestion: '',
            checked_at: toUtc8IsoString(new Date()),
            trigger_source: 'manual-admin',
            course_weekday: getCourseWeekdayLabel(new Date())
          };
          results.push(row);
          sendSse('result', { index: i + 1, total: students.length, row });
        }
      }

      const payload = {
        total: students.length,
        remind_count: remindCount,
        results
      };

      if (wantsStream) {
        sendSse('final', payload);
        sendSse('done', { ok: true });
        closeSse();
        return;
      }

      res.json(payload);
    } catch (err: any) {
      respondError(500, err?.message || '批量检测失败');
    }
  });

  app.post('/api/admin/progress/check/:studentId', authenticate, requireAdmin, async (req: any, res: any) => {
    const studentId = Number(req.params.studentId);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      return res.status(400).json({ error: '无效的学生ID' });
    }

    const student = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(studentId) as any;
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: '学生不存在' });
    }

    try {
      const checked = await evaluateStudentProgress(studentId, 'manual-admin-single');
      res.json({
        student_id: student.id,
        student_username: student.username,
        status: checked.status,
        lag_days: checked.lag_days,
        should_remind: Number(checked.should_remind || 0) === 1,
        reason: checked.reason,
        suggestion: checked.suggestion,
        checked_at: checked.checked_at,
        trigger_source: checked.trigger_source,
        course_weekday: checked.course_weekday
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '检测失败' });
    }
  });

  // Auth Routes
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json(buildAuthPayload(user));
  });

  app.post('/api/auth/refresh', (req, res) => {
    const refreshToken = String(req.body?.refreshToken || '').trim();
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token is required' });
    }

    try {
      const decoded = jwt.verify(refreshToken, REFRESH_JWT_SECRET) as any;
      if (decoded?.type !== 'refresh') {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(decoded.id) as any;
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      res.json(buildAuthPayload(user));
    } catch (err) {
      res.status(401).json({ error: 'Refresh token expired' });
    }
  });

  app.post('/api/auth/register', authenticate, (req: any, res: any) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { username, password } = req.body;
    try {
      const hash = bcrypt.hashSync(password, 10);
      const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash);
      res.json({ id: result.lastInsertRowid, username });
    } catch (err) {
      res.status(400).json({ error: 'User already exists' });
    }
  });

  app.post('/api/auth/change-password', authenticate, (req: any, res: any) => {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请输入旧密码和新密码' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: '新密码至少需要6位' });
    }

    const currentUser = db.prepare('SELECT id, password FROM users WHERE id = ?').get(req.user.id) as any;
    if (!currentUser) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const oldPasswordMatched = bcrypt.compareSync(oldPassword, currentUser.password);
    if (!oldPasswordMatched) {
      return res.status(400).json({ error: '旧密码不正确' });
    }

    const newPasswordHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(newPasswordHash, req.user.id);
    return res.json({ success: true, message: '密码修改成功' });
  });

  // Units
  app.get('/api/units', (req, res) => {
    const units = db.prepare('SELECT * FROM units').all();
    res.json(units);
  });

  app.get('/api/units/:id', (req, res) => {
    const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    res.json(unit);
  });

  app.post('/api/feedback', authenticate, (req: any, res: any) => {
    const text = String(req.body?.content || '').trim();
    if (!text) {
      return res.status(400).json({ error: '反馈内容不能为空' });
    }

    const result = db.prepare('INSERT INTO feedbacks (student_id, content) VALUES (?, ?)').run(req.user.id, text);
    res.json({ id: result.lastInsertRowid, message: '反馈提交成功' });
  });

  app.get('/api/feedback/mine', authenticate, (req: any, res: any) => {
    const rows = db.prepare(`
      SELECT f.*, ru.username AS replied_by_username
      FROM feedbacks f
      LEFT JOIN users ru ON f.replied_by = ru.id
      WHERE f.student_id = ?
      ORDER BY f.created_at DESC
    `).all(req.user.id);
    res.json(rows);
  });

  app.get('/api/progress/reminder', authenticate, async (req: any, res: any) => {
    try {
      const dayKey = getTodayKey();
      const latestToday = db.prepare(`
        SELECT * FROM progress_checks
        WHERE student_id = ? AND day_key = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(req.user.id, dayKey) as any;

      const checked = latestToday || await evaluateStudentProgress(Number(req.user.id), 'daily-auto');
      res.json({
        checked_at: checked.checked_at,
        day_key: checked.day_key,
        status: checked.status,
        lag_days: Number(checked.lag_days || 0),
        should_remind: Number(checked.should_remind || 0) === 1,
        reason: checked.reason,
        suggestion: checked.suggestion,
        trigger_source: checked.trigger_source,
        course_weekday: checked.course_weekday,
        from_cache: Boolean(latestToday)
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '进度检测失败' });
    }
  });

  app.post('/api/progress/check', authenticate, async (req: any, res: any) => {
    try {
      const checked = await evaluateStudentProgress(Number(req.user.id), 'manual-student');
      res.json({
        checked_at: checked.checked_at,
        day_key: checked.day_key,
        status: checked.status,
        lag_days: Number(checked.lag_days || 0),
        should_remind: Number(checked.should_remind || 0) === 1,
        reason: checked.reason,
        suggestion: checked.suggestion,
        trigger_source: checked.trigger_source,
        course_weekday: checked.course_weekday
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '进度检测失败' });
    }
  });

  // Study Plans
  app.get('/api/plans/history/:unitId', authenticate, (req: any, res: any) => {
    const unitId = Number(req.params.unitId);
    if (!Number.isFinite(unitId) || unitId <= 0) {
      return res.status(400).json({ error: 'Invalid unit id' });
    }

    const current = db.prepare(`
      SELECT id, student_id, unit_id, plan_content, updated_at, created_at
      FROM study_plans
      WHERE student_id = ? AND unit_id = ?
      LIMIT 1
    `).get(req.user.id, unitId) as any;

    const history = db.prepare(`
      SELECT id, student_id, unit_id, plan_content, source, created_at
      FROM study_plan_history
      WHERE student_id = ? AND unit_id = ?
      ORDER BY id DESC
      LIMIT 20
    `).all(req.user.id, unitId) as any[];

    const previous = history[0] || null;
    res.json({ current, previous, history });
  });

  app.get('/api/plans/:unitId(\\d+)', authenticate, (req: any, res: any) => {
    const plan = db.prepare('SELECT * FROM study_plans WHERE student_id = ? AND unit_id = ?').get(req.user.id, req.params.unitId) as any;
    if (!plan) {
      return res.json(null);
    }

    const todayKey = getTodayKey();
    const generateCount = Number(plan.generate_count || 0);
    const adjustCountTotal = Number(plan.adjust_count || 0);
    const adjustCount = plan.adjust_daily_date === todayKey ? Number(plan.adjust_daily_count || 0) : 0;
    res.json({
      ...plan,
      generate_count: generateCount,
      adjust_count_total: adjustCountTotal,
      adjust_count: adjustCount,
      adjust_count_scope: 'daily',
      max_generate_count: MAX_PLAN_GENERATIONS,
      max_adjust_count: MAX_PLAN_ADJUSTMENTS,
      remaining_generate_count: Math.max(0, MAX_PLAN_GENERATIONS - generateCount),
      remaining_adjust_count: Math.max(0, MAX_PLAN_ADJUSTMENTS - adjustCount)
    });
  });

  app.get('/api/plans/pretest/:unitId', authenticate, (req: any, res: any) => {
    const unitId = Number(req.params.unitId);
    const unit = db.prepare('SELECT id FROM units WHERE id = ?').get(unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const filePath = resolvePretestFilePath(unitId);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Pretest file not found' });
    }

    const question = fs.readFileSync(filePath, 'utf-8');
    res.json({ unit_id: unitId, question, file_path: filePath });
  });

  app.post('/api/plans/generate', authenticate, async (req: any, res: any) => {
    const startedAt = Date.now();
    const { unitId, prompt: clientPrompt, pretestAnswer, regenerateContext } = req.body;
    const wantsStream = String(req.query?.stream || '') === '1' || String(req.headers.accept || '').includes('text/event-stream');
    const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(unitId) as any;

    let promptBuildMs = 0;
    let aiElapsedMs = 0;
    let promptLength = 0;
    let filesCount = 0;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let streamEnded = false;
    let clientDisconnected = false;

    const sendSse = (event: string, payload: any) => {
      if (!wantsStream || streamEnded || clientDisconnected) return;
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (err) {
        clientDisconnected = true;
      }
    };

    const closeSse = () => {
      if (!wantsStream || streamEnded) return;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      streamEnded = true;
      if (clientDisconnected) return;
      try {
        res.end();
      } catch (err) {}
    };

    const respondError = (status: number, error: string) => {
      if (wantsStream) {
        sendSse('error', { error, status });
        closeSse();
        return;
      }
      res.status(status).json({ error });
    };

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }

      heartbeatTimer = setInterval(() => {
        sendSse('ping', { ts: Date.now() });
      }, 10000);

      req.on('aborted', () => {
        clientDisconnected = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });

      res.on('close', () => {
        clientDisconnected = true;
        streamEnded = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });

      sendSse('stage', { message: '请求已接收，开始处理...' });
    }

    if (!unit) {
      return respondError(404, 'Unit not found');
    }

    try {
      const { client, model } = getAiClient();
      const existing = db.prepare('SELECT id, plan_content, generate_count, adjust_count, pretest_answer FROM study_plans WHERE student_id = ? AND unit_id = ?').get(req.user.id, unitId) as any;
      const trimmedPretestAnswer = typeof pretestAnswer === 'string' ? pretestAnswer.trim() : '';
      const pretestFilePath = resolvePretestFilePath(Number(unitId));
      const pretestQuestion = fs.existsSync(pretestFilePath) ? fs.readFileSync(pretestFilePath, 'utf-8').trim() : '';

      if (!existing && !trimmedPretestAnswer) {
        return respondError(400, '首次生成学习计划前，请先完成预设测评题并提交答案。');
      }
      if (!existing && !pretestQuestion) {
        return respondError(400, '首次生成学习计划前，未找到该单元的预设测评题文件。');
      }

      let basePrompt: string | undefined = clientPrompt;
      if (!basePrompt) {
        let resourcesText = '无';
        try {
          const resources = JSON.parse(unit.resources || '[]');
          if (resources.length > 0) {
            resourcesText = resources.map((r: any) => `- ${r.title}: ${r.url || ''} ${r.description || ''}`).join('\n');
          }
        } catch (e) {}

        basePrompt = prompts.generatePlan(unit, resourcesText);
      }

      const knowledgeAnswer = trimmedPretestAnswer || String(existing?.pretest_answer || '').trim();
      if (pretestQuestion || knowledgeAnswer) {
        basePrompt = prompts.buildPlanPrompt(basePrompt, pretestQuestion, knowledgeAnswer);
      }

      const regenerateNote = String(regenerateContext || '').trim();
      if (regenerateNote) {
        basePrompt = `${basePrompt}\n\n[学生补充情况说明]\n${regenerateNote}\n\n请结合上述“学生补充情况说明”对计划进行针对性调整，重点在时间安排、任务粒度与优先级上体现。`;
      }

      sendSse('stage', { message: '正在读取资料并构建提示词...' });
      const promptBuildStartedAt = Date.now();
      const { prompt, files } = await buildPromptWithFiles(basePrompt, client);
      promptBuildMs = Date.now() - promptBuildStartedAt;
      promptLength = prompt.length;
      filesCount = files.length;

      const aiTimeoutMs = Number(process.env.AI_TIMEOUT_MS || 120000);
      const maxCompletionTokens = Number(process.env.AI_PLAN_MAX_TOKENS || 4800);

      const callAiWithTimeout = async (userPrompt: string, stream = false) => {
        let timeoutId: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('AI_REQUEST_TIMEOUT')), aiTimeoutMs);
        });

        const requestBody: any = {
          model,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: maxCompletionTokens,
        };
        if (stream) {
          requestBody.stream = true;
        }

        try {
          return await Promise.race([
            client.chat.completions.create(requestBody),
            timeoutPromise
          ]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      };

      sendSse('stage', { message: 'AI 正在生成学习计划...' });
      let ai_raw = '';
      let response: any;

      if (wantsStream) {
        const aiStartedAt = Date.now();
        try {
          const streamResponse: any = await callAiWithTimeout(prompt, true);
          for await (const chunk of streamResponse as any) {
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              ai_raw += delta;
              sendSse('delta', { content: delta });
            }
          }
        } finally {
          aiElapsedMs += Date.now() - aiStartedAt;
        }

        if (!ai_raw.trim()) {
          sendSse('stage', { message: '首次流式结果为空，正在重试一次...' });
          const retryPrompt = prompts.planRetry(prompt);
          const retryAiStartedAt = Date.now();
          try {
            response = await callAiWithTimeout(retryPrompt);
          } finally {
            aiElapsedMs += Date.now() - retryAiStartedAt;
          }
          ai_raw = response?.choices?.[0]?.message?.content?.trim() || '';
          if (ai_raw) {
            sendSse('delta', { content: ai_raw });
          }
        }
      } else {
        const aiStartedAt = Date.now();
        try {
          response = await callAiWithTimeout(prompt);
        } finally {
          aiElapsedMs += Date.now() - aiStartedAt;
        }
        ai_raw = response?.choices?.[0]?.message?.content?.trim() || '';

        if (!ai_raw) {
          const retryPrompt = prompts.planRetry(prompt);
          const retryAiStartedAt = Date.now();
          try {
            response = await callAiWithTimeout(retryPrompt);
          } finally {
            aiElapsedMs += Date.now() - retryAiStartedAt;
          }
          ai_raw = response?.choices?.[0]?.message?.content?.trim() || '';
        }
      }

      if (!ai_raw) {
        console.error('[plans.generate] empty ai response', JSON.stringify(response));
        throw new Error('AI 返回空响应');
      }

      const planContent = ai_raw;
      const currentGenerateCount = Number(existing?.generate_count || 0);
      if (currentGenerateCount >= MAX_PLAN_GENERATIONS) {
        return respondError(429, `学习计划最多可生成 ${MAX_PLAN_GENERATIONS} 次，当前次数已用完。`);
      }

      if (existing) {
        db.prepare(`UPDATE study_plans SET plan_content = ?, generate_count = COALESCE(generate_count, 0) + 1, pretest_answer = COALESCE(NULLIF(?, ''), pretest_answer), pretest_submitted_at = CASE WHEN TRIM(COALESCE(?, '')) <> '' THEN CURRENT_TIMESTAMP ELSE pretest_submitted_at END, updated_at = CURRENT_TIMESTAMP WHERE student_id = ? AND unit_id = ?`).run(planContent, trimmedPretestAnswer, trimmedPretestAnswer, req.user.id, unitId);
      } else {
        db.prepare('INSERT INTO study_plans (student_id, unit_id, plan_content, generate_count, adjust_count, pretest_answer, pretest_submitted_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(req.user.id, unitId, planContent, 1, 0, trimmedPretestAnswer);
      }

      const refreshed = db.prepare('SELECT generate_count, adjust_count, adjust_daily_count, adjust_daily_date FROM study_plans WHERE student_id = ? AND unit_id = ?').get(req.user.id, unitId) as any;
      const todayKey = getTodayKey();
      const generateCount = Number(refreshed?.generate_count || 0);
      const adjustCountTotal = Number(refreshed?.adjust_count || 0);
      const adjustCount = refreshed?.adjust_daily_date === todayKey ? Number(refreshed?.adjust_daily_count || 0) : 0;

      const elapsed_ms = Date.now() - startedAt;
      console.log('[plans.generate] total_ms=%d prompt_build_ms=%d ai_elapsed_ms=%d prompt_length=%d files=%d unitId=%s user=%s stream=%s', elapsed_ms, promptBuildMs, aiElapsedMs, promptLength, filesCount, unitId, req.user?.id, wantsStream ? '1' : '0');
      const payload = {
        plan_content: planContent,
        prompt_preview: prompt,
        files_used: files,
        ai_raw,
        plan_file: null,
        plan_version: null,
        elapsed_ms,
        prompt_build_ms: promptBuildMs,
        ai_elapsed_ms: aiElapsedMs,
        generate_count: generateCount,
        adjust_count_total: adjustCountTotal,
        adjust_count: adjustCount,
        adjust_count_scope: 'daily',
        max_generate_count: MAX_PLAN_GENERATIONS,
        max_adjust_count: MAX_PLAN_ADJUSTMENTS,
        remaining_generate_count: Math.max(0, MAX_PLAN_GENERATIONS - generateCount),
        remaining_adjust_count: Math.max(0, MAX_PLAN_ADJUSTMENTS - adjustCount)
      };

      if (wantsStream) {
        sendSse('final', payload);
        sendSse('done', { ok: true });
        closeSse();
        return;
      }

      res.json(payload);
    } catch (err: any) {
      const isTimeout = err?.message === 'AI_REQUEST_TIMEOUT';
      const status = isTimeout ? 504 : 500;
      const message = isTimeout ? 'AI generation timed out. Try again with shorter input.' : err?.message || 'Unknown error';
      const elapsed_ms = Date.now() - startedAt;
      console.error('[plans.generate] error total_ms=%d prompt_build_ms=%d ai_elapsed_ms=%d prompt_length=%d files=%d unitId=%s user=%s message=%s', elapsed_ms, promptBuildMs, aiElapsedMs, promptLength, filesCount, unitId, req.user?.id, message, err);
      respondError(status, message);
    }
  });

  // Notes
  app.get('/api/notes/:unitId', authenticate, (req: any, res: any) => {
    const notes = db.prepare('SELECT * FROM notes WHERE student_id = ? AND unit_id = ? ORDER BY created_at DESC').all(req.user.id, req.params.unitId);
    res.json((notes as any[]).map(withNoteFileUrls));
  });

  app.post('/api/notes', authenticate, notesUpload, async (req: any, res: any) => {
    const { unitId, week, content } = req.body;
    const wantsStream = String(req.query?.stream || '') === '1' || String(req.headers.accept || '').includes('text/event-stream');
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let streamEnded = false;
    let clientDisconnected = false;

    const sendSse = (event: string, payload: any) => {
      if (!wantsStream || streamEnded || clientDisconnected) return;
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (err) {
        clientDisconnected = true;
      }
    };

    const closeSse = () => {
      if (!wantsStream || streamEnded) return;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      streamEnded = true;
      if (clientDisconnected) return;
      try {
        res.end();
      } catch (err) {}
    };

    const respondError = (status: number, error: string) => {
      if (wantsStream) {
        sendSse('error', { error, status });
        closeSse();
        return;
      }
      res.status(status).json({ error });
    };

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }

      heartbeatTimer = setInterval(() => {
        sendSse('ping', { ts: Date.now() });
      }, 10000);

      req.on('aborted', () => {
        clientDisconnected = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });

      res.on('close', () => {
        clientDisconnected = true;
        streamEnded = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });

      sendSse('stage', { message: '正在保存笔记...' });
    }

    const existingNotesCount = db.prepare('SELECT COUNT(*) as count FROM notes WHERE student_id = ? AND unit_id = ?').get(req.user.id, unitId) as { count: number };
    const noteVersion = Number(existingNotesCount?.count || 0) + 1;

    const noteContentFilename = `note-s${req.user.id}-u${unitId}-n${noteVersion}.md`;
    const noteContentPath = path.join(NOTES_DIR, noteContentFilename);
    const noteContentForFile = (content || '').trim() || '（本次仅提交了附件，未填写文字内容）';
    fs.writeFileSync(noteContentPath, noteContentForFile, 'utf-8');

    const uploadedByField = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const uploadedFiles = [
      ...(uploadedByField.files || []),
      ...(uploadedByField.file || [])
    ];

    const invalidFiles = uploadedFiles.filter((file) => {
      const ext = path.extname(String(file.originalname || '')).toLowerCase();
      return !NOTE_ALLOWED_EXTENSIONS.has(ext);
    });
    if (invalidFiles.length > 0) {
      for (const file of uploadedFiles) {
        try {
          if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (err) {}
      }
      const names = invalidFiles.map((file) => String(file.originalname || '未知文件')).join('、');
      return respondError(400, `以下文件类型暂不支持上传：${names}`);
    }

    const fileUrls: string[] = [];
    for (let index = 0; index < uploadedFiles.length; index++) {
      const currentFile = uploadedFiles[index];
      const originalExt = path.extname(currentFile.originalname || '').toLowerCase();
      const ext = originalExt || '.bin';
      const suffix = uploadedFiles.length > 1 ? `-${index + 1}` : '';
      const filename = `note-s${req.user.id}-u${unitId}-n${noteVersion}-file${suffix}${ext}`;
      const fromPath = currentFile.path;
      const toPath = path.join(NOTES_DIR, filename);
      fs.renameSync(fromPath, toPath);
      fileUrls.push(`/notes/${filename}`);
    }
    const fileUrl = fileUrls[0] || null;

    const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(unitId) as any;
    if (!unit) return respondError(404, 'Unit not found');

    // Save note
    const result = db.prepare('INSERT INTO notes (student_id, unit_id, week, content, file_url, file_urls) VALUES (?, ?, ?, ?, ?, ?)').run(
      req.user.id,
      unitId,
      week,
      content || '',
      fileUrl,
      JSON.stringify(fileUrls)
    );
    const noteId = result.lastInsertRowid;

    let adjustApplied = false;
    let adjustSkippedReason = '';
    let adjustCount = 0;
    let adjustedPlanContent = '';

    // Adjust plan
    try {
      const plan = db.prepare('SELECT * FROM study_plans WHERE student_id = ? AND unit_id = ?').get(req.user.id, unitId) as any;
      if (plan) {
        const todayKey = getTodayKey();
        const currentDailyAdjustCount = plan.adjust_daily_date === todayKey ? Number(plan.adjust_daily_count || 0) : 0;
        adjustCount = currentDailyAdjustCount;
        if (currentDailyAdjustCount >= MAX_PLAN_ADJUSTMENTS) {
          adjustSkippedReason = `今日根据笔记调整计划已达到上限（${MAX_PLAN_ADJUSTMENTS}次）`;
        } else {
          sendSse('stage', { message: 'AI 正在根据最新笔记调整学习计划...' });
          const { client, model } = getAiClient();
          const now = new Date();
          const planCreatedAt = plan.created_at ? new Date(plan.created_at) : null;
          const planUpdatedAt = plan.updated_at ? new Date(plan.updated_at) : null;
          const hoursSinceCreated = planCreatedAt ? Math.max(0, Math.floor((now.getTime() - planCreatedAt.getTime()) / 3600000)) : null;
          const hoursSinceUpdated = planUpdatedAt ? Math.max(0, Math.floor((now.getTime() - planUpdatedAt.getTime()) / 3600000)) : null;
          const courseWeekdayLabel = getCourseWeekdayLabel(now);
          const progressContext = [
            `当前时间: ${toUtc8IsoString(now)}`,
            `教学日历定位: ${courseWeekdayLabel}（按2026-03-02为第一周周一计算）`,
            `本次笔记提交序号: 第${noteVersion}次`,
            `本次笔记提交周次字段: ${week || '未知'}`,
            `原计划创建时间: ${plan.created_at || '未知'}`,
            `原计划上次更新时间: ${plan.updated_at || '未知'}`,
            `距原计划创建已过小时: ${hoursSinceCreated ?? '未知'}`,
            `距原计划上次更新已过小时: ${hoursSinceUpdated ?? '未知'}`,
            `单元周次范围: 第${unit.week_range}周`
          ].join('\n');

          const baseAdjustPrompt = prompts.adjustPlan(unit, plan, content, fileUrls, progressContext);
          const noteAttachmentPaths = resolveAttachmentPathsFromUrls(fileUrls);
          const adjustPromptWithFile = noteAttachmentPaths.length > 0
            ? `${baseAdjustPrompt}\nFILES: ${noteAttachmentPaths.join(', ')}`
            : baseAdjustPrompt;
          const { prompt: adjustPrompt } = await buildPromptWithFiles(adjustPromptWithFile, client);

          let newPlanContent = plan.plan_content;
          if (wantsStream) {
            let streamed = '';
            const streamResponse: any = await client.chat.completions.create({
              model,
              messages: [{ role: 'user', content: adjustPrompt }],
              stream: true,
            } as any);

            for await (const chunk of streamResponse as any) {
              const delta = chunk?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                streamed += delta;
                sendSse('delta', { content: delta });
              }
            }
            if (streamed.trim()) {
              newPlanContent = streamed.trim();
            }
          } else {
            const response = await client.chat.completions.create({
              model,
              messages: [{ role: 'user', content: adjustPrompt }],
            });
            newPlanContent = response.choices?.[0]?.message?.content?.trim() || plan.plan_content;
          }

          if (String(plan.plan_content || '').trim()) {
            savePlanHistorySnapshot(req.user.id, Number(unitId), String(plan.plan_content), 'note-adjust');
          }
          db.prepare('UPDATE study_plans SET plan_content = ?, adjust_count = COALESCE(adjust_count, 0) + 1, adjust_daily_count = CASE WHEN adjust_daily_date = ? THEN COALESCE(adjust_daily_count, 0) + 1 ELSE 1 END, adjust_daily_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newPlanContent, todayKey, todayKey, plan.id);

          savePlanFile(req.user.id, Number(unitId), newPlanContent);
          adjustApplied = true;
          adjustCount = currentDailyAdjustCount + 1;
          adjustedPlanContent = newPlanContent;
        }
      } else {
        adjustSkippedReason = '当前单元尚未生成学习计划，已仅保存笔记';
      }
    } catch (err) {
      console.error('Failed to adjust plan', err);
      adjustSkippedReason = '计划调整失败，已仅保存笔记';
    }

    const payload = {
      id: noteId,
      message: adjustApplied ? 'Note saved and plan adjusted' : 'Note saved',
      plan_adjusted: adjustApplied,
      plan_content: adjustedPlanContent || undefined,
      adjust_skipped_reason: adjustSkippedReason,
      adjust_count: adjustCount,
      adjust_count_scope: 'daily',
      max_adjust_count: MAX_PLAN_ADJUSTMENTS,
      remaining_adjust_count: Math.max(0, MAX_PLAN_ADJUSTMENTS - adjustCount)
    };

    if (wantsStream) {
      sendSse('final', payload);
      sendSse('done', { ok: true });
      closeSse();
      return;
    }

    res.json(payload);
  });

  // Grade Unit
  app.post('/api/grade/:unitId', authenticate, async (req: any, res: any) => {
    const { unitId } = req.params;
    const wantsStream = String(req.query?.stream || '') === '1' || String(req.headers.accept || '').includes('text/event-stream');
    const startedAt = Date.now();
    let promptBuildMs = 0;
    let aiElapsedMs = 0;
    let promptLength = 0;
    let filesCount = 0;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let streamEnded = false;
    let clientDisconnected = false;

    const sendSse = (event: string, payload: any) => {
      if (!wantsStream || streamEnded || clientDisconnected) return;
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (err) {
        clientDisconnected = true;
      }
    };

    const closeSse = () => {
      if (!wantsStream || streamEnded) return;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      streamEnded = true;
      if (clientDisconnected) return;
      try {
        res.end();
      } catch (err) {}
    };

    const respondError = (status: number, error: string) => {
      if (wantsStream) {
        sendSse('error', { error, status });
        closeSse();
        return;
      }
      res.status(status).json({ error });
    };

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }

      heartbeatTimer = setInterval(() => {
        sendSse('ping', { ts: Date.now() });
      }, 10000);

      req.on('aborted', () => {
        clientDisconnected = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });

      res.on('close', () => {
        clientDisconnected = true;
        streamEnded = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });

      sendSse('stage', { message: '评分请求已接收，正在准备材料...' });
    }

    console.log('[grade] request received unitId=%s user=%s', unitId, req.user?.id);

    const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(unitId) as any;
    if (!unit) return respondError(404, 'Unit not found');

    const latestNote = db.prepare('SELECT * FROM notes WHERE student_id = ? AND unit_id = ? ORDER BY created_at DESC LIMIT 1').get(req.user.id, unitId) as any;
    if (!latestNote) return respondError(400, 'No notes found for this unit');

    const plan = db.prepare('SELECT * FROM study_plans WHERE student_id = ? AND unit_id = ?').get(req.user.id, unitId) as any;

    try {
      const { client, model } = getAiClient();
      const normalizedLatestNote = withNoteFileUrls(latestNote);
      const noteFileUrls = parseNoteFileUrls(normalizedLatestNote);
      const basePrompt = prompts.gradeUnit(unit, plan, normalizedLatestNote);
      const noteAttachmentPaths = resolveAttachmentPathsFromUrls(noteFileUrls);
      const promptWithNoteFile = noteAttachmentPaths.length > 0
        ? `${basePrompt}\nFILES: ${noteAttachmentPaths.join(', ')}`
        : basePrompt;
      const promptBuildStartedAt = Date.now();
      const { prompt, files } = await buildPromptWithFiles(promptWithNoteFile, client);
      promptBuildMs = Date.now() - promptBuildStartedAt;
      promptLength = prompt.length;
      filesCount = files.length;
      sendSse('stage', { message: '评分提示词已构建，AI开始评分...' });

      const gradePrompt = prompt;
      const gradeMaxTokens = Number(process.env.AI_GRADE_MAX_TOKENS || 1800);
      const gradeRetryMaxTokens = Number(process.env.AI_GRADE_RETRY_MAX_TOKENS || 2600);

      const aiTimeoutMs = Number(process.env.AI_GRADE_TIMEOUT_MS || process.env.AI_TIMEOUT_MS || 120000);
      const aiIdleTimeoutMs = Number(process.env.AI_GRADE_IDLE_TIMEOUT_MS || 30000);
      const callAiWithTimeout = async (messages: any[], options?: { stream?: boolean; maxTokens?: number }) => {
        const shouldStream = options?.stream ?? wantsStream;
        const effectiveMaxTokens = Number(options?.maxTokens || gradeMaxTokens);
        const requestBody: any = {
          model,
          messages,
          max_tokens: effectiveMaxTokens,
          thinking: { type: 'disabled' },
        };

        if (!shouldStream) {
          let timeoutId: NodeJS.Timeout | null = null;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('AI_REQUEST_TIMEOUT')), aiTimeoutMs);
          });
          try {
            return await Promise.race([
              client.chat.completions.create(requestBody),
              timeoutPromise
            ]);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }

        const streamRequestBody: any = { ...requestBody, stream: true };
        const streamResponse: any = await client.chat.completions.create(streamRequestBody);

        let raw = '';
        let lastFinishReason: string | null = null;
        let totalTimer: NodeJS.Timeout | null = null;
        const totalTimeoutPromise = new Promise<never>((_, reject) => {
          totalTimer = setTimeout(() => reject(new Error('AI_REQUEST_TIMEOUT')), aiTimeoutMs);
        });
        const iterator = (streamResponse as any)[Symbol.asyncIterator]();

        try {
          while (true) {
            let idleTimer: NodeJS.Timeout | null = null;
            const idleTimeoutPromise = new Promise<never>((_, reject) => {
              idleTimer = setTimeout(() => reject(new Error('AI_IDLE_TIMEOUT')), aiIdleTimeoutMs);
            });

            let nextResult: any;
            try {
              nextResult = await Promise.race([
                iterator.next(),
                idleTimeoutPromise,
                totalTimeoutPromise
              ]);
            } finally {
              if (idleTimer) clearTimeout(idleTimer);
            }

            if (nextResult?.done) break;
            const chunk = nextResult.value;
            const delta = chunk?.choices?.[0]?.delta?.content;
            const finishReason = chunk?.choices?.[0]?.finish_reason;
            if (typeof finishReason === 'string' && finishReason) {
              lastFinishReason = finishReason;
            }
            if (typeof delta === 'string' && delta.length > 0) {
              raw += delta;
              sendSse('delta', { content: delta });
            }
          }
          return {
            choices: [{ message: { content: raw }, finish_reason: lastFinishReason }]
          };
        } finally {
          if (totalTimer) clearTimeout(totalTimer);
        }
      };

      const aiStartedAt = Date.now();
      let response: any;
      try {
        response = await callAiWithTimeout([{ role: 'user', content: gradePrompt }]);
      } finally {
        aiElapsedMs += Date.now() - aiStartedAt;
      }

      let raw = response.choices?.[0]?.message?.content || '';
      const firstFinishReason = String(response?.choices?.[0]?.finish_reason || '');
      let result: any = parseGradeResult(raw);

      if (!result) {
        sendSse('stage', { message: firstFinishReason === 'length' ? '评分内容过长，正在自动补全并重试...' : '评分结果格式异常，正在自动修复...' });
        const repairPrompt = prompts.gradeRepair();
        const retryStartedAt = Date.now();
        let retryResponse: any;
        const repairAssistantRaw = String(raw || '（空响应）').slice(0, 6000);
        try {
          retryResponse = await callAiWithTimeout([
            { role: 'user', content: gradePrompt },
            { role: 'assistant', content: repairAssistantRaw },
            { role: 'user', content: repairPrompt }
          ], { stream: false, maxTokens: gradeRetryMaxTokens });
        } finally {
          aiElapsedMs += Date.now() - retryStartedAt;
        }
        raw = retryResponse.choices?.[0]?.message?.content || raw;
        result = parseGradeResult(raw);
      }

      if (!result) {
        throw new Error('AI 返回的内容不是有效的 JSON');
      }

      const gradeValue = result.grade;
      const feedbackValue = typeof result.feedback === 'string' ? result.feedback.trim() : '';
      const gradeText = typeof gradeValue === 'number' ? String(gradeValue) : String(gradeValue || '').trim();

      if (!gradeText || !feedbackValue) {
        throw new Error('AI 评分结果缺少 grade 或 feedback 字段');
      }

      db.prepare('UPDATE notes SET grade = ?, feedback = ? WHERE id = ?').run(gradeText, feedbackValue, latestNote.id);
      const elapsedMs = Date.now() - startedAt;
      console.log('[grade] success total_ms=%d prompt_build_ms=%d ai_elapsed_ms=%d prompt_length=%d files=%d unitId=%s user=%s', elapsedMs, promptBuildMs, aiElapsedMs, promptLength, filesCount, unitId, req.user?.id);
      const payload = { grade: gradeText, feedback: feedbackValue, prompt_preview: prompt, files_used: files, ai_raw: raw };
      if (wantsStream) {
        sendSse('final', payload);
        sendSse('done', { ok: true });
        closeSse();
        return;
      }
      res.json(payload);
    } catch (err: any) {
      const isTimeout = err?.message === 'AI_REQUEST_TIMEOUT' || err?.message === 'AI_IDLE_TIMEOUT';
      const status = isTimeout ? 504 : 500;
      const message = isTimeout ? 'AI grading timed out. Please try again.' : err?.message || '评分失败';
      const elapsedMs = Date.now() - startedAt;
      console.error('[grade] error total_ms=%d prompt_build_ms=%d ai_elapsed_ms=%d prompt_length=%d files=%d unitId=%s user=%s message=%s', elapsedMs, promptBuildMs, aiElapsedMs, promptLength, filesCount, unitId, req.user?.id, message, err);
      respondError(status, message);
    }
  });

  // AI Assistant Chat
  app.post('/api/ai/chat', authenticate, async (req: any, res: any) => {
    const { question, context, unitId, displayedPlan, displayedPlanMeta } = req.body;
    const wantsStream = String(req.query?.stream || '') === '1' || String(req.headers.accept || '').includes('text/event-stream');
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let streamEnded = false;
    let clientDisconnected = false;

    const sendSse = (event: string, payload: any) => {
      if (!wantsStream || streamEnded || clientDisconnected) return;
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (err) {
        clientDisconnected = true;
      }
    };

    const closeSse = () => {
      if (!wantsStream || streamEnded) return;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      streamEnded = true;
      if (clientDisconnected) return;
      try {
        res.end();
      } catch (err) {}
    };

    const respondError = (status: number, error: string) => {
      if (wantsStream) {
        sendSse('error', { error, status });
        closeSse();
        return;
      }
      res.status(status).json({ error });
    };

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }

      heartbeatTimer = setInterval(() => {
        sendSse('ping', { ts: Date.now() });
      }, 10000);

      req.on('aborted', () => {
        clientDisconnected = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });

      res.on('close', () => {
        clientDisconnected = true;
        streamEnded = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });

      sendSse('stage', { message: '正在组织问题上下文...' });
    }

    try {
      const { client, model } = getAiClient();
      let latestNoteContext = '';
      let latestPlanContext = '';
      let currentUnitContext = '';
      if (unitId) {
        const latestNote = db.prepare('SELECT content, file_url, file_urls, created_at FROM notes WHERE student_id = ? AND unit_id = ? ORDER BY created_at DESC LIMIT 1').get(req.user.id, unitId) as any;
        if (latestNote) {
          const noteFileUrls = parseNoteFileUrls(latestNote);
          latestNoteContext = `\n【该学生在本单元最新一次笔记（后端实时读取）】\n提交时间：${latestNote.created_at || '未知'}\n笔记内容：${latestNote.content || '无'}\n是否有附件：${noteFileUrls.length > 0 ? `是（共${noteFileUrls.length}份：${noteFileUrls.join('、')}）` : '否'}\n`;
        } else {
          latestNoteContext = `\n【该学生在本单元最新一次笔记（后端实时读取）】\n当前无笔记记录。\n`;
        }

        if (String(displayedPlan || '').trim()) {
          latestPlanContext = `\n【当前页面正在展示的学习计划（前端传入）】\n展示版本：${displayedPlanMeta || '未标注'}\n计划内容：${displayedPlan}\n`;
        } else {
          const latestPlan = db.prepare('SELECT plan_content, updated_at FROM study_plans WHERE student_id = ? AND unit_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1').get(req.user.id, unitId) as any;
          latestPlanContext = latestPlan
            ? `\n【该学生在本单元当前学习计划（后端实时读取）】\n计划更新时间：${latestPlan.updated_at || '未知'}\n计划内容：${latestPlan.plan_content || '无'}\n`
            : `\n【该学生在本单元当前学习计划（后端实时读取）】\n当前无学习计划记录。\n`;
        }

        const currentUnit = db.prepare('SELECT title, week_range, description, objectives, resources FROM units WHERE id = ?').get(unitId) as any;
        if (currentUnit) {
          currentUnitContext = `\n【当前单元基础信息（后端实时读取）】\n单元名称：${currentUnit.title || '未知'}\n周次：${currentUnit.week_range || '未知'}\n描述：${currentUnit.description || '无'}\n目标：${currentUnit.objectives || '无'}\n资源：${currentUnit.resources || '[]'}\n`;
        }
      }

      const mergedContext = `${context || ''}${currentUnitContext}${latestPlanContext}${latestNoteContext}`;
      const latestAttachmentNote = unitId
        ? db.prepare('SELECT file_url, file_urls FROM notes WHERE student_id = ? AND unit_id = ? ORDER BY created_at DESC LIMIT 1').get(req.user.id, unitId) as any
        : null;
      const latestAttachmentFiles = latestAttachmentNote
        ? resolveAttachmentPathsFromUrls(parseNoteFileUrls(latestAttachmentNote))
        : [];
      const outlinePathCandidates = unitId
        ? [
            path.join(DATA_DIR, `admin/plan_unit/unit${unitId}/计算机视觉大纲_${unitId}.md`),
            path.join(DATA_DIR, `admin/unit_plan/unit${unitId}/计算机视觉大纲_${unitId}.md`),
            path.join(process.cwd(), `data/admin/plan_unit/unit${unitId}/计算机视觉大纲_${unitId}.md`),
            path.join(process.cwd(), `data/admin/unit_plan/unit${unitId}/计算机视觉大纲_${unitId}.md`),
          ]
        : [];
      const outlinePath = outlinePathCandidates.find(candidate => fs.existsSync(candidate)) || null;
      const basePrompt = prompts.qaAssistant(mergedContext, question);
      const filesForPrompt = [...latestAttachmentFiles, outlinePath].filter(Boolean) as string[];
      const promptWithAttachment = filesForPrompt.length > 0 ? `${basePrompt}\nFILES: ${filesForPrompt.join(', ')}` : basePrompt;
      sendSse('stage', { message: '正在读取附件并生成回答...' });
      const { prompt, files } = await buildPromptWithFiles(promptWithAttachment, client);

      if (wantsStream) {
        let aiRaw = '';
        const streamResponse: any = await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        } as any);

        for await (const chunk of streamResponse as any) {
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            aiRaw += delta;
            sendSse('delta', { content: delta });
          }
        }

        const answer = aiRaw.trim();
        sendSse('final', { answer, prompt_preview: prompt, files_used: files, ai_raw: aiRaw });
        sendSse('done', { ok: true });
        closeSse();
        return;
      }

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
      });

      const answer = response.choices?.[0]?.message?.content?.trim() || '';
      const ai_raw = response.choices?.[0]?.message?.content || '';
      res.json({ answer, prompt_preview: prompt, files_used: files, ai_raw });
    } catch (err: any) {
      respondError(500, err.message);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const distIndexFile = path.join(distDir, 'index.html');
    if (fs.existsSync(distIndexFile)) {
      app.use(express.static(distDir));
      app.get('*', (req, res) => {
        res.sendFile(distIndexFile);
      });
    } else {
      app.get('*', (req, res) => {
        res.status(404).json({ error: 'Not found' });
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
