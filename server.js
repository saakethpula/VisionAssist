require('dotenv').config({ path: './keys.env' });
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5174;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/api/openai-proxy', async (req, res) => {
    const { prompt, imageBase64 } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not set.' });
    }
    try {
        // Step 1: Get a description of the image for debugging
        const debugResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Describe what you see in this image. Be concise.' },
                            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
                        ]
                    }
                ],
                max_tokens: 100
            })
        });
        const debugData = await debugResponse.json();
        const debugDescription = debugData.choices?.[0]?.message?.content || '';

        // Step 2: Run the main prompt as before
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
                        ]
                    }
                ],
                max_tokens: 100
            })
        });
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        res.json({ text, debugDescription });
    } catch (err) {
        res.status(500).json({ error: 'Failed to contact OpenAI.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
