import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Settings, Volume2, Command, Sparkles, Activity, Wifi, WifiOff, X, Plus, Trash2, Sliders, MessageSquare, Moon, Sun, Bell, HelpCircle, Phone, Square } from 'lucide-react';
import { getNovaResponse, NovaAction, NovaResponse, GroundingChunk } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  role: 'user' | 'nova';
  text: string;
  actions?: NovaAction[];
  groundingChunks?: GroundingChunk[];
}

// Type declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function VoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'nova', text: 'Hi, I am Nova. How can I help you today?' }
  ]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isWifiOn, setIsWifiOn] = useState(true);
  const [language, setLanguage] = useState('en-US');
  const [readNotificationsAloud, setReadNotificationsAloud] = useState(false);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [sensitivity, setSensitivity] = useState(70);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [customCommands, setCustomCommands] = useState<{trigger: string, action: string}[]>([
    { trigger: 'morning routine', action: 'turn on wifi and open youtube' }
  ]);
  const [newTrigger, setNewTrigger] = useState('');
  const [newAction, setNewAction] = useState('');
  
  const [customApps, setCustomApps] = useState<{name: string, url: string}[]>([
    { name: 'my blog', url: 'https://example.com' }
  ]);
  const [newAppName, setNewAppName] = useState('');
  const [newAppUrl, setNewAppUrl] = useState('');

  const [contacts, setContacts] = useState<{name: string, phone: string}[]>([
    { name: 'My Home', phone: '+1234567890' }
  ]);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  const [textInput, setTextInput] = useState('');
  const [pendingCall, setPendingCall] = useState<{name: string, phone: string} | null>(null);
  const [pendingApp, setPendingApp] = useState<{name: string, url: string} | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Apply dark mode class to body
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    // Initialize Speech Synthesis
    synthesisRef.current = window.speechSynthesis;
    
    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Initialize Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = language;

      recognitionRef.current.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        
        let errorMessage = "";
        if (event.error === 'network') {
          errorMessage = "A network error occurred during speech recognition. This can happen if you are offline, or if the browser blocks the speech service in this environment.";
        } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          errorMessage = "Microphone access was denied. Please allow microphone permissions in your browser.";
        }
        
        if (errorMessage) {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'nova',
            text: `⚠️ ${errorMessage}`
          }]);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      console.warn("Speech Recognition API not supported in this browser.");
    }
  }, []); // Run once on mount

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language;
    }
  }, [language]);

  useEffect(() => {
    if (voices.length > 0 && !selectedVoiceURI) {
      const defaultVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Natural')) || voices[0];
      setSelectedVoiceURI(defaultVoice.voiceURI);
    }
  }, [voices, selectedVoiceURI]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Process transcript when listening stops
  useEffect(() => {
    if (!isListening && transcript.trim() !== '') {
      handleProcessCommand(transcript);
      setTranscript('');
    }
  }, [isListening]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setTranscript('');
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e: any) {
        console.error("Speech recognition error:", e);
        if (e.name === 'NotAllowedError' || e.message?.includes('not allowed')) {
          speak("Microphone access is denied. Please allow microphone permissions in your browser.");
        } else {
          speak("I couldn't start listening. There might be an issue with your microphone.");
        }
        setIsListening(false);
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim() && !isProcessing) {
      handleProcessCommand(textInput);
      setTextInput('');
    }
  };

  const stopSpeaking = useCallback(() => {
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthesisRef.current) return;
    
    // Cancel any ongoing speech
    synthesisRef.current.cancel();
    setIsSpeaking(false);
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (selectedVoiceURI) {
      const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
    }
    
    utterance.rate = 1.05;
    utterance.pitch = 1.1;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    synthesisRef.current.speak(utterance);
  }, [voices, selectedVoiceURI]);

  const executeSystemCommand = (command: string) => {
    switch (command.toUpperCase()) {
      case 'DARK_MODE':
      case 'DARK_MODE_ON':
        setIsDarkMode(true);
        break;
      case 'LIGHT_MODE':
      case 'DARK_MODE_OFF':
        setIsDarkMode(false);
        break;
      case 'WIFI_ON':
        setIsWifiOn(true);
        break;
      case 'WIFI_OFF':
        setIsWifiOn(false);
        break;
      case 'CAMERA_OPEN':
        try {
          window.open('intent://camera/#Intent;scheme=android.media.action.IMAGE_CAPTURE;end', '_top');
        } catch (e) {
          console.error('Failed to open camera', e);
        }
        break;
      default:
        console.log(`Simulated System Command: ${command}`);
    }
  };

  const callContact = (target: string) => {
    const normalizedTarget = target.toLowerCase().trim();
    const contact = contacts.find(c => c.name.toLowerCase() === normalizedTarget);

    if (contact) {
      setPendingCall(contact);
      speak(`Are you sure you want to call ${contact.name}?`);
    } else {
      speak(`I couldn't find a contact named ${target}. Please add them in settings.`);
    }
  };

  const confirmCall = () => {
    if (pendingCall) {
      speak(`Calling ${pendingCall.name}.`);
      // Delay clearing the state slightly to ensure the native link click registers
      setTimeout(() => setPendingCall(null), 500);
    }
  };

  const cancelCall = () => {
    setPendingCall(null);
    speak('Call cancelled.');
  };

  const simulateNotification = () => {
    const apps = ['WhatsApp', 'Messages', 'Calendar', 'Email'];
    const app = apps[Math.floor(Math.random() * apps.length)];
    const msg = `New message from ${app}.`;
    
    const notifMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { 
      id: notifMsgId, 
      role: 'nova', 
      text: `🔔 Notification: ${msg}` 
    }]);

    if (readNotificationsAloud) {
      speak(`You have a new notification. ${msg}`);
    }
  };

  const openApp = (target: string) => {
    const normalizedTarget = target.toLowerCase().trim();

    // Check custom apps first
    const customApp = customApps.find(app => app.name.toLowerCase() === normalizedTarget);
    if (customApp) {
      speak(`Opening ${target}.`);
      if (customApp.url.startsWith('http')) {
        window.open(customApp.url, '_blank');
      } else {
        window.open(customApp.url, '_top');
      }
      return;
    }

    // Map of common apps to their web URLs or Android Intents
    const appIntents: Record<string, string> = {
      'youtube': 'https://youtube.com',
      'google': 'https://google.com',
      'whatsapp': 'https://web.whatsapp.com',
      'chrome': 'https://google.com',
      'maps': 'https://maps.google.com',
      'twitter': 'https://twitter.com',
      'x': 'https://x.com',
      'instagram': 'https://instagram.com',
      'facebook': 'https://facebook.com',
      'gmail': 'https://mail.google.com',
      'spotify': 'https://open.spotify.com',
      'netflix': 'https://netflix.com',
      'amazon': 'https://amazon.com',
      'github': 'https://github.com',
      'linkedin': 'https://linkedin.com',
      'reddit': 'https://reddit.com',
      'tiktok': 'https://tiktok.com',
      'weather': 'https://weather.com',
      'calculator': 'https://www.desmos.com/scientific',
      'calendar': 'https://calendar.google.com',
      'camera': 'intent://camera/#Intent;scheme=android.media.action.IMAGE_CAPTURE;end',
      'gallery': 'intent://gallery/#Intent;scheme=android.intent.action.VIEW;type=image/*;end',
      'settings': 'intent://settings/#Intent;scheme=android.settings.SETTINGS;end'
    };

    const intentUrl = appIntents[normalizedTarget];

    if (intentUrl) {
      setPendingApp({ name: target, url: intentUrl });
      speak(`Are you sure you want to open ${target}?`);
    } else {
      // Fallback: Web search for apps not found in the map
      const searchUrl = `https://google.com/search?q=${encodeURIComponent(target)}`;
      setPendingApp({ name: `Search for ${target}`, url: searchUrl });
      speak(`I couldn't find ${target}. Do you want to search the web instead?`);
    }
  };

  const confirmApp = () => {
    if (pendingApp) {
      speak(`Opening ${pendingApp.name}.`);
      setTimeout(() => setPendingApp(null), 500);
    }
  };

  const cancelApp = () => {
    setPendingApp(null);
    speak('Action cancelled.');
  };

  const handleProcessCommand = async (text: string) => {
    // Add user message
    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', text }]);
    
    setIsProcessing(true);
    
    // Check for custom command shortcuts
    let textToProcess = text;
    const matchedShortcut = customCommands.find(c => text.toLowerCase().includes(c.trigger.toLowerCase()));
    if (matchedShortcut) {
      textToProcess = matchedShortcut.action;
      console.log(`Shortcut triggered: ${matchedShortcut.trigger} -> ${matchedShortcut.action}`);
    }
    
    // Get AI Response
    const response = await getNovaResponse(textToProcess, language);
    
    // --- INTERCEPT LOGIC FOR WIFI AND INSTALLED APPS ---
    const processedActions = response.actions.map(action => {
      if (action.type === 'OPEN_APP' && action.target) {
        action.text = `Opening ${action.target}.`;
      }

      if (action.type === 'CALL_CONTACT' && action.target) {
        action.text = `Calling ${action.target}.`;
      }

      if (action.type === 'SYSTEM_COMMAND' && action.command) {
        if (action.command === 'WIFI_ON') {
           action.text = "Turning on WiFi.";
        } else if (action.command === 'WIFI_OFF') {
           action.text = "Turning off WiFi.";
        } else if (action.command === 'CAMERA_OPEN') {
           action.text = "Opening camera.";
        }
      }
      return action;
    });
    // ---------------------------------------------------

    setIsProcessing(false);
    
    // Combine text for the chat bubble
    const combinedText = processedActions.map(a => a.text).filter(Boolean).join(' ');
    
    // Add Nova message
    const novaMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { 
      id: novaMsgId, 
      role: 'nova', 
      text: combinedText || 'Done.',
      actions: processedActions,
      groundingChunks: response.groundingChunks
    }]);

    // Execute actions
    for (const action of processedActions) {
      if (action.text) {
        speak(action.text);
      }
      
      if (action.type === 'SYSTEM_COMMAND' && action.command) {
        executeSystemCommand(action.command);
      } else if (action.type === 'OPEN_APP' && action.target) {
        openApp(action.target);
      } else if (action.type === 'CALL_CONTACT' && action.target) {
        callContact(action.target);
      }
    }
  };

  return (
    <div className={`flex flex-col h-screen w-full transition-colors duration-500 ${isDarkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}>
      {/* Header */}
      <header className={`flex items-center justify-between p-6 border-b ${isDarkMode ? 'border-zinc-800/50' : 'border-zinc-200'}`}>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-500">
            <Sparkles size={20} />
            {isProcessing && (
              <motion.div 
                className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Nova AI</h1>
            <p className={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Smart Voice Controller</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsHelpOpen(true)}
            className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-600'}`}
            title="Help & Tutorial"
          >
            <HelpCircle size={20} />
          </button>
          <button 
            onClick={simulateNotification}
            className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-600'}`}
            title="Simulate Notification"
          >
            <Bell size={20} />
          </button>
          {isWifiOn ? (
            <Wifi size={20} className="text-emerald-500" />
          ) : (
            <WifiOff size={20} className="text-zinc-500" />
          )}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-600'}`}
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-br-sm' 
                  : isDarkMode 
                    ? 'bg-zinc-900 border border-zinc-800 rounded-bl-sm' 
                    : 'bg-white border border-zinc-200 shadow-sm rounded-bl-sm'
              }`}>
                <p className="text-[15px] leading-relaxed">{msg.text}</p>
                
                {/* Action Indicators */}
                {msg.actions?.map((action, idx) => (
                  <React.Fragment key={idx}>
                    {action.type === 'SYSTEM_COMMAND' && (
                      <div className="mt-3 flex items-center gap-2 text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-1.5 rounded-md w-fit">
                        <Command size={14} />
                        Executed: {action.command}
                      </div>
                    )}
                    {action.type === 'OPEN_APP' && (
                      <div className="mt-3 flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1.5 rounded-md w-fit">
                        <Activity size={14} />
                        Opening: {action.target}
                      </div>
                    )}
                    {action.type === 'CALL_CONTACT' && (
                      <div className="mt-3 flex items-center gap-2 text-xs font-mono text-blue-400 bg-blue-500/10 px-2.5 py-1.5 rounded-md w-fit">
                        <Phone size={14} />
                        Calling: {action.target}
                      </div>
                    )}
                  </React.Fragment>
                ))}

                {/* Grounding Sources */}
                {msg.groundingChunks && msg.groundingChunks.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-zinc-700/50">
                    <p className="text-xs text-zinc-400 mb-2 font-medium">Sources:</p>
                    <div className="flex flex-wrap gap-2">
                      {msg.groundingChunks.slice(0, 3).map((chunk, idx) => chunk.web && (
                        <a 
                          key={idx}
                          href={chunk.web.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded truncate max-w-[200px] transition-colors"
                          title={chunk.web.title}
                        >
                          {chunk.web.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {/* Live Transcript Preview */}
        {transcript && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-end"
          >
            <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 bg-indigo-600/50 text-white/70 rounded-br-sm italic`}>
              {transcript}...
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Controls */}
      <footer className={`p-6 flex flex-col items-center justify-center border-t ${isDarkMode ? 'border-zinc-800/50 bg-zinc-950/80' : 'border-zinc-200 bg-white/80'} backdrop-blur-xl`}>
        
        <form onSubmit={handleTextSubmit} className="w-full max-w-2xl flex items-center gap-3 mb-6">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type a command or tap the mic..."
            disabled={isProcessing}
            className={`flex-1 p-3 rounded-xl border outline-none transition-colors ${
              isDarkMode 
                ? 'bg-zinc-900 border-zinc-800 focus:border-indigo-500 text-zinc-100 placeholder-zinc-500' 
                : 'bg-zinc-100 border-zinc-200 focus:border-indigo-500 text-zinc-900 placeholder-zinc-400'
            }`}
          />
          <button
            type="submit"
            disabled={!textInput.trim() || isProcessing}
            className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl transition-colors"
          >
            <Command size={20} />
          </button>
        </form>

        {/* Animated Orb / Mic Button */}
        <div className="relative flex items-center justify-center mb-2">
          {isListening && (
            <>
              <motion.div 
                className="absolute w-32 h-32 rounded-full bg-indigo-500/20"
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div 
                className="absolute w-24 h-24 rounded-full bg-indigo-500/30"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
              />
            </>
          )}
          
          <button
            onClick={toggleListening}
            className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 ${
              isListening 
                ? 'bg-indigo-600 text-white shadow-indigo-500/25' 
                : isDarkMode 
                  ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' 
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {isListening ? <Volume2 size={28} className="animate-pulse" /> : <Mic size={28} />}
          </button>

          <AnimatePresence>
            {isSpeaking && (
              <motion.button
                initial={{ opacity: 0, scale: 0.5, x: -20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.5, x: -20 }}
                onClick={stopSpeaking}
                className={`absolute ml-32 z-10 flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 ${
                  isDarkMode 
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30' 
                    : 'bg-red-100 text-red-600 hover:bg-red-200 border border-red-200'
                }`}
                title="Stop speaking"
              >
                <Square size={16} fill="currentColor" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        
        <p className={`text-sm font-medium ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {isListening ? 'Listening...' : 'Tap to speak'}
        </p>
      </footer>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-md overflow-hidden rounded-2xl shadow-2xl flex flex-col max-h-[85vh] ${isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-zinc-200'}`}
            >
              <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Settings size={18} className="text-indigo-500" />
                  Nova Settings
                </h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className={`p-1.5 rounded-full transition-colors ${isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-5 space-y-8">
                {/* Appearance */}
                <section className="space-y-3">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Appearance</h3>
                  <div className={`flex items-center justify-between p-3 rounded-xl ${isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                    <div className="flex items-center gap-3">
                      {isDarkMode ? <Moon size={18} className="text-indigo-400" /> : <Sun size={18} className="text-amber-500" />}
                      <span className="text-sm font-medium">Dark Mode</span>
                    </div>
                    <button 
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDarkMode ? 'bg-indigo-500' : 'bg-zinc-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </section>

                {/* Voice & Audio */}
                <section className="space-y-3">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Voice & Audio</h3>
                  
                  <div className={`p-4 rounded-xl space-y-4 ${isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Bell size={18} className="text-indigo-400" />
                        <span className="text-sm font-medium">Read Notifications Aloud</span>
                      </div>
                      <button 
                        onClick={() => setReadNotificationsAloud(!readNotificationsAloud)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${readNotificationsAloud ? 'bg-indigo-500' : 'bg-zinc-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${readNotificationsAloud ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-zinc-500/20">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Sliders size={16} className="text-indigo-500" />
                          Wake Word Sensitivity
                        </label>
                        <span className="text-xs font-mono text-indigo-500">{sensitivity}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="100" 
                        value={sensitivity}
                        onChange={(e) => setSensitivity(parseInt(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                      <p className={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Higher sensitivity may cause false triggers.</p>
                    </div>

                    <div className="space-y-2 pt-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <MessageSquare size={16} className="text-indigo-500" />
                        Language
                      </label>
                      <select 
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className={`w-full p-2.5 rounded-lg text-sm border outline-none transition-colors ${
                          isDarkMode 
                            ? 'bg-zinc-900 border-zinc-700 focus:border-indigo-500 text-zinc-200' 
                            : 'bg-white border-zinc-300 focus:border-indigo-500 text-zinc-800'
                        }`}
                      >
                        <option value="en-US">English (US)</option>
                        <option value="mr-IN">Marathi (India)</option>
                      </select>
                    </div>

                    <div className="space-y-2 pt-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <MessageSquare size={16} className="text-indigo-500" />
                        Assistant Voice
                      </label>
                      <select 
                        value={selectedVoiceURI}
                        onChange={(e) => setSelectedVoiceURI(e.target.value)}
                        className={`w-full p-2.5 rounded-lg text-sm border outline-none transition-colors ${
                          isDarkMode 
                            ? 'bg-zinc-900 border-zinc-700 focus:border-indigo-500 text-zinc-200' 
                            : 'bg-white border-zinc-300 focus:border-indigo-500 text-zinc-800'
                        }`}
                      >
                        {voices.map((voice, index) => (
                          <option key={`${voice.voiceURI}-${index}`} value={voice.voiceURI}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                {/* Custom Shortcuts */}
                <section className="space-y-3">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Custom Shortcuts</h3>
                  
                  <div className={`p-4 rounded-xl space-y-4 ${isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                    <div className="space-y-3">
                      {customCommands.map((cmd, idx) => (
                        <div key={idx} className={`flex items-start justify-between p-3 rounded-lg border ${isDarkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                          <div>
                            <p className="text-sm font-semibold">"{cmd.trigger}"</p>
                            <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>→ {cmd.action}</p>
                          </div>
                          <button 
                            onClick={() => setCustomCommands(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      {customCommands.length === 0 && (
                        <p className={`text-sm text-center py-2 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>No shortcuts added yet.</p>
                      )}
                    </div>

                    <div className={`pt-3 border-t ${isDarkMode ? 'border-zinc-700' : 'border-zinc-200'} space-y-2`}>
                      <input 
                        type="text" 
                        placeholder="When I say... (e.g. 'morning')"
                        value={newTrigger}
                        onChange={(e) => setNewTrigger(e.target.value)}
                        className={`w-full p-2.5 rounded-lg text-sm border outline-none transition-colors ${
                          isDarkMode ? 'bg-zinc-900 border-zinc-700 focus:border-indigo-500' : 'bg-white border-zinc-300 focus:border-indigo-500'
                        }`}
                      />
                      <input 
                        type="text" 
                        placeholder="Nova should... (e.g. 'turn on wifi')"
                        value={newAction}
                        onChange={(e) => setNewAction(e.target.value)}
                        className={`w-full p-2.5 rounded-lg text-sm border outline-none transition-colors ${
                          isDarkMode ? 'bg-zinc-900 border-zinc-700 focus:border-indigo-500' : 'bg-white border-zinc-300 focus:border-indigo-500'
                        }`}
                      />
                      <button 
                        onClick={() => {
                          if (newTrigger.trim() && newAction.trim()) {
                            setCustomCommands(prev => [...prev, { trigger: newTrigger.trim(), action: newAction.trim() }]);
                            setNewTrigger('');
                            setNewAction('');
                          }
                        }}
                        disabled={!newTrigger.trim() || !newAction.trim()}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Plus size={16} />
                        Add Shortcut
                      </button>
                    </div>
                  </div>
                </section>

                {/* Custom Apps */}
                <section className="space-y-3">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Custom Apps</h3>
                  
                  <div className={`p-4 rounded-xl space-y-4 ${isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                    <div className="space-y-3">
                      {customApps.map((app, idx) => (
                        <div key={idx} className={`flex items-start justify-between p-3 rounded-lg border ${isDarkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                          <div>
                            <p className="text-sm font-semibold">{app.name}</p>
                            <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>{app.url}</p>
                          </div>
                          <button 
                            onClick={() => setCustomApps(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      {customApps.length === 0 && (
                        <p className={`text-sm text-center py-2 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>No custom apps added yet.</p>
                      )}
                    </div>

                    <div className={`pt-3 border-t ${isDarkMode ? 'border-zinc-700' : 'border-zinc-200'} space-y-2`}>
                      <input 
                        type="text" 
                        placeholder="App Name (e.g. 'my blog')"
                        value={newAppName}
                        onChange={(e) => setNewAppName(e.target.value)}
                        className={`w-full p-2.5 rounded-lg text-sm border outline-none transition-colors ${
                          isDarkMode ? 'bg-zinc-900 border-zinc-700 focus:border-indigo-500' : 'bg-white border-zinc-300 focus:border-indigo-500'
                        }`}
                      />
                      <input 
                        type="url" 
                        placeholder="App URL (e.g. 'https://...')"
                        value={newAppUrl}
                        onChange={(e) => setNewAppUrl(e.target.value)}
                        className={`w-full p-2.5 rounded-lg text-sm border outline-none transition-colors ${
                          isDarkMode ? 'bg-zinc-900 border-zinc-700 focus:border-indigo-500' : 'bg-white border-zinc-300 focus:border-indigo-500'
                        }`}
                      />
                      <button 
                        onClick={() => {
                          if (newAppName.trim() && newAppUrl.trim()) {
                            let url = newAppUrl.trim();
                            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                              url = 'https://' + url;
                            }
                            setCustomApps(prev => [...prev, { name: newAppName.trim(), url }]);
                            setNewAppName('');
                            setNewAppUrl('');
                          }
                        }}
                        disabled={!newAppName.trim() || !newAppUrl.trim()}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Plus size={16} />
                        Add App
                      </button>
                    </div>
                  </div>
                </section>

                {/* Contacts */}
                <section className="space-y-3">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Contacts</h3>
                  
                  <div className={`p-4 rounded-xl space-y-4 ${isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                    <div className="space-y-3">
                      {contacts.map((contact, idx) => (
                        <div key={idx} className={`flex items-start justify-between p-3 rounded-lg border ${isDarkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                          <div>
                            <p className="text-sm font-semibold">{contact.name}</p>
                            <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>{contact.phone}</p>
                          </div>
                          <button 
                            onClick={() => setContacts(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      {contacts.length === 0 && (
                        <p className={`text-sm text-center py-2 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>No contacts added yet.</p>
                      )}
                    </div>

                    <div className={`pt-3 border-t ${isDarkMode ? 'border-zinc-700' : 'border-zinc-200'} space-y-2`}>
                      <input 
                        type="text" 
                        placeholder="Contact Name (e.g. 'My Home')"
                        value={newContactName}
                        onChange={(e) => setNewContactName(e.target.value)}
                        className={`w-full p-2.5 rounded-lg text-sm border outline-none transition-colors ${
                          isDarkMode ? 'bg-zinc-900 border-zinc-700 focus:border-indigo-500' : 'bg-white border-zinc-300 focus:border-indigo-500'
                        }`}
                      />
                      <input 
                        type="tel" 
                        placeholder="Phone Number (e.g. '+1234567890')"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(e.target.value)}
                        className={`w-full p-2.5 rounded-lg text-sm border outline-none transition-colors ${
                          isDarkMode ? 'bg-zinc-900 border-zinc-700 focus:border-indigo-500' : 'bg-white border-zinc-300 focus:border-indigo-500'
                        }`}
                      />
                      <button 
                        onClick={() => {
                          if (newContactName.trim() && newContactPhone.trim()) {
                            setContacts(prev => [...prev, { name: newContactName.trim(), phone: newContactPhone.trim() }]);
                            setNewContactName('');
                            setNewContactPhone('');
                          }
                        }}
                        disabled={!newContactName.trim() || !newContactPhone.trim()}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Plus size={16} />
                        Add Contact
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Help Modal */}
      <AnimatePresence>
        {isHelpOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-md overflow-hidden rounded-2xl shadow-2xl flex flex-col max-h-[85vh] ${isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-zinc-200'}`}
            >
              <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <HelpCircle size={18} className="text-indigo-500" />
                  How to use Nova
                </h2>
                <button 
                  onClick={() => setIsHelpOpen(false)}
                  className={`p-1.5 rounded-full transition-colors ${isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <section className="space-y-2">
                  <h3 className="font-semibold text-indigo-500">Voice Commands</h3>
                  <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    Tap the microphone icon at the bottom to start speaking. Nova understands natural language and can perform various tasks.
                  </p>
                </section>
                
                <section className="space-y-2">
                  <h3 className="font-semibold text-indigo-500">System Control</h3>
                  <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    Try saying: "Turn on dark mode", "Disable WiFi", or "Switch to light theme".
                  </p>
                </section>
                
                <section className="space-y-2">
                  <h3 className="font-semibold text-indigo-500">App Navigation</h3>
                  <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    You can open apps by saying: "Open YouTube", "Launch WhatsApp", or "Go to Settings".
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="font-semibold text-indigo-500">Calling Contacts</h3>
                  <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    Add contacts in Settings, then say: "Call My Home" or "Call John" to place a real phone call.
                  </p>
                </section>
                
                <section className="space-y-2">
                  <h3 className="font-semibold text-indigo-500">Custom Shortcuts</h3>
                  <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    Create custom voice triggers in Settings. For example, map "morning routine" to "turn on wifi and open youtube".
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="font-semibold text-indigo-500">Read Notifications</h3>
                  <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    Enable "Read Notifications Aloud" in Settings. When a new notification arrives (simulate with the 🔔 icon), Nova will read it to you.
                  </p>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Call Confirmation Modal */}
      <AnimatePresence>
        {pendingCall && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center ${isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-zinc-200'}`}
            >
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4 text-blue-500">
                <Phone size={32} />
              </div>
              <h2 className="text-xl font-semibold mb-2">Confirm Call</h2>
              <p className={`mb-6 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Are you sure you want to call {pendingCall.name}?
              </p>
              <div className="flex w-full gap-3">
                <button 
                  onClick={cancelCall}
                  className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
                >
                  No
                </button>
                <a 
                  href={`tel:${pendingCall.phone}`}
                  target="_top"
                  onClick={confirmCall}
                  className="flex-1 py-2.5 rounded-xl font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center justify-center"
                >
                  Yes
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* App Open Confirmation Modal */}
      <AnimatePresence>
        {pendingApp && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center ${isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-zinc-200'}`}
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4 text-emerald-500">
                <Activity size={32} />
              </div>
              <h2 className="text-xl font-semibold mb-2">Confirm Action</h2>
              <p className={`mb-6 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Are you sure you want to open {pendingApp.name}?
              </p>
              <div className="flex w-full gap-3">
                <button 
                  onClick={cancelApp}
                  className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
                >
                  No
                </button>
                <a 
                  href={pendingApp.url}
                  target={pendingApp.url.startsWith('http') ? "_blank" : "_top"}
                  rel="noopener noreferrer"
                  onClick={confirmApp}
                  className="flex-1 py-2.5 rounded-xl font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center justify-center"
                >
                  Yes
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
