import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  ChevronRight, 
  ShieldAlert, 
  IndianRupee, 
  XOctagon, 
  Loader2, 
  CheckCircle2, 
  RefreshCcw,
  Languages,
  Info,
  MessageSquare,
  Send,
  Zap,
  ListChecks,
  AlertTriangle,
  History,
  X,
  Sparkles,
  LayoutGrid,
  Edit3,
  Clock,
  Layout
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from '@google/genai';
import { cn, fileToBase64 } from '@/src/lib/utils';
import mammoth from 'mammoth';

// Types for the AI output
interface ActionStep {
  step: string;
  days: number;
  priority: 'low' | 'medium' | 'high';
}

interface SuggestedClause {
  title: string;
  current?: string;
  suggested: string;
  benefit: string;
}

interface DocumentSummary {
  document_summary: {
    hidden_risks: {
      language: string;
      summary: string;
    };
    financial_obligations: {
      language: string;
      summary: string;
    };
    termination_clauses: {
      language: string;
      summary: string;
    };
    risk_score: number;
    risk_score_logic: string;
    action_steps: ActionStep[];
    suggested_clauses: SuggestedClause[];
  };
}

interface RiskConfig {
  financial: number; // 1-5
  termination: number; // 1-5
  hidden_legal: number; // 1-5
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const AI_MODEL = 'gemini-3-flash-preview';

const SUPPORTED_LANGUAGES = [
  { id: 'hindi', label: 'Hindi (हिंदी)' },
  { id: 'marathi', label: 'Marathi (मराठी)' },
  { id: 'bengali', label: 'Bengali (বাংলা)' },
  { id: 'tamil', label: 'Tamil (தமிழ்)' },
  { id: 'telugu', label: 'Telugu (తెలుగు)' },
  { id: 'gujarati', label: 'Gujarati (ગુજરાતી)' },
  { id: 'kannada', label: 'Kannada (ಕನ್ನಡ)' },
  { id: 'punjabi', label: 'Punjabi (ਪੰਜਾਬী)' },
  { id: 'english', label: 'English' }
];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>('hindi');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DocumentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [userInput, setUserInput] = useState('');
  
