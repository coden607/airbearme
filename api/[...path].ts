async function loadCreateApp() {
    try {
        const mod = await import("../dist/index.js");
        return mod.createApp;
    } catch (_error) {
        const mod = await import("../server/index.ts");
        return mod.createApp;
    }
}

// Cache the Express app instance across warm invocations
let cachedApp: any = null;
let appPromise: Promise<any> | null = null;

async function getApp() {
    if (cachedApp) return cachedApp;
    if (appPromise) return appPromise;

    appPromise = (async () => {
        const createApp = await loadCreateApp();
        const { app } = await createApp();
        cachedApp = app;
        return app;
    })();

    return appPromise;
}

export default async function handler(req: any, res: any) {
    try {
        const app = await getApp();
        return app(req, res);
    } catch (error: any) {
        console.error('[API Handler Error]', error);
        res.status(500).json({ 
            error: 'Server initialization failed', 
        });
    }
}
