import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import {
  Lightbulb,
  CheckCircle,
  AlertTriangle,
  Info,
  Wand2,
  BookOpen,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import type { QuestionQualityAnalysis, QuestionTemplate } from '@/lib/question-quality-assistant'

interface QuestionAssistantProps {
  question: string
  onQuestionChange: (question: string) => void
  onClose?: () => void
  className?: string
}

export function QuestionAssistant({ question, onQuestionChange, onClose, className = '' }: QuestionAssistantProps) {
  const [analysis, setAnalysis] = useState<QuestionQualityAnalysis | null>(null)
  const [templates, setTemplates] = useState<QuestionTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
//   const [_showBuilder, _setShowBuilder] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)

  // Debounced analysis
  useEffect(() => {
    if (question.trim().length < 3) {
      setAnalysis(null)
      return
    }

    const timer = setTimeout(() => {
      analyzeQuestion()
    }, 500)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question])

  const analyzeQuestion = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/question-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze', question })
      })

      if (response.ok) {
        const data = await response.json()
        setAnalysis(data.analysis)
        setTemplates(data.templates || [])
      }
    } catch (_error) {
    }
    setLoading(false)
  }

  const applyImprovedQuestion = (improvedQuestion: string) => {
    onQuestionChange(improvedQuestion)
  }

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600 bg-green-50 border-green-200'
    if (score >= 70) return 'text-blue-600 bg-blue-50 border-blue-200'
    if (score >= 55) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  const getSeverityIcon = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high': return <AlertTriangle className="w-4 h-4 text-red-500" />
      case 'medium': return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case 'low': return <Info className="w-4 h-4 text-blue-500" />
    }
  }

  if (!question.trim() || question.trim().length < 3) {
    return (
      <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-3">
          <Lightbulb className="w-5 h-5 text-blue-600" />
          <div>
            <p className="text-sm font-medium text-blue-900">Need help crafting your question?</p>
            <p className="text-sm text-blue-700">Start typing to get real-time suggestions and quality feedback.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <Wand2 className="w-5 h-5 text-purple-600" />
          <h3 className="text-sm font-medium text-gray-900">Question Assistant</h3>
          {analysis && (
            <div className={`px-2 py-1 rounded-full text-xs font-medium border ${getScoreColor(analysis.score)}`}>
              {analysis.score}/100 - {analysis.level}
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {loading && (
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="animate-spin w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full"></div>
              <span>Analyzing your question...</span>
            </div>
          )}

          {analysis && !loading && (
            <>
              {/* Strengths */}
              {analysis.strengths.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-green-800 mb-2 flex items-center space-x-1">
                    <CheckCircle className="w-4 h-4" />
                    <span>What&apos;s working well:</span>
                  </h4>
                  <ul className="space-y-1">
                    {analysis.strengths.map((strength, index) => (
                      <li key={index} className="text-sm text-green-700 flex items-start space-x-2">
                        <CheckCircle className="w-3 h-3 mt-0.5 text-green-500" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Issues */}
              {analysis.issues.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-800 mb-2 flex items-center space-x-1">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Areas for improvement:</span>
                  </h4>
                  <ul className="space-y-2">
                    {analysis.issues.map((issue, index) => (
                      <li key={index} className="text-sm flex items-start space-x-2">
                        {getSeverityIcon(issue.severity)}
                        <span className="text-gray-700">{issue.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {analysis.suggestions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-purple-800 mb-2 flex items-center space-x-1">
                    <Lightbulb className="w-4 h-4" />
                    <span>Suggestions:</span>
                  </h4>
                  <ul className="space-y-2">
                    {analysis.suggestions.map((suggestion, index) => (
                      <li key={index} className="text-sm space-y-1">
                        <p className="text-gray-700">{suggestion.description}</p>
                        {suggestion.example && (
                          <p className="text-xs text-gray-500 italic bg-gray-50 p-2 rounded">
                            {suggestion.example}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improved Examples */}
              {analysis.examples.improved.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center space-x-1">
                    <Wand2 className="w-4 h-4" />
                    <span>Try these improved versions:</span>
                  </h4>
                  <div className="space-y-2">
                    {analysis.examples.improved.map((improved, index) => (
                      <div key={index} className="bg-blue-50 border border-blue-200 rounded p-3">
                        <p className="text-sm text-blue-900 mb-2">{improved}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => applyImprovedQuestion(improved)}
                          className="text-xs"
                        >
                          Use this version
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Templates */}
          {templates.length > 0 && (
            <div>
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center space-x-2 text-sm font-medium text-gray-800 hover:text-gray-900"
              >
                <BookOpen className="w-4 h-4" />
                <span>Question templates ({templates.length})</span>
                {showTemplates ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showTemplates && (
                <div className="mt-3 space-y-3">
                  {templates.map((template) => (
                    <div key={template.id} className="bg-gray-50 border border-gray-200 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-sm font-medium text-gray-900">{template.title}</h5>
                        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                          {template.category}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{template.description}</p>
                      <p className="text-xs text-purple-700 font-mono bg-purple-50 p-2 rounded mb-2">
                        {template.template}
                      </p>
                      {template.examples.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-700">Examples:</p>
                          {template.examples.slice(0, 1).map((example, i) => (
                            <div key={i} className="bg-white p-2 rounded text-xs text-gray-600 border">
                              {example}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => applyImprovedQuestion(example)}
                                className="ml-2 text-xs h-6 px-2"
                              >
                                Use
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}