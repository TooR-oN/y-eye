import { useState, useRef } from 'react'
import type { EvidenceFile } from '@/shared/types'
import { useAutoSync } from '@/hooks/useAutoSync'

interface EvidenceUploadSectionProps {
  entityType: 'site' | 'person'
  entityId: string
  evidenceFiles: EvidenceFile[]
  onUpdated: () => void
}

const FILE_TYPE_ICONS: Record<string, string> = {
  'image': '🖼️',
  'application/pdf': '📄',
  'text': '📝',
  'video': '🎬',
  'audio': '🔊',
}

function getFileIcon(mimeType: string | null): string {
  if (!mimeType) return '📎'
  for (const [key, icon] of Object.entries(FILE_TYPE_ICONS)) {
    if (mimeType.startsWith(key)) return icon
  }
  return '📎'
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function EvidenceUploadSection({ entityType, entityId, evidenceFiles, onUpdated }: EvidenceUploadSectionProps) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { createEvidenceAndSync } = useAutoSync()

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)

    try {
      for (const file of Array.from(files)) {
        // Web preview: 파일을 base64로 읽어서 Mock 저장
        const reader = new FileReader()
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })

        const evidenceFile: Partial<EvidenceFile> = {
          id: crypto.randomUUID(),
          entry_id: null,
          entity_type: entityType,
          entity_id: entityId,
          file_name: file.name,
          file_path: `Attachments/${entityType === 'site' ? 'Sites' : 'Persons'}/${entityId}/${file.name}`,
          file_type: file.name.split('.').pop()?.toLowerCase() || null,
          mime_type: file.type || null,
          file_size: file.size,
          description: null,
          ai_analysis: null,
          captured_at: new Date().toISOString(),
        }

        await createEvidenceAndSync(evidenceFile)
        console.log(`[Evidence] Uploaded: ${file.name} (${formatFileSize(file.size)}) → ${evidenceFile.file_path}`)
      }
      onUpdated()
    } catch (err) {
      console.error('Failed to upload evidence:', err)
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  async function handleDelete(id: string) {
    if (!confirm('이 증거 파일을 삭제하시겠습니까?')) return
    try {
      await window.electronAPI.evidence.delete(id)
      onUpdated()
    } catch (err) {
      console.error('Failed to delete evidence:', err)
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-yeye-500 bg-yeye-500/5'
            : 'border-dark-700/50 hover:border-dark-600 hover:bg-dark-800/20'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.doc,.docx,.json,.csv"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div className="space-y-2">
            <div className="text-2xl animate-pulse">⏳</div>
            <p className="text-sm text-dark-300">업로드 중...</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-2xl">📎</div>
            <p className="text-sm text-dark-300">
              클릭하거나 파일을 드래그하여 업로드
            </p>
            <p className="text-[10px] text-dark-500">
              이미지, PDF, 텍스트, 문서 파일 지원 · Vault Attachments 폴더에 자동 저장
            </p>
          </div>
        )}
      </div>

      {/* File list */}
      {evidenceFiles.length > 0 && (
        <div className="space-y-2">
          {evidenceFiles.map(file => (
            <div key={file.id} className="flex items-center gap-3 bg-dark-800/40 border border-dark-700/30 rounded-lg px-4 py-3 group">
              <span className="text-lg flex-shrink-0">
                {getFileIcon(file.mime_type)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-dark-200 truncate">{file.file_name}</p>
                <div className="flex items-center gap-2 text-[10px] text-dark-500">
                  <span>{formatFileSize(file.file_size)}</span>
                  {file.file_type && <span>· {file.file_type.toUpperCase()}</span>}
                  <span>· {new Date(file.created_at).toLocaleDateString('ko-KR')}</span>
                </div>
                {file.file_path && (
                  <p className="text-[10px] text-dark-600 font-mono truncate mt-0.5">{file.file_path}</p>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {file.description && (
                  <span className="text-[10px] text-dark-500 mr-2">{file.description}</span>
                )}
                <button
                  onClick={() => handleDelete(file.id)}
                  className="text-dark-600 hover:text-red-400 text-xs p-1 transition-colors"
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {evidenceFiles.length === 0 && (
        <p className="text-xs text-dark-600 italic text-center py-2">
          아직 첨부된 증거 파일이 없습니다
        </p>
      )}
    </div>
  )
}
