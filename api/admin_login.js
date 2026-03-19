export default function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    
    const { password } = req.body;
    
    if (password === process.env.ADMIN_PASS) {
        res.status(200).json({ ok: true });
    } else {
        res.status(401).json({ ok: false });
    }
}
