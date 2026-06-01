import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';

export async function POST(req: NextRequest) {
  const { path } = await req.json();
  if (!path || typeof path !== 'string') {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  const platform = process.platform;
  let cmd: string;
  if (platform === 'darwin') {
    cmd = `open "${path}"`;
  } else if (platform === 'win32') {
    cmd = `explorer "${path}"`;
  } else {
    cmd = `xdg-open "${path}"`;
  }

  return new Promise<NextResponse>((resolve) => {
    exec(cmd, (err) => {
      if (err) {
        resolve(NextResponse.json({ error: err.message }, { status: 500 }));
      } else {
        resolve(NextResponse.json({ ok: true }));
      }
    });
  });
}
