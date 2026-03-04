import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs'; // 🌟 新增：引入文件系统模块

// 优先读取显式配置；否则在 Linux 容器默认使用 /data 持久化目录，Windows 本地开发回退到工作目录
const defaultDataDir = process.platform === 'win32' ? process.cwd() : '/data';
const dbPath = process.env.DATABASE_PATH || process.env.DB_PATH || path.join(process.env.DATA_DIR || defaultDataDir, 'database.sqlite');

// 🌟 新增：确保 /data 这样的持久化目录已经被创建，防止 SQLite 找不到文件夹而报错
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log('[db] sqlite path:', dbPath);

const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student'
  );

  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    week_range TEXT NOT NULL,
    description TEXT NOT NULL,
    objectives TEXT NOT NULL,
    resources TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS study_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    plan_content TEXT NOT NULL,
    generate_count INTEGER NOT NULL DEFAULT 0,
    adjust_count INTEGER NOT NULL DEFAULT 0,
    adjust_daily_count INTEGER NOT NULL DEFAULT 0,
    adjust_daily_date TEXT,
    pretest_answer TEXT,
    pretest_submitted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(unit_id) REFERENCES units(id)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    week TEXT NOT NULL,
    content TEXT NOT NULL,
    file_url TEXT,
    grade TEXT,
    feedback TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(unit_id) REFERENCES units(id)
  );

  CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    admin_reply TEXT,
    replied_by INTEGER,
    replied_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(replied_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS progress_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    day_key TEXT NOT NULL,
    status TEXT NOT NULL,
    lag_days INTEGER NOT NULL DEFAULT 0,
    should_remind INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    suggestion TEXT,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    trigger_source TEXT NOT NULL DEFAULT 'daily-auto',
    course_weekday TEXT,
    plan_id INTEGER,
    note_id INTEGER,
    detail_json TEXT,
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(plan_id) REFERENCES study_plans(id),
    FOREIGN KEY(note_id) REFERENCES notes(id)
  );

  CREATE TABLE IF NOT EXISTS study_plan_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    plan_content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'unknown',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(unit_id) REFERENCES units(id)
  );

  CREATE TABLE IF NOT EXISTS quiz_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    assigned_by INTEGER NOT NULL,
    quiz_payload TEXT NOT NULL,
    answer_key TEXT NOT NULL,
    student_answers TEXT,
    grading_detail TEXT,
    total_questions INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER,
    score INTEGER,
    submitted_at DATETIME,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(unit_id) REFERENCES units(id),
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(assigned_by) REFERENCES users(id)
  );
`);

// Add columns if they don't exist (for existing db)
try {
  db.exec("ALTER TABLE units ADD COLUMN resources TEXT DEFAULT '[]'");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE notes ADD COLUMN file_url TEXT");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE study_plans ADD COLUMN generate_count INTEGER NOT NULL DEFAULT 0");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE study_plans ADD COLUMN adjust_count INTEGER NOT NULL DEFAULT 0");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE study_plans ADD COLUMN adjust_daily_count INTEGER NOT NULL DEFAULT 0");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE study_plans ADD COLUMN adjust_daily_date TEXT");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE study_plans ADD COLUMN pretest_answer TEXT");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE study_plans ADD COLUMN pretest_submitted_at DATETIME");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE quiz_assignments ADD COLUMN student_answers TEXT");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE quiz_assignments ADD COLUMN grading_detail TEXT");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE quiz_assignments ADD COLUMN total_questions INTEGER NOT NULL DEFAULT 0");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE quiz_assignments ADD COLUMN correct_count INTEGER");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE quiz_assignments ADD COLUMN score INTEGER");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE quiz_assignments ADD COLUMN submitted_at DATETIME");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE quiz_assignments ADD COLUMN expires_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE quiz_assignments ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE feedbacks ADD COLUMN admin_reply TEXT");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE feedbacks ADD COLUMN replied_by INTEGER");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE feedbacks ADD COLUMN replied_at DATETIME");
} catch (e) {
  // Column might already exist
}

// Seed default admin and units if empty
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
}

const defaultSettings = [
  { key: 'ai_api_key', value: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || 'sk-mnVcHeOzlSwmJ2zO4n8hFdR1E9jyOUjZMmy5HrzByC8uaKRb' },
  { key: 'ai_base_url', value: process.env.AI_BASE_URL || 'https://api.moonshot.cn/v1' },
  { key: 'ai_model', value: process.env.AI_MODEL || 'kimi-k2.5' },
  { key: 'ai_config_mode', value: 'default' }
];
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const s of defaultSettings) {
  insertSetting.run(s.key, s.value);
}

const fillEmptySetting = db.prepare(`
  UPDATE settings
  SET value = ?
  WHERE key = ? AND (value IS NULL OR TRIM(value) = '')
