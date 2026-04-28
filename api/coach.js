// api/coach.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body;
  const apiKey = process.env.CLAUDE_API_KEY; // Vercel에 설정한 키

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01', // Claude API 버전
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620', // 혹은 'claude-3-opus-20240229'
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    // Claude의 응답 텍스트 추출
    const text = data.content[0].text;
    res.status(200).json({ text });
  } catch (error) {
    res.status(500).json({ error: 'Claude 분석 중 오류가 발생했습니다.' });
  }
}
