export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}` 
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', 
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 800
      })
    });

    const data = await response.json();

    // Jika Groq mengembalikan status gagal (401, 400, dll), lempar pesan aslinya
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Groq Error: ${data.error?.message || response.statusText}`,
        details: data
      });
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
}