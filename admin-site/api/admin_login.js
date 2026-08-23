export default function handler(req, res) {
        // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Handle preflight
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== 'POST') return res.status(405).end();
    
    const { password } = req.body;
    
    if (password === process.env.ADMIN_PASS) {
        res.status(200).json({ ok: true });
    } else {
        res.status(401).json({ ok: false });
    }
}
