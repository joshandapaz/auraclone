"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Box, Copy } from "lucide-react";

interface App {
  name: string;
  packageName: string;
}

interface AllAppsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apps: App[];
  onClone: (app: App) => void;
}

export default function AllAppsModal({ isOpen, onClose, apps, onClone }: AllAppsModalProps) {
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
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <p className="dim">No apps found for "{query}"</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {filtered.map((app, i) => (
                    <motion.button
                      key={app.packageName}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      whileTap={{ scale: 0.98, backgroundColor: 'rgba(255,255,255,0.05)' }}
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
                        transition: 'background 0.15s'
                      }}
                    >
                      {/* App Icon Placeholder */}
                      <div
                        className="flex-center"
                        style={{
                          width: '46px', height: '46px',
                          borderRadius: '12px',
                          flexShrink: 0,
                          background: `${getColor(app.name)}22`,
                          border: `1px solid ${getColor(app.name)}44`
                        }}
                      >
                        <span style={{ fontSize: '1.2rem', fontWeight: 700, color: getColor(app.name) }}>
                          {app.name.charAt(0).toUpperCase()}
                        </span>
                      </div>

                      {/* App Name */}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {app.name}
                        </p>
                        <p className="dim" style={{ margin: 0, fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {app.packageName}
                        </p>
                      </div>

                      {/* Clone Button */}
                      <div
                        className="flex-center"
                        style={{
                          gap: '5px',
                          padding: '6px 12px',
                          borderRadius: '20px',
                          background: 'rgba(0,229,255,0.1)',
                          border: '1px solid rgba(0,229,255,0.25)',
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
