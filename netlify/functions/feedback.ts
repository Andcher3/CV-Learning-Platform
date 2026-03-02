import { Config } from "@netlify/functions";
import db from './db';
import { authenticate } from './utils';

export default async (req: Request) => {
  const url = new URL(req.url);

  let user;
  try {
    user = authenticate(req);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 401 });
  }

  if (req.method === 'POST' && url.pathname === '/api/feedback') {
    const { content } = await req.json();
    const text = String(content || '').trim();

    if (!text) {
      return new Response(JSON.stringify({ error: '反馈内容不能为空' }), { status: 400 });
    }

    const result = db.prepare('INSERT INTO feedbacks (student_id, content) VALUES (?, ?)').run(user.id, text);
    return new Response(JSON.stringify({ id: result.lastInsertRowid, message: '反馈提交成功' }));
  }

  return new Response('Not found', { status: 404 });
};

export const config: Config = {
  path: "/api/feedback*"
};