`);
for (const s of defaultSettings) {
  fillEmptySetting.run(s.value, s.key);
}

const unitResourcePatches: Record<number, { objectives: string; resources: string }> = {
  3: {
    objectives: '掌握针孔相机模型、内参/外参与相机标定基本方法，能够运行标定代码并输出相机内参矩阵。',
    resources: JSON.stringify([
      { title: '鲁鹏计算机视觉：第6讲 相机模型（B站检索）', url: '', description: '关键词：北京邮电大学 计算机视觉 鲁鹏 第6讲 相机模型' },
      { title: '鲁鹏计算机视觉：第7讲前半 相机标定（B站检索）', url: '', description: '关键词：北京邮电大学 计算机视觉 鲁鹏 第7讲 相机标定' },
      { title: 'Programming Computer Vision with Python（第4章）', url: 'http://programmingcomputervision.com/', description: '运行相机标定代码并输出相机内参矩阵' },
      { title: 'OpenCV 相机标定官方教程', url: 'https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html' },
      { title: 'Computer Vision: Algorithms and Applications（第2章）', url: 'http://szeliski.org/Book/' }
    ])
  },
  4: {
    objectives: '系统掌握多层感知机、反向传播与卷积神经网络核心机制，能够完成基础神经网络训练与验证。',
    resources: JSON.stringify([
      { title: 'D2L：多层感知机', url: 'https://zh.d2l.ai/chapter_multilayer-perceptrons/index.html' },
      { title: 'D2L：卷积神经网络', url: 'https://zh.d2l.ai/chapter_convolutional-neural-networks/index.html' },
      { title: 'MLP 讲解视频（B站）', url: 'https://www.bilibili.com/video/BV1L64y1m7Nh/' },
      { title: '反向传播讲解视频（B站）', url: 'https://www.bilibili.com/video/BV1Th411U7UN/' },
      { title: '卷积神经网络讲解视频（B站）', url: 'https://www.bilibili.com/video/BV1MB4y1F7of/' },
      { title: '卷积层原理补充（B站）', url: 'https://www.bilibili.com/video/BV1EV411j7nX/' },
      { title: 'CNN 实战示例（B站）', url: 'https://www.bilibili.com/video/BV1t44y1r7ct/' },
      { title: '训练技巧补充（B站）', url: 'https://www.bilibili.com/video/BV1hh411U7gn/' }
    ])
  },
  5: {
    objectives: '掌握自注意力与多头注意力机制，理解 Transformer/ViT 关键结构并完成基础视觉分类实践。',
    resources: JSON.stringify([
      { title: '李宏毅课程主页（2021）', url: 'https://speech.ee.ntu.edu.tw/~hylee/ml/2021-spring.php' },
      { title: 'The Illustrated Transformer', url: 'https://jalammar.github.io/illustrated-transformer/' },
      { title: 'Transformer 原始论文', url: 'https://arxiv.org/abs/1706.03762' },
      { title: 'BERT 论文', url: 'https://arxiv.org/abs/1810.04805' },
      { title: 'ViT 论文', url: 'https://arxiv.org/abs/2010.11929' },
      { title: 'DeiT 论文', url: 'https://arxiv.org/abs/2012.12877', description: '如访问异常可检索 DeiT arXiv' },
      { title: 'Swin Transformer 论文', url: 'https://arxiv.org/abs/2103.14030', description: '如访问异常可检索 Swin Transformer arXiv' },
      { title: 'Transformer-XL 论文', url: 'https://arxiv.org/abs/1901.02860', description: '如访问异常可检索 Transformer-XL arXiv' },
      { title: 'HuggingFace Transformers 文档', url: 'https://huggingface.co/docs/transformers/index' },
      { title: 'HuggingFace Transformers 仓库', url: 'https://github.com/huggingface/transformers' },
      { title: 'ViT PyTorch 实现', url: 'https://github.com/lucidrains/vit-pytorch' },
      { title: 'Transformer-XL 代码', url: 'https://github.com/kimiyoung/transformer-xl' },
      { title: 'Transformer 讲解视频（B站）', url: 'https://www.bilibili.com/video/BV1AF411b7xQ' },
      { title: 'ViT 讲解视频（B站）', url: 'https://www.bilibili.com/video/BV13L4y1475U' },
      { title: 'Transformer 实战视频（B站）', url: 'https://www.bilibili.com/video/BV15P4y137jb' },
      { title: '注意力机制补充（B站）', url: 'https://www.bilibili.com/video/BV1PL411M7eQ' },
      { title: 'Transformer 细节补充（B站）', url: 'https://www.bilibili.com/video/BV1bK411e7fd' },
      { title: 'ViT 实验演示（B站）', url: 'https://www.bilibili.com/video/BV1pu411o7BE/' }
    ])
  },
  6: {
    objectives: '理解目标检测中的边界框、锚框、NMS与SSD框架，能够完成基础检测推理与可视化。',
    resources: JSON.stringify([
      { title: 'D2L：边界框', url: 'https://zh.d2l.ai/chapter_computer-vision/bounding-box.html' },
      { title: 'D2L：锚框', url: 'https://zh.d2l.ai/chapter_computer-vision/anchor.html' },
      { title: 'D2L：多尺度目标检测', url: 'https://zh.d2l.ai/chapter_computer-vision/multiscale-object-detection.html' },
      { title: 'D2L：SSD', url: 'https://zh.d2l.ai/chapter_computer-vision/ssd.html' },
      { title: 'SSD 原始实现（Caffe）', url: 'https://github.com/weiliu89/caffe/tree/ssd' },
      { title: 'NMS 原理详解', url: 'https://zhuanlan.zhihu.com/p/5119830621' },
      { title: '目标检测基础视频（B站）', url: 'https://www.bilibili.com/video/BV1Db4y1C71g' },
      { title: '锚框与回归视频（B站）', url: 'https://www.bilibili.com/video/BV1Lh411Y7LX' },
      { title: 'SSD 讲解视频（B站）', url: 'https://www.bilibili.com/video/BV1ZX4y1c7Sw' },
      { title: '检测实战视频（B站）', url: 'https://www.bilibili.com/video/BV1aB4y1K7za' },
      { title: 'NMS 细节视频（B站）', url: 'https://www.bilibili.com/video/BV1fT4y1L7Gi' }
    ])
  },
  7: {
    objectives: '理解 DETR 与匈牙利匹配的核心思想，能够使用 DETR 模型对图片进行端到端目标检测并可视化结果。',
    resources: JSON.stringify([
      { title: 'DETR 论文', url: 'https://arxiv.org/pdf/2005.12872' },
      { title: 'DETR 官方代码', url: 'https://github.com/facebookresearch/detr' },
      { title: 'HuggingFace DETR 文档', url: 'https://huggingface.co/docs/transformers/model_doc/detr' },
      { title: 'DETR 讲解视频（B站）', url: 'https://www.bilibili.com/video/BV1GB4y1X72R' },
      { title: 'DETR 实战视频（B站）', url: 'https://www.bilibili.com/video/BV1w61kY1EVo' }
    ])
  },
  8: {
    objectives: '系统掌握语义分割基础、转置卷积与FCN关键原理，能够复现语义分割模型并完成训练优化实践。',
    resources: JSON.stringify([
      { title: '语义分割综述论文', url: 'https://arxiv.org/abs/2001.05566' },
      { title: '图像分割基础讲解视频', url: 'https://www.bilibili.com/video/BV1BK4y1M7Rd/' },
      { title: '转置卷积详解（A guide to convolution arithmetic）', url: 'https://arxiv.org/abs/1603.07285' },
      { title: '转置卷积动画演示', url: 'https://github.com/vdumoulin/conv_arithmetic' },
      { title: 'FCN 原始论文', url: 'https://arxiv.org/abs/1411.4038' },
      { title: 'FCN 代码解读视频', url: 'https://www.bilibili.com/video/BV1Jh411Y7WQ/?vd_source=70900f2568559f2a6ea1e31fedb1175b' },
      { title: 'FCN 官方代码', url: 'https://github.com/shelhamer/fcn.berkeleyvision.org' },
      { title: 'PyTorch 语义分割实战教程', url: 'https://github.com/CSAILVision/semantic-segmentation-pytorch' }
    ])
  },
  9: {
    objectives: '理解 GAN 与 VAE 核心机制，掌握典型生成模型训练思路并能运行/对比主流生成模型实现。',
    resources: JSON.stringify([
      { title: 'GAN 原始论文', url: 'https://arxiv.org/abs/1406.2661' },
      { title: 'VAE 论文（Auto-Encoding Variational Bayes）', url: 'https://arxiv.org/abs/1312.6114' },
      { title: 'WGAN 论文', url: 'https://arxiv.org/abs/1701.07875' },
      { title: 'Progressive GAN 论文', url: 'https://arxiv.org/abs/1711.00937' },
      { title: 'StyleGAN 论文', url: 'https://arxiv.org/abs/1812.04948', description: '如访问异常可检索 StyleGAN arXiv' },
      { title: 'StyleGAN2 论文', url: 'https://arxiv.org/abs/1912.04958', description: '如访问异常可检索 StyleGAN2 arXiv' },
      { title: 'VQ-VAE 论文', url: 'https://arxiv.org/abs/1711.00937', description: '可结合文档中的VAE扩展阅读' },
      { title: 'GAN Hacks', url: 'https://github.com/soumith/ganhacks' },
      { title: 'PyTorch GAN Zoo', url: 'https://github.com/facebookresearch/pytorch_GAN_zoo' },
      { title: 'CycleGAN/Pix2Pix', url: 'https://github.com/junyanz/pytorch-CycleGAN-and-pix2pix' },
      { title: 'VAE 代码示例', url: 'https://github.com/altosaar/vae' }
    ])
  },
  10: {
    objectives: '掌握神经风格迁移核心理论与实现方法，能够完成风格迁移复现并了解快速迁移与域迁移扩展。',
    resources: JSON.stringify([
      { title: 'Neural Style 论文', url: 'https://arxiv.org/abs/1508.06576' },
      { title: 'Instance Normalization 论文', url: 'https://arxiv.org/abs/1607.08022', description: '如访问异常可检索 Instance Normalization arXiv' },
      { title: 'AdaIN 论文', url: 'https://arxiv.org/abs/1703.06868' },
      { title: 'WCT 风格迁移论文', url: 'https://arxiv.org/abs/1705.08086', description: '如访问异常可检索 Universal Style Transfer arXiv' },
      { title: 'Fast Style Transfer 论文', url: 'https://arxiv.org/abs/1603.08155' },
      { title: 'CycleGAN 论文', url: 'https://arxiv.org/abs/1703.10593' },
      { title: '风格迁移综述', url: 'https://arxiv.org/abs/2001.08128' },
      { title: 'Fast Style Transfer 代码', url: 'https://github.com/lengstrom/fast-style-transfer' },
      { title: 'AdaIN 代码', url: 'https://github.com/xunhuang1995/AdaIN-style' },
      { title: 'CycleGAN 代码', url: 'https://github.com/junyanz/pytorch-CycleGAN-and-pix2pix' }
    ])
  }
};

const unitsCount = db.prepare('SELECT COUNT(*) as count FROM units').get() as { count: number };
if (unitsCount.count === 0) {
  const units = [
    { 
      title: '机器学习基础', 
      week_range: '1', 
      description: '编程与数学基础，线性回归&分类', 
      objectives: '掌握如何搭建最基础的PyTorch编程实验环境，并回顾机器学习的基础知识。',
      resources: JSON.stringify([
        { title: 'Anaconda下载与安装', url: 'http://t.csdnimg.cn/1WEsj' },
        { title: 'PyTorch GPU版本安装参考', url: 'https://blog.csdn.net/Little_Carter/article/details/135934842' },
        { title: 'Python数值计算与数据处理', url: 'https://zh.d2l.ai/chapter_preliminaries/index.html' },
        { title: '线性回归视频', url: 'https://www.bilibili.com/video/BV1PX4y1g7KC/?spm_id_from=333.788.recommend_more_video.2' },
        { title: '线性回归讲义', url: 'https://zh.d2l.ai/chapter_linear-networks/linear-regression.html' },
        { title: 'Softmax视频', url: 'https://www.bilibili.com/video/BV1K64y1Q7wu/?spm_id_from=333.788.recommend_more_video.0' },
        { title: 'Softmax编程实现视频', url: 'https://www.bilibili.com/video/BV1K64y1Q7wu/?p=5' },
        { title: 'Softmax编程实现讲义', url: 'https://zh.d2l.ai/chapter_linear-networks/softmax-regression-concise.html' }
      ])
    },
    { 
      title: '图像处理基础', 
      week_range: '2-3', 
      description: '图像处理操作与视觉数据增广', 
      objectives: '通过编程实践，了解基础的图像处理操作以及如何使用图像处理技术实现视觉数据的有效增广，为复杂视觉模型的高效训练提供基础。',
      resources: JSON.stringify([
        { title: '常见的图像处理操作', url: '', description: '参考教材《Programming-Computer-VisionPython计算机视觉编程》第一章，学习如何使用NumPy、Matplotlib等常用的Python工具包实现基础的图像处理操作，阅读并运行教材中的例程。' },
        { title: '数据增广简介视频', url: 'https://www.bilibili.com/video/BV17y4y1g76q/' },
        { title: '数据增广编程实现', url: 'https://zh.d2l.ai/chapter_computer-vision/image-augmentation.html' }
      ])
    },
    {
      title: '相机模型',
      week_range: '4-5',
      description: '针孔相机模型、相机校准基础',
      objectives: unitResourcePatches[3].objectives,
      resources: unitResourcePatches[3].resources
    },
    {
      title: '深度学习基础',
      week_range: '5-6',
      description: '多层感知机，卷积神经网络',
      objectives: unitResourcePatches[4].objectives,
      resources: unitResourcePatches[4].resources
    },
    {
      title: 'Transformer',
      week_range: '7',
      description: '注意力机制, 网络基础, 编程实践',
      objectives: unitResourcePatches[5].objectives,
      resources: unitResourcePatches[5].resources
    },
    {
      title: '目标检测基础',
      week_range: '8',
      description: '检测基础、SSD检测模型',
      objectives: unitResourcePatches[6].objectives,
      resources: unitResourcePatches[6].resources
    },
    {
      title: '目标检测进阶',
      week_range: '9',
      description: 'DETR 检测模型',
      objectives: unitResourcePatches[7].objectives,
      resources: unitResourcePatches[7].resources
    },
    {
      title: '语义分割',
      week_range: '10',
      description: '分割基础、转置卷积、全卷积',
      objectives: unitResourcePatches[8].objectives,
      resources: unitResourcePatches[8].resources
    },
    {
      title: '生成模型',
      week_range: '11',
      description: 'GAN, VAE',
      objectives: unitResourcePatches[9].objectives,
      resources: unitResourcePatches[9].resources
    },
    {
      title: '风格迁移',
      week_range: '12',
      description: '概念、模型结构、学习方法',
      objectives: unitResourcePatches[10].objectives,
      resources: unitResourcePatches[10].resources
    },
  ];
  const insertUnit = db.prepare('INSERT INTO units (title, week_range, description, objectives, resources) VALUES (?, ?, ?, ?, ?)');
  const insertMany = db.transaction((units) => {
    for (const unit of units) {
      insertUnit.run(unit.title, unit.week_range, unit.description, unit.objectives, unit.resources);
    }
  });
  insertMany(units);
} else {
  // Update unit 1 and 2 if they exist but don't have resources set yet
  const unit1 = db.prepare('SELECT resources FROM units WHERE id = 1').get() as any;
  if (unit1 && (!unit1.resources || unit1.resources === '[]')) {
    db.prepare('UPDATE units SET objectives = ?, resources = ? WHERE id = 1').run(
      '掌握如何搭建最基础的PyTorch编程实验环境，并回顾机器学习的基础知识。',
      JSON.stringify([
        { title: 'Anaconda下载与安装', url: 'http://t.csdnimg.cn/1WEsj' },
        { title: 'PyTorch GPU版本安装参考', url: 'https://blog.csdn.net/Little_Carter/article/details/135934842' },
        { title: 'Python数值计算与数据处理', url: 'https://zh.d2l.ai/chapter_preliminaries/index.html' },
        { title: '线性回归视频', url: 'https://www.bilibili.com/video/BV1PX4y1g7KC/?spm_id_from=333.788.recommend_more_video.2' },
        { title: '线性回归讲义', url: 'https://zh.d2l.ai/chapter_linear-networks/linear-regression.html' },
        { title: 'Softmax视频', url: 'https://www.bilibili.com/video/BV1K64y1Q7wu/?spm_id_from=333.788.recommend_more_video.0' },
        { title: 'Softmax编程实现视频', url: 'https://www.bilibili.com/video/BV1K64y1Q7wu/?p=5' },
        { title: 'Softmax编程实现讲义', url: 'https://zh.d2l.ai/chapter_linear-networks/softmax-regression-concise.html' }
      ])
    );
  }
  const unit2 = db.prepare('SELECT resources FROM units WHERE id = 2').get() as any;
  if (unit2 && (!unit2.resources || unit2.resources === '[]')) {
    db.prepare('UPDATE units SET objectives = ?, resources = ? WHERE id = 2').run(
      '通过编程实践，了解基础的图像处理操作以及如何使用图像处理技术实现视觉数据的有效增广，为复杂视觉模型的高效训练提供基础。',
      JSON.stringify([
        { title: '常见的图像处理操作', url: '', description: '参考教材《Programming-Computer-VisionPython计算机视觉编程》第一章，学习如何使用NumPy、Matplotlib等常用的Python工具包实现基础的图像处理操作，阅读并运行教材中的例程。' },
        { title: '数据增广简介视频', url: 'https://www.bilibili.com/video/BV17y4y1g76q/' },
        { title: '数据增广编程实现', url: 'https://zh.d2l.ai/chapter_computer-vision/image-augmentation.html' }
      ])
    );
  }

  const unitBackfillPatches = Object.entries(unitResourcePatches).map(([id, payload]) => ({
    id: Number(id),
    objectives: payload.objectives,
    resources: payload.resources
  }));

  const patchUnit = db.prepare('UPDATE units SET objectives = ?, resources = ? WHERE id = ?');
  for (const patch of unitBackfillPatches) {
    const current = db.prepare('SELECT resources FROM units WHERE id = ?').get(patch.id) as any;
    let currentCount = 0;
    let targetCount = 0;
    try {
      const parsedCurrent = JSON.parse(String(current?.resources || '[]'));
      currentCount = Array.isArray(parsedCurrent) ? parsedCurrent.length : 0;
    } catch (err) {
      currentCount = 0;
    }
    try {
      const parsedTarget = JSON.parse(patch.resources);
      targetCount = Array.isArray(parsedTarget) ? parsedTarget.length : 0;
    } catch (err) {
      targetCount = 0;
    }

    if (current && (currentCount === 0 || currentCount < targetCount)) {
      patchUnit.run(patch.objectives, patch.resources, patch.id);
    }
  }
}

export default db;
