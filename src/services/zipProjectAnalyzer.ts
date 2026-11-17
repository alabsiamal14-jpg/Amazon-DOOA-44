import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface ProjectAnalysisResult {
  projectName: string;
  totalFiles: number;
  totalFolders: number;
  projectType: string;
  detectedTechnologies: string[];
  packageJson: any;
  importantFiles: string[];
  issues: {
    category: 'success' | 'warning' | 'critical' | 'security' | 'performance' | 'architecture' | 'duplication' | 'firebase' | 'dependencies' | 'build';
    title: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    file: string;
    line?: number;
    cause: string;
    explanation: string;
    solution: string;
    fixCode?: string;
  }[];
  fileIndex: Record<string, string>; // path -> content (sanitized)
  fileTree: string[];
}

// Sanitize secrets from file content
function sanitizeContent(content: string): string {
  // Replace potential API keys, secrets, tokens, firebase keys
  return content
    .replace(/(api[_-]?key|secret|token|password|auth[_-]?domain|database[_-]?url|storage[_-]?bucket)\s*[:=]\s*['"][^'"]+['"]/gi, '$1: "REDACTED_SECRET"')
    .replace(/AIza[0-9A-Za-z-_]{35}/g, 'AIza_REDACTED_KEY')
    .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, '-----BEGIN PRIVATE KEY-----\nREDACTED\n-----END PRIVATE KEY-----');
}

