import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Backend API URL
const API_BASE_URL = 'http://localhost:8000';
const QUIZ_API_ENDPOINT = `${API_BASE_URL}/generate-quiz`;

// --- Icons ---
const BookIcon = (props) => (
  <svg {...props} width="24" height="24" fill="none" stroke="black" strokeWidth="2">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20c0-.5-.5-1-1-1"/>
    <path d="M18 17v3"/>
    <path d="M10 2h2"/>
    <path d="M10 6h2"/>
    <path d="M10 10h2"/>
    <path d="M10 14h2"/>
  </svg>
);

const TestIcon = (props) => (
  <svg {...props} width="24" height="24" fill="none" stroke="black" strokeWidth="2">
    <path d="M12 2v2"/>
    <path d="M15 4h-6"/>
    <path d="M18 7h-12c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2z"/>
    <path d="M12 11v6"/>
    <path d="M15 14h-6"/>
  </svg>
);

const StatusIcon = (props) => (
  <svg {...props} width="24" height="24" fill="none" stroke="black" strokeWidth="2">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <path d="M22 4L12 14.01l-3-3"/>
    <path d="M16 4h6v6"/>
  </svg>
);

// --- Tabs ---
const TABS = {
  QUERY: 'query',
  INDEX_DOC: 'index',
  MOCK: 'mock',
  STATUS: 'status'
};

// Simple card
const StatusCard = ({ title, value, icon }) => (
  <div className="status-card">
    <h3>{title}</h3>
    <p><strong>{value}</strong></p>
    {icon}
  </div>
);

