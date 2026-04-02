"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Copy, Play, Plus, Zap, Shield, HardDrive, Trash2, FolderOpen, Loader2, Sparkles, Image as ImageIcon, Monitor, Smartphone, Settings, Search } from "lucide-react";
import { cloneApp, launchApp, getClones, getInstalledApps, uploadIcon } from "./actions/cloner";
import AppDiscoveryModal from "./components/AppDiscoveryModal";
import IconPicker from "./components/IconPicker";

export default function Home() {
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [activeTab, setActiveTab] = useState("clones");
  const [cloning, setCloning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sourcePath, setSourcePath] = useState("");
  const [cloneName, setCloneName] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  
  // Discovery State
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [installedApps, setInstalledApps] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  
  const [clones, setClones] = useState<any[]>([]);

  useEffect(() => {
    getClones().then(setClones);
  }, []);

  const handleDiscovery = async () => {
    setShowDiscovery(true);
    setLoadingApps(true);
    const result = await getInstalledApps();
    if (result.success && result.apps) {
      setInstalledApps(result.apps);
    }
    setLoadingApps(false);
  };

  const handleSelectApp = (app: any) => {
    setSourcePath(app.InstallLocation);
    setCloneName(`${app.DisplayName} - Alternative`);
    setShowDiscovery(false);
  };

  const handleClone = async () => {
    if (!sourcePath || !cloneName) return alert("Please fill in both fields");
    
    setCloning(true);
    
    // 1. Handle Icon Upload if present
    let finalIconUrl = "";
    if (iconFile) {
      const formData = new FormData();
      formData.append("file", iconFile);
      const uploadRes = await uploadIcon(formData);
      if (uploadRes.success && uploadRes.url) finalIconUrl = uploadRes.url;
    }

    // 2. Perform Physical Clone
    let p = 0;
    const int = setInterval(() => {
      p += Math.random() * 5;
      if (p > 95) clearInterval(int);
      setProgress(Math.floor(p));
    }, 200);

    const result = await cloneApp(sourcePath, cloneName, finalIconUrl);
    clearInterval(int);
    setProgress(100);

    setTimeout(() => {
      setCloning(false);
      setProgress(0);
      if (result.success) {
        getClones().then(setClones);
        setSourcePath("");
        setCloneName("");
        setIconFile(null);
      } else {
        alert("Error: " + result.error);
      }
    }, 1000);
  };

  return (
    <main className="main-container" style={{ paddingBottom: '100px' }}>
      {/* Mobile-Friendly Device Switcher */}
      <div className="flex-center" style={{ marginBottom: '40px' }}>
        <div className="glass" style={{ padding: '4px', display: 'flex', gap: '4px', borderRadius: '14px' }}>
          <button 
            onClick={() => setViewMode("desktop")}
            className={viewMode === "desktop" ? 'btn-primary' : 'btn-secondary'} 
            style={{ padding: '8px 16px', fontSize: '0.8rem', border: 'none', display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            <Monitor size={14} /> Desktop
          </button>
          <button 
            onClick={() => setViewMode("mobile")}
            className={viewMode === "mobile" ? 'btn-primary' : 'btn-secondary'} 
            style={{ padding: '8px 16px', fontSize: '0.8rem', border: 'none', display: 'flex', gap: '8px', alignItems: 'center', background: viewMode === "mobile" ? 'linear-gradient(135deg, var(--accent-secondary), var(--accent))' : 'transparent' }}
          >
            <Smartphone size={14} /> Mobile
          </button>
        </div>
      </div>

      {/* Header section */}
      <header style={{ marginBottom: '40px', textAlign: 'center' }}>
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-center"
          style={{ gap: '12px', marginBottom: '12px' }}
        >
          <div className="glass aura-glow flex-center" style={{ width: '42px', height: '42px', borderRadius: '10px', background: viewMode === 'desktop' ? 'var(--accent)' : 'var(--accent-secondary)' }}>
            {viewMode === 'desktop' ? <Box size={22} color="#000" /> : <Smartphone size={22} color="#fff" />}
          </div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, margin: 0, fontFamily: 'var(--font-outfit)' }}>
            Aura <span style={{ color: viewMode === 'desktop' ? 'var(--accent)' : 'var(--accent-secondary)' }}>{viewMode === 'desktop' ? 'Cloner' : 'Mobile'}</span>
          </h1>
        </motion.div>
        <p className="dim" style={{ fontSize: '1rem' }}>
          {viewMode === 'desktop' 
            ? 'Premium Physical Application Virtualization & Account Isolation'
            : 'Unrestricted Android Instance Virtualizer & Dual-Account Engine'}
        </p>
      </header>

      {viewMode === "desktop" ? (
        <div className="grid-cols" style={{ gridTemplateColumns: 'minmax(300px, 1fr) 2fr' }}>
        {/* Left: Action Panel */}
        <section>
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="glass" 
            style={{ padding: '24px', position: 'sticky', top: '40px' }}
          >
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem' }}>
              <Plus size={20} color="var(--accent)" /> Clone New App
            </h2>
            <p className="dim" style={{ fontSize: '0.9rem', marginBottom: '24px' }}>
              Select a folder to physically duplicate it for account isolation.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label className="dim" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  SOURCE FOLDER PATH
                  <span onClick={handleDiscovery} style={{ color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Sparkles size={12} /> Auto-Discovery
                  </span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="C:\Games\YourGame" 
                    style={{ flex: 1 }}
                    value={sourcePath}
                    onChange={(e) => setSourcePath(e.target.value)}
                  />
                  <button className="btn-secondary flex-center" style={{ padding: '12px' }}>
                    <FolderOpen size={18} />
                  </button>
                </div>
              </div>

              <div>
                <label className="dim" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '8px' }}>CLONE NAME</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. MyGame - Alt Account" 
                  style={{ width: '100%' }}
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                />
              </div>

              {/* Icon Selection */}
              <div>
                <label className="dim" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '8px' }}>CUSTOM INSTANCE ICON</label>
                <IconPicker onIconSelect={setIconFile} />
              </div>

              <div className="glass" style={{ padding: '16px', background: 'rgba(0,229,255,0.03)', borderColor: 'rgba(0,229,255,0.1)' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <Shield size={18} color="var(--accent)" style={{ marginTop: '2px' }} />
                  <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '4px' }}>Account Isolation</h4>
                    <p className="dim" style={{ fontSize: '0.8rem' }}>Aura will automatically redirect AppData for this clone.</p>
                  </div>
                </div>
              </div>

              <button 
                className="btn-primary" 
                style={{ width: '100%', justifyContent: 'center', height: '50px' }}
                disabled={cloning}
                onClick={handleClone}
              >
                {cloning ? (
                  <>
                    <Loader2 className="animate-spin" size={18} /> Cloning App Data...
                  </>
                ) : (
                  <><Copy size={18} /> Start Physical Clone</>
                )}
              </button>

              {cloning && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="progress-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                  </div>
                  <p className="dim" style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '4px' }}>
                    {progress}% • Copying massive files
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </section>

        {/* Right: List of Clones */}
        <section>
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Your Cloned Apps</h2>
              <div className="glass flex-center" style={{ padding: '4px', gap: '4px' }}>
                <button 
                  onClick={() => setActiveTab('clones')}
                  className={activeTab === 'clones' ? 'btn-primary' : 'btn-secondary'} 
                  style={{ padding: '6px 12px', fontSize: '0.8rem', border: 'none' }}
                >
                  Active
                </button>
                <button 
                  onClick={() => setActiveTab('history')}
                  className={activeTab === 'history' ? 'btn-primary' : 'btn-secondary'} 
                  style={{ padding: '6px 12px', fontSize: '0.8rem', border: 'none', background: 'transparent' }}
                >
                  History
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {clones.map((clone, i) => (
                <motion.div 
                  key={clone.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + (i * 0.1) }}
                  className="glass aura-glow" 
                  style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}
                >
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div className="glass flex-center aura-glow" style={{ width: '50px', height: '50px', background: 'var(--bg-dots)', overflow: 'hidden', padding: 0 }}>
                      {clone.icon ? (
                        <img src={clone.icon} alt={clone.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Zap size={24} color="var(--accent)" />
                      )}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{clone.name}</h3>
                      <p className="dim" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <HardDrive size={12} /> {clone.size || 'N/A'} • {clone.path}
                      </p>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary flex-center" style={{ width: '40px', height: '40px', padding: 0 }}>
                      <Trash2 size={16} color="#ff4444" />
                    </button>
                    <button 
                      className="btn-primary" 
                      style={{ padding: '8px 20px', fontSize: '0.9rem' }}
                      onClick={async () => {
                        const exe = prompt("Enter EXE name to launch (e.g. game.exe):", clone.exeName || "game.exe");
                        if (!exe) return;
                        const result = await launchApp(clone.id, exe);
                        if (!result.success) alert("Launch Error: " + result.error);
                      }}
                    >
                      <Play size={16} fill="currentColor" /> Launch
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>
      </div>
      ) : (
        /* Aura Mobile UI */
        <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="glass" style={{ padding: '24px', marginBottom: '30px' }}>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '20px' }}>Clone Mobile Apps</h2>
            <div className="grid-cols" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '12px' }}>
              {["WhatsApp", "Instagram", "Facebook", "Snapchat", "Game Center", "Free Fire", "PUBG", "Clash"].map((app, i) => (
                <motion.div 
                  key={i}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className="glass flex-center"
                  style={{ aspectRatio: '1/1', flexDirection: 'column', gap: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}
                >
                  <div className="flex-center" style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-dots)' }}>
                    <Box size={20} className="dim" />
                  </div>
                  <span style={{ fontSize: '0.65rem' }}>{app}</span>
                </motion.div>
              ))}
              <div 
                className="glass flex-center" 
                style={{ aspectRatio: '1/1', flexDirection: 'column', gap: '8px', cursor: 'pointer', border: '1px dashed var(--accent-secondary)' }}
              >
                <Plus size={20} color="var(--accent-secondary)" />
                <span style={{ fontSize: '0.65rem', color: 'var(--accent-secondary)' }}>More</span>
              </div>
            </div>
          </div>

          <div style={{ padding: '0 10px' }}>
            <h3 className="dim" style={{ fontSize: '0.9rem', marginBottom: '15px' }}>YOUR MOBILE CLONES</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="glass" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <div className="glass flex-center" style={{ width: '42px', height: '42px', background: 'var(--accent-secondary)', borderRadius: '12px' }}>
                    <Smartphone size={22} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>WhatsApp Clone</h4>
                    <p className="dim" style={{ fontSize: '0.7rem' }}>Isolated Sandbox • v2.24.1</p>
                  </div>
                </div>
                <button className="btn-primary" style={{ padding: '6px 16px', fontSize: '0.8rem', background: 'var(--accent-secondary)', border: 'none' }}>Open</button>
              </div>
            </div>
          </div>
        </motion.section>
      )}

      {/* Floating Bottom Nav for Mobile Feel */}
      <nav 
        className="glass aura-glow" 
        style={{ 
          position: 'fixed', 
          bottom: '20px', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          width: 'max-content', 
          padding: '8px 24px', 
          display: 'flex', 
          gap: '30px', 
          borderRadius: '50px',
          zIndex: 1000
        }}
      >
        <button className="dim" style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <Zap size={20} color={viewMode === 'desktop' ? 'var(--accent)' : 'var(--text-dim)'} />
          <span style={{ fontSize: '0.6rem' }}>Cloner</span>
        </button>
        <button className="dim" style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <Search size={20} />
          <span style={{ fontSize: '0.6rem' }}>Explore</span>
        </button>
        <button className="dim" style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <Settings size={20} />
          <span style={{ fontSize: '0.6rem' }}>Config</span>
        </button>
      </nav>

      <AppDiscoveryModal 
        isOpen={showDiscovery} 
        onClose={() => setShowDiscovery(false)} 
        apps={installedApps} 
        loading={loadingApps}
        onSelect={handleSelectApp}
      />

      {/* Footer Stats hidden on mobile cloner for cleaner look */}
      {viewMode === "desktop" && (
        <footer style={{ marginTop: '80px', paddingTop: '40px', borderTop: '1px solid var(--card-border)' }}>
          <div className="grid-cols" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div style={{ textAlign: 'center' }}>
              <h4 className="dim" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Clones</h4>
              <p style={{ fontSize: '2rem', fontWeight: 800 }}>{clones.length}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <h4 className="dim" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>Storage Used</h4>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-secondary)' }}>
                {clones.reduce((acc, c) => acc + (c.sizeVal || 0), 0).toFixed(2)} GB
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <h4 className="dim" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>Isolation Status</h4>
              <p style={{ fontSize: '2rem', fontWeight: 800, color: '#00ff88' }}>ACTIVE</p>
            </div>
          </div>
        </footer>
      )}
    </main>
  );
}
