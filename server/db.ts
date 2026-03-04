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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES users(id)
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
      objectives: '掌握针孔相机模型、内参/外参与相机标定基本方法，能够运行标定代码并输出相机内参矩阵。',
      resources: JSON.stringify([
        { title: '鲁鹏计算机视觉：第6讲 相机模型（B站检索）', url: '', description: '关键词：北京邮电大学 计算机视觉 鲁鹏 第6讲 相机模型' },
        { title: '鲁鹏计算机视觉：第7讲前半 相机标定（B站检索）', url: '', description: '关键词：北京邮电大学 计算机视觉 鲁鹏 第7讲 相机标定' },
        { title: 'Programming Computer Vision with Python（第4章）', url: 'http://programmingcomputervision.com/', description: '运行相机标定代码并输出相机内参矩阵' },
        { title: 'OpenCV 相机标定官方教程', url: 'https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html' },
        { title: 'Computer Vision: Algorithms and Applications（第2章）', url: 'http://szeliski.org/Book/' }
      ])
    },
    {
      title: '深度学习基础',
      week_range: '5-6',
      description: '多层感知机，卷积神经网络',
      objectives: '理解反向传播与卷积神经网络核心机制，能够完成两层神经网络前向/反向传播基础实现。',
      resources: JSON.stringify([
        { title: 'CS231n Lecture 4：Backpropagation', url: 'https://cs231n.github.io/optimization-2/' },
        { title: 'CS231n Lecture 5：Convolutional Neural Networks', url: 'https://cs231n.github.io/convolutional-networks/' },
        { title: 'CS231n Assignment 1（官方）', url: 'https://github.com/cs231n/cs231n.github.io/tree/master/assignments' },
        { title: 'Deep Learning（花书）', url: 'https://www.deeplearningbook.org/', description: '建议阅读第6章与第9章' }
      ])
    },
    {
      title: 'Transformer',
      week_range: '7',
      description: '注意力机制, 网络基础, 编程实践',
      objectives: '掌握自注意力与多头注意力机制，能够调用 ViT 模型完成图片分类并记录预测类别与置信度。',
      resources: JSON.stringify([
        { title: '李宏毅深度学习课程：Self-Attention and Transformer', url: 'https://speech.ee.ntu.edu.tw/~hylee/index.html', description: '可在 B站 搜索同名视频' },
        { title: 'HuggingFace 图像分类任务文档', url: 'https://huggingface.co/docs/transformers/tasks/image_classification' },
        { title: 'Vision Transformer 论文', url: 'https://arxiv.org/abs/2010.11929' }
      ])
    },
    {
      title: '目标检测基础',
      week_range: '8',
      description: '检测基础、SSD检测模型',
      objectives: '理解目标检测中的 Anchor 与 NMS 等基础概念，能够使用 torchvision 的 SSD 预训练模型完成推理与可视化。',
      resources: JSON.stringify([
        { title: 'CS231n 目标检测笔记', url: 'https://cs231n.github.io/detection/' },
        { title: 'torchvision 模型库（目标检测）', url: 'https://pytorch.org/vision/stable/models.html#object-detection' },
        { title: 'PyTorch torchvision 检测实战教程', url: 'https://pytorch.org/tutorials/intermediate/torchvision_tutorial.html' },
        { title: 'YOLOv5（可选）', url: 'https://github.com/ultralytics/yolov5' }
      ])
    },
    {
      title: '目标检测进阶',
      week_range: '9',
      description: 'DETR 检测模型',
      objectives: '理解 DETR 与匈牙利匹配的核心思想，能够使用 DETR 模型对图片进行端到端目标检测并可视化结果。',
      resources: JSON.stringify([
        { title: '李沐论文精讲：DETR（B站检索）', url: '', description: '关键词：李沐 论文精读 DETR' },
        { title: 'HuggingFace DETR 文档', url: 'https://huggingface.co/docs/transformers/model_doc/detr' },
        { title: 'DETR 论文', url: 'https://arxiv.org/abs/2005.12872' }
      ])
    },
    {
      title: '语义分割',
      week_range: '10',
      description: '分割基础、转置卷积、全卷积',
      objectives: '掌握 FCN、转置卷积与 DeepLab 等语义分割关键概念，能够完成 DeepLabV3 推理并输出可视化分割结果。',
      resources: JSON.stringify([
        { title: 'CS231n 语义分割笔记', url: 'https://cs231n.github.io/semantic-segmentation/' },
        { title: 'D2L：转置卷积', url: 'https://zh.d2l.ai/chapter_computer-vision/transposed-conv.html' },
        { title: 'torchvision DeepLabV3 文档', url: 'https://pytorch.org/vision/stable/models/generated/torchvision.models.segmentation.deeplabv3_resnet50.html' }
      ])
    },
    {
      title: '生成模型',
      week_range: '11',
      description: 'GAN, VAE',
      objectives: '理解 GAN 的生成器/判别器对抗训练思路，能够运行 PyTorch DCGAN 教程并生成图像结果。',
      resources: JSON.stringify([
        { title: 'CS231n 生成模型笔记（含GAN）', url: 'https://cs231n.github.io/generative-models/' },
        { title: 'PyTorch DCGAN 官方教程', url: 'https://pytorch.org/tutorials/beginner/dcgan_faces_tutorial.html' },
        { title: 'GAN 原始论文', url: 'https://arxiv.org/abs/1406.2661' }
      ])
    },
    {
      title: '风格迁移',
      week_range: '12',
      description: '概念、模型结构、学习方法',
      objectives: '掌握内容损失、风格损失与格拉姆矩阵等核心概念，能够运行神经风格迁移并保存融合结果图。',
      resources: JSON.stringify([
        { title: 'CS231n 神经风格迁移笔记', url: 'https://cs231n.github.io/neural-style-transfer/' },
        { title: 'PyTorch Neural Style Transfer 教程', url: 'https://pytorch.org/tutorials/advanced/neural_style_tutorial.html' },
        { title: 'CycleGAN（可选进阶）', url: 'https://github.com/junyanz/pytorch-CycleGAN-and-pix2pix' }
      ])
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

  const unitBackfillPatches = [
    {
      id: 3,
      objectives: '掌握针孔相机模型、内参/外参与相机标定基本方法，能够运行标定代码并输出相机内参矩阵。',
      resources: JSON.stringify([
        { title: '鲁鹏计算机视觉：第6讲 相机模型（B站检索）', url: '', description: '关键词：北京邮电大学 计算机视觉 鲁鹏 第6讲 相机模型' },
        { title: '鲁鹏计算机视觉：第7讲前半 相机标定（B站检索）', url: '', description: '关键词：北京邮电大学 计算机视觉 鲁鹏 第7讲 相机标定' },
        { title: 'Programming Computer Vision with Python（第4章）', url: 'http://programmingcomputervision.com/', description: '运行相机标定代码并输出相机内参矩阵' },
        { title: 'OpenCV 相机标定官方教程', url: 'https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html' },
        { title: 'Computer Vision: Algorithms and Applications（第2章）', url: 'http://szeliski.org/Book/' }
      ])
    },
    {
      id: 4,
      objectives: '理解反向传播与卷积神经网络核心机制，能够完成两层神经网络前向/反向传播基础实现。',
      resources: JSON.stringify([
        { title: 'CS231n Lecture 4：Backpropagation', url: 'https://cs231n.github.io/optimization-2/' },
        { title: 'CS231n Lecture 5：Convolutional Neural Networks', url: 'https://cs231n.github.io/convolutional-networks/' },
        { title: 'CS231n Assignment 1（官方）', url: 'https://github.com/cs231n/cs231n.github.io/tree/master/assignments' },
        { title: 'Deep Learning（花书）', url: 'https://www.deeplearningbook.org/', description: '建议阅读第6章与第9章' }
      ])
    },
    {
      id: 5,
      objectives: '掌握自注意力与多头注意力机制，能够调用 ViT 模型完成图片分类并记录预测类别与置信度。',
      resources: JSON.stringify([
        { title: '李宏毅深度学习课程：Self-Attention and Transformer', url: 'https://speech.ee.ntu.edu.tw/~hylee/index.html', description: '可在 B站 搜索同名视频' },
        { title: 'HuggingFace 图像分类任务文档', url: 'https://huggingface.co/docs/transformers/tasks/image_classification' },
        { title: 'Vision Transformer 论文', url: 'https://arxiv.org/abs/2010.11929' }
      ])
    },
    {
      id: 6,
      objectives: '理解目标检测中的 Anchor 与 NMS 等基础概念，能够使用 torchvision 的 SSD 预训练模型完成推理与可视化。',
      resources: JSON.stringify([
        { title: 'CS231n 目标检测笔记', url: 'https://cs231n.github.io/detection/' },
        { title: 'torchvision 模型库（目标检测）', url: 'https://pytorch.org/vision/stable/models.html#object-detection' },
        { title: 'PyTorch torchvision 检测实战教程', url: 'https://pytorch.org/tutorials/intermediate/torchvision_tutorial.html' },
        { title: 'YOLOv5（可选）', url: 'https://github.com/ultralytics/yolov5' }
      ])
    },
    {
      id: 7,
      objectives: '理解 DETR 与匈牙利匹配的核心思想，能够使用 DETR 模型对图片进行端到端目标检测并可视化结果。',
      resources: JSON.stringify([
        { title: '李沐论文精讲：DETR（B站检索）', url: '', description: '关键词：李沐 论文精读 DETR' },
        { title: 'HuggingFace DETR 文档', url: 'https://huggingface.co/docs/transformers/model_doc/detr' },
        { title: 'DETR 论文', url: 'https://arxiv.org/abs/2005.12872' }
      ])
    },
    {
      id: 8,
      objectives: '掌握 FCN、转置卷积与 DeepLab 等语义分割关键概念，能够完成 DeepLabV3 推理并输出可视化分割结果。',
      resources: JSON.stringify([
        { title: 'CS231n 语义分割笔记', url: 'https://cs231n.github.io/semantic-segmentation/' },
        { title: 'D2L：转置卷积', url: 'https://zh.d2l.ai/chapter_computer-vision/transposed-conv.html' },
        { title: 'torchvision DeepLabV3 文档', url: 'https://pytorch.org/vision/stable/models/generated/torchvision.models.segmentation.deeplabv3_resnet50.html' }
      ])
    },
    {
      id: 9,
      objectives: '理解 GAN 的生成器/判别器对抗训练思路，能够运行 PyTorch DCGAN 教程并生成图像结果。',
      resources: JSON.stringify([
        { title: 'CS231n 生成模型笔记（含GAN）', url: 'https://cs231n.github.io/generative-models/' },
        { title: 'PyTorch DCGAN 官方教程', url: 'https://pytorch.org/tutorials/beginner/dcgan_faces_tutorial.html' },
        { title: 'GAN 原始论文', url: 'https://arxiv.org/abs/1406.2661' }
      ])
    },
    {
      id: 10,
      objectives: '掌握内容损失、风格损失与格拉姆矩阵等核心概念，能够运行神经风格迁移并保存融合结果图。',
      resources: JSON.stringify([
        { title: 'CS231n 神经风格迁移笔记', url: 'https://cs231n.github.io/neural-style-transfer/' },
        { title: 'PyTorch Neural Style Transfer 教程', url: 'https://pytorch.org/tutorials/advanced/neural_style_tutorial.html' },
        { title: 'CycleGAN（可选进阶）', url: 'https://github.com/junyanz/pytorch-CycleGAN-and-pix2pix' }
      ])
    }
  ];

  const patchUnit = db.prepare('UPDATE units SET objectives = ?, resources = ? WHERE id = ?');
  for (const patch of unitBackfillPatches) {
    const current = db.prepare('SELECT resources FROM units WHERE id = ?').get(patch.id) as any;
    if (current && (!current.resources || current.resources === '[]')) {
      patchUnit.run(patch.objectives, patch.resources, patch.id);
    }
  }
}

export default db;
