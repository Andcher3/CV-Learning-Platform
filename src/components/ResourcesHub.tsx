import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, GraduationCap, Code2, Wrench, ExternalLink, Search } from 'lucide-react';

type ResourceItem = {
  id: number;
  title: string;
  type: '书籍' | '课程' | '精讲' | '代码库' | '教程' | '笔记';
  authorOrOrg?: string;
  platformOrPublisher?: string;
  backupKeywords?: string[];
  link?: string;
  linkLabel?: string;
  note?: string;
};

type ResourceSection = {
  key: string;
  title: string;
  description: string;
  icon: any;
  items: ResourceItem[];
};

export default function ResourcesHub() {
  const navigate = useNavigate();

  const sections = useMemo<ResourceSection[]>(() => [
    {
      key: 'theory',
      title: '核心理论基石',
      description: '系统构建深度学习与计算机视觉理论框架。',
      icon: BookOpen,
      items: [
        {
          id: 1,
          type: '书籍',
          title: '《Deep Learning》（花书）',
          authorOrOrg: 'Ian Goodfellow, Yoshua Bengio, Aaron Courville',
          platformOrPublisher: 'MIT Press',
          backupKeywords: ['深度学习 花书 pdf', 'Deep Learning Ian Goodfellow'],
          link: 'https://www.deeplearningbook.org/',
          linkLabel: '官网'
        },
        {
          id: 2,
          type: '书籍',
          title: '《Computer Vision: Algorithms and Applications》（第二版）',
          authorOrOrg: 'Richard Szeliski',
          platformOrPublisher: 'Springer',
          backupKeywords: ['Computer Vision Algorithms and Applications Szeliski pdf'],
          link: 'http://szeliski.org/Book/',
          linkLabel: '官网'
        },
        {
          id: 3,
          type: '书籍',
          title: '《Programming Computer Vision with Python》',
          authorOrOrg: 'Jan Erik Solem',
          platformOrPublisher: "O'Reilly Media",
          backupKeywords: ['Programming Computer Vision with Python Jan Erik Solem'],
          link: 'http://programmingcomputervision.com/',
          linkLabel: '官网（需Internet Archive）'
        }
      ]
    },
    {
      key: 'courses',
      title: '高质量课程',
      description: '覆盖经典课程、中文课程与前沿论文精读。',
      icon: GraduationCap,
      items: [
        {
          id: 4,
          type: '课程',
          title: '斯坦福 CS231n: Deep Learning for Computer Vision（2017）',
          authorOrOrg: 'Fei-Fei Li, Justin Johnson, Serena Yeung',
          platformOrPublisher: '斯坦福大学',
          backupKeywords: ['CS231n 2017 lecture notes', 'Stanford CS231n 2017 video'],
          link: 'https://cs231n.github.io/',
          linkLabel: '课程笔记',
          note: '视频可在 YouTube 搜索：Stanford CS231n 2017'
        },
        {
          id: 5,
          type: '课程',
          title: '李宏毅深度学习课程（2021）',
          authorOrOrg: '李宏毅',
          platformOrPublisher: 'YouTube / B站',
          backupKeywords: ['李宏毅 深度学习 2021', 'Hung-yi Lee Deep Learning'],
          link: 'https://speech.ee.ntu.edu.tw/~hylee/index.html',
          linkLabel: '课程主页'
        },
        {
          id: 6,
          type: '课程',
          title: '北京邮电大学 计算机视觉（鲁鹏）',
          authorOrOrg: '鲁鹏',
          platformOrPublisher: 'B站 / 中国大学MOOC',
          backupKeywords: ['北京邮电大学 计算机视觉 鲁鹏'],
          note: '可在 B站 搜索：鲁鹏 计算机视觉'
        },
        {
          id: 7,
          type: '精讲',
          title: '李沐论文精讲（DETR / ViT 等）',
          authorOrOrg: '李沐',
          platformOrPublisher: 'B站',
          backupKeywords: ['李沐 论文精读 DETR', '跟李沐学AI']
        }
      ]
    },
    {
      key: 'practice',
      title: '实操与案例库',
      description: '通过官方作业与模型库强化工程落地能力。',
      icon: Code2,
      items: [
        {
          id: 8,
          type: '代码库',
          title: 'CS231n 作业（官方 GitHub）',
          authorOrOrg: 'Stanford CS231n',
          platformOrPublisher: 'GitHub',
          backupKeywords: ['CS231n assignments GitHub'],
          link: 'https://github.com/cs231n/cs231n.github.io/tree/master/assignments',
          linkLabel: 'GitHub'
        },
        {
          id: 9,
          type: '代码库',
          title: 'torchvision 模型库',
          authorOrOrg: 'PyTorch',
          platformOrPublisher: '官方文档',
          backupKeywords: ['torchvision models'],
          link: 'https://pytorch.org/vision/stable/models.html',
          linkLabel: '文档'
        },
        {
          id: 10,
          type: '代码库',
          title: 'HuggingFace Transformers（视觉任务）',
          authorOrOrg: 'HuggingFace',
          platformOrPublisher: 'GitHub / huggingface.co',
          backupKeywords: ['HuggingFace Transformers'],
          link: 'https://huggingface.co/docs/transformers/tasks/image_classification',
          linkLabel: '文档'
        },
        {
          id: 11,
          type: '代码库',
          title: 'YOLOv5（Ultralytics）',
          authorOrOrg: 'Ultralytics',
          platformOrPublisher: 'GitHub',
          backupKeywords: ['YOLOv5 GitHub'],
          link: 'https://github.com/ultralytics/yolov5',
          linkLabel: 'GitHub'
        }
      ]
    },
    {
      key: 'prerequisite',
      title: '前置知识补丁',
      description: '在进入复杂任务前补齐 Python / PyTorch / ML 基础。',
      icon: Wrench,
      items: [
        {
          id: 12,
          type: '教程',
          title: 'CS231n Python NumPy 教程',
          backupKeywords: ['CS231n python numpy tutorial'],
          link: 'https://cs231n.github.io/python-numpy-tutorial/',
          linkLabel: '教程'
        },
        {
          id: 13,
          type: '教程',
          title: 'PyTorch 60分钟入门（60 Minute Blitz）',
          backupKeywords: ['PyTorch 60分钟入门'],
          link: 'https://pytorch.org/tutorials/beginner/deep_learning_60min_blitz.html',
          linkLabel: '教程'
        },
        {
          id: 14,
          type: '笔记',
          title: 'CS229 机器学习笔记（监督学习部分）',
          backupKeywords: ['CS229 notes 2020'],
          link: 'https://cs229.stanford.edu/notes2020spring/',
          linkLabel: '课程笔记'
        }
      ]
    }
  ], []);

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center text-slate-600 hover:text-indigo-700 transition"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> 返回 Dashboard
          </button>
          <div className="text-slate-900 font-semibold">学习资源总览</div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8">
          <h1 className="text-2xl font-bold text-slate-900">计算机视觉课程资源库</h1>
          <p className="mt-2 text-slate-600 text-sm">
            资源按四个维度组织，点击链接可直接访问；若链接失效，可使用备用关键词检索。
          </p>
        </div>

        <div className="space-y-8">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <section key={section.key} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center mb-2">
                  <Icon className="w-5 h-5 text-indigo-600 mr-2" />
                  <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
                </div>
                <p className="text-sm text-slate-600 mb-5">{section.description}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {section.items.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-indigo-700">#{item.id} · {item.type}</div>
                        {item.link ? (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800"
                          >
                            {item.linkLabel || '访问'} <ExternalLink className="w-4 h-4 ml-1" />
                          </a>
                        ) : null}
                      </div>

                      <h3 className="mt-2 text-slate-900 font-semibold leading-6">{item.title}</h3>

                      {(item.authorOrOrg || item.platformOrPublisher) && (
                        <div className="mt-2 text-sm text-slate-600 space-y-1">
                          {item.authorOrOrg ? <div><span className="font-medium">作者/机构：</span>{item.authorOrOrg}</div> : null}
                          {item.platformOrPublisher ? <div><span className="font-medium">平台/出版社：</span>{item.platformOrPublisher}</div> : null}
                        </div>
                      )}

                      {item.backupKeywords && item.backupKeywords.length > 0 && (
                        <div className="mt-3 text-sm text-slate-600">
                          <div className="font-medium inline-flex items-center"><Search className="w-4 h-4 mr-1" />备用关键词</div>
                          <div className="mt-1">{item.backupKeywords.join(' / ')}</div>
                        </div>
                      )}

                      {item.note ? <p className="mt-3 text-sm text-slate-500">{item.note}</p> : null}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
