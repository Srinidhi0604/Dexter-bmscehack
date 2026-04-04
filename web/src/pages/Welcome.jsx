import { useEffect, useState } from 'react'

const WELCOME_MD = `
# TrafficLab 3D

**AI-powered traffic analysis system** — built for drone/CCTV footage with YOLO object detection, multi-object tracking, 3D vehicle lifting and satellite map projection.

---

## Quick Start

1. **Location** — Create a location by uploading a CCTV frame and satellite image
2. **Calibration** — Upload or verify the G-projection configuration file
3. **Inference** — Scan your footage, select tasks, and run YOLO inference
4. **Visualization** — Replay annotated results with live telemetry overlay

---

## Core Features

- 🚗 &nbsp; **YOLO Vehicle Detection** — YOLOv8/v11 fine-tuned on VisDrone dataset
- 🏃 &nbsp; **ByteTrack Multi-Object Tracking** — persistent IDs across frames
- 📐 &nbsp; **3D Bounding Box Lifting** — from 2D to geo-referenced 3D boxes
- 🛰️ &nbsp; **Satellite Map Projection** — homography-based bird's-eye view
- 📊 &nbsp; **Kinematics Engine** — speed (km/h), heading and trajectory smoothing
- 🌐 &nbsp; **Web Interface** — React frontend + FastAPI backend

---

## Keyboard Shortcuts (Visualization)

| Key | Action |
|-----|--------|
| Space | Pause / Play |
| ← / → | Step one frame |
| 1 | Toggle color-by-ID |
| 3 | Toggle 3D boxes |
| F | Toggle FOV overlay |

---

*Developed for BMS CE Hackathon 2026*
`

function renderMd(md) {
  // Very lightweight markdown renderer (no deps needed for welcome screen)
  return md
    .split('\n')
    .map((line, i) => {
      if (line.startsWith('# '))   return <h1 key={i} style={{fontFamily:'var(--font-display)',fontSize:28,fontWeight:700,color:'#fff',marginBottom:12,marginTop:24,letterSpacing:2}}>{line.slice(2)}</h1>
      if (line.startsWith('## '))  return <h2 key={i} style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:700,color:'var(--cyan)',marginBottom:10,marginTop:28,letterSpacing:1.5,textTransform:'uppercase'}}>{line.slice(3)}</h2>
      if (line.startsWith('### ')) return <h3 key={i} style={{fontSize:14,fontWeight:600,color:'#e8f4ff',marginBottom:6,marginTop:20}}>{line.slice(4)}</h3>
      if (line === '---') return <div key={i} className="divider" />
      if (line.startsWith('- ')) {
        const content = line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/&nbsp;/g, '\u00a0')
        return <li key={i} style={{marginBottom:6,color:'rgba(200,216,240,0.8)',lineHeight:1.7}} dangerouslySetInnerHTML={{__html:content}} />
      }
      if (line.startsWith('| ') && line.includes('|')) {
        const cols = line.split('|').filter(c=>c.trim() && !c.match(/^[-\s]+$/))
        if (!cols.length) return null
        const isHeader = i > 0
        return null // handled below
      }
      if (line === '') return <div key={i} style={{height:8}} />
      const rendered = line
        .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e8f4ff">$1</strong>')
        .replace(/`(.*?)`/g, '<code style="font-family:var(--font-mono);font-size:12px;background:rgba(0,212,255,0.1);padding:2px 6px;border-radius:4px;color:var(--cyan)">$1</code>')
        .replace(/🚗|🏃|📐|🛰️|📊|🌐/g, s => s)
      return <p key={i} style={{fontSize:14,lineHeight:1.8,color:'rgba(200,216,240,0.75)',marginBottom:4}} dangerouslySetInnerHTML={{__html:rendered}} />
    })
}

function ShortcutsTable() {
  const rows = [
    ['Space','Pause / Play'],
    ['← / →','Step one frame'],
    ['1','Toggle color-by-ID'],
    ['3','Toggle 3D boxes'],
    ['F','Toggle FOV overlay'],
  ]
  return (
    <table className="data-table" style={{marginTop:8}}>
      <thead><tr><th>Key</th><th>Action</th></tr></thead>
      <tbody>{rows.map(([k,v])=>(
        <tr key={k}><td><code style={{fontFamily:'var(--font-mono)',color:'var(--cyan)'}}>{k}</code></td><td>{v}</td></tr>
      ))}</tbody>
    </table>
  )
}

