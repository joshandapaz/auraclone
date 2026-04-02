import { NextResponse } from 'next/server';
import { cloneApp, launchApp, getClones, getInstalledApps, uploadIcon } from '../../actions/cloner';

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
