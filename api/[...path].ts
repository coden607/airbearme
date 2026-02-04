async function loadCreateApp() {
    try {
        const mod = await import("../dist/index.js");
        return mod.createApp;
    } catch (_error) {
        const mod = await import("../server/index.ts");
        return mod.createApp;
    }
}

export default async function handler(req: any, res: any) {
    try {
        console.log('[API Request]', req.method, req.url);
        const createApp = await loadCreateApp();
        const { app } = await createApp();
        return app(req, res);
    } catch (error: any) {
        console.error('[API Handler Error]', error);
        res.status(500).json({ 
            error: 'Server initialization failed', 
        });
    }
}
