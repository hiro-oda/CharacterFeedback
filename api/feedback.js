const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { characterSettings, scenario } = req.body ?? {};

  if (!characterSettings?.trim() || !scenario?.trim()) {
    return res.status(400).json({ error: 'キャラクター設定とシナリオを入力してください。' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      messages: [
        {
          role: 'system',
          content: `あなたは以下のキャラクター設定を持つ人物です。このキャラクターとして、シナリオを読んでフィードバックを日本語でしてください。\n\nフィードバックの方針：\n- 自分のキャラクターとして自然に話すこと（一人称でコメントする）\n- キャラクターとして違和感のあるセリフ・行動・設定があれば指摘する\n- 良い点は認め、改善点は具体的に提案する\n- キャラクターの口調・性格に合った話し方をする\n\n【キャラクター設定】\n${characterSettings}`,
        },
        {
          role: 'user',
          content: `以下のシナリオを読んで、あなたのキャラクターとしてフィードバックをしてください。\n\n【シナリオ】\n${scenario}`,
        },
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    const message = error?.message ?? '不明なエラーが発生しました。';
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
};
