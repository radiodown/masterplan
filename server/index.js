import express from 'express';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculatePlan, PlanError } from '../shared/calculate.js';
import { makeDefaultPlan } from '../shared/project.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataPath = resolve(process.env.FOREST_PLAN_DATA_FILE || join(root, '.data', 'plan.json'));
const app = express();
const server = createServer(app);
const development = process.argv.includes('--dev');
let writes = Promise.resolve();

app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));
app.use('/api', (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/plan', async (_request, response) => {
  let plan;
  try {
    plan = JSON.parse(await readFile(dataPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    plan = makeDefaultPlan();
  }
  response.json({ plan, summary: calculatePlan(plan) });
});

app.put('/api/plan', async (request, response) => {
  if (!request.is('application/json')) {
    response.status(415).json({ error: 'JSON 형식으로 보내 주세요.' });
    return;
  }
  const plan = request.body;
  const summary = calculatePlan(plan);
  const save = writes.then(async () => {
    await mkdir(dirname(dataPath), { recursive: true });
    const temporaryPath = `${dataPath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(plan, null, 2), { mode: 0o600 });
    await rename(temporaryPath, dataPath);
  });
  writes = save.catch(() => {});
  await save;
  response.json({ plan, summary });
});

app.use('/api', (_request, response) => response.status(404).json({ error: '요청한 API를 찾을 수 없습니다.' }));
if (development) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server } } });
  app.use(vite.middlewares);
} else {
  app.use(express.static(join(root, 'dist')));
}
app.use((error, _request, response, _next) => {
  if (error instanceof PlanError || error.status === 400) {
    response.status(400).json({ error: error instanceof PlanError ? error.message : '입력 형식을 확인해 주세요.' });
    return;
  }
  console.error(error.message);
  response.status(500).json({ error: '서버에서 계획을 처리하지 못했습니다.' });
});

const port = Number(process.env.FOREST_PLAN_PORT || (development ? 5173 : 4174));
server.listen(port, '127.0.0.1', () => console.log(`포레스트 플랜 · http://127.0.0.1:${port}`));
