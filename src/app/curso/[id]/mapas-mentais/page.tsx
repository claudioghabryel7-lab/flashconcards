'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Brain, Download, RefreshCw, ZoomIn, ZoomOut, Target, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import SimpleHeader from '@/components/SimpleHeader'
import Footer from '@/components/Footer'

export default function MapasMentaisPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [courseData, setCourseData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mindMaps, setMindMaps] = useState<any[]>([])
  const [selectedMap, setSelectedMap] = useState<any>(null)
  const [generating, setGenerating] = useState(false)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    // Simular carregamento de mapas mentais gerados por IA
    const loadMindMaps = async () => {
      setLoading(true)
      
      // Mapas mentais mockados gerados por IA
      const mockMindMaps = [
        {
          id: 1,
          title: "Mapa Mental - Língua Portuguesa",
          topic: "Compreensão Textual",
          description: "Estrutura completa para análise e interpretação de textos",
          nodes: [
            { id: 1, text: "Compreensão Textual", x: 400, y: 300, color: "#3B82F6" },
            { id: 2, text: "Tipos de Texto", x: 200, y: 200, color: "#10B981" },
            { id: 3, text: "Elementos", x: 600, y: 200, color: "#8B5CF6" },
            { id: 4, text: "Narrativo", x: 100, y: 100, color: "#F59E0B" },
            { id: 5, text: "Descritivo", x: 200, y: 100, color: "#F59E0B" },
            { id: 6, text: "Dissertativo", x: 300, y: 100, color: "#F59E0B" },
            { id: 7, text: "Personagens", x: 500, y: 100, color: "#EF4444" },
            { id: 8, text: "Enredo", x: 600, y: 100, color: "#EF4444" },
            { id: 9, text: "Tempo", x: 700, y: 100, color: "#EF4444" },
            { id: 10, text: "Espaço", x: 600, y: 300, color: "#EF4444" }
          ],
          connections: [
            { from: 1, to: 2 },
            { from: 1, to: 3 },
            { from: 2, to: 4 },
            { from: 2, to: 5 },
            { from: 2, to: 6 },
            { from: 3, to: 7 },
            { from: 3, to: 8 },
            { from: 3, to: 9 },
            { from: 3, to: 10 }
          ]
        },
        {
          id: 2,
          title: "Mapa Mental - Matemática",
          topic: "Regra de Três",
          description: "Estrutura visual para resolver problemas de proporcionalidade",
          nodes: [
            { id: 1, text: "Regra de Três", x: 400, y: 300, color: "#3B82F6" },
            { id: 2, text: "Simples", x: 200, y: 200, color: "#10B981" },
            { id: 3, text: "Composta", x: 600, y: 200, color: "#8B5CF6" },
            { id: 4, text: "Grandezas", x: 100, y: 100, color: "#F59E0B" },
            { id: 5, text: "Direta", x: 200, y: 100, color: "#EF4444" },
            { id: 6, text: "Inversa", x: 300, y: 100, color: "#EF4444" },
            { id: 7, text: "3+ Grandezas", x: 500, y: 100, color: "#F59E0B" },
            { id: 8, text: "Análise", x: 600, y: 100, color: "#EF4444" },
            { id: 9, text: "Resolução", x: 700, y: 100, color: "#EF4444" }
          ],
          connections: [
            { from: 1, to: 2 },
            { from: 1, to: 3 },
            { from: 2, to: 4 },
            { from: 2, to: 5 },
            { from: 2, to: 6 },
            { from: 3, to: 7 },
            { from: 3, to: 8 },
            { from: 3, to: 9 }
          ]
        },
        {
          id: 3,
          title: "Mapa Mental - Informática",
          topic: "Hardware vs Software",
          description: "Diferenças e componentes fundamentais",
          nodes: [
            { id: 1, text: "Computador", x: 400, y: 300, color: "#3B82F6" },
            { id: 2, text: "Hardware", x: 200, y: 200, color: "#10B981" },
            { id: 3, text: "Software", x: 600, y: 200, color: "#8B5CF6" },
            { id: 4, text: "CPU", x: 100, y: 100, color: "#F59E0B" },
            { id: 5, text: "Memória", x: 200, y: 100, color: "#F59E0B" },
            { id: 6, text: "Armazenamento", x: 300, y: 100, color: "#F59E0B" },
            { id: 7, text: "Sistema", x: 500, y: 100, color: "#EF4444" },
            { id: 8, text: "Aplicativos", x: 600, y: 100, color: "#EF4444" },
            { id: 9, text: "Drivers", x: 700, y: 100, color: "#EF4444" }
          ],
          connections: [
            { from: 1, to: 2 },
            { from: 1, to: 3 },
            { from: 2, to: 4 },
            { from: 2, to: 5 },
            { from: 2, to: 6 },
            { from: 3, to: 7 },
            { from: 3, to: 8 },
            { from: 3, to: 9 }
          ]
        }
      ]

      const courseTitle = decodeURIComponent(params.id).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      
      setCourseData({
        id: params.id,
        title: courseTitle,
        organization: "Comissão de Concurso Público",
        status: "Aberto"
      })
      
      setMindMaps(mockMindMaps)
      setSelectedMap(mockMindMaps[0])
      setLoading(false)
    }

    loadMindMaps()
  }, [params.id])

  const generateNewMap = async () => {
    setGenerating(true)
    
    // Simular geração de novo mapa mental
    setTimeout(() => {
      const newMap = {
        id: mindMaps.length + 1,
        title: `Mapa Mental - Raciocínio Lógico`,
        topic: "Estruturas Lógicas",
        description: "Organização visual de conceitos lógicos",
        nodes: [
          { id: 1, text: "Lógica", x: 400, y: 300, color: "#3B82F6" },
          { id: 2, text: "Proposições", x: 200, y: 200, color: "#10B981" },
          { id: 3, text: "Conectivos", x: 600, y: 200, color: "#8B5CF6" },
          { id: 4, text: "Verdadeiro", x: 100, y: 100, color: "#10B981" },
          { id: 5, text: "Falso", x: 200, y: 100, color: "#EF4444" },
          { id: 6, text: "E", x: 500, y: 100, color: "#F59E0B" },
          { id: 7, text: "OU", x: 600, y: 100, color: "#F59E0B" },
          { id: 8, text: "NÃO", x: 700, y: 100, color: "#F59E0B" }
        ],
        connections: [
          { from: 1, to: 2 },
          { from: 1, to: 3 },
          { from: 2, to: 4 },
          { from: 2, to: 5 },
          { from: 3, to: 6 },
          { from: 3, to: 7 },
          { from: 3, to: 8 }
        ]
      }
      
      setMindMaps([...mindMaps, newMap])
      setSelectedMap(newMap)
      setGenerating(false)
    }, 2000)
  }

  const downloadMap = () => {
    // Simular download do mapa mental
    alert('Download do mapa mental iniciado!')
  }

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.1, 2))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.1, 0.5))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!courseData) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Mapas Mentais não encontrados</h1>
          <button
            onClick={() => router.push('/cursos')}
            className="px-6 py-2 bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Voltar para busca
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <SimpleHeader />
      
      <section className="relative py-20">
        {/* Background Pattern */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950"></div>
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 1px)`,
              backgroundSize: '40px 40px'
            }}></div>
          </div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <button
              onClick={() => router.push(`/curso/${params.id}`)}
              className="mb-6 inline-flex items-center text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para {courseData.title}
            </button>

            <div className="text-center">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Mapas Mentais
              </h1>
              <p className="text-gray-300">
                {courseData.title} - Gerados por IA para otimizar seus estudos
              </p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="lg:col-span-1"
            >
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Brain className="w-5 h-5 mr-2 text-blue-400" />
                  Mapas Disponíveis
                </h3>
                
                <div className="space-y-3 mb-6">
                  {mindMaps.map((map) => (
                    <button
                      key={map.id}
                      onClick={() => setSelectedMap(map)}
                      className={`w-full p-3 rounded-lg border text-left transition-all duration-300 ${
                        selectedMap?.id === map.id 
                          ? 'bg-blue-500/20 border-blue-500 text-blue-400' 
                          : 'bg-slate-700 border-slate-600 hover:bg-slate-600 text-white'
                      }`}
                    >
                      <div className="font-medium">{map.title}</div>
                      <div className="text-sm opacity-75">{map.topic}</div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={generateNewMap}
                  disabled={generating}
                  className="w-full px-4 py-2 bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Gerando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Gerar Novo Mapa
                    </>
                  )}
                </button>
              </div>

              {/* Statistics */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mt-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Target className="w-5 h-5 mr-2 text-green-400" />
                  Estatísticas
                </h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total de Mapas</span>
                    <span className="font-semibold">{mindMaps.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tópicos Cobertos</span>
                    <span className="font-semibold">{mindMaps.length * 3}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Conceitos Mapeados</span>
                    <span className="font-semibold">{mindMaps.reduce((acc, map) => acc + map.nodes.length, 0)}</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Map Visualization */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="lg:col-span-3"
            >
              {selectedMap && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-semibold">{selectedMap.title}</h3>
                      <p className="text-gray-400">{selectedMap.description}</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleZoomOut}
                        className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleZoomIn}
                        className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        onClick={downloadMap}
                        className="p-2 bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* SVG Map */}
                  <div className="bg-slate-900 rounded-lg p-4 overflow-hidden" style={{ height: '500px' }}>
                    <svg 
                      width="100%" 
                      height="100%" 
                      viewBox="0 0 800 600"
                      style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                    >
                      {/* Connections */}
                      {selectedMap.connections.map((conn: any, index: number) => {
                        const fromNode = selectedMap.nodes.find((n: any) => n.id === conn.from)
                        const toNode = selectedMap.nodes.find((n: any) => n.id === conn.to)
                        
                        if (!fromNode || !toNode) return null
                        
                        return (
                          <line
                            key={index}
                            x1={fromNode.x}
                            y1={fromNode.y}
                            x2={toNode.x}
                            y2={toNode.y}
                            stroke="#4B5563"
                            strokeWidth="2"
                          />
                        )
                      })}

                      {/* Nodes */}
                      {selectedMap.nodes.map((node: any) => (
                        <g key={node.id}>
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r="30"
                            fill={node.color}
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                          />
                          <text
                            x={node.x}
                            y={node.y}
                            textAnchor="middle"
                            dy="0.3em"
                            fill="white"
                            fontSize="12"
                            fontWeight="bold"
                            className="pointer-events-none select-none"
                          >
                            {node.text.length > 15 ? node.text.substring(0, 15) + '...' : node.text}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>

                  <div className="mt-4 flex items-center justify-center gap-4 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span>Conceito Principal</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span>Categoria</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                      <span>Subcategoria</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
