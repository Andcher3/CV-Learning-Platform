import { Config } from "@netlify/functions";
import db from './db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate } from './utils';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export default async (req: Request) => {
  const url = new URL(req.url);
  
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const { username, password } = await req.json();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    return new Response(JSON.stringify({ token, user: { id: user.id, username: user.username, role: user.role } }));
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    try {
      const user = authenticate(req);
      if (user.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
      
      const { username, password } = await req.json();
      const hash = bcrypt.hashSync(password, 10);
      const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash);
      return new Response(JSON.stringify({ id: result.lastInsertRowid, username }));
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'User already exists' }), { status: 400 });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/change-password') {
    try {
      const user = authenticate(req);
      const { oldPassword, newPassword } = await req.json();

      if (!oldPassword || !newPassword) {
        return new Response(JSON.stringify({ error: '请输入旧密码和新密码' }), { status: 400 });
      }

      if (String(newPassword).length < 6) {
        return new Response(JSON.stringify({ error: '新密码至少需要6位' }), { status: 400 });
      }

      const currentUser = db.prepare('SELECT id, password FROM users WHERE id = ?').get(user.id) as any;
      if (!currentUser) {
        return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404 });
      }

      const oldPasswordMatched = bcrypt.compareSync(oldPassword, currentUser.password);
      if (!oldPasswordMatched) {
        return new Response(JSON.stringify({ error: '旧密码不正确' }), { status: 400 });
      }

      const newPasswordHash = bcrypt.hashSync(newPassword, 10);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(newPasswordHash, user.id);
      return new Response(JSON.stringify({ success: true, message: '密码修改成功' }));
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || '修改密码失败' }), { status: 400 });
    }
  }

  return new Response('Not found', { status: 404 });
};

export const config: Config = {
  path: "/api/auth/*"
};
