import { readFileSync } from 'fs';
import { join } from 'path';

export function loadSkill(skillName) {
  const filePath = join(process.cwd(), 'skills', `${skillName}.skill`);
  const raw = readFileSync(filePath, 'utf8');
  // Strip YAML front-matter, return prompt body only
  return raw.replace(/^---[\s\S]*?---\n/, '').trim();
}
