import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Backend API URL
const API_BASE_URL = 'http://localhost:8000';
// New Quiz API endpoint
const QUIZ_API_ENDPOINT = `${API_BASE_URL}/generate-quiz`;

// --- Icons (inline SVG with black stroke) ---
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

// Simple StatusCard component without excessive styling
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

  // --- Index Document States ---
  const [selectedFile, setSelectedFile] = useState(null);
  const [savePermanent, setSavePermanent] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  // --- Query States ---
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState("Hello! Start by uploading a document or asking a question."); 
  const [chatHistory, setChatHistory] = useState([]);

  // --- Mock Test/Quiz States ---
  const [mockReq, setMockReq] = useState({ 
    topic: '',
    num_questions: 5, 
    difficulty_level: 'Medium' 
  });
  const [mockResult, setMockResult] = useState(null);

  // --- Status States ---
  const [systemStatus, setSystemStatus] = useState({ status: 'Loading...', documents_loaded: 0 });

  // --- Utility Functions ---
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
      setUploadMessage(`✅ Success! Status: ${statusMsg}`);
      
      setChatHistory([]);
      setAnswer(statusMsg.includes("Temporarily") ? 
        `Book "${selectedFile.name}" indexed temporarily. Ready to ask questions.` : 
        `Book "${selectedFile.name}" permanently saved. Ready to ask questions.`
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
    const currentQuery = query.trim();
    if (!currentQuery) return;

    setQuery(''); 
    setLoading(true);
    setError(null);
    setAnswer('Thinking...');

    const tempHistoryEntry = { query: currentQuery, answer: 'Generating answer...' };
    setChatHistory(prev => [...prev, tempHistoryEntry]);

    try {
      const response = await axios.post(`${API_BASE_URL}/rag/temp_query`, { query: currentQuery, top_k: 5 });
      const newAnswer = response.data.answer;
      
      setAnswer(newAnswer); 
      
      setChatHistory(prev => {
          const updatedHistory = [...prev];
          const lastIndex = updatedHistory.length - 1;
          if (updatedHistory[lastIndex]?.query === currentQuery) {
              updatedHistory[lastIndex].answer = newAnswer;
          } else {
              updatedHistory.push({ query: currentQuery, answer: newAnswer });
          }
          return updatedHistory;
      });

    } catch (err) {
      handleError(err, "Query Failed");
      const failedAnswer = 'Error: Failed to generate answer.';
      setAnswer(failedAnswer);
      
      setChatHistory(prev => {
          const updatedHistory = [...prev];
          const lastIndex = updatedHistory.length - 1;
          if (updatedHistory[lastIndex]?.query === currentQuery) {
              updatedHistory[lastIndex].answer = failedAnswer;
          } else {
              updatedHistory.push({ query: currentQuery, answer: failedAnswer });
          }
          return updatedHistory;
      });
      
    } finally {
      setLoading(false);
    }
  };

  const handleTestSubmit = async (e) => {
    e.preventDefault();
    const topic = mockReq.topic.trim();
    
    if (!topic) {
      setError("Please enter a topic to generate a quiz.");
      return;
    }

    setLoading(true);
    setError(null);
    setMockResult(null);

    try {
      const payload = {
        topic: topic,
        num_questions: mockReq.num_questions
      };

      console.log('Sending quiz request:', payload);
      const response = await axios.post(QUIZ_API_ENDPOINT, payload);
      console.log('Raw quiz response received:', response.data);
      console.log('Response keys:', Object.keys(response.data));
      console.log('Questions array:', response.data.questions || 'No questions key found');
      
      setMockResult(response.data);
    } catch (err) {
      console.error('Quiz generation error:', err); // Debug log
      handleError(err, "Quiz/Test Generation Failed");
      setMockResult({ test_title: "Generation Error", questions: [] });
    } finally {
      setLoading(false);
    }
  };

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
              <div className="upload-options">
                <input
                  type="checkbox"
                  id="save"
                  checked={savePermanent}
                  onChange={(e) => setSavePermanent(e.target.checked)}
                  disabled={loading}
                />
                <label htmlFor="save">{savePermanent ? 'Save Permanently' : 'Use Temporarily'}</label>
                <button type="submit" disabled={loading || !selectedFile}>
                  {loading ? 'Indexing...' : 'Index Document'}
                </button>
              </div>
            </form>
            {uploadMessage && <p className="upload-message">{uploadMessage}</p>}
          </div>
        );

      case TABS.QUERY:
        return (
          <div>
            <h3>Ask Question (RAG)</h3>

            <div className="chat-history">
                <div className="current-answer">
                    <p><strong>Current AI Response:</strong></p>
                    <p>{loading ? 'Generating answer...' : answer}</p>
                </div>
                
                {chatHistory.slice().reverse().map((chat, index) => (
                    <div key={index} className="chat-entry">
                        <p><strong>You:</strong> {chat.query}</p>
                        <p><strong>AI:</strong> {chat.answer}</p>
                    </div>
                ))}
            </div>

            <form onSubmit={handleQuerySubmit} className="query-form">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter your query..."
                disabled={loading}
                className="query-input"
              />
              <button 
                type="submit" 
                disabled={loading || !query.trim()} 
                className="query-button"
              >
                {loading ? 'Querying...' : 'Ask'}
              </button>
            </form>
          </div>
        );

      case TABS.MOCK:
        return (
          <div>
            <h3>Quiz/Test Generator</h3>
            <form onSubmit={handleTestSubmit} className="quiz-form">
              <div className="form-row">
                <label>Topic:</label>
                <input 
                  type="text" 
                  value={mockReq.topic} 
                  onChange={(e) => setMockReq(p => ({...p, topic: e.target.value}))} 
                  placeholder="e.g., Photosynthesis or Chapter 5 Summary"
                  className="topic-input"
                />
              </div>
              
              <div className="form-controls">
                <label>Questions:</label>
                <input 
                  type="number" 
                  min="1" 
                  max="20" 
                  value={mockReq.num_questions} 
                  onChange={(e) => setMockReq(p => ({...p, num_questions: parseInt(e.target.value) || 1}))} 
                  className="number-input"
                />
                
                <label>Difficulty:</label>
                <select 
                  value={mockReq.difficulty_level} 
                  onChange={(e) => setMockReq(p => ({...p, difficulty_level: e.target.value}))} 
                  className="difficulty-select"
                >
                  {['Easy','Medium','Hard'].map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
                
                <button 
                  type="submit"
                  disabled={loading || !mockReq.topic.trim()} 
                  className="generate-button"
                >
                  {loading ? 'Generating...' : 'Generate Quiz/Test'}
                </button>
              </div>
            </form>

            {mockResult && (
              <div className="quiz-results">
                <h4>{mockResult.test_title || mockResult.title || 'Generated Quiz'}</h4>
                
                {/* Debug info - remove after fixing */}
                <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f0f0f0', fontSize: '0.8rem' }}>
                  <strong>Debug Info:</strong> Found {mockResult.questions ? mockResult.questions.length : 0} questions
                  <br />
                  <strong>Keys in response:</strong> {Object.keys(mockResult).join(', ')}
                </div>
                
                {/* Try different possible structures */}
                {(() => {
                  // Check various possible question array locations
                  let questions = mockResult.questions || mockResult.quiz_questions || mockResult.data?.questions || [];
                  
                  // If questions is a string, try to parse it
                  if (typeof questions === 'string') {
                    try {
                      questions = JSON.parse(questions);
                    } catch (e) {
                      console.error('Failed to parse questions string:', e);
                      questions = [];
                    }
                  }
                  
                  // If mockResult itself has question-like properties, treat it as a single question
                  if (!questions.length && (mockResult.question_text || mockResult.question)) {
                    questions = [mockResult];
                  }
                  
                  console.log('Processed questions:', questions);
                  
                  return questions.length > 0 ? (
                    <div className="questions-list">
                      <ol>
                        {questions.map((q, i) => {
                          // Handle different question formats
                          const questionText = q.question_text || q.question || q.text || q.prompt || `Question ${i + 1}`;
                          const options = q.options || q.choices || q.answers || [];
                          const correctAnswer = q.correct_answer || q.answer || q.correct || q.solution;
                          const difficulty = q.difficulty || q.level || 'Medium';
                          
                          return (
                            <li key={i} className="question-item">
                              <div className="question-text">{questionText}</div>
                              
                              <span className={`difficulty-badge difficulty-${difficulty.toLowerCase()}`}>
                                {difficulty}
                              </span>
                              
                              {options.length > 0 && (
                                <ul className="question-options">
                                  {options.map((option, idx) => (
                                    <li key={idx} data-option={String.fromCharCode(65 + idx)}>
                                      {option}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              
                              {correctAnswer && (
                                <p className="correct-answer">
                                  <strong>Answer:</strong> {correctAnswer}
                                </p>
                              )}
                              
                              {/* Show raw question data for debugging */}
                              <details style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                                <summary style={{ cursor: 'pointer', color: '#666' }}>
                                  Raw question data
                                </summary>
                                <pre style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#f5f5f5' }}>
                                  {JSON.stringify(q, null, 2)}
                                </pre>
                              </details>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ) : (
                    <div className="no-questions">
                      <p style={{ color: '#d32f2f', fontWeight: 'bold' }}>
                        No questions found in the response!
                      </p>
                      <p>Please check the backend response format.</p>
                      
                      <details style={{ marginTop: '1rem' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                          Show Full Backend Response
                        </summary>
                        <pre style={{ 
                          marginTop: '0.5rem', 
                          padding: '1rem', 
                          backgroundColor: '#f5f5f5', 
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          overflow: 'auto'
                        }}>
                          {JSON.stringify(mockResult, null, 2)}
                        </pre>
                      </details>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );

      case TABS.STATUS:
        const tempStoreStatus = systemStatus.temp_store || {};
        return (
          <div>
            <h3>System Status</h3>
            <div className="status-cards">
              <StatusCard title="API Status" value={systemStatus.status} icon={<StatusIcon/>}/>
              <StatusCard title="Permanent Documents" value={systemStatus.documents_loaded || 0} icon={<BookIcon/>}/>
              <StatusCard title="Temporary RAM Store" value={tempStoreStatus.is_active ? `Active (${tempStoreStatus.chunk_count || 0} Chunks)` : 'Inactive'} icon={<TestIcon/>}/>
            </div>
            
            <h4>Detailed Status Information:</h4>
            <div className="status-details">
              <p><strong>API Status:</strong> {systemStatus.status}</p>
              <p><strong>Documents Loaded:</strong> {systemStatus.documents_loaded || 0}</p>
              <p><strong>Temp Store Active:</strong> {tempStoreStatus.is_active ? 'Yes' : 'No'}</p>
              {tempStoreStatus.is_active && (
                <>
                  <p><strong>Chunks in Memory:</strong> {tempStoreStatus.chunk_count || 0}</p>
                  <p><strong>Document Name:</strong> {tempStoreStatus.document_name || 'N/A'}</p>
                </>
              )}
            </div>
          </div>
        );
      
      default: 
        return null;
    }
  };

  return (
    <div className="app-container">
      <h1>Study Buddy RAG Dashboard</h1>
      
      <div className="tab-navigation">
        <button 
          onClick={() => setActiveTab(TABS.INDEX_DOC)} 
          className={activeTab === TABS.INDEX_DOC ? 'tab-button active' : 'tab-button'}
        >
          Index Document
        </button>
        <button 
          onClick={() => setActiveTab(TABS.QUERY)} 
          className={activeTab === TABS.QUERY ? 'tab-button active' : 'tab-button'}
        >
          Study & Query
        </button>
        <button 
          onClick={() => setActiveTab(TABS.MOCK)} 
          className={activeTab === TABS.MOCK ? 'tab-button active' : 'tab-button'}
        >
          Quiz/Test Generator
        </button>
        <button 
          onClick={() => setActiveTab(TABS.STATUS)} 
          className={activeTab === TABS.STATUS ? 'tab-button active' : 'tab-button'}
        >
          System Status
        </button>
      </div>
      
      {error && <div className="error-message">Error: {error}</div>}
      
      <div className="content-area">
        {renderContent()}
      </div>
    </div>
  );
};

export default App;