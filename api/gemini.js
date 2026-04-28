// api/gemini.js
export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY; // Vercel 설정에서 넣은 키를 가져옴

  if (!apiKey) {
    return res.status(500).json({ error: 'API key is not configured' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 1024 }
        }),
      }
    );

    const data = await response.json();
    
    // Gemini의 원본 응답을 그대로 전달하거나 필요한 부분만 가공해서 보냄
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'AI 분석 중 오류가 발생했습니다.' });
  }
}