const App = () => {
  const [activeTab, setActiveTab] = useState(TABS.QUERY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Indexing states
  const [selectedFile, setSelectedFile] = useState(null);
  const [savePermanent, setSavePermanent] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  // Query states
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState("Hello! Start by uploading a document or asking a question.");
  const [chatHistory, setChatHistory] = useState([]);

  // Quiz states
  const [mockReq, setMockReq] = useState({ topic: '', num_questions: 5, difficulty_level: 'Medium' });
  const [mockResult, setMockResult] = useState(null);

  // System status
  const [systemStatus, setSystemStatus] = useState({ status: 'Loading...', documents_loaded: 0 });

  // --- Utils ---
  const handleError = (err, customMsg) => {
    console.error("API Error:", err);
    const detail = err.response?.data?.detail || err.message;
    setError(`${customMsg}: ${detail}`);
    setLoading(false);
  };

  const fetchSystemStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/info/status`);
      setSystemStatus(response.data);

      const tempStatus = await axios.get(`${API_BASE_URL}/rag/check_temp_status`);
      setSystemStatus(prev => ({ ...prev, temp_store: tempStatus.data }));
    } catch (err) {
      setSystemStatus({ status: 'OFFLINE', documents_loaded: 0, error: true });
    }
  }, []);

  useEffect(() => {
    fetchSystemStatus();
  }, [fetchSystemStatus]);

  // --- File upload ---
  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setLoading(true);
    setError(null);
    setUploadMessage('Indexing document...');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const url = `${API_BASE_URL}/rag/upload?save_permanent=${savePermanent}`;
      const response = await axios.post(url, formData);

      const statusMsg = response.data.status;
      setUploadMessage(`✅ Success: ${statusMsg}`);
      setAnswer(`Book "${selectedFile.name}" indexed. Ready to ask questions.`);
      fetchSystemStatus();
    } catch (err) {
      handleError(err, "Upload Failed");
      setUploadMessage('');
    } finally {
      setLoading(false);
      setSelectedFile(null);
    }
  };

  // --- Query submit ---
  const handleQuerySubmit = async (e) => {
    e.preventDefault();
    const currentQuery = query.trim();
    if (!currentQuery) return;

    setQuery('');
    setLoading(true);
    setError(null);
    setAnswer('Thinking...');

    const tempEntry = { query: currentQuery, answer: 'Generating...' };
    setChatHistory(prev => [...prev, tempEntry]);

    try {
      const response = await axios.post(`${API_BASE_URL}/rag/temp_query`, { query: currentQuery, top_k: 5 });
      const newAnswer = response.data.answer;

      setAnswer(newAnswer);
      setChatHistory(prev => {
        const updated = [...prev];
        updated[updated.length - 1].answer = newAnswer;
        return updated;
      });
    } catch (err) {
      handleError(err, "Query Failed");
    } finally {
      setLoading(false);
    }
  };

  // --- Quiz submit ---
  const handleTestSubmit = async (e) => {
    e.preventDefault();
    if (!mockReq.topic.trim()) {
      setError("Please enter a topic.");
      return;
    }

    setLoading(true);
    setError(null);
    setMockResult(null);

    try {
      const response = await axios.post(QUIZ_API_ENDPOINT, {
        topic: mockReq.topic,
        num_questions: mockReq.num_questions,
        difficulty: mockReq.difficulty_level
      });

      // Response can be [] or {questions: []}
      setMockResult(Array.isArray(response.data) ? response.data : response.data.questions || []);
    } catch (err) {
      handleError(err, "Quiz Generation Failed");
      setMockResult([]);
    } finally {
      setLoading(false);
    }
  };

  // --- Render Tabs ---
  const renderContent = () => {
    switch (activeTab) {
      case TABS.INDEX_DOC:
        return (
          <div>
            <h3>Upload Document</h3>
            <form onSubmit={handleFileUpload}>
              <input type="file" accept=".pdf" onChange={(e) => setSelectedFile(e.target.files[0])} disabled={loading}/>
              <button type="submit" disabled={loading || !selectedFile}>
                {loading ? 'Indexing...' : 'Index'}
              </button>
            </form>
            {uploadMessage && <p>{uploadMessage}</p>}
          </div>
        );

      case TABS.QUERY:
        return (
          <div>
            <h3>Ask Question</h3>
            <div>
              <p><strong>AI:</strong> {answer}</p>
              {chatHistory.map((chat, i) => (
                <div key={i}>
                  <p><strong>You:</strong> {chat.query}</p>
                  <p><strong>AI:</strong> {chat.answer}</p>
                </div>
              ))}
            </div>
            <form onSubmit={handleQuerySubmit}>
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter query..." disabled={loading}/>
              <button type="submit" disabled={loading}>Ask</button>
            </form>
          </div>
        );

      case TABS.MOCK:
        return (
          <div>
            <h3>Quiz Generator</h3>
            <form onSubmit={handleTestSubmit}>
              <input type="text" value={mockReq.topic} onChange={(e) => setMockReq(p => ({...p, topic: e.target.value}))} placeholder="Topic"/>
              <input type="number" min="1" max="20" value={mockReq.num_questions} onChange={(e) => setMockReq(p => ({...p, num_questions: parseInt(e.target.value) || 1}))}/>
              <select value={mockReq.difficulty_level} onChange={(e) => setMockReq(p => ({...p, difficulty_level: e.target.value}))}>
                {['Easy','Medium','Hard'].map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
              </select>
              <button type="submit" disabled={loading}>Generate</button>
            </form>

            {mockResult && mockResult.length > 0 && (
              <div>
                <h4>Generated Quiz</h4>
                <ol>
                  {mockResult.map((q, i) => (
                    <li key={i}>
                      <p><strong>Q{i+1}:</strong> {q.question}</p>
                      {q.options && (
                        <ul>
                          {Object.entries(q.options).map(([key, val]) => (
                            <li key={key}><strong>{key}:</strong> {val}</li>
                          ))}
                        </ul>
                      )}
                      {q.correct_answer && <p style={{color: "green"}}><strong>Correct:</strong> {q.correct_answer}</p>}
                      {q.explanation && <p><strong>Explanation:</strong> {q.explanation}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        );

      case TABS.STATUS:
        const temp = systemStatus.temp_store || {};
        return (
          <div>
            <h3>Status</h3>
            <StatusCard title="API" value={systemStatus.status} icon={<StatusIcon/>}/>
            <StatusCard title="Docs" value={systemStatus.documents_loaded} icon={<BookIcon/>}/>
            <StatusCard title="Temp Store" value={temp.is_active ? `Active (${temp.chunk_count} Chunks)` : 'Inactive'} icon={<TestIcon/>}/>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      <h1>Study Buddy Dashboard</h1>
      <div className="tab-navigation">
        {Object.entries(TABS).map(([key, val]) => (
          <button key={val} onClick={() => setActiveTab(val)} className={activeTab === val ? 'active' : ''}>
            {val}
          </button>
        ))}
      </div>
      {error && <div style={{color:"red"}}>{error}</div>}
      <div className="content-area">{renderContent()}</div>
    </div>
  );
};

export default App;
