
import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type Item = {
  id: number
  name: string
  description?: string
  category?: string
  type?: string
  lat: number
  lng: number
  photo_url?: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const FALLBACK_ARTISANS: Item[] = [
  {
    id: 1,
    name: 'Artesanías de obsidiana',
    description: 'Tallado tradicional con piedra volcánica de la región.',
    category: 'Artesano',
    lat: 20.0568,
    lng: -99.3391,
    photo_url: ''
  }
]

const FALLBACK_PLACES: Item[] = [
  {
    id: 1,
    name: 'Zona Arqueológica de Tula',
    description: 'Hogar de los Atlantes de Tula y centro ceremonial tolteca.',
    type: 'Zona arqueológica',
    lat: 20.0624,
    lng: -99.3374,
    photo_url: ''
  }
]

export default function App(){
  const [artisans, setArtisans] = useState<Item[]>([])
  const [places, setPlaces] = useState<Item[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const map = useRef<maplibregl.Map | null>(null)

  const items = useMemo(() => {
    const a = artisans.map(a => ({...a, kind:'Artesano'} as any))
    const p = places.map(p => ({...p, kind:'Lugar'} as any))
    const all = [...a, ...p]
    if(!q) return all
    const qq = q.toLowerCase()
    return all.filter(i => i.name.toLowerCase().includes(qq) || (i.description||'').toLowerCase().includes(qq) || (i.category||i.type||'').toLowerCase().includes(qq))
  }, [artisans, places, q])

  useEffect(() => {
    let cancelled = false

    async function loadData(){
      try {
        const [artisansRes, placesRes] = await Promise.all([
          fetch(`${API_URL}/artisans`),
          fetch(`${API_URL}/places`)
        ])

        if(!artisansRes.ok || !placesRes.ok){
          throw new Error('Respuesta no válida del servidor')
        }

        const [artisanData, placeData] = await Promise.all([
          artisansRes.json(),
          placesRes.json()
        ])

        if(!cancelled){
          setArtisans(Array.isArray(artisanData) ? artisanData : [])
          setPlaces(Array.isArray(placeData) ? placeData : [])
          setError(null)
        }
      } catch (err) {
        console.debug('No se pudieron cargar los datos remotos', err)
        if(!cancelled){
          setArtisans(FALLBACK_ARTISANS)
          setPlaces(FALLBACK_PLACES)
          setError('No se pudieron cargar los datos en vivo. Mostrando información de ejemplo.')
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if(!mapRef.current || map.current) return
    map.current = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-99.3389, 20.0617], // Tula
      zoom: 12
    })
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }),'top-right')
  }, [])

  useEffect(() => {
    if(!map.current || !(map.current instanceof maplibregl.Map)) return
    // clear existing markers by storing them in map instance
    // @ts-ignore
    if(map.current._customMarkers){ (map.current as any)._customMarkers.forEach((m:any)=>m.remove()) }
    // @ts-ignore
    (map.current as any)._customMarkers = []

    items.forEach(i => {
      if(typeof i.lat !== 'number' || typeof i.lng !== 'number') return
      const el = document.createElement('div')
      el.style.width = '14px'; el.style.height='14px'; el.style.borderRadius='50%'
      el.style.background = i.kind === 'Artesano' ? '#0ea5e9' : '#22c55e'
      el.style.border = '2px solid white'
      try {
        const marker = new Marker({ element: el })
        if(typeof (marker as any).addTo !== 'function'){
          console.debug('Instancia de marcador inválida recibida', marker)
          return
        }
        marker.setLngLat([i.lng, i.lat])
        marker.addTo(map.current!)
        // @ts-ignore
        (map.current as any)._customMarkers.push(marker)
      } catch (err) {
        console.debug('No se pudo crear un marcador en el mapa', err)
      }
    })
  }, [items])

  function focus(item: Item & {kind:string}){
    if(!map.current) return
    map.current.flyTo({ center: [item.lng, item.lat], zoom: 15 })
  }

  return (
    <div>
      <div className="header">
        <h1>Tula Turismo</h1>
        <input className="search" type="text" placeholder="Buscar artesanos o lugares..." value={q} onChange={e=>setQ(e.target.value)} />
      </div>
      <div className="container">
        <div className="sidebar">
          {error && <div className="message warning">{error}</div>}
          {items.length === 0 ? (
            <div className="message">No se encontraron resultados.</div>
          ) : (
            items.map((it:any) => (
              <div key={`${it.kind}-${it.id}`} className="item" onClick={()=>focus(it)}>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <strong>{it.name}</strong>
                  <span className="badge">{it.kind}</span>
                </div>
                <div style={{fontSize:12, color:'#666'}}>{it.category || it.type}</div>
                <div style={{fontSize:12}}>{it.description}</div>
              </div>
            ))
          )}
        </div>
        <div className="map">
          <div ref={mapRef} className="mapCanvas" />
          <div className="footer">v{__APP_VERSION__}</div>
        </div>
      </div>
    </div>
  )
}
