export default async function handler(req, res) {
  // Pastikan hanya menerima method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // API Key dipanggil dari environment server, 100% aman!
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}` 
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192', // Model yang ringan dan cepat
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Groq API Error:', error);
    res.status(500).json({ error: 'Gagal terhubung ke AI Service' });
  }
}