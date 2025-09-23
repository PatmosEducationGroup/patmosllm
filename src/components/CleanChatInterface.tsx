import React, { useState, useRef, useEffect } from 'react';
import { Send, Plus, Menu, X, MessageCircle, User, Settings, Search, Clock, Globe, Download, ShoppingCart, Zap } from 'lucide-react';

// TypeScript interfaces
interface Source {
  title: string;
  author?: string;
  chunk_id: string;
  amazon_url?: string;
  resource_url?: string;
  download_enabled: boolean;
  contact_person?: string;
  contact_email?: string;
}

interface Message {
  id: number;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Source[];
}

interface Session {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

// Sample data for demonstration
const sampleSessions: Session[] = [
  { id: '1', title: 'How to pray effectively', updatedAt: '2024-01-15', messageCount: 8 },
  { id: '2', title: 'Bible study methods', updatedAt: '2024-01-14', messageCount: 12 },
  { id: '3', title: 'Finding spiritual guidance', updatedAt: '2024-01-14', messageCount: 5 },
  { id: '4', title: 'Prayer for healing', updatedAt: '2024-01-13', messageCount: 15 },
];

const sampleSources = [
  {
    title: "Prayer Guide for Modern Christians",
    author: "Dr. Sarah Johnson",
    chunk_id: "123",
    amazon_url: "https://amazon.com/prayer-guide",
    download_enabled: true,
    contact_person: "Dr. Johnson",
    contact_email: "sarah@example.com"
  },
  {
    title: "Healing Through Faith",
    author: "Rev. Michael Chen",
    chunk_id: "456",
    resource_url: "https://example.com/healing-faith.pdf",
    download_enabled: true
  }
];

export default function CleanChatInterface() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSession, setCurrentSession] = useState('1');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      type: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: Date.now() + 1,
        type: 'assistant',
        content: "Prayer is one of the most powerful spiritual practices available to us. Based on the documents in our knowledge base, here are some effective approaches to prayer that can deepen your spiritual connection...",
        sources: sampleSources,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);
    }, 2000);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  };

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar */}
      <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${sidebarOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: '#82b3db' }}>
                  H.E
                </div>
                <span className="font-semibold text-gray-900">PatmosLLM</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {/* New Chat Button */}
            <button
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg text-white font-medium transition-all hover:shadow-md"
              style={{ backgroundColor: '#82b3db' }}
            >
              <Plus size={18} />
              <span>New Chat</span>
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Sessions */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {sampleSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => setCurrentSession(session.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    currentSession === session.id
                      ? 'bg-gray-100 border-l-4'
                      : 'hover:bg-gray-50'
                  }`}
                  style={{ borderLeftColor: currentSession === session.id ? '#82b3db' : 'transparent' }}
                >
                  <div className="font-medium text-gray-900 text-sm truncate mb-1">
                    {session.title}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{formatDate(session.updatedAt)}</span>
                    <span>{session.messageCount} messages</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* User Profile */}
          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: '#9ecd55' }}>
                <User size={16} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">John Smith</div>
                <div className="text-xs text-gray-500">Free Plan</div>
              </div>
              <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <Settings size={16} className="text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Menu size={18} className="text-gray-600" />
                </button>
              )}
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Heaven.Earth Assistant</h1>
                <p className="text-sm text-gray-500">Ask me anything about your documents</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#9ecd55' }}></div>
              <span className="text-sm text-gray-500">Online</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-4xl mx-auto px-6 py-8">
            {messages.length === 0 ? (
              // Welcome State
              <div className="text-center py-16">
                <div
                  className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-white text-2xl font-bold shadow-lg"
                  style={{ backgroundColor: '#82b3db' }}
                >
                  H.E
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-3">Welcome to Heaven.Earth</h2>
                <p className="text-gray-600 mb-12 text-lg">I can help you explore and understand your document library. Ask me anything!</p>

                {/* Suggested Questions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  {[
                    { icon: "🙏", title: "How do I pray effectively?", desc: "Learn prayer techniques" },
                    { icon: "📖", title: "Bible study methods", desc: "Explore study techniques" },
                    { icon: "💡", title: "Finding spiritual guidance", desc: "Get direction for life" },
                    { icon: "🤝", title: "Community and fellowship", desc: "Build relationships" }
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(suggestion.title)}
                      className="p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all text-left group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="text-2xl">{suggestion.icon}</div>
                        <div>
                          <div className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                            {suggestion.title}
                          </div>
                          <div className="text-sm text-gray-500">{suggestion.desc}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // Messages
              <div className="space-y-8">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-3xl ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                      <div
                        className={`rounded-2xl px-6 py-4 ${
                          message.type === 'user'
                            ? 'text-white shadow-lg ml-12'
                            : 'bg-white shadow-sm border border-gray-100 mr-12'
                        }`}
                        style={{
                          backgroundColor: message.type === 'user' ? '#82b3db' : 'white',
                          color: message.type === 'user' ? 'white' : '#374151'
                        }}
                      >
                        <div className="whitespace-pre-wrap">{message.content}</div>

                        {/* Sources */}
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <div className="flex items-center space-x-2 mb-3">
                              <Globe size={14} className="text-gray-500" />
                              <span className="text-sm font-medium text-gray-700">Sources:</span>
                            </div>
                            <div className="space-y-2">
                              {message.sources.map((source, i) => (
                                <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                  <div className="font-medium text-sm text-gray-900 mb-1">{source.title}</div>
                                  {source.author && (
                                    <div className="text-xs text-gray-500 mb-2">by {source.author}</div>
                                  )}
                                  <div className="flex items-center space-x-2">
                                    {source.amazon_url && (
                                      <a
                                        href={source.amazon_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center space-x-1 px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded-md hover:bg-blue-100 transition-colors"
                                      >
                                        <ShoppingCart size={12} />
                                        <span>Store</span>
                                      </a>
                                    )}
                                    {source.resource_url && source.download_enabled && (
                                      <a
                                        href={source.resource_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center space-x-1 px-2 py-1 text-xs rounded-md hover:bg-green-100 transition-colors"
                                        style={{ backgroundColor: '#f0f9e8', color: '#9ecd55' }}
                                      >
                                        <Download size={12} />
                                        <span>Download</span>
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Timestamp */}
                        <div className={`flex items-center space-x-1 mt-3 text-xs ${
                          message.type === 'user' ? 'text-blue-100' : 'text-gray-400'
                        }`}>
                          <Clock size={12} />
                          <span>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Typing Indicator */}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white rounded-2xl px-6 py-4 shadow-sm border border-gray-100 mr-12">
                      <div className="flex items-center space-x-3">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#82b3db', animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#82b3db', animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#82b3db', animationDelay: '300ms' }}></div>
                        </div>
                        <span className="text-sm text-gray-500 flex items-center space-x-1">
                          <Zap size={14} />
                          <span>AI is thinking...</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end space-x-4">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask me anything about your documents..."
                  className="w-full resize-none border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent max-h-32"
                  rows={1}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="p-3 rounded-xl text-white transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: input.trim() && !isTyping ? '#82b3db' : '#e5e7eb' }}
              >
                <Send size={18} />
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
              <span>Press Enter to send, Shift + Enter for new line</span>
              <span>Powered by AI</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}