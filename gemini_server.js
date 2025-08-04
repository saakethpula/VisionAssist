require('dotenv').config({ path: './keys.env' });
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.GEMINI_PORT || 5180;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/api/gemini-vision', async (req, res) => {
    const { imageBase64, prompt } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'No image provided.' });
    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const effectivePrompt = prompt;
        const image = {
            inlineData: {
                data: imageBase64,
                mimeType: 'image/jpeg',
            },
        };
        const result = await model.generateContent([effectivePrompt, image]);
        const response = await result.response;
        const text = response.text();
        res.json({ text });
    } catch (err) {
        console.error('Gemini Vision API error:', err);
        res.status(500).json({ error: 'Failed to analyze image with Gemini Vision.' });
    }
});

app.listen(PORT, () => {
    console.log(`Gemini Vision server running on http://localhost:${PORT}`);
});