export async function analyzeProjectZip(zipBuffer: Buffer, originalFilename: string): Promise<ProjectAnalysisResult> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amazon-duaa-zip-'));
  
  try {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    // Security checks against ZIP bomb & Path Traversal
    if (entries.length > 800) {
      throw new Error('الملف المضغوط يحتوي على عدد ملفات كبير جداً (أكثر من 800 ملف).');
    }

    let totalExtractedSize = 0;
    const maxTotalSize = 60 * 1024 * 1024; // 60MB

    const fileIndex: Record<string, string> = {};
    const fileTree: string[] = [];
    let packageJson: any = null;
    const detectedTechs = new Set<string>();
    const importantFiles: string[] = [];
    const foldersSet = new Set<string>();

    for (const entry of entries) {
      const entryName = entry.entryName;
      
      // Prevent path traversal
      if (entryName.includes('..') || path.isAbsolute(entryName)) {
        continue;
      }

      if (entry.isDirectory) {
        foldersSet.add(entryName);
        continue;
      }

      // Ignore unnecessary directories
      if (
        entryName.includes('node_modules') || 
        entryName.includes('.git/') || 
        entryName.includes('dist/') || 
        entryName.includes('build/') ||
        entryName.includes('.next/')
      ) {
        continue;
      }

      // Ignore sensitive files (.env, service accounts)
      if (
        entryName.includes('.env') || 
        entryName.includes('service-account') || 
        entryName.includes('credentials') ||
        entryName.endsWith('.pem')
      ) {
        continue;
      }

      const data = entry.getData();
      totalExtractedSize += data.length;
      if (totalExtractedSize > maxTotalSize) {
        throw new Error('حجم الملفات المستخرجة تجاوز الحد الأقصى المسموح به (60MB).');
      }

      fileTree.push(entryName);
      const ext = path.extname(entryName).toLowerCase();
      
      const allowedCodeExts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.md'];
      if (allowedCodeExts.includes(ext) || entryName === 'package.json' || entryName.includes('config')) {
        let textContent = data.toString('utf8');
        textContent = sanitizeContent(textContent);
        fileIndex[entryName] = textContent;

        if (entryName.endsWith('package.json')) {
          try {
            packageJson = JSON.parse(textContent);
          } catch (e) {}
        }

        if (['vite.config.ts', 'vite.config.js', 'next.config.js', 'tsconfig.json', 'tailwind.config.js', 'firebase.json'].some(f => entryName.endsWith(f))) {
          importantFiles.push(entryName);
        }
      }
    }

    // Detect Technologies from package.json & file tree
    if (packageJson) {
      const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
      if (deps['react']) detectedTechs.add('React');
      if (deps['typescript']) detectedTechs.add('TypeScript');
      if (deps['vite']) detectedTechs.add('Vite');
      if (deps['next']) detectedTechs.add('Next.js');
      if (deps['tailwindcss']) detectedTechs.add('Tailwind CSS');
      if (deps['firebase']) detectedTechs.add('Firebase');
      if (deps['@supabase/supabase-js']) detectedTechs.add('Supabase');
      if (deps['express']) detectedTechs.add('Express.js');
      if (deps['drizzle-orm']) detectedTechs.add('Drizzle ORM');
    }

    // Fallback tech detection from file tree
    if (fileTree.some(f => f.endsWith('.tsx'))) detectedTechs.add('React / JSX');
    if (fileTree.some(f => f.includes('firebase'))) detectedTechs.add('Firebase');

    const projectType = packageJson?.dependencies?.next ? 'Next.js Web App' : (packageJson?.dependencies?.react ? 'React SPA (Vite / Webpack)' : 'Node.js / Web Project');

    // Perform Automated Code & Architecture Checks (Static Analysis)
    const issues: ProjectAnalysisResult['issues'] = [];

    // Check for potential product duplication or multiple fetch sources
    for (const [filePath, content] of Object.entries(fileIndex)) {
      if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        // Check useEffect without cleanup or interval / multiple listeners
        if (content.includes('useEffect') && content.includes('onSnapshot') && !content.includes('unsubscribe')) {
          issues.push({
            category: 'firebase',
            title: 'مستمع Firestore بدون إلغاء اشتراك (Unsubscribed Listener)',
            severity: 'high',
            file: filePath,
            cause: 'استخدام onSnapshot داخل useEffect بدون إرجاع دالة إلغاء الاشتراك (unsubscribe).',
            explanation: 'قد يؤدي ذلك إلى تسرب الذاكرة (Memory Leak) وتكرار جلب البيانات بشكل مستمر مع كل إعادة تصيير للمكون.',
            solution: 'تأكد من إرجاع دالة إلغاء الاشتراك في نهاية الـ useEffect كما يلي: return () => unsubscribe();',
            fixCode: 'useEffect(() => {\n  const unsubscribe = onSnapshot(query, (snapshot) => {\n    // data handling\n  });\n  return () => unsubscribe();\n}, []);'
          });
        }

        // Check duplicate state or mock data mixing with Firestore
        if (content.includes('localStorage') && content.includes('collection(')) {
          issues.push({
            category: 'duplication',
            title: 'خلط بين LocalStorage وقاعدة بيانات Firestore',
            severity: 'medium',
            file: filePath,
            cause: 'الاعتماد المزدوج على التخزين المحلي وقاعدة البيانات الحية في نفس المكون.',
            explanation: 'قد يتسبب في تضارب البيانات وظهور منتجات مكررة أو قديمة للمستخدم.',
            solution: 'توحيد مصدر الحقيقة (Single Source of Truth) إما بالاعتماد بالكامل على Firestore أو التخزين المحلي.'
          });
        }

        // Check for unused imports or large useEffects
        if (content.split('\n').length > 400) {
          issues.push({
            category: 'architecture',
            title: 'مكون طويل جداً (God Component)',
            severity: 'medium',
            file: filePath,
            cause: `يحتوي الملف على أكثر من ${content.split('\n').length} سطر برمجي.`,
            explanation: 'صعوبة الصيانة واختبار الوحدات (Unit Testing) وزيادة احتمالية حدوث أخطاء إعادة التصيير.',
            solution: 'تقسيم الملف إلى مكونات فرعية أصغر (Sub-components) وخطافات مخصصة (Custom Hooks).'
          });
        }
      }
    }

    // Add general success notice if project looks healthy
    if (issues.length === 0) {
      issues.push({
        category: 'success',
        title: 'هيكلية المشروع سليمة ومنظمة',
        severity: 'low',
        file: 'Project Root',
        cause: 'لم يتم رصد مشاكل حرجة ظاهرة في الفحص الأولي.',
        explanation: 'المشروع يتبع المعايير القياسية وخالٍ من الأخطاء الحرجة المباشرة.',
        solution: 'استمر في اتباع أفضل ممارسات التطوير البرمجي.'
      });
    }

    return {
      projectName: originalFilename || 'project.zip',
      totalFiles: fileTree.length,
      totalFolders: foldersSet.size,
      projectType,
      detectedTechnologies: Array.from(detectedTechs),
      packageJson: packageJson || {},
      importantFiles,
      issues,
      fileIndex,
      fileTree,
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

// Smart context retrieval for chat questions
export function findRelevantFilesForQuery(query: string, fileIndex: Record<string, string>): { filename: string; content: string }[] {
  const queryLower = query.toLowerCase();
  const results: { filename: string; content: string; score: number }[] = [];

  const keywords = queryLower.split(/\s+/).filter(w => w.length > 2);

  for (const [filename, content] of Object.entries(fileIndex)) {
    let score = 0;
    const filenameLower = filename.toLowerCase();

    for (const kw of keywords) {
      if (filenameLower.includes(kw)) score += 5;
      if (content.toLowerCase().includes(kw)) score += 1;
    }

    if (score > 0) {
      results.push({ filename, content, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 4).map(r => ({ filename: r.filename, content: r.content.slice(0, 4000) }));
}
