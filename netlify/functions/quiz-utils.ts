import fs from 'fs';
import path from 'path';

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export type ParsedQuestion = {
  id: string;
  difficulty: QuizDifficulty;
  sourceNumber: number;
  prompt: string;
  options: Record<string, string>;
};

export type QuizQuestion = ParsedQuestion & {
  correctAnswer: string;
  explanation: string;
};

const QUIZ_COUNT_BY_LEVEL: Record<QuizDifficulty, number> = {
  easy: 4,
  medium: 3,
  hard: 3,
};

const getQuizRootCandidates = () => {
  const dataDir = process.env.DATA_DIR || '/data';
  return [
    path.join(dataDir, 'admin', 'quiz'),
    path.join(process.cwd(), 'data', 'admin', 'quiz')
  ];
};

const resolveUnitQuizDir = (unitId: number) => {
  for (const root of getQuizRootCandidates()) {
    const candidate = path.join(root, `unit${unitId}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(getQuizRootCandidates()[0], `unit${unitId}`);
};

const parseQuestionBlocks = (content: string) => {
  const lines = String(content || '').replace(/\r/g, '').split('\n');
  const blocks: { number: number; lines: string[] }[] = [];
  let current: { number: number; lines: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine || '';
    const matched = line.match(/^\s*(\d+)\.\s*(.*)$/);
    if (matched) {
      if (current) blocks.push(current);
      current = { number: Number(matched[1]), lines: [String(matched[2] || '').trim()] };
      continue;
    }

    if (!current) continue;
    current.lines.push(line);
  }

  if (current) blocks.push(current);
  return blocks;
};

const parseOptionsFromLines = (lines: string[]) => {
  const options: Record<string, string> = {};
  const promptLines: string[] = [];
  let currentOptionKey = '';

  for (const rawLine of lines) {
    const line = String(rawLine || '');
    const optionMatch = line.match(/^\s*([A-Z])[\.、:：]\s*(.*)$/);
    if (optionMatch) {
      currentOptionKey = optionMatch[1].toUpperCase();
      options[currentOptionKey] = String(optionMatch[2] || '').trim();
      continue;
    }

    if (currentOptionKey && line.trim()) {
      options[currentOptionKey] = `${options[currentOptionKey]} ${line.trim()}`.trim();
      continue;
    }

    if (!Object.keys(options).length) {
      promptLines.push(line);
    }
  }

  return {
    prompt: promptLines.join('\n').trim(),
    options,
  };
};

const parseQuestionBank = (content: string, difficulty: QuizDifficulty) => {
  const blocks = parseQuestionBlocks(content);
  return blocks.map((block) => {
    const parsed = parseOptionsFromLines(block.lines);
    return {
      id: `${difficulty}-${block.number}`,
      difficulty,
      sourceNumber: block.number,
      prompt: parsed.prompt,
      options: parsed.options,
    } as ParsedQuestion;
  }).filter((q) => q.prompt && Object.keys(q.options).length > 0);
};

const parseAnswerBank = (content: string) => {
  const answerMap = new Map<number, { answer: string; explanation: string }>();
  const regex = /(\d+)\.\s*\*\*答案[：:]\s*([A-Z])\*\*(?:\s*-\s*([\s\S]*?))?(?=\n\s*\d+\.\s*\*\*答案|$)/g;

  let matched: RegExpExecArray | null = null;
  while ((matched = regex.exec(String(content || ''))) !== null) {
    const sourceNumber = Number(matched[1]);
    const answer = String(matched[2] || '').trim().toUpperCase();
    const explanation = String(matched[3] || '').trim();
    if (sourceNumber > 0 && answer) {
      answerMap.set(sourceNumber, { answer, explanation });
    }
  }

  return answerMap;
};

const randomPick = <T>(items: T[], count: number) => {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned.slice(0, count);
};

const loadLevelQuestions = (unitQuizDir: string, difficulty: QuizDifficulty) => {
  const questionFilePath = path.join(unitQuizDir, `${difficulty}.md`);
  const answerFilePath = path.join(unitQuizDir, `${difficulty}_ans.md`);

  if (!fs.existsSync(questionFilePath)) {
    throw new Error(`未找到题库文件：${questionFilePath}`);
  }
  if (!fs.existsSync(answerFilePath)) {
    throw new Error(`未找到答案文件：${answerFilePath}`);
  }

  const questionMarkdown = fs.readFileSync(questionFilePath, 'utf-8');
  const answerMarkdown = fs.readFileSync(answerFilePath, 'utf-8');

  const parsedQuestions = parseQuestionBank(questionMarkdown, difficulty);
  const answerMap = parseAnswerBank(answerMarkdown);

  const quizQuestions: QuizQuestion[] = parsedQuestions.map((question) => {
    const answer = answerMap.get(question.sourceNumber);
    if (!answer) {
      throw new Error(`${difficulty} 题库第 ${question.sourceNumber} 题缺少答案`);
    }
    return {
      ...question,
      correctAnswer: answer.answer,
      explanation: answer.explanation,
    };
  });

  const requiredCount = QUIZ_COUNT_BY_LEVEL[difficulty];
  if (quizQuestions.length < requiredCount) {
    throw new Error(`${difficulty} 题库题量不足，至少需要 ${requiredCount} 题`);
  }

  return randomPick(quizQuestions, requiredCount);
};

export const buildRandomQuizForUnit = (unitId: number) => {
  const unitQuizDir = resolveUnitQuizDir(unitId);
  const easy = loadLevelQuestions(unitQuizDir, 'easy');
  const medium = loadLevelQuestions(unitQuizDir, 'medium');
  const hard = loadLevelQuestions(unitQuizDir, 'hard');

  const all = [...easy, ...medium, ...hard];
  const shuffled = randomPick(all, all.length);

  return {
    quizDir: unitQuizDir,
    questions: shuffled,
    totalQuestions: shuffled.length,
  };
};

export const sanitizeQuizForStudent = (questions: QuizQuestion[]) => {
  return questions.map((question) => ({
    id: question.id,
    difficulty: question.difficulty,
    sourceNumber: question.sourceNumber,
    prompt: question.prompt,
    options: question.options,
  }));
};
