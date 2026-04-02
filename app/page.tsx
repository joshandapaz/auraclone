"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Copy, Play, Plus, Zap, Shield, HardDrive, Trash2, FolderOpen, Loader2, Sparkles, Image as ImageIcon, Monitor, Smartphone, Settings, Search } from "lucide-react";
import { registerPlugin } from '@capacitor/core';
import { useLocalStorage } from './hooks/useLocalStorage';
import AppDiscoveryModal from "./components/AppDiscoveryModal";
import AllAppsModal from "./components/AllAppsModal";
import IconPicker from "./components/IconPicker";

const AppList = registerPlugin<any>('AppList');

// API wrappers instead of server actions
async function getClones() {
  try {
    const res = await fetch('/api/cloner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'getClones' }) });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.warn("Cloner API not available (Mobile Mode)", e);
    return [];
  }
}
async function getInstalledApps() {
  try {
    const res = await fetch('/api/cloner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'getInstalledApps' }) });
    if (!res.ok) return { success: false, error: 'API unreachable' };
    return await res.json();
  } catch (e) {
    return { success: false, error: 'API unreachable' };
  }
}
async function cloneApp(sourcePath: string, destName: string, iconUrl?: string) {
  try {
    const res = await fetch('/api/cloner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cloneApp', payload: { sourcePath, destName, iconUrl } }) });
    if (!res.ok) return { success: false, error: 'API unreachable' };
    return await res.json();
  } catch (e) {
    return { success: false, error: 'API unreachable' };
  }
}
async function launchApp(cloneId: number, exeName: string) {
  try {
    const res = await fetch('/api/cloner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'launchApp', payload: { cloneId, exeName } }) });
    if (!res.ok) return { success: false, error: 'API unreachable' };
    return await res.json();
  } catch (e) {
    return { success: false, error: 'API unreachable' };
  }
}
async function uploadIcon(formData: FormData) {
  try {
    formData.append('action', 'uploadIcon');
    const res = await fetch('/api/cloner', { method: 'POST', body: formData });
    if (!res.ok) return { success: false, error: 'API unreachable' };
    return await res.json();
  } catch (e) {
    return { success: false, error: 'API unreachable' };
  }
}

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

  // Mobile All-Apps Modal
  const [showAllApps, setShowAllApps] = useState(false);

  // Mobile Cloner States
  const [mobileAppList, setMobileAppList] = useState<any[]>([]);
  const [mobileAppsLoading, setMobileAppsLoading] = useState(false);
  const [mobileClones, setMobileClones] = useLocalStorage<any[]>("aura_mobile_clones", []);
  const [sandboxSetup, setSandboxSetup] = useState(false);

  useEffect(() => {
    // Detect mobile environment and set default viewMode
    if (typeof window !== 'undefined') {
      const isCapacitor = (window as any).Capacitor?.isNativePlatform();
      if (isCapacitor || window.innerWidth < 768) {
        setViewMode("mobile");
      }
      
      // Load installed apps natively if on device
      if (isCapacitor) {
         setMobileAppsLoading(true);
         AppList.getInstalledApps().then((res: any) => {
            if (res && res.apps) setMobileAppList(res.apps);
            setMobileAppsLoading(false);
         }).catch((err: any) => {
            console.error(err);
            setMobileAppsLoading(false);
         });

         AppList.isSandboxSetup().then((res: any) => {
            if (res && res.isSetup) setSandboxSetup(true);
         }).catch(console.error);
      } else {
         // Mock data for browser testing
         setMobileAppList([
           { name: "WhatsApp", packageName: "com.whatsapp" },
           { name: "Instagram", packageName: "com.instagram.android" },
           { name: "Facebook", packageName: "com.facebook.katana" }
         ]);
      }
    }

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
    
    let finalIconUrl = "";
    if (iconFile) {
      const formData = new FormData();
      formData.append("file", iconFile);
      const uploadRes = await uploadIcon(formData);
      if (uploadRes.success && uploadRes.url) finalIconUrl = uploadRes.url;
    }

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

  const [showDeepCloneModal, setShowDeepCloneModal] = useState(false);
  const [selectedMobileApp, setSelectedMobileApp] = useState<any>(null);
  const [newDeepCloneName, setNewDeepCloneName] = useState("");

  const handleMobileClone = async (app: any) => {
    setSelectedMobileApp(app);
    setNewDeepCloneName(`${app.name} Clone`);
    setShowDeepCloneModal(true);
  };

  const startDeepClone = async () => {
    if (!selectedMobileApp || !newDeepCloneName) return;
    setShowDeepCloneModal(false);
    setCloning(true);
    setProgress(5); // Start progress
    
    try {
      const isCapacitor = (window as any).Capacitor?.isNativePlatform();
      if (!isCapacitor) {
        alert("Deep Cloning is only supported on a real Android device.");
        setCloning(false);
        return;
      }

      // Step 1: Extract APK locally
      setProgress(15);
      const resApk = await AppList.getApkBase64({ path: selectedMobileApp.apkPath });
      
      // Step 2: Upload and Repackage on Server
      setProgress(30);
      const resClone = await fetch('/api/cloner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deepCloneApp',
          payload: {
            apkBase64: resApk.base64,
            newName: newDeepCloneName,
            originalPackage: selectedMobileApp.packageName
          }
        })
      });
      
      if (!resClone.ok) throw new Error("Repackaging failed");
      const cloneData = await resClone.json();
      
      if (!cloneData.success) throw new Error(cloneData.error);

      // Step 3: Handle result
      setProgress(90);
      
      // Tell user to install
      alert(`Clone "${newDeepCloneName}" is ready! We will now trigger the Android system installer. Please follow the system prompts to install your isolated copy.`);
      
      // Note: In a production app, we would download the APK to the device's downloads folder 
      // but for this MVP, we prompt the browser to "open" the generated APK link which Android handles.
      // Or better, we can use a Capacitor plugin to download and call installApk.
      const downloadUrl = window.location.origin + cloneData.url;
      window.open(downloadUrl, "_blank");

      const newClone = {
        id: Date.now(),
        name: newDeepCloneName,
        packageName: cloneData.packageName, // The modified package name
        createdAt: new Date().toISOString()
      };
      
      setMobileClones((prev) => [newClone, ...prev]);
      
    } catch (e: any) {
      alert("Deep Clone Error: " + e.message);
    } finally {
      setCloning(false);
      setProgress(0);
    }
  };

  const handleMobileLaunch = async (clone: any) => {
    try {
      const isCapacitor = (window as any).Capacitor?.isNativePlatform();
      if (isCapacitor) {
         alert(`Launching ${clone.name} (${clone.packageName}). If this was a deep clone, it will have its own independent data!`);
         await AppList.launchApp({ packageName: clone.packageName });
      } else {
         alert(`Launching ${clone.packageName} natively (Browser Mock)`);
      }
    } catch (e) {
      alert("Error: App might not be installed yet.");
    }
  };

  const handleMobileRemove = (id: number) => {
    setMobileClones((prev) => prev.filter(c => c.id !== id));
  };

  return (
    <main className="main-container" style={{ paddingBottom: '100px' }}>
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
            : 'Native Android Instance Virtualizer Prototype'}
        </p>
      </header>

      {viewMode === "desktop" ? (
        <div className="grid-cols" style={{ gridTemplateColumns: 'minmax(300px, 1fr) 2fr' }}>
          {/* Desktop Left Action Panel */}
          <section>
            <motion.div className="glass" style={{ padding: '24px', position: 'sticky', top: '40px' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem' }}>
                <Plus size={20} color="var(--accent)" /> Clone New App
              </h2>
              <p className="dim" style={{ fontSize: '0.9rem', marginBottom: '24px' }}>
                Select a folder to physically duplicate it for account isolation.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label className="dim" style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
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
                <div>
                  <label className="dim" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '8px' }}>CUSTOM INSTANCE ICON</label>
                  <IconPicker onIconSelect={setIconFile} />
                </div>
                <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', height: '50px' }} disabled={cloning} onClick={handleClone}>
                  {cloning ? <><Loader2 className="animate-spin" size={18} /> Cloning App Data...</> : <><Copy size={18} /> Start Physical Clone</>}
                </button>
                {cloning && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="progress-container"><div className="progress-bar" style={{ width: `${progress}%` }}></div></div>
                    <p className="dim" style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '4px' }}>{progress}% • Copying files</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </section>

          {/* Desktop Right List Panel */}
          <section>
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Your Cloned Apps</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {clones.map((clone, i) => (
                  <motion.div key={clone.id} className="glass aura-glow" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                      <div className="glass flex-center aura-glow" style={{ width: '50px', height: '50px' }}>
                        {clone.icon ? <img src={clone.icon} alt={clone.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Zap size={24} color="var(--accent)" />}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{clone.name}</h3>
                        <p className="dim" style={{ fontSize: '0.8rem' }}><HardDrive size={12} /> {clone.path}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-secondary flex-center" style={{ width: '40px', height: '40px', padding: 0 }}><Trash2 size={16} color="#ff4444" /></button>
                      <button className="btn-primary" style={{ padding: '8px 20px', fontSize: '0.9rem' }} onClick={async () => {
                        const exe = prompt("EXE name:", "game.exe");
                        if (exe) launchApp(clone.id, exe);
                      }}>
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
        /* Mobile UI Setup */
        <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="glass" style={{ padding: '24px', marginBottom: '30px' }}>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '20px' }}>Detected Applications</h2>
            <p className="dim" style={{ fontSize: '0.85rem', marginBottom: '15px' }}>Tap an app to automatically clone and sandbox it into a parallel space.</p>
            
            {cloning && (
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginBottom: '20px' }}>
                 <div className="progress-container"><div className="progress-bar" style={{ width: `${progress}%`, background: 'var(--accent-secondary)' }}></div></div>
                 <p style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '6px', color: 'var(--accent-secondary)' }}>{progress}% • Generating Isolated Sandbox...</p>
               </motion.div>
            )}

            <div className="grid-cols" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '12px', maxHeight: '400px', overflowY: 'auto', padding: '10px 0' }}>
              {mobileAppList.slice(0, 20).map((app, i) => (
                <motion.div 
                  key={i}
                  whileTap={{ scale: 0.95 }}
                  className="glass flex-center"
                  style={{ aspectRatio: '1/1', flexDirection: 'column', gap: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}
                  onClick={() => handleMobileClone(app)}
                >
                  <div className="flex-center" style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-dots)' }}>
                    <Box size={20} className="dim" />
                  </div>
                  <span style={{ fontSize: '0.65rem', textAlign: 'center', padding: '0 4px', wordBreak: 'break-word', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {app.name}
                  </span>
                </motion.div>
              ))}
              {/* More Button — opens full app list */}
              <motion.div 
                whileTap={{ scale: 0.95 }}
                className="glass flex-center" 
                style={{ aspectRatio: '1/1', flexDirection: 'column', gap: '8px', cursor: 'pointer', border: '1px dashed var(--accent-secondary)' }}
                onClick={() => setShowAllApps(true)}
              >
                <Plus size={20} color="var(--accent-secondary)" />
                <span style={{ fontSize: '0.65rem', color: 'var(--accent-secondary)' }}>All Apps</span>
              </motion.div>
            </div>
          </div>

          <div style={{ padding: '0 10px' }}>
            <h3 className="dim" style={{ fontSize: '0.9rem', marginBottom: '15px', textTransform: 'uppercase' }}>Your Parallel Space</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {mobileClones.length === 0 ? (
                <div className="glass flex-center" style={{ padding: '30px', flexDirection: 'column', gap: '10px' }}>
                  <Shield size={32} strokeWidth={1} className="dim" />
                  <p className="dim" style={{ fontSize: '0.85rem' }}>No apps cloned yet. Select an app above.</p>
                </div>
              ) : (
                mobileClones.map(clone => (
                  <motion.div key={clone.id} className="glass" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center', overflow: 'hidden' }}>
                      <div className="glass flex-center" style={{ width: '42px', height: '42px', background: 'var(--accent-secondary)', borderRadius: '12px', flexShrink: 0 }}>
                        <Smartphone size={22} color="#fff" />
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{clone.name}</h4>
                        <p className="dim" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Isolated • {clone.packageName}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button onClick={() => handleMobileRemove(clone.id)} className="btn-secondary" style={{ padding: '8px', border: 'none' }}>
                        <Trash2 size={16} color="#ff4444" />
                      </button>
                      <button onClick={() => handleMobileLaunch(clone)} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem', background: 'var(--accent-secondary)', border: 'none' }}>
                        Open
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          <AnimatePresence>
            {showDeepCloneModal && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="modal-overlay flex-center"
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, padding: '20px' }}
              >
                <motion.div 
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  className="glass"
                  style={{ width: '100%', maxWidth: '400px', padding: '30px' }}
                >
                  <h3 style={{ fontSize: '1.4rem', marginBottom: '10px' }}>Deep Clone App</h3>
                  <p className="dim" style={{ fontSize: '0.9rem', marginBottom: '25px' }}>
                    This will create a physically new application on your device with 100% fresh data.
                  </p>
                  
                  <div style={{ marginBottom: '25px' }}>
                    <label className="dim" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '8px' }}>CUSTOM DISPLAY NAME</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      style={{ width: '100%' }}
                      value={newDeepCloneName}
                      onChange={(e) => setNewDeepCloneName(e.target.value)}
                      placeholder="e.g. My Protected WhatsApp"
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowDeepCloneModal(false)}>Cancel</button>
                    <button className="btn-primary" style={{ flex: 2, background: 'var(--accent-secondary)' }} onClick={startDeepClone}>
                      Start Deep Clone
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      )}

      {viewMode === "desktop" && <AppDiscoveryModal isOpen={showDiscovery} onClose={() => setShowDiscovery(false)} apps={installedApps} loading={loadingApps} onSelect={handleSelectApp} />}
      <AllAppsModal isOpen={showAllApps} onClose={() => setShowAllApps(false)} apps={mobileAppList} onClone={handleMobileClone} loading={mobileAppsLoading} />
    </main>
  );
}
