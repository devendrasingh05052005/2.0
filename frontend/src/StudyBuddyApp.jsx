import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';


// Backend API URL
const API_BASE_URL = 'http://localhost:8000';

// Icons (inline SVG)
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

const UploadIcon = (props) => (
  <svg {...props} width="24" height="24" fill="none" stroke="black" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

// Tabs
const TABS = {
  QUERY: 'query',
  INDEX_DOC: 'index',
  MOCK: 'mock',
  STATUS: 'status'
};

const App = () => {
  const [activeTab, setActiveTab] = useState(TABS.QUERY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [savePermanent, setSavePermanent] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState("Hello! Start by uploading a document or asking a question.");

  const [mockReq, setMockReq] = useState({ num_questions: 5, difficulty_level: 'Medium' });
  const [mockResult, setMockResult] = useState(null);

  const [systemStatus, setSystemStatus] = useState({ status: 'Loading...', documents_loaded: 0 });

  const handleError = (err, customMsg) => {
    console.error("API Call Failed:", err);
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
      setUploadMessage(`Success! Status: ${statusMsg}`);
      setAnswer(statusMsg.includes("Temporarily") ? 
        `Book "${selectedFile.name}" indexed temporarily. Go to 'Study & Query' tab to ask questions.` : 
        `Book "${selectedFile.name}" permanently saved. Go to 'Study & Query' tab to ask questions.`
      );

      fetchSystemStatus();
    } catch (err) {
      handleError(err, "Upload Failed");
      setUploadMessage('');
    } finally {
      setLoading(false);
      setSelectedFile(null);
    }
  };

  const handleQuerySubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer('Thinking...');

    try {
      const response = await axios.post(`${API_BASE_URL}/rag/temp_query`, { query, top_k: 5 });
      setAnswer(response.data.answer);
    } catch (err) {
      handleError(err, "Query Failed");
      setAnswer('Sorry, I failed to generate an answer.');
    } finally {
      setLoading(false);
    }
  };

  const handleMockTestSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMockResult(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/mock/generate`, mockReq);
      setMockResult(response.data);
    } catch (err) {
      handleError(err, "Mock Test Generation Failed");
      setMockResult({ test_title: "Generation Error", questions: [] });
    } finally {
      setLoading(false);
    }
  };

  const StatusCard = ({ title, value, icon }) => (
    <div>
      <div>{title}</div>
      <div>{value}</div>
      <div>{icon}</div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case TABS.INDEX_DOC:
        return (
          <div>
            <h3>Document Upload & Indexing</h3>
            <form onSubmit={handleFileUpload}>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setSelectedFile(e.target.files[0])}
                disabled={loading}
              />
              <div>
                <input
                  type="checkbox"
                  id="save"
                  checked={savePermanent}
                  onChange={(e) => setSavePermanent(e.target.checked)}
                  disabled={loading}
                />
                <label htmlFor="save">{savePermanent ? 'Save Permanently' : 'Use Temporarily'}</label>
                <button type="submit" disabled={loading || !selectedFile}>{loading ? 'Indexing...' : 'Index Document'}</button>
              </div>
            </form>
            {uploadMessage && <p>{uploadMessage}</p>}
          </div>
        );
      case TABS.QUERY:
        return (
          <div>
            <h3>Ask Question (RAG)</h3>
            <div>
              <p>AI Response:</p>
              <p>{loading ? 'Generating answer...' : answer}</p>
            </div>
            <form onSubmit={handleQuerySubmit}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter your query..."
                disabled={loading}
              />
              <button type="submit" disabled={loading || !query.trim()}>{loading ? 'Querying...' : 'Ask'}</button>
            </form>
          </div>
        );
      case TABS.MOCK:
        return (
          <div>
            <h3>Mock Test Generator</h3>
            <form onSubmit={handleMockTestSubmit}>
              <label>Questions:</label>
              <input type="number" min="1" max="20" value={mockReq.num_questions} onChange={(e) => setMockReq(p => ({...p, num_questions: parseInt(e.target.value) || 1}))}/>
              <label>Difficulty:</label>
              <select value={mockReq.difficulty_level} onChange={(e) => setMockReq(p => ({...p, difficulty_level: e.target.value}))}>
                {['Easy','Medium','Hard'].map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
              </select>
              <button type="submit" disabled={loading || systemStatus.documents_loaded < 1}>{loading ? 'Generating...' : 'Generate Mock Test'}</button>
            </form>
            {mockResult && (
              <div>
                <h4>{mockResult.test_title || 'Test Results'}</h4>
                {mockResult.questions.length > 0 ? (
                  <ol>
                    {mockResult.questions.map((q,i) => (
                      <li key={i}>{q.question_text} ({q.difficulty})</li>
                    ))}
                  </ol>
                ) : <p>No questions generated.</p>}
              </div>
            )}
          </div>
        );
      case TABS.STATUS:
        const tempStoreStatus = systemStatus.temp_store || {};
        return (
          <div>
            <StatusCard title="API Status" value={systemStatus.status} icon={<StatusIcon/>}/>
            <StatusCard title="Permanent Documents" value={systemStatus.documents_loaded || 0} icon={<BookIcon/>}/>
            <StatusCard title="Temporary RAM Store" value={tempStoreStatus.is_active?`Active (${tempStoreStatus.chunk_count} Chunks)`:'Inactive'} icon={<TestIcon/>}/>
            <pre>{JSON.stringify(systemStatus, null, 2)}</pre>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div>
      <h1>Study Buddy RAG Dashboard</h1>
      <div>
        <button onClick={()=>setActiveTab(TABS.INDEX_DOC)}>Index Document</button>
        <button onClick={()=>setActiveTab(TABS.QUERY)}>Study & Query</button>
        <button onClick={()=>setActiveTab(TABS.MOCK)}>Mock Test Generator</button>
        <button onClick={()=>setActiveTab(TABS.STATUS)}>System Status</button>
      </div>
      {error && <div>{error}</div>}
      <div>{renderContent()}</div>
    </div>
  );
};

export default App;
