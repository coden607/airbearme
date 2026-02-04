export default async function handler(req: any, res: any) {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
