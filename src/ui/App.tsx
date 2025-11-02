
import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'

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

export default function App(){
  const [artisans, setArtisans] = useState<Item[]>([])
  const [places, setPlaces] = useState<Item[]>([])
  const [q, setQ] = useState('')
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
    fetch(`${API_URL}/artisans`).then(r=>r.json()).then(setArtisans).catch(console.error)
    fetch(`${API_URL}/places`).then(r=>r.json()).then(setPlaces).catch(console.error)
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
    if(!map.current) return
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
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([i.lng, i.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<strong>${i.name}</strong><br/>${i.kind}`))
        .addTo(map.current!)
      // @ts-ignore
      (map.current as any)._customMarkers.push(marker)
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
          {items.map((it:any) => (
            <div key={`${it.kind}-${it.id}`} className="item" onClick={()=>focus(it)}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <strong>{it.name}</strong>
                <span className="badge">{it.kind}</span>
              </div>
              <div style={{fontSize:12, color:'#666'}}>{it.category || it.type}</div>
              <div style={{fontSize:12}}>{it.description}</div>
            </div>
          ))}
        </div>
        <div className="map">
          <div ref={mapRef} className="mapCanvas" />
          <div className="footer">v{__APP_VERSION__}</div>
        </div>
      </div>
    </div>
  )
}
