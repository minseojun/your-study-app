export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body;
  const apiKey = process.env.CLAUDE_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message || `Claude API 오류 (${response.status})`;
      return res.status(502).json({ error: msg });
    }

    const text = data?.content?.[0]?.text;
    if (!text) return res.status(500).json({ error: '응답 형식 오류' });

    res.status(200).json({ text });
  } catch (error) {
    res.status(500).json({ error: 'Claude 분석 중 오류가 발생했습니다.' });
  }
}