export default function Welcome() {
  const [apiOk, setApiOk] = useState(null)

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setApiOk(d.status === 'ok'))
      .catch(() => setApiOk(false))
  }, [])

  return (
    <>
      <div className="page-header">
        <div className="page-title">WELCOME</div>
        <div className="page-subtitle">TRAFFICLAB 3D — AI TRAFFIC ANALYTICS PLATFORM</div>
      </div>

      <div className="page-body fade-in">
        {/* Status row */}
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-label">API Status</div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:apiOk===null?'#888':apiOk?'var(--green)':'var(--red)',boxShadow:`0 0 8px ${apiOk===null?'#888':apiOk?'var(--green)':'var(--red)'}`}} />
              <span className="text-mono" style={{fontSize:13,color:apiOk===null?'#888':apiOk?'var(--green)':'var(--red)'}}>
                {apiOk === null ? 'Checking…' : apiOk ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Platform</div>
            <div className="stat-value" style={{fontSize:14,marginTop:4}}>TrafficLab</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Version</div>
            <div className="stat-value" style={{fontSize:14,marginTop:4}}>v1.1.0</div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20}}>
          <div>
            {/* Hero */}
            <div className="card section-gap" style={{background:'linear-gradient(135deg,rgba(0,212,255,0.06),rgba(124,58,237,0.08))',borderColor:'rgba(0,212,255,0.25)'}}>
              <h1 style={{fontFamily:'var(--font-display)',fontSize:32,fontWeight:900,color:'#fff',letterSpacing:3,marginBottom:8}}>
                TRAFFIC<span style={{color:'var(--cyan)'}}>LAB</span> 3D
              </h1>
              <p style={{fontSize:14,lineHeight:1.8,color:'rgba(200,216,240,0.75)',maxWidth:560}}>
                AI-powered traffic analysis system built for drone/CCTV footage with YOLO object detection, multi-object tracking, 3D vehicle lifting and satellite map projection.
              </p>
            </div>

            {/* Features */}
            <div className="card section-gap">
              <div className="card-title">Core Features</div>
              {[
                ['⚡','YOLO Detection','YOLOv8/v11 fine-tuned on VisDrone dataset'],
                ['🔁','ByteTrack MOT','Persistent vehicle IDs across frames'],
                ['📐','3D Lifting','Geo-referenced 3D bounding boxes from 2D'],
                ['🛰️','Satellite Projection','Homography-based bird\'s-eye view mapping'],
                ['📊','Kinematics Engine','Speed (km/h), heading and trajectory smoothing'],
              ].map(([icon,title,desc])=>(
                <div key={title} style={{display:'flex',gap:12,marginBottom:12,padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:'var(--radius)',border:'1px solid var(--border)'}}>
                  <span style={{fontSize:20}}>{icon}</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'#e8f4ff',marginBottom:2}}>{title}</div>
                    <div style={{fontSize:12,color:'rgba(200,216,240,0.55)'}}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            {/* Quickstart */}
            <div className="card section-gap">
              <div className="card-title">Quick Start</div>
              {[
                ['1','Location','Upload CCTV frame & satellite image'],
                ['2','Calibration','Upload G-projection JSON'],
                ['3','Inference','Run YOLO on footage'],
                ['4','Visualization','Replay annotated results'],
              ].map(([n,step,desc])=>(
                <div key={n} style={{display:'flex',gap:12,marginBottom:12,alignItems:'flex-start'}}>
                  <div style={{width:26,height:26,borderRadius:'50%',background:'rgba(0,212,255,0.15)',border:'1px solid var(--border-bright)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontFamily:'var(--font-display)',fontSize:11,color:'var(--cyan)',fontWeight:700}}>{n}</div>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:'#e8f4ff'}}>{step}</div>
                    <div style={{fontSize:11,color:'rgba(200,216,240,0.5)',marginTop:2}}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Shortcuts */}
            <div className="card">
              <div className="card-title">Visualization Shortcuts</div>
              <ShortcutsTable />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
