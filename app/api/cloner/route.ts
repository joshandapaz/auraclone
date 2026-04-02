import { NextResponse } from 'next/server';
import { writeFile, mkdir, rm, copyFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { cloneApp, launchApp, getClones, getInstalledApps, uploadIcon } from '../../actions/cloner';

const execPromise = promisify(exec);

const JAVA_PATH = "C:\\Users\\HP\\.antigravity\\exx86_64\\bin\\java.exe";
const APKTOOL_JAR = path.join(process.cwd(), "bin", "apktool.jar");
const SIGNER_JAR = path.join(process.cwd(), "bin", "uber-apk-signer.jar");

export const config = {
  api: {
    bodyParser: false, // Required for raw stream handling
  },
};

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const action = formData.get('action');

      if (action === 'uploadIcon') {
        const result = await uploadIcon(formData);
        return NextResponse.json(result);
      }
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const body = await req.json();
    const { action, payload } = body;

    switch (action) {
      case 'getClones':
        return NextResponse.json(await getClones());
      case 'getInstalledApps':
        return NextResponse.json(await getInstalledApps());
      case 'cloneApp':
        return NextResponse.json(await cloneApp(payload.sourcePath, payload.destName, payload.iconUrl));
      case 'launchApp':
        return NextResponse.json(await launchApp(payload.cloneId, payload.exeName));
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
