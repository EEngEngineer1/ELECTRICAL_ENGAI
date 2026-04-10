import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadSkill(skillName) {
  const candidates = [
    join(process.cwd(), 'skills', `${skillName}.skill`),
    join(__dirname, '..', 'skills', `${skillName}.skill`),
    join(__dirname, '..', '..', 'skills', `${skillName}.skill`),
  ];
  const filePath = candidates.find(p => existsSync(p));
  if (!filePath) throw new Error(`Skill "${skillName}" not found`);
  const raw = readFileSync(filePath, 'utf8');
  // Strip YAML front-matter, return prompt body only
  return raw.replace(/^---[\s\S]*?---\n/, '').trim();
}
