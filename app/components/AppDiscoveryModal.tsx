"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Terminal, Package, ArrowRight, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";

interface AppDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  apps: any[];
  loading: boolean;
  onSelect: (app: any) => void;
}

export default function AppDiscoveryModal({ isOpen, onClose, apps, loading, onSelect }: AppDiscoveryModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredApps = useMemo(() => {
    return apps.filter(app => 
      app.DisplayName?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [apps, searchQuery]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="flex-center" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass aura-glow"
            style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            {/* Header */}
            <div style={{ padding: '24px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.4rem' }}>Discover Installed Apps</h3>
                <p className="dim" style={{ fontSize: '0.8rem', marginTop: '4px' }}>Found {apps.length} applications registered on your system.</p>
              </div>
              <button 
                onClick={onClose}
                className="btn-secondary" 
                style={{ padding: '8px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--card-border)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ position: 'relative' }}>
                <Search size={18} className="dim" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Search apps (e.g. Steam, Discord, Chrome...)" 
                  style={{ width: '100%', paddingLeft: '40px' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {loading ? (
                <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '16px' }}>
                  <Loader2 className="animate-spin" size={32} color="var(--accent)" />
                  <p className="dim">Scanning Windows Registry...</p>
                </div>
              ) : filteredApps.length === 0 ? (
                <div className="flex-center" style={{ height: '200px', flexDirection: 'column', textAlign: 'center' }}>
                  <p className="dim">No applications found matching "{searchQuery}"</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredApps.map((app, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="glass"
                      style={{ 
                        padding: '12px 16px', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        background: 'rgba(255,255,255,0.03)',
                        transition: 'background 0.2s'
                      }}
                      whileHover={{ background: 'rgba(255,255,255,0.08)', x: 5 }}
                      onClick={() => onSelect(app)}
                    >
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div className="flex-center" style={{ width: '40px', height: '40px', background: 'var(--bg-dots)', borderRadius: '8px' }}>
                          <Package size={20} className="dim" />
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1rem' }}>{app.DisplayName}</h4>
                          <p className="dim" style={{ fontSize: '0.75rem' }}>{app.DisplayVersion || 'v?.?'}</p>
                        </div>
                      </div>
                      <ArrowRight size={16} className="dim" />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--card-border)', background: 'var(--bg)' }}>
              <p className="dim" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal size={14} /> Only apps with a registered 'InstallLocation' are listed.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
