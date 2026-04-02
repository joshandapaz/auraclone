"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Copy, Loader2 } from "lucide-react";

interface App {
  name: string;
  packageName: string;
}

interface AllAppsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apps: App[];
  loading?: boolean;
  onClone: (app: App) => void;
}

export default function AllAppsModal({ isOpen, onClose, apps, loading, onClone }: AllAppsModalProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return apps;
    return apps.filter(a => a.name.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q));
  }, [apps, query]);

  // Get a colour for each app based on its first letter for visual variety
  const colors = [
    "#00e5ff", "#7c3aed", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6"
  ];
  const getColor = (name: string) => colors[name.charCodeAt(0) % colors.length];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(8px)',
              zIndex: 1100
            }}
          />

          {/* Bottom Sheet Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{
              position: 'fixed',
              bottom: 0, left: 0, right: 0,
              height: '88vh',
              background: 'var(--bg-card)',
              borderRadius: '24px 24px 0 0',
              border: '1px solid var(--card-border)',
              borderBottom: 'none',
              zIndex: 1200,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Drag Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px', paddingBottom: '4px' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '4px', background: 'var(--card-border)' }} />
            </div>

            {/* Header */}
            <div style={{ padding: '12px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>All Installed Apps</h2>
                <p className="dim" style={{ margin: 0, fontSize: '0.8rem' }}>{filtered.length} apps • Tap to clone</p>
              </div>
              <button
                onClick={onClose}
                className="btn-secondary"
                style={{ width: '36px', height: '36px', padding: 0, border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input
                  autoFocus
                  type="text"
                  className="input-field"
                  placeholder="Search apps..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{ width: '100%', paddingLeft: '40px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* App List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 20px' }}>
              {loading ? (
                <div className="flex-center" style={{ flexDirection: 'column', gap: '16px', padding: '60px 20px' }}>
                  <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
                  <p className="dim" style={{ margin: 0 }}>Scanning installed apps...</p>
                </div>
              ) : apps.length === 0 ? (
                <div className="flex-center" style={{ flexDirection: 'column', gap: '12px', padding: '60px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem' }}>📱</div>
                  <p style={{ margin: 0, fontWeight: 600 }}>No apps found</p>
                  <p className="dim" style={{ margin: 0, fontSize: '0.85rem' }}>
                    Make sure you're running on a real Android device. App discovery requires the native plugin.
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <p className="dim">No apps matching "<strong>{query}</strong>"</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {filtered.map((app, i) => (
                    <motion.button
                      key={`${app.packageName}-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.4) }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { onClone(app); onClose(); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '12px 16px',
                        borderRadius: '14px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        width: '100%',
                        textAlign: 'left',
                      }}
                    >
                      {/* App Icon Avatar */}
                      <div
                        className="flex-center"
                        style={{
                          width: '48px', height: '48px',
                          borderRadius: '14px',
                          flexShrink: 0,
                          background: `${getColor(app.name)}20`,
                          border: `1.5px solid ${getColor(app.name)}50`
                        }}
                      >
                        <span style={{ fontSize: '1.3rem', fontWeight: 800, color: getColor(app.name) }}>
                          {app.name.charAt(0).toUpperCase()}
                        </span>
                      </div>

                      {/* App Info */}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {app.name}
                        </p>
                        <p className="dim" style={{ margin: 0, fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {app.packageName}
                        </p>
                      </div>

                      {/* Clone Pill */}
                      <div
                        className="flex-center"
                        style={{
                          gap: '5px',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          background: 'rgba(0,229,255,0.12)',
                          border: '1px solid rgba(0,229,255,0.3)',
                          flexShrink: 0
                        }}
                      >
                        <Copy size={12} color="var(--accent)" />
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>Clone</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
