import { useState } from 'react'
import type { MarkdownExportResult } from '@/shared/types'

interface MarkdownPreviewModalProps {
  result: MarkdownExportResult
  onClose: () => void
}

export default function MarkdownPreviewModal({ result, onClose }: MarkdownPreviewModalProps) {
  const [copied, setCopied] = useState(false)
  const [activeView, setActiveView] = useState<'preview' | 'raw'>('preview')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result.markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for non-HTTPS
      const textarea = document.createElement('textarea')
      textarea.value = result.markdown
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function handleDownload() {
    const blob = new Blob([result.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Simple markdown-to-HTML renderer (basic)
  function renderMarkdown(md: string): string {
    let html = md
      // Frontmatter: wrap in code block
      .replace(/^---\n([\s\S]*?)\n---/m, '<div class="mb-4 p-3 bg-dark-900/60 border border-dark-700/30 rounded text-[10px] font-mono text-dark-500 whitespace-pre">$1</div>')
      // Headers
      .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-dark-200 mt-4 mb-1">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-dark-100 mt-5 mb-2 pb-1 border-b border-dark-700/30">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-dark-50 mb-3">$1</h1>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-dark-200 font-semibold">$1</strong>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="text-[11px] bg-dark-800/80 text-yeye-400 px-1 py-0.5 rounded">$1</code>')
      // Wiki links
      .replace(/\[\[(.+?)\]\]/g, '<span class="text-yeye-400 underline underline-offset-2 decoration-yeye-500/30">$1</span>')
      // Tables
      .replace(/\|(.+)\|/g, (match) => {
        if (match.includes('---')) return ''
        const cells = match.split('|').filter(c => c.trim())
        const isHeader = cells.some(c => c.includes('항목') || c.includes('값'))
        const cellTag = isHeader ? 'th' : 'td'
        const cellClass = isHeader ? 'text-[10px] font-semibold text-dark-400 uppercase tracking-wider' : 'text-xs text-dark-300'
        return `<tr>${cells.map(c => `<${cellTag} class="${cellClass} px-3 py-1.5 border-b border-dark-800/40 text-left">${c.trim()}</${cellTag}>`).join('')}</tr>`
      })
      // List items
      .replace(/^- (.+)$/gm, '<li class="text-xs text-dark-300 ml-3 mb-0.5 list-disc list-inside">$1</li>')
      .replace(/^  - (.+)$/gm, '<li class="text-[11px] text-dark-400 ml-6 mb-0.5 list-circle list-inside">$1</li>')
      // Blockquotes
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-yeye-500/40 pl-3 text-xs text-dark-400 italic my-2">$1</blockquote>')
      // Horizontal rules
      .replace(/^---$/gm, '<hr class="border-dark-700/30 my-4" />')
      // Italic (footer)
      .replace(/\*(.+?)\*/g, '<em class="text-[10px] text-dark-500">$1</em>')
      // Line breaks
      .replace(/\n\n/g, '<div class="mb-2"></div>')
      .replace(/\n/g, '<br />')

    // Wrap table rows
    html = html.replace(/(<tr>[\s\S]*?<\/tr>)/g, '<table class="w-full border-collapse mb-3">$1</table>')

    return html
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-800/50">
          <div>
            <h2 className="text-sm font-bold text-dark-50 flex items-center gap-2">
              📝 마크다운 미리보기
            </h2>
            <p className="text-[10px] text-dark-500 mt-0.5">
              {result.filePath && <span className="font-mono">{result.filePath}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-dark-800/50 rounded-lg p-0.5">
              <button
                onClick={() => setActiveView('preview')}
                className={`px-2.5 py-1 rounded text-[10px] transition-colors ${
                  activeView === 'preview' ? 'bg-dark-700 text-dark-200' : 'text-dark-500 hover:text-dark-300'
                }`}
              >
                미리보기
              </button>
              <button
                onClick={() => setActiveView('raw')}
                className={`px-2.5 py-1 rounded text-[10px] transition-colors ${
                  activeView === 'raw' ? 'bg-dark-700 text-dark-200' : 'text-dark-500 hover:text-dark-300'
                }`}
              >
                원본
              </button>
            </div>
            <button onClick={onClose} className="text-dark-500 hover:text-dark-300 transition-colors text-lg">✕</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeView === 'preview' ? (
            <div
              className="prose-dark"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }}
            />
          ) : (
            <pre className="text-xs text-dark-300 font-mono whitespace-pre-wrap leading-relaxed bg-dark-950/50 border border-dark-800/30 rounded-lg p-4">
              {result.markdown}
            </pre>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-dark-800/50">
          <p className="text-[10px] text-dark-600">
            {result.markdown.length.toLocaleString()} 자 · 웹 프리뷰 모드 (Electron 앱에서 실제 파일 저장)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="btn-secondary btn-sm text-xs"
            >
              {copied ? '✓ 복사됨' : '📋 클립보드 복사'}
            </button>
            <button
              onClick={handleDownload}
              className="btn-primary btn-sm text-xs"
            >
              📥 다운로드 (.md)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
