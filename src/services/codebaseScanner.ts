import fs from 'fs';
import path from 'path';

export interface CodebaseSnapshot {
  fileTree: string[];
  filesContent: Record<string, string>;
  formattedContext: string;
}

export function scanCodebase(rootDir: string = process.cwd()): CodebaseSnapshot {
  const fileTree: string[] = [];
  const filesContent: Record<string, string> = {};

  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.ai', '.cache', 'Amazon-Duaa-v1'];
  const allowedExtensions = ['.ts', '.tsx', '.js', '.json', '.css', '.html'];

  function walk(currentDir: string, relativePath: string = '') {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (ignoreDirs.includes(entry.name)) continue;
          walk(path.join(currentDir, entry.name), path.join(relativePath, entry.name));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (allowedExtensions.includes(ext) || entry.name === 'server.ts' || entry.name === 'package.json') {
            const relPath = path.join(relativePath, entry.name).replace(/\\/g, '/');
            fileTree.push(relPath);
            try {
              const content = fs.readFileSync(path.join(currentDir, entry.name), 'utf8');
              // Limit file content size to avoid huge tokens per file
              filesContent[relPath] = content.slice(0, 10000);
            } catch (err) {
              // skip unreadable files
            }
          }
        }
      }
    } catch (err) {
      console.error('Error walking directory:', err);
    }
  }

  walk(rootDir);

  // Format context for LLM
  let formattedContext = `=== REPOSITORY FILE TREE (${fileTree.length} files) ===\n` + fileTree.join('\n') + '\n\n';
  formattedContext += `=== FILE CONTENTS ===\n`;

  // Prioritize key files
  const priorityFiles = ['server.ts', 'src/App.tsx', 'src/components/StoreFront.tsx', 'src/lib/storage.ts', 'src/db/products.ts', 'package.json'];
  
  const processedFiles = new Set<string>();

  for (const pFile of priorityFiles) {
    if (filesContent[pFile]) {
      formattedContext += `\n--- FILE: ${pFile} ---\n${filesContent[pFile]}\n`;
      processedFiles.add(pFile);
    }
  }

  for (const [fPath, content] of Object.entries(filesContent)) {
    if (!processedFiles.has(fPath)) {
      // Add other files if within reasonable size
      if (formattedContext.length < 120000) {
        formattedContext += `\n--- FILE: ${fPath} ---\n${content}\n`;
      }
    }
  }

  return {
    fileTree,
    filesContent,
    formattedContext: formattedContext.slice(0, 150000), // Safety cap
  };
}
