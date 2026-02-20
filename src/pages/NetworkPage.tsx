import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Site, Person, PersonSiteRelation, PersonRelation } from '@/shared/types'

// ============================================
// Types
// ============================================
interface GraphNode {
  id: string
  label: string
  sublabel?: string
  type: 'site' | 'person'
  x: number
  y: number
  vx: number
  vy: number
  pinned?: boolean
  risk?: string
  priority?: string
  status?: string
}

interface GraphEdge {
  source: string
  target: string
  label?: string
  confidence?: string
  type: 'person-site' | 'person-person'
}

// ============================================
// Color helpers
// ============================================
const NODE_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  site: { fill: '#1e3a5f', stroke: '#3b82f6', text: '#93c5fd' },
  person: { fill: '#3b1f4e', stroke: '#a855f7', text: '#d8b4fe' },
}

const RISK_RING: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

const PRIORITY_RING: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

const CONFIDENCE_OPACITY: Record<string, number> = {
  confirmed: 1.0,
  high: 0.8,
  medium: 0.6,
  low: 0.4,
  suspected: 0.3,
}

// ============================================
// Force-directed layout (simplified)
// ============================================
function runForceLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  if (nodes.length === 0) return nodes

  const padding = 100
  const cx = width / 2
  const cy = height / 2
  // Spread initial positions across available space
  const spreadRadius = Math.min(width, height) * 0.4
  const iterations = Math.max(150, nodes.length * 25)

  // Initialize positions — skip pinned nodes
  nodes.forEach((node, i) => {
    if (node.pinned) return
    const angle = (2 * Math.PI * i) / nodes.length + (Math.random() - 0.5) * 0.3
    node.x = cx + spreadRadius * Math.cos(angle)
    node.y = cy + spreadRadius * Math.sin(angle)
    node.vx = 0
    node.vy = 0
  })

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const minDist = Math.max(120, Math.min(width, height) / (nodes.length + 1) * 1.2)

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = Math.max(0.01, 1 - iter / iterations)
    const repulsion = 20000 * alpha
    const attraction = 0.003 * alpha
    const centerPull = 0.003 * alpha

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[j].x - nodes[i].x
        let dy = nodes[j].y - nodes[i].y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)

        // Stronger repulsion when too close
        const effectiveRepulsion = dist < minDist ? repulsion * 2.5 : repulsion
        const force = effectiveRepulsion / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        nodes[i].vx -= fx
        nodes[i].vy -= fy
        nodes[j].vx += fx
        nodes[j].vy += fy
      }
    }

    // Attraction along edges (desired distance ~minDist)
    for (const edge of edges) {
      const source = nodeMap.get(edge.source)
      const target = nodeMap.get(edge.target)
      if (!source || !target) continue
      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      // Only attract if distance > desired, repel if too close
      const delta = dist - minDist * 0.8
      const force = delta * attraction
      const fx = (dx / Math.max(dist, 1)) * force
      const fy = (dy / Math.max(dist, 1)) * force
      source.vx += fx
      source.vy += fy
      target.vx -= fx
      target.vy -= fy
    }

    // Gentle center pull
    for (const node of nodes) {
      node.vx += (cx - node.x) * centerPull
      node.vy += (cy - node.y) * centerPull
    }

    // Apply velocity with damping — skip pinned
    for (const node of nodes) {
      if (node.pinned) continue
      node.x += node.vx * 0.7
      node.y += node.vy * 0.7
      node.vx *= 0.6
      node.vy *= 0.6

      // Keep within padded bounds
      node.x = Math.max(padding, Math.min(width - padding, node.x))
      node.y = Math.max(padding, Math.min(height - padding, node.y))
    }
  }

  return nodes
}

