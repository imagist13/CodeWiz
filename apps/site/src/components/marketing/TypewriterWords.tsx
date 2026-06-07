'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface WordItem {
  text: string;
  color: string;
}

const WORDS_EN: WordItem[] = [
  { text: 'Development', color: '#3b82f6' },   // blue
  { text: 'Design', color: '#f59e0b' },         // amber
  { text: 'Writing', color: '#10b981' },         // emerald
  { text: 'Research', color: '#8b5cf6' },        // violet
  { text: 'Debugging', color: '#ef4444' },       // red
  { text: 'Prototyping', color: '#06b6d4' },     // cyan
];

const WORDS_ZH: WordItem[] = [
  { text: '开发', color: '#3b82f6' },
  { text: '设计', color: '#f59e0b' },
  { text: '写作', color: '#10b981' },
  { text: '调研', color: '#8b5cf6' },
  { text: '调试', color: '#ef4444' },
  { text: '原型', color: '#06b6d4' },
];

export function TypewriterWords({ locale }: { locale: string }) {
  const words = locale === 'zh' ? WORDS_ZH : WORDS_EN;
  const [index, setIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const current = words[index];

  const tick = useCallback(() => {
    const full = current.text;

    if (!isDeleting) {
      // Typing
      const next = full.slice(0, displayed.length + 1);
      setDisplayed(next);
      if (next === full) {
        // Pause then start deleting
        setTimeout(() => setIsDeleting(true), 2000);
        return;
      }
    } else {
      // Deleting
      const next = full.slice(0, displayed.length - 1);
      setDisplayed(next);
      if (next === '') {
        setIsDeleting(false);
        setIndex((prev) => (prev + 1) % words.length);
        return;
      }
    }
  }, [current.text, displayed, isDeleting, words.length]);

  useEffect(() => {
    const speed = isDeleting ? 60 : 100;
    const timer = setTimeout(tick, speed);
    return () => clearTimeout(timer);
  }, [tick, isDeleting]);

  return (
    <span className="inline-flex items-baseline">
      <span
        className="font-semibold transition-colors duration-300"
        style={{ color: current.color }}
      >
        {displayed}
      </span>
      <motion.span
        className="ml-[1px] inline-block h-[0.85em] w-[2px] translate-y-[0.05em] rounded-full"
        style={{ backgroundColor: current.color }}
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
      />
    </span>
  );
}