  // New States
  const [riskConfig, setRiskConfig] = useState<RiskConfig>({
    financial: 3,
    termination: 3,
    hidden_legal: 3
  });
  const [activeTab, setActiveTab] = useState<'summary' | 'drafting' | 'timeline'>('summary');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    processFile(selectedFile);
  };

  const processFile = async (selectedFile: File | undefined) => {
    if (selectedFile) {
      const type = selectedFile.type;
      const validTypes = [
        'image/jpeg', 'image/png', 'image/webp', 
        'application/pdf', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
      ];

      if (!validTypes.includes(type)) {
        setError('Unsupported format. Please upload an image, PDF, or Word document.');
        return;
      }

      setFile(selectedFile);
      setError(null);
      setResult(null);
      setChatMessages([]);

      if (type.startsWith('image/')) {
        setPreview(URL.createObjectURL(selectedFile));
      } else {
        setPreview(null);
      }
    }
  };

  const loadExample = () => {
    // A sample text simulating a rental agreement
    const exampleText = `RENTAL AGREEMENT
This agreement is made on 1st May 2024 between Mr. Sharma (Landlord) and Ms. Gupta (Tenant).
The monthly rent is ₹25,000. 
Security Deposit: ₹1,00,000 (Non-refundable if tenant leaves before 6 months).
Late Fee: ₹500 per day after the 5th of each month.
Notice Period: 3 months for both parties.
Maintenance: All minor and major repairs including structural damage to be borne by the tenant.
Termination: Landlord can terminate immediately if any relative of the tenant visits.`;

    const blob = new Blob([exampleText], { type: 'text/plain' });
    const exampleFile = new File([blob], 'example_contract.txt', { type: 'text/plain' });
    
    setFile(exampleFile);
    setError(null);
    setResult(null);
    setChatMessages([]);
    setPreview(null);
  };

  const analyzeDocument = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      let contentPart: any;
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        const base64Data = await fileToBase64(file);
        contentPart = { inlineData: { data: base64Data, mimeType: file.type } };
      } else if (file.type.includes('word') || file.type.includes('officedocument') || file.type === 'text/plain') {
        let textContent = '';
        if (file.type === 'text/plain') {
          textContent = await file.text();
        } else {
          const arrayBuffer = await file.arrayBuffer();
          const { value: extractedText } = await mammoth.extractRawText({ arrayBuffer });
          textContent = extractedText;
        }
        contentPart = { text: `Document Content: ${textContent}` };
      }

      const prompt = `Analyze this legal document and extract key insights.
      User Risk Preferences (Weight 1-5, where 5 is critical):
      - Financial Penalties Priority: ${riskConfig.financial}
      - Termination Flexibility Priority: ${riskConfig.termination}
      - Hidden Clauses/Ambiguity Priority: ${riskConfig.hidden_legal}

      Tasks:
      1. Summarize Hidden Risks, Financial Obligations, and Termination in simple ${language}.
      2. Calculate a Risk Score (0-100) HEAVILY WEIGHTED by the User Risk Preferences above.
      3. Logic for score in ${language}.
      4. Suggested Clauses: Identify 2-3 improved clauses or missing language to better protect the user, based context (e.g. if lease, suggest notice period changes). Title & suggested text in ${language}.
      5. Action Steps: Provide 4 chronological steps with priority (low/medium/high) and estimated days taken for that step.

      Output JSON format:
      {
        "document_summary": {
          "hidden_risks": { "language": "${language}", "summary": "..." },
          "financial_obligations": { "language": "${language}", "summary": "..." },
          "termination_clauses": { "language": "${language}", "summary": "..." },
          "risk_score": number,
          "risk_score_logic": "...",
          "action_steps": [
            { "step": "...", "days": number, "priority": "low|medium|high" }
          ],
          "suggested_clauses": [
            { "title": "...", "current": "...", "suggested": "...", "benefit": "..." }
          ]
        }
      }`;

      const response = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ parts: [ { text: prompt }, contentPart ] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              document_summary: {
                type: Type.OBJECT,
                properties: {
                  hidden_risks: {
                    type: Type.OBJECT,
                    properties: { language: { type: Type.STRING }, summary: { type: Type.STRING } },
                    required: ['language', 'summary']
                  },
                  financial_obligations: {
                    type: Type.OBJECT,
                    properties: { language: { type: Type.STRING }, summary: { type: Type.STRING } },
                    required: ['language', 'summary']
                  },
                  termination_clauses: {
                    type: Type.OBJECT,
                    properties: { language: { type: Type.STRING }, summary: { type: Type.STRING } },
                    required: ['language', 'summary']
                  },
                  risk_score: { type: Type.NUMBER },
                  risk_score_logic: { type: Type.STRING },
                  action_steps: { 
                    type: Type.ARRAY, 
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        step: { type: Type.STRING },
                        days: { type: Type.NUMBER },
                        priority: { type: Type.STRING }
                      },
                      required: ['step', 'days', 'priority']
                    }
                  },
                  suggested_clauses: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        current: { type: Type.STRING },
                        suggested: { type: Type.STRING },
                        benefit: { type: Type.STRING }
                      },
                      required: ['title', 'suggested', 'benefit']
                    }
                  }
                },
                required: ['hidden_risks', 'financial_obligations', 'termination_clauses', 'risk_score', 'risk_score_logic', 'action_steps', 'suggested_clauses']
              }
            },
            required: ['document_summary']
          }
        }
      });

      const parsedResult = JSON.parse(response.text || '{}');
      setResult(parsedResult as DocumentSummary);
      setChatMessages([
        { role: 'assistant', content: `Analysis complete in ${language}. You can now ask me any specific questions about this document.` }
      ]);
    } catch (err: any) {
      console.error(err);
      setError('Analysis failed. The document might be too complex or the format is unreadable.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || !result || isChatLoading) return;

    const currentInput = userInput;
    setUserInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: currentInput }]);
    setIsChatLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are a legal assistant. Based on the document we analyzed: 
      Summary: ${JSON.stringify(result)}
      
      User asks: "${currentInput}"
      Answer concisely in ${language}.`;

      const response = await ai.models.generateContent({
        model: AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      setChatMessages(prev => [...prev, { role: 'assistant', content: response.text || "I'm sorry, I couldn't process that." }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Error connecting to AI. Please try again." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    processFile(droppedFile);
  }, []);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setChatMessages([]);
  };

  return (
    <div className="min-h-screen bg-brand-bg text-slate-300 font-sans selection:bg-blue-900/30 overflow-x-hidden">
      {/* Background Subtle Gradient */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.4]" 
           style={{ backgroundImage: 'radial-gradient(circle at 50% -20%, #1e293b, transparent)' }} />

      <div className="relative max-w-7xl mx-auto px-6 py-12 md:py-16">
        {/* Header */}
        <header className="mb-12 border-l-4 border-blue-600 pl-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-xs font-semibold uppercase tracking-widest mb-4 border border-blue-500/20">
              <Zap className="w-3 h-3 animate-pulse" />
              Intelligence Engine v2.0
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4 font-display">
              Legal Ledger <span className="text-blue-500">AI</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl leading-relaxed">
              Scan contracts, agreements & legal papers. Get instant clarity in your preferred language.
            </p>
          </motion.div>
          
          <button 
            onClick={loadExample}
            className="text-xs font-bold text-slate-400 border border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-800 transition-all flex items-center gap-2"
          >
            <History className="w-3 h-3" /> Load Example Document
          </button>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Left Column: UI Controls */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-brand-elevated rounded-2xl border border-brand-border shadow-2xl overflow-hidden p-6 transition-all">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Document Setup</h2>
              </div>
              
              <div className="space-y-6">
                {/* Risk Weight Panel */}
                <div className="bg-brand-deep rounded-xl p-4 border border-brand-border space-y-4">
                  <h3 className="text-[10px] font-bold text-blue-500 uppercase flex items-center gap-2">
                    <ShieldAlert className="w-3 h-3" /> Risk Weighting
                  </h3>
                  <div className="space-y-3">
                    <WeightSelector 
                      label="Financial Exposure" 
                      value={riskConfig.financial} 
                      onChange={(v) => setRiskConfig(p => ({...p, financial: v}))} 
                    />
                    <WeightSelector 
                      label="Exit Conditions" 
                      value={riskConfig.termination} 
                      onChange={(v) => setRiskConfig(p => ({...p, termination: v}))} 
                    />
                    <WeightSelector 
                      label="Legal Clarity" 
                      value={riskConfig.hidden_legal} 
                      onChange={(v) => setRiskConfig(p => ({...p, hidden_legal: v}))} 
                    />
                  </div>
                </div>

                {/* Language Grid */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-wider">
                    Output Language
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SUPPORTED_LANGUAGES.map(lang => (
                      <button
                        key={lang.id}
                        onClick={() => setLanguage(lang.id)}
                        className={cn(
                          "py-2 px-2 rounded-lg text-[10px] font-bold transition-all border outline-none truncate",
                          language === lang.id 
                            ? "bg-blue-600 text-white border-blue-500 shadow-lg" 
                            : "bg-brand-card text-slate-600 border-transparent hover:border-slate-700 hover:text-slate-400"
                        )}
                      >
                        {lang.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Unified Upload Zone */}
                <div>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "relative aspect-[16/9] flex flex-col items-center justify-center border border-dashed rounded-xl transition-all cursor-pointer overflow-hidden",
                      isDragging ? "border-blue-500 bg-blue-500/5 rotate-1" : "border-brand-border bg-brand-card hover:bg-brand-card/80",
                      file ? "border-solid border-slate-700" : ""
                    )}
                  >
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,.pdf,.docx,.doc" className="hidden" />
                    
                    {preview ? (
                      <div className="relative w-full h-full">
                        <img src={preview} alt="Document" className="w-full h-full object-cover opacity-40 group-hover:opacity-20" />
                        <div className="absolute inset-0 flex items-center justify-center">
                           <RefreshCcw className="w-6 h-6 text-white/50" />
                        </div>
                      </div>
                    ) : file ? (
                      <div className="text-center p-4">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mx-auto mb-3 border border-blue-500/20">
                          <FileText className="w-6 h-6 text-blue-500" />
                        </div>
                        <p className="text-[11px] font-bold text-slate-300 line-clamp-1">{file.name}</p>
                      </div>
                    ) : (
                      <div className="text-center p-6 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all">
                        <Upload className="w-6 h-6 text-blue-500 mx-auto mb-3" />
                        <p className="text-[11px] font-black uppercase text-slate-400">Import Contract</p>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  disabled={!file || isAnalyzing}
                  onClick={analyzeDocument}
                  className={cn(
                    "w-full py-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest transition-all",
                    !file ? "bg-brand-deep text-slate-700 border border-brand-border" : 
                    isAnalyzing ? "bg-blue-900/20 text-blue-400 border border-blue-500 animate-pulse" :
                    "bg-white text-brand-bg hover:scale-[1.02] active:scale-95 shadow-xl shadow-white/5"
                  )}
                >
                  {isAnalyzing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Zap className="w-4 h-4" /> Start Analysis</>
                  )}
                </button>
              </div>
            </section>
          </div>

          {/* Middle Column: Primary Analysis */}
          <div className="lg:col-span-8 space-y-6">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  {/* Tab Navigation */}
                  <div className="flex bg-brand-elevated p-1 rounded-xl border border-brand-border sticky top-0 z-10 backdrop-blur-md">
                    {(['summary', 'drafting', 'timeline'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "flex-1 py-3 px-4 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                          activeTab === tab ? "bg-brand-card text-blue-400 border border-brand-border shadow-sm" : "text-slate-500 hover:text-slate-400"
                        )}
                      >
                        {tab === 'summary' && <div className="flex items-center justify-center gap-2"><LayoutGrid className="w-3 h-3" /> Summary</div>}
                        {tab === 'drafting' && <div className="flex items-center justify-center gap-2"><Edit3 className="w-3 h-3" /> AI Drafting</div>}
                        {tab === 'timeline' && <div className="flex items-center justify-center gap-2"><Clock className="w-3 h-3" /> Timeline</div>}
                      </button>
                    ))}
                  </div>

                  {activeTab === 'summary' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                      {/* Risk Score */}
                      <section className="bg-brand-card rounded-2xl border border-brand-border p-6 relative overflow-hidden">
                        <div className="flex items-center gap-6">
                          <div className="relative w-24 h-24 flex-shrink-0">
                            <svg className="w-full h-full transform -rotate-90">
                              <circle cx="48" cy="48" r="44" stroke="#1e293b" strokeWidth="6" fill="transparent" />
                              <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="6" fill="transparent"
                                strokeDasharray={276}
                                strokeDashoffset={276 - (276 * result.document_summary.risk_score) / 100}
                                className={cn(
                                  "transition-all duration-1000",
                                  result.document_summary.risk_score > 70 ? "text-red-500" : "text-emerald-500"
                                )}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center text-xl font-black text-white">
                              {result.document_summary.risk_score}
                            </div>
                          </div>
                          <div className="space-y-2">
                             <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                               <ShieldAlert className="w-3 h-3 text-blue-500" /> System Rating
                             </div>
                             <p className="text-sm text-slate-300 font-medium leading-relaxed italic border-l-2 border-slate-700 pl-4">
                               "{result.document_summary.risk_score_logic}"
                             </p>
                          </div>
                        </div>
                      </section>

                      {/* Summary Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <AnalysisCard title="Hidden Risks" content={result.document_summary.hidden_risks.summary} theme="orange" />
                        <AnalysisCard title="Financials" content={result.document_summary.financial_obligations.summary} theme="blue" />
                        <AnalysisCard title="Termination" content={result.document_summary.termination_clauses.summary} theme="emerald" />
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'drafting' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                      {result.document_summary.suggested_clauses.map((clause, idx) => (
                        <div key={idx} className="bg-brand-card rounded-xl border border-brand-border p-6 space-y-4 border-l-4 border-l-blue-600">
                          <h4 className="font-bold text-white text-sm flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-blue-500" /> {clause.title}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <span className="text-[9px] font-bold text-slate-600 uppercase">Original context</span>
                              <p className="text-xs text-slate-500 italic bg-brand-deep p-3 rounded-lg border border-brand-border">
                                {clause.current || "Context found in document..."}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Recommended clause</span>
                              <div className="bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/20">
                                <p className="text-xs text-emerald-100 font-medium leading-relaxed">
                                  {clause.suggested}
                                </p>
                              </div>
                            </div>
                          </div>
                          <p className="text-[10px] text-blue-400 font-bold bg-blue-500/5 py-2 px-3 rounded-lg border border-blue-500/10">
                            WHY: {clause.benefit}
                          </p>
                        </div>
                      ))}
                    </motion.div>
                  )}

                  {activeTab === 'timeline' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 bg-brand-card rounded-2xl border border-brand-border relative">
                       <div className="absolute left-[47px] top-12 bottom-12 w-0.5 bg-slate-800" />
                       <div className="space-y-10 relative">
                         {result.document_summary.action_steps.map((step, idx) => (
                           <div key={idx} className="flex gap-8 group">
                             <div className="w-10 h-10 rounded-full bg-brand-card border-2 border-slate-700 flex items-center justify-center text-xs font-bold text-slate-500 relative z-10 group-hover:border-blue-500 group-hover:text-blue-500 transition-colors">
                               {idx + 1}
                             </div>
                             <div className="flex-1 bg-brand-deep rounded-xl p-5 border border-brand-border group-hover:border-blue-500/30 transition-all">
                               <div className="flex items-center justify-between mb-2">
                                 <h4 className="text-xs font-bold text-white tracking-wide">{step.step}</h4>
                                 <div className="flex items-center gap-3">
                                   <span className={cn(
                                     "text-[9px] px-2 py-0.5 rounded-full font-black uppercase",
                                     step.priority === 'high' ? "bg-red-500/20 text-red-400" : 
                                     step.priority === 'medium' ? "bg-orange-500/20 text-orange-400" : 
                                     "bg-blue-500/20 text-blue-400"
                                   )}>
                                     {step.priority}
                                   </span>
                                   <span className="text-[10px] text-slate-600 font-bold uppercase flex items-center gap-1">
                                     <Clock className="w-3 h-3" /> {step.days} {step.days === 1 ? 'Day' : 'Days'}
                                   </span>
                                 </div>
                               </div>
                             </div>
                           </div>
                         ))}
                       </div>
                    </motion.div>
                  )}

                  {/* JSON Fallback Toggle */}
                  <details className="group">
                    <summary className="text-[10px] font-bold text-slate-700 uppercase cursor-pointer hover:text-slate-500 mb-2 list-none flex items-center gap-2">
                       <Layout className="w-3 h-3" /> System Logs (JSON)
                    </summary>
                    <div className="bg-brand-deep rounded-xl p-6 overflow-x-auto border border-brand-border">
                      <pre className="text-blue-400 text-[10px] font-mono opacity-60">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    </div>
                  </details>
                </motion.div>
              ) : isAnalyzing ? (
                <div key="loading" className="flex flex-col items-center justify-center min-h-[500px] bg-brand-elevated/40 border border-brand-border rounded-3xl p-12 text-center space-y-8">
                  <div className="relative">
                    <div className="w-32 h-32 rounded-full border-2 border-blue-500/10 border-t-blue-500 animate-[spin_1.5s_linear_infinite]" />
                    <div className="absolute inset-0 blur-3xl bg-blue-500/10 scale-150 rounded-full" />
                    <ShieldAlert className="absolute inset-0 m-auto w-10 h-10 text-blue-500/50" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xl font-bold text-white font-display">Contract Parsing Engaged</h3>
                    <p className="text-[11px] text-slate-500 max-w-sm uppercase font-bold tracking-[0.2em]">Executing heuristics & legality mappings...</p>
                  </div>
                </div>
              ) : (
                <div key="waiting" className="flex flex-col items-center justify-center min-h-[500px] border border-dashed border-brand-border rounded-3xl group transition-all hover:bg-brand-elevated/10">
                  <div className="w-24 h-24 rounded-3xl bg-brand-card flex items-center justify-center text-slate-700 group-hover:text-blue-600 transition-all duration-500 group-hover:scale-110 shadow-2xl border border-brand-border">
                    <LayoutGrid className="w-10 h-10" />
                  </div>
                  <div className="mt-8 text-center space-y-2">
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.3em]">System Standby</p>
                    <p className="text-xl font-bold text-slate-300 font-display">Awaiting Document Input</p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Floating Chat Integration */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4">
        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-[420px] max-w-[calc(100vw-2rem)] h-[580px] bg-brand-elevated rounded-3xl border border-brand-border shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden backdrop-blur-2xl"
            >
              <div className="p-5 bg-brand-card border-b border-brand-border flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">Legal Co-Pilot</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Contextual Analysis Ready</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowChat(false)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-brand-bg/50">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center opacity-40">
                       <Sparkles className="w-8 h-8 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Conversational AI</p>
                      <p className="text-sm font-medium text-slate-600 leading-relaxed">Ask specific questions about terms, risks, or negotiation points.</p>
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[85%] p-4 rounded-2xl text-[13px] leading-relaxed",
                        msg.role === 'user' 
                          ? "bg-blue-600 text-white rounded-tr-none shadow-xl shadow-blue-900/40 font-medium" 
                          : "bg-brand-card text-slate-300 border border-brand-border rounded-tl-none shadow-sm"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-brand-card p-4 rounded-2xl border border-brand-border rounded-tl-none flex items-center gap-3">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                      </div>
                      <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Synthesizing</span>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={sendChatMessage} className="p-5 bg-brand-card border-t border-brand-border flex gap-3">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Ask about notice periods..."
                  disabled={!result || isChatLoading}
                  className="flex-1 bg-brand-deep border border-brand-border rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-all disabled:opacity-50"
                />
                <button 
                  type="submit"
                  disabled={!result || isChatLoading || !userInput.trim()}
                  className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white hover:bg-blue-500 disabled:opacity-50 transition-all shadow-xl shadow-blue-900/30 flex-shrink-0"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setShowChat(!showChat)}
          className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 group border-4 border-brand-bg",
            showChat ? "bg-slate-800 text-white scale-90" : "bg-blue-600 text-white hover:bg-blue-500 hover:scale-105"
          )}
        >
          {showChat ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
          {!showChat && result && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-brand-bg shadow-lg animate-pulse" />
          )}
          <div className="absolute -left-32 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold uppercase py-2 px-4 rounded-full opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap tracking-widest border border-slate-700">
             Start Consultation
          </div>
        </button>
      </div>

      <footer className="max-w-7xl mx-auto px-6 py-16 border-t border-brand-border mt-20 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-3 grayscale opacity-40">
           <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-white font-bold font-display">V</div>
           <span className="text-xs font-bold font-display tracking-widest uppercase">Vakil Ledger AI</span>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-700 text-center">
          Digitizing Trust &bull; Secured Document Mappings &bull; {new Date().getFullYear()}
        </div>
        <div className="flex items-center gap-8 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
           <a href="#" className="hover:text-slate-400">Privacy</a>
           <a href="#" className="hover:text-slate-400">Security</a>
        </div>
      </footer>
    </div>
  );
}

function WeightSelector({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-500 uppercase">{label}</span>
        <span className="text-[10px] font-mono text-blue-500 font-bold">{value}/5</span>
      </div>
      <div className="flex gap-1">
        {[1,2,3,4,5].map(v => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={cn(
              "flex-1 h-1.5 rounded-full transition-all",
              v <= value ? "bg-blue-600" : "bg-slate-800 hover:bg-slate-700"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function AnalysisCard({ title, content, theme }: { title: string, content: string, theme: 'orange' | 'blue' | 'emerald' }) {
  const themes = {
    orange: "border-orange-500/30 bg-orange-500/5 text-orange-400",
    blue: "border-blue-500/30 bg-blue-500/5 text-blue-400",
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
  };

  return (
    <div className={cn("p-6 rounded-2xl border transition-all h-full", themes[theme])}>
      <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-3">{title}</h4>
      <p className="text-sm leading-relaxed text-slate-300 font-medium">
        {content === "Not found in document" ? <span className="opacity-40 italic">Not detected in scan...</span> : content}
      </p>
    </div>
  );
}

