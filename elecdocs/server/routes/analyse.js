import { Router } from 'express';
import { getSession } from '../services/sessionStore.js';
import { loadSkill } from '../services/skillLoader.js';
import { answerSchematicQuestion, generateSuggestedQuestions, analyseProcessControl } from '../services/claudeService.js';
import { setSession } from '../services/sessionStore.js';

const router = Router();

// POST /api/analyse/question
router.post('/question', async (req, res) => {
  try {
    const { uploadId, pageNumbers, question } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const images = pageNumbers && pageNumbers.length > 0
      ? pageNumbers.map(n => session.pageImages[n - 1]).filter(Boolean)
      : session.pageImages;

    const skill = loadSkill('electrical-schematic-interpreter');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of answerSchematicQuestion({
      images,
      extractedText: session.extractedText,
      question,
      systemPrompt: skill
    })) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Question error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/analyse/suggestions
router.post('/suggestions', async (req, res) => {
  try {
    const { uploadId } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const questions = await generateSuggestedQuestions({
      images: session.pageImages,
      extractedText: session.extractedText
    });

    res.json({ questions });
  } catch (err) {
    console.error('Suggestions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analyse/processcontrol
router.post('/processcontrol', async (req, res) => {
  try {
    const { uploadId } = req.body;
    const session = getSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const result = await analyseProcessControl({ extractedText: session.extractedText });
    setSession(uploadId + '_processcontrol', result);
    res.json(result);
  } catch (err) {
    console.error('Process control error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
