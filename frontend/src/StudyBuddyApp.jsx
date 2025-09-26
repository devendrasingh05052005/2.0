import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// 🚀 IMPORTANT: Ensure your FastAPI is running on http://localhost:8000
const API_BASE_URL = 'http://localhost:8000'; 

// --- Icons (using inline SVG for compatibility) ---
const BookIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20c0-.5-.5-1-1-1"/><path d="M18 17v3"/><path d="M10 2h2"/><path d="M10 6h2"/><path d="M10 10h2"/><path d="M10 14h2"/></svg>
);
const TestIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2"/><path d="M15 4h-6"/><path d="M18 7h-12c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2z"/><path d="M12 11v6"/><path d="M15 14h-6"/></svg>
);
const StatusIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/><path d="M16 4h6v6"/></svg>
);


const TABS = {
    STUDY: 'study',
    MOCK: 'mock',
    STATUS: 'status'
};

const StudyBuddyApp = () => {
    // --- Global States ---
    const [activeTab, setActiveTab] = useState(TABS.STUDY);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // --- Study Tab States ---
    const [query, setQuery] = useState('');
    const [answer, setAnswer] = useState("Hello! Start by uploading a book or asking a question about your indexed material.");
    const [selectedFile, setSelectedFile] = useState(null);
    const [savePermanent, setSavePermanent] = useState(false);
    const [uploadMessage, setUploadMessage] = useState('');

    // --- Mock Test Tab States ---
    const [mockReq, setMockReq] = useState({ num_questions: 5, difficulty_level: 'Medium' });
    const [mockResult, setMockResult] = useState(null);

    // --- Status Tab States ---
    const [systemStatus, setSystemStatus] = useState({ status: 'Loading...', documents_loaded: 0 });

    // --- Utility Function to Handle API Errors ---
    const handleError = (err, customMsg) => {
        console.error("API Call Failed:", err);
        const detail = err.response?.data?.detail || err.message;
        setError(`${customMsg}: ${detail}. Check the backend console.`);
        setLoading(false);
    };

    // ----------------------------------------------------
    // --- A. STATUS CHECK LOGIC (Runs on component load) ---
    // ----------------------------------------------------
    const fetchSystemStatus = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/info/status`);
            setSystemStatus(response.data);
            
            // Check Temp Store status via status API (if available)
            const tempStatus = await axios.get(`${API_BASE_URL}/rag/check_temp_status`);
            setSystemStatus(prev => ({ ...prev, temp_store: tempStatus.data }));

        } catch (err) {
            setSystemStatus({ status: 'OFFLINE', documents_loaded: 0, error: true });
        }
    }, []);

    useEffect(() => {
        fetchSystemStatus();
    }, [fetchSystemStatus]);

    // ----------------------------------------------------
    // --- B. UPLOAD LOGIC (Study Tab) ---
    // ----------------------------------------------------
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
            const response = await axios.post(url, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const statusMsg = response.data.status;
            setUploadMessage(`✅ Success! Status: ${statusMsg}. Chunks: ${response.data.chunks_indexed || response.data.total_documents_in_db}`);
            setAnswer(statusMsg.includes("Temporarily") ? 
                `Book "${selectedFile.name}" indexed temporarily. Ask your question now!` : 
                `Book "${selectedFile.name}" permanently saved. Ready to query.`
            );
            fetchSystemStatus(); // Update status tab
        } catch (err) {
            handleError(err, "Upload Failed");
            setUploadMessage('');
        } finally {
            setLoading(false);
            setSelectedFile(null);
        }
    };

    // ----------------------------------------------------
    // --- C. QUERY LOGIC (Study Tab) ---
    // ----------------------------------------------------
    const handleQuerySubmit = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError(null);
        setAnswer('Thinking...');

        try {
            // This hits /rag/temp_query which handles the RAM store fallback to Main DB
            const response = await axios.post(`${API_BASE_URL}/rag/temp_query`, {
                query: query,
                top_k: 5,
            });

            setAnswer(response.data.answer);
        } catch (err) {
            handleError(err, "Query Failed");
            setAnswer('Sorry, I failed to generate an answer.');
        } finally {
            setLoading(false);
        }
    };

    // ----------------------------------------------------
    // --- D. MOCK TEST LOGIC (Mock Test Tab) ---
    // ----------------------------------------------------
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

    // --- Rendering Helpers ---
    const renderContent = () => {
        switch (activeTab) {
            case TABS.STUDY:
                return (
                    <div className="space-y-6">
                        {/* Upload Section */}
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-inner">
                            <h3 className="text-xl font-semibold text-blue-700 mb-3 flex items-center gap-2"><BookIcon className="w-5 h-5"/> Index Document</h3>
                            <form onSubmit={handleFileUpload} className="flex flex-col space-y-4">
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => setSelectedFile(e.target.files[0])}
                                    disabled={loading}
                                    className="p-2 border border-gray-300 rounded-md"
                                />
                                <div className="flex items-center gap-4">
                                    <input
                                        type="checkbox"
                                        id="save"
                                        checked={savePermanent}
                                        onChange={(e) => setSavePermanent(e.target.checked)}
                                        disabled={loading}
                                        className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                                    />
                                    <label htmlFor="save" className={`font-semibold ${savePermanent ? 'text-orange-600' : 'text-gray-700'}`}>
                                        {savePermanent ? 'Save Permanently (Main DB)' : 'Use Temporarily (RAM)'}
                                    </label>
                                    <button 
                                        type="submit" 
                                        disabled={loading || !selectedFile} 
                                        className="ml-auto px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition disabled:bg-gray-400"
                                    >
                                        {loading ? 'Indexing...' : 'Index Document'}
                                    </button>
                                </div>
                                {uploadMessage && <p className="mt-2 text-sm text-green-700 font-medium">{uploadMessage}</p>}
                            </form>
                        </div>
                        
                        {/* Query Section */}
                        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-md">
                            <h3 className="text-xl font-semibold text-gray-800 mb-3">Ask Question</h3>
                            <div className="p-4 mb-4 bg-green-50 border-l-4 border-green-500 rounded-md shadow-sm">
                                <p className="font-bold text-green-700 mb-1">AI Response:</p>
                                {loading ? (
                                    <p className="text-blue-500 animate-pulse">Generating answer...</p>
                                ) : (
                                    <p className="whitespace-pre-wrap text-gray-700">{answer}</p>
                                )}
                            </div>
                            <form onSubmit={handleQuerySubmit} className="flex gap-2">
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Enter your query..."
                                    disabled={loading}
                                    className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                />
                                <button 
                                    type="submit" 
                                    disabled={loading || !query.trim()} 
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
                                >
                                    {loading ? 'Querying...' : 'Ask'}
                                </button>
                            </form>
                        </div>
                    </div>
                );

            case TABS.MOCK:
                return (
                    <div className="space-y-6">
                        <form onSubmit={handleMockTestSubmit} className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg shadow-inner flex items-center gap-4">
                            <h3 className="text-xl font-semibold text-indigo-700 flex-shrink-0">Test Config:</h3>
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium">Questions:</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={mockReq.num_questions}
                                    onChange={(e) => setMockReq(p => ({ ...p, num_questions: parseInt(e.target.value) || 1 }))}
                                    className="w-16 p-2 border rounded-md"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium">Difficulty:</label>
                                <select
                                    value={mockReq.difficulty_level}
                                    onChange={(e) => setMockReq(p => ({ ...p, difficulty_level: e.target.value }))}
                                    className="p-2 border rounded-md"
                                >
                                    {['Easy', 'Medium', 'Hard'].map(level => (
                                        <option key={level} value={level}>{level}</option>
                                    ))}
                                </select>
                            </div>
                            <button 
                                type="submit" 
                                disabled={loading || systemStatus.documents_loaded < 1} 
                                className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:bg-gray-400"
                            >
                                {loading ? 'Generating...' : 'Generate Mock Test'}
                            </button>
                        </form>
                        
                        {/* Mock Test Result */}
                        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-md min-h-[300px]">
                            <h4 className="text-lg font-bold text-gray-800 border-b pb-2 mb-3">
                                {mockResult?.test_title || (loading ? 'Generating...' : 'Test Results')}
                            </h4>
                            {systemStatus.documents_loaded < 1 && (
                                <p className="text-red-500">Note: Main DB is empty. Test quality will be poor unless documents are indexed permanently.</p>
                            )}
                            {mockResult?.questions.length > 0 ? (
                                <ol className="list-decimal list-inside space-y-4">
                                    {mockResult.questions.map((q, index) => (
                                        <li key={index} className="text-gray-700">
                                            <span className="font-semibold">{q.question_text}</span> 
                                            <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${q.difficulty === 'Hard' ? 'bg-red-100 text-red-700' : q.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                                                {q.difficulty}
                                            </span>
                                            {/* We only show source context on the backend console for now */}
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="text-gray-500">{mockResult ? "No questions generated." : "Generate a test using the form above."}</p>
                            )}
                        </div>
                    </div>
                );

            case TABS.STATUS:
                const tempStoreStatus = systemStatus.temp_store || {};
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-3 gap-6">
                            {/* Main Status Card */}
                            <StatusCard 
                                title="API Status" 
                                value={systemStatus.status} 
                                color={systemStatus.status === 'OFFLINE' ? 'red' : 'green'} 
                                icon={<StatusIcon className="w-6 h-6"/>}
                            />
                            {/* Main DB Count Card */}
                            <StatusCard 
                                title="Permanent Documents" 
                                value={systemStatus.documents_loaded || 0} 
                                color={systemStatus.documents_loaded > 0 ? 'blue' : 'gray'} 
                                icon={<BookIcon className="w-6 h-6"/>}
                            />
                            {/* Temp RAM Status Card */}
                            <StatusCard 
                                title="Temporary RAM Store" 
                                value={tempStoreStatus.is_active ? `Active (${tempStoreStatus.chunk_count} Chunks)` : 'Inactive'} 
                                color={tempStoreStatus.is_active ? 'purple' : 'gray'} 
                                icon={<TestIcon className="w-6 h-6"/>}
                            />
                        </div>
                        
                        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-md">
                            <h4 className="text-lg font-bold text-gray-800 mb-3">System Details</h4>
                            <pre className="p-3 bg-gray-50 rounded-md text-sm whitespace-pre-wrap">
                                {JSON.stringify(systemStatus, null, 2)}
                            </pre>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    // Card Component for Status Tab
    const StatusCard = ({ title, value, color, icon }) => (
        <div className={`p-5 rounded-xl shadow-lg bg-white border-l-4 border-${color}-500 flex items-center justify-between`}>
            <div>
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <p className={`text-2xl font-bold text-${color}-700 mt-1`}>{value}</p>
            </div>
            <div className={`text-${color}-500 bg-${color}-100 p-2 rounded-full`}>
                {icon}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-100 p-5">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-4xl font-extrabold text-gray-800 text-center mb-6">Study Buddy RAG Dashboard</h1>
                
                {/* Tab Navigation */}
                <div className="flex justify-center mb-6 border-b border-gray-300">
                    <TabButton name="Study & Query" tab={TABS.STUDY} active={activeTab} setActive={setActiveTab} Icon={BookIcon} />
                    <TabButton name="Mock Test Generator" tab={TABS.MOCK} active={activeTab} setActive={setActiveTab} Icon={TestIcon} />
                    <TabButton name="System Status" tab={TABS.STATUS} active={activeTab} setActive={setActiveTab} Icon={StatusIcon} />
                </div>
                
                {/* Global Error Display */}
                {error && <div className="p-3 mb-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center font-medium">{error}</div>}

                <div className="p-6 bg-white rounded-xl shadow-2xl">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

// Tab Button Component
const TabButton = ({ name, tab, active, setActive, Icon }) => (
    <button
        onClick={() => setActive(tab)}
        className={`px-6 py-3 text-lg font-medium transition duration-300 ease-in-out flex items-center gap-2 ${
            active === tab 
                ? 'text-blue-600 border-b-4 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700 hover:border-b-2 border-gray-300'
        }`}
    >
        <Icon className="w-5 h-5"/> {name}
    </button>
);

export default StudyBuddyApp;
