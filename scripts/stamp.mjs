// После сборки кладёт в dist/version.json коммит, из которого собран сайт (его сверяет release-receipt после деплоя).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

let commit = process.env.GITHUB_SHA;
if (!commit) {
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    commit = undefined;
  }
}
if (commit) writeFileSync('dist/version.json', JSON.stringify({ commit, builtAt: new Date().toISOString() }, null, 2) + '\n');
console.log(commit ? `dist/version.json: коммит ${commit.slice(0, 7)}` : 'коммит не определён, version.json не создан');
