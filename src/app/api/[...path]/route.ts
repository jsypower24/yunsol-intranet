import { handle } from '@/server/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ path: string[] }> };

async function dispatch(request: Request, context: Context) {
  const { path } = await context.params;
  return handle(request, path.join('/'));
}

export const GET = dispatch;
export const POST = dispatch;
