import { useState, useRef, useEffect } from 'react';
import useStore from '../store/useStore.js';

function cleanMarkdown(text) {
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')   // ***bold italic***
    .replace(/\*\*(.*?)\*\*/g, '$1')        // **bold**
    .replace(/\*(.*?)\*/g, '$1')            // *italic*
    .replace(/^#{1,6}\s+/gm, '')            // # headings
    .replace(/^[-*]\s+/gm, '- ')            // normalise bullets
    .replace(/`([^`]+)`/g, '$1');            // `code`
}

export default function QuestionPanel() {
  const { uploadId, chatHistory, addChatMessage, updateLastChat, isStreaming, setStreaming, suggestedQuestions, pageCount } = useStore();
  const [question, setQuestion] = useState('');
  const [selectedPages, setSelectedPages] = useState([]);
  const messagesEnd = useRef(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  if (!uploadId) return null;

  const ask = async (q) => {
    const text = q || question;
    if (!text.trim() || isStreaming) return;
    setQuestion('');
    addChatMessage({ role: 'user', text });
    addChatMessage({ role: 'assistant', text: '' });
    setStreaming(true);

    try {
      const pageNumbers = selectedPages.length > 0
        ? selectedPages
        : Array.from({ length: pageCount }, (_, i) => i + 1);

      const res = await fetch('/api/analyse/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, pageNumbers, question: text })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulated += parsed.text;
                updateLastChat(accumulated);
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (err) {
      updateLastChat(`Error: ${err.message}`);
    } finally {
      setStreaming(false);
    }
  };

  const togglePage = (p) => {
    setSelectedPages(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p].sort((a, b) => a - b)
    );
  };

  return (
    <div className="bg-white rounded-lg shadow flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <h2 className="font-semibold text-slate-700">Ask about this schematic</h2>
        {pageCount > 1 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            <span className="text-xs text-slate-400 mr-1">Pages:</span>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => togglePage(p)}
                className={`w-6 h-6 text-xs rounded ${
                  selectedPages.includes(p) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                {p}
              </button>
            ))}
            {selectedPages.length > 0 && (
              <button onClick={() => setSelectedPages([])} className="text-xs text-blue-500 ml-1">All</button>
            )}
          </div>
        )}
      </div>

      {/* Suggested questions */}
      {chatHistory.length === 0 && suggestedQuestions.length > 0 && (
        <div className="px-4 py-3 space-y-1 border-b">
          {suggestedQuestions.map((q, i) => (
            <button key={i} onClick={() => ask(q)}
              className="block w-full text-left text-sm text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded transition-colors">
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatHistory.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white text-xs'
                : 'bg-slate-100 text-slate-700 text-xs leading-relaxed'
            }`} style={{ fontFamily: 'Segoe UI, Calibri, Arial, sans-serif' }}>
              {msg.role === 'assistant' ? cleanMarkdown(msg.text) : msg.text}
              {msg.role === 'assistant' && msg.text === '' && isStreaming && (
                <span className="inline-block w-2 h-3 bg-slate-400 animate-pulse ml-1" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            placeholder="Ask a question..."
            disabled={isStreaming}
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={() => ask()} disabled={isStreaming || !question.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