// ============================================
// Main Component
// ============================================
export default function NetworkPage() {
  const navigate = useNavigate()
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({ width: 900, height: 700 })

  // Drag state
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // Stats
  const [stats, setStats] = useState({ sites: 0, persons: 0, relations: 0 })

  const loadData = useCallback(async () => {
    try {
      const [sites, persons, psr] = await Promise.all([
        window.electronAPI.sites.list(),
        window.electronAPI.persons.list(),
        // Get all person-site relations by iterating persons
        (async () => {
          const allPersons = await window.electronAPI.persons.list()
          const allRelations: PersonSiteRelation[] = []
          for (const p of allPersons) {
            const rels = await window.electronAPI.personSiteRelations.list({ person_id: p.id })
            allRelations.push(...rels)
          }
          return allRelations
        })(),
      ])

      // Person-person relations
      const ppRelations: PersonRelation[] = []
      for (const p of persons) {
        const rels = await window.electronAPI.personRelations.list(p.id)
        for (const r of rels) {
          if (!ppRelations.find(e => e.id === r.id)) {
            ppRelations.push(r)
          }
        }
      }

      // Build nodes
      const graphNodes: GraphNode[] = [
        ...sites.map(s => ({
          id: s.id,
          label: s.display_name || s.domain,
          sublabel: s.domain,
          type: 'site' as const,
          x: 0, y: 0, vx: 0, vy: 0,
          priority: s.priority,
          status: s.status,
        })),
        ...persons.map(p => ({
          id: p.id,
          label: p.alias || p.real_name || '미확인',
          sublabel: p.real_name && p.alias ? p.real_name : undefined,
          type: 'person' as const,
          x: 0, y: 0, vx: 0, vy: 0,
          risk: p.risk_level,
          status: p.status,
        })),
      ]

      // Build edges
      const graphEdges: GraphEdge[] = [
        ...psr.map(r => ({
          source: r.person_id,
          target: r.site_id,
          label: r.role || undefined,
          confidence: r.confidence,
          type: 'person-site' as const,
        })),
        ...ppRelations.map(r => ({
          source: r.person_a_id,
          target: r.person_b_id,
          label: r.relation_type || undefined,
          confidence: r.confidence,
          type: 'person-person' as const,
        })),
      ]

      // Only include nodes that have at least one connection, OR all nodes if few
      let finalNodes = graphNodes
      let finalEdges = graphEdges

      if (graphNodes.length > 10) {
        const connectedIds = new Set<string>()
        graphEdges.forEach(e => { connectedIds.add(e.source); connectedIds.add(e.target) })
        finalNodes = graphNodes.filter(n => connectedIds.has(n.id))
        finalEdges = graphEdges.filter(e =>
          finalNodes.find(n => n.id === e.source) && finalNodes.find(n => n.id === e.target)
        )
      }

      // Run force layout
      const w = containerRef.current?.clientWidth || 900
      const h = Math.max(500, containerRef.current?.clientHeight || 700)
      setDimensions({ width: w, height: h })
      runForceLayout(finalNodes, finalEdges, w, h)

      setNodes(finalNodes)
      setEdges(finalEdges)
      setStats({
        sites: sites.length,
        persons: persons.length,
        relations: psr.length + ppRelations.length,
      })
    } catch (err) {
      console.error('Failed to load network data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Resize observer — re-layout on resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let resizeTimer: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) {
        const newW = Math.floor(width)
        const newH = Math.max(500, Math.floor(height))
        setDimensions(prev => {
          // Only re-layout if size changed significantly
          if (Math.abs(prev.width - newW) > 30 || Math.abs(prev.height - newH) > 30) {
            clearTimeout(resizeTimer)
            resizeTimer = setTimeout(() => {
              // Re-run force layout — pinned nodes stay in place
              setNodes(prev => {
                if (prev.length === 0) return prev
                const newNodes = prev.map(n => ({ ...n }))
                runForceLayout(newNodes, edges, newW, newH)
                return newNodes
              })
            }, 300)
          }
          return { width: newW, height: newH }
        })
      }
    })
    observer.observe(container)
    return () => { observer.disconnect(); clearTimeout(resizeTimer) }
  }, [nodes.length, edges.length])

  // Drag handlers
  function handleMouseDown(nodeId: string, e: React.MouseEvent) {
    e.preventDefault()
    const node = nodes.find(n => n.id === nodeId)
    if (!node || !svgRef.current) return
    const svgRect = svgRef.current.getBoundingClientRect()
    setDraggingNode(nodeId)
    setDragOffset({
      x: e.clientX - svgRect.left - node.x,
      y: e.clientY - svgRect.top - node.y,
    })
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!draggingNode || !svgRef.current) return
    const svgRect = svgRef.current.getBoundingClientRect()
    const newX = e.clientX - svgRect.left - dragOffset.x
    const newY = e.clientY - svgRect.top - dragOffset.y
    setNodes(prev => prev.map(n =>
      n.id === draggingNode ? { ...n, x: newX, y: newY } : n
    ))
  }

  function handleMouseUp() {
    if (draggingNode) {
      // Pin the dragged node so re-layout won't move it
      setNodes(prev => prev.map(n =>
        n.id === draggingNode ? { ...n, pinned: true } : n
      ))
    }
    setDraggingNode(null)
  }

  function handleNodeClick(node: GraphNode) {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
  }

  function handleNodeDblClick(node: GraphNode) {
    navigate(node.type === 'site' ? `/sites/${node.id}` : `/persons/${node.id}`)
  }

  // Get connected edges for a node
  function getConnectedEdges(nodeId: string) {
    return edges.filter(e => e.source === nodeId || e.target === nodeId)
  }

  function getConnectedNodeIds(nodeId: string) {
    const connected = new Set<string>()
    edges.forEach(e => {
      if (e.source === nodeId) connected.add(e.target)
      if (e.target === nodeId) connected.add(e.source)
    })
    return connected
  }

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="titlebar-drag pt-2">
          <div className="titlebar-no-drag">
            <h1 className="page-title">관계도</h1>
            <p className="page-subtitle">사이트-인물 네트워크 시각화</p>
          </div>
        </div>
        <div className="card h-96 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-yeye-500/30 border-t-yeye-500 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-dark-500">관계도 데이터 로딩 중...</p>
          </div>
        </div>
      </div>
    )
  }

  const highlightedNodes = hoveredNode ? getConnectedNodeIds(hoveredNode) : new Set<string>()

  return (
    <div className="p-4 space-y-3 h-[calc(100vh-2rem)] flex flex-col">
      {/* Header */}
      <div className="titlebar-drag pt-2">
        <div className="titlebar-no-drag flex items-start justify-between">
          <div>
            <h1 className="page-title">관계도</h1>
            <p className="page-subtitle">사이트-인물 네트워크 시각화 · 더블 클릭으로 상세 이동, 드래그로 노드 위치 변경</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-dark-400">
            <span>🌐 사이트 {stats.sites}</span>
            <span>👤 인물 {stats.persons}</span>
            <span>🔗 관계 {stats.relations}</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-dark-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#1e3a5f] border border-[#3b82f6]" />
          <span>사이트</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#3b1f4e] border border-[#a855f7]" />
          <span>인물</span>
        </div>
        <span className="text-dark-600">│</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-0.5 bg-blue-500/60" />
          <span>인물↔사이트</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-0.5 bg-purple-500/60" style={{ borderTop: '1px dashed' }} />
          <span>인물↔인물</span>
        </div>
      </div>

      {/* Graph + Detail Panel */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* SVG Graph */}
        <div ref={containerRef} className="flex-1 card p-0 overflow-hidden relative min-h-0">
          {nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-3">
                <p className="text-4xl">🕸️</p>
                <p className="text-sm text-dark-500">연결된 관계가 없습니다</p>
                <p className="text-xs text-dark-600">사이트와 인물을 연결하면 여기에 네트워크 그래프가 표시됩니다</p>
              </div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              width={dimensions.width}
              height={dimensions.height}
              className="cursor-grab active:cursor-grabbing"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="shadow">
                  <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.5" />
                </filter>
              </defs>

              {/* Edges */}
              {edges.map((edge, i) => {
                const source = nodes.find(n => n.id === edge.source)
                const target = nodes.find(n => n.id === edge.target)
                if (!source || !target) return null
                const opacity = CONFIDENCE_OPACITY[edge.confidence || 'medium'] || 0.5
                const isHighlighted = hoveredNode && (edge.source === hoveredNode || edge.target === hoveredNode)
                const isActive = selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id)
                const color = edge.type === 'person-site' ? '#3b82f6' : '#a855f7'

                // Edge midpoint for label
                const mx = (source.x + target.x) / 2
                const my = (source.y + target.y) / 2

                return (
                  <g key={`edge-${i}`}>
                    <line
                      x1={source.x} y1={source.y}
                      x2={target.x} y2={target.y}
                      stroke={color}
                      strokeOpacity={isHighlighted || isActive ? 0.9 : opacity * 0.4}
                      strokeWidth={isHighlighted || isActive ? 2.5 : 1.5}
                      strokeDasharray={edge.type === 'person-person' ? '6 4' : undefined}
                    />
                    {edge.label && (isHighlighted || isActive) && (
                      <>
                        <rect
                          x={mx - 20} y={my - 8}
                          width={40} height={16}
                          rx={4}
                          fill="#1a1a2e"
                          fillOpacity={0.9}
                          stroke={color}
                          strokeOpacity={0.3}
                          strokeWidth={0.5}
                        />
                        <text x={mx} y={my + 3} textAnchor="middle" fill="#9ca3af" fontSize={9}>
                          {edge.label}
                        </text>
                      </>
                    )}
                  </g>
                )
              })}

              {/* Nodes */}
              {nodes.map(node => {
                const colors = NODE_COLORS[node.type]
                const isHovered = hoveredNode === node.id
                const isSelected = selectedNode?.id === node.id
                const isConnectedToHover = hoveredNode ? highlightedNodes.has(node.id) : false
                const isFaded = hoveredNode ? (!isHovered && !isConnectedToHover && hoveredNode !== node.id) : false
                const ringColor = node.type === 'person'
                  ? RISK_RING[node.risk || 'medium']
                  : PRIORITY_RING[node.priority || 'medium']
                const nodeRadius = node.type === 'site' ? 28 : 24

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{
                      cursor: draggingNode === node.id ? 'grabbing' : 'pointer',
                      opacity: isFaded ? 0.2 : 1,
                      transition: draggingNode ? 'none' : 'opacity 0.2s',
                    }}
                    onMouseDown={e => handleMouseDown(node.id, e)}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onClick={() => handleNodeClick(node)}
                    onDoubleClick={() => handleNodeDblClick(node)}
                  >
                    {/* Risk/Priority ring */}
                    <circle
                      r={nodeRadius + 3}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth={isSelected ? 3 : 2}
                      strokeOpacity={isSelected ? 0.9 : 0.5}
                    />

                    {/* Main node */}
                    {node.type === 'site' ? (
                      <rect
                        x={-nodeRadius} y={-nodeRadius}
                        width={nodeRadius * 2} height={nodeRadius * 2}
                        rx={8}
                        fill={colors.fill}
                        stroke={isSelected ? '#60a5fa' : colors.stroke}
                        strokeWidth={isSelected ? 2 : 1}
                        filter={isHovered ? 'url(#glow)' : undefined}
                      />
                    ) : (
                      <circle
                        r={nodeRadius}
                        fill={colors.fill}
                        stroke={isSelected ? '#c084fc' : colors.stroke}
                        strokeWidth={isSelected ? 2 : 1}
                        filter={isHovered ? 'url(#glow)' : undefined}
                      />
                    )}

                    {/* Icon */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={16}
                      y={-4}
                    >
                      {node.type === 'site' ? '🌐' : '👤'}
                    </text>

                    {/* Label */}
                    <text
                      textAnchor="middle"
                      y={nodeRadius + 16}
                      fill={colors.text}
                      fontSize={11}
                      fontWeight={600}
                    >
                      {node.label.length > 18 ? node.label.slice(0, 16) + '…' : node.label}
                    </text>
                    {node.sublabel && isHovered && (
                      <text
                        textAnchor="middle"
                        y={nodeRadius + 28}
                        fill="#6b7280"
                        fontSize={9}
                      >
                        {node.sublabel}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          )}
        </div>

        {/* Detail Panel */}
        {selectedNode && (
          <div className="w-72 card space-y-4 overflow-y-auto flex-shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-dark-200">
                {selectedNode.type === 'site' ? '🌐 사이트' : '👤 인물'} 정보
              </h3>
              <button onClick={() => setSelectedNode(null)} className="text-dark-600 hover:text-dark-400 text-xs">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-dark-500">이름</p>
                <p className="text-sm font-medium text-dark-100">{selectedNode.label}</p>
                {selectedNode.sublabel && <p className="text-xs text-dark-500">{selectedNode.sublabel}</p>}
              </div>

              {selectedNode.type === 'person' && selectedNode.risk && (
                <div>
                  <p className="text-xs text-dark-500">위험도</p>
                  <span className={`badge priority-${selectedNode.risk} text-xs`}>
                    {selectedNode.risk === 'critical' ? '긴급' : selectedNode.risk === 'high' ? '높음' : selectedNode.risk === 'medium' ? '보통' : '낮음'}
                  </span>
                </div>
              )}

              {selectedNode.type === 'site' && selectedNode.priority && (
                <div>
                  <p className="text-xs text-dark-500">우선순위</p>
                  <span className={`badge priority-${selectedNode.priority} text-xs`}>
                    {selectedNode.priority === 'critical' ? '긴급' : selectedNode.priority === 'high' ? '높음' : selectedNode.priority === 'medium' ? '보통' : '낮음'}
                  </span>
                </div>
              )}

              <div>
                <p className="text-xs text-dark-500 mb-1.5">연결 ({getConnectedEdges(selectedNode.id).length})</p>
                <div className="space-y-1.5">
                  {getConnectedEdges(selectedNode.id).map((edge, i) => {
                    const otherId = edge.source === selectedNode.id ? edge.target : edge.source
                    const other = nodes.find(n => n.id === otherId)
                    if (!other) return null
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs px-2 py-1.5 bg-dark-800/40 rounded-lg cursor-pointer hover:bg-dark-800/70 transition-colors"
                        onClick={() => {
                          setSelectedNode(other)
                          setHoveredNode(other.id)
                        }}
                      >
                        <span>{other.type === 'site' ? '🌐' : '👤'}</span>
                        <span className="text-dark-200 flex-1 truncate">{other.label}</span>
                        {edge.label && <span className="text-dark-600">{edge.label}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={() => handleNodeDblClick(selectedNode)}
                className="btn-primary btn-sm w-full"
              >
                상세 페이지 →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
