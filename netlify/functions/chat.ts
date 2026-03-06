import { Config } from "@netlify/functions";
import { authenticate, getAiClient, buildPromptWithFiles } from './utils';
import { prompts } from '../../server/prompts';
import db from './db';
import path from 'path';

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

const resolveAttachmentPathsFromUrls = (fileUrls: string[]) => {
  const dataDir = process.env.DATA_DIR || '/data';
  const notesDir = path.join(dataDir, 'notes');
  const uploadsDir = process.env.UPLOADS_DIR || path.join(dataDir, 'uploads');
  return fileUrls
    .map((url) => {
      const normalized = String(url || '').trim();
      if (!normalized) return null;
      if (normalized.startsWith('/notes/')) return path.join(notesDir, path.basename(normalized));
      if (normalized.startsWith('/uploads/')) return path.join(uploadsDir, path.basename(normalized));
      return null;
    })
    .filter(Boolean) as string[];
};

export default async (req: Request) => {
  const url = new URL(req.url);
  let user;
  try {
    user = authenticate(req);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 401 });
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/chat') {
    const { question, context, unitId } = await req.json();
    try {
      const { client, model } = getAiClient();
      let latestNoteContext = '';
      if (unitId) {
        const latestNote = db.prepare('SELECT content, file_url, file_urls, created_at FROM notes WHERE student_id = ? AND unit_id = ? ORDER BY created_at DESC LIMIT 1').get(user.id, unitId) as any;
        if (latestNote) {
          const noteFileUrls = parseNoteFileUrls(latestNote);
          latestNoteContext = `\n【该学生在本单元最新一次笔记（后端实时读取）】\n提交时间：${latestNote.created_at || '未知'}\n笔记内容：${latestNote.content || '无'}\n是否有附件：${noteFileUrls.length > 0 ? `是（共${noteFileUrls.length}份：${noteFileUrls.join('、')}）` : '否'}\n`;
        } else {
          latestNoteContext = `\n【该学生在本单元最新一次笔记（后端实时读取）】\n当前无笔记记录。\n`;
        }
      }

      const mergedContext = `${context || ''}${latestNoteContext}`;
      const latestAttachmentNote = unitId
        ? db.prepare('SELECT file_url, file_urls FROM notes WHERE student_id = ? AND unit_id = ? ORDER BY created_at DESC LIMIT 1').get(user.id, unitId) as any
        : null;
      const latestAttachmentFiles = latestAttachmentNote
        ? resolveAttachmentPathsFromUrls(parseNoteFileUrls(latestAttachmentNote))
        : [];
      const basePrompt = prompts.qaAssistant(mergedContext, question);
      const promptWithAttachment = latestAttachmentFiles.length > 0
        ? `${basePrompt}\nFILES: ${latestAttachmentFiles.join(', ')}`
        : basePrompt;
      const { prompt, files } = await buildPromptWithFiles(promptWithAttachment, client);

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
      });

      const answer = response.choices?.[0]?.message?.content?.trim() || '';
      const ai_raw = response.choices?.[0]?.message?.content || '';
      return new Response(JSON.stringify({ answer, prompt_preview: prompt, files_used: files, ai_raw }));
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response('Not found', { status: 404 });
};

export const config: Config = {
  path: "/api/ai/chat"
};
