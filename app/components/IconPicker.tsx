"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Box, Check, Image as ImageIcon } from "lucide-react";
import { useState, useRef } from "react";

interface IconPickerProps {
  onIconSelect: (file: File | null) => void;
  selectedIconUrl?: string | null;
}

export default function IconPicker({ onIconSelect, selectedIconUrl }: IconPickerProps) {
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(selectedIconUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      onIconSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
      {/* Icon Preview */}
      <motion.div 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="glass aura-glow flex-center"
        style={{ 
          width: '80px', 
          height: '80px', 
          borderRadius: '50%', 
          overflow: 'hidden', 
          background: 'var(--bg-dots)',
          border: preview ? '2px solid var(--accent)' : '1px solid var(--card-border)',
          cursor: 'pointer',
          flexShrink: 0
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <AnimatePresence mode="wait">
          {preview ? (
            <motion.img 
              key="preview"
              src={preview} 
              alt="Icon Preview" 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-center" style={{ flexDirection: 'column', gap: '4px' }}>
              <Box size={24} className="dim" />
              <p style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>Default</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Upload Instructions */}
      <div 
        style={{ 
          flex: 1, 
          padding: '16px', 
          borderRadius: '12px', 
          border: dragActive ? '2px dashed var(--accent)' : '1px dashed var(--card-border)',
          background: dragActive ? 'rgba(0,229,255,0.05)' : 'rgba(255,255,255,0.01)',
          transition: 'all 0.2s',
          cursor: 'pointer'
        }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="flex-center" style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)' }}>
            <Upload size={16} className="dim" />
          </div>
          <div>
            <h5 style={{ margin: 0, fontSize: '0.85rem' }}>Change Instance Icon</h5>
            <p className="dim" style={{ fontSize: '0.75rem' }}>Drag & Drop or Click to Upload</p>
          </div>
        </div>
      </div>

      {preview && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setPreview(null);
            onIconSelect(null);
          }}
          className="btn-secondary flex-center" 
          style={{ padding: '8px', width: '36px', height: '36px', borderRadius: '50%' }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
