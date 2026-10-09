"use client";
import { useEffect, useState } from 'react';

const dirtyEditors = new Set();
let installed = false;
function beforeUnload(event) {
  if (!dirtyEditors.size) return;
  event.preventDefault();
  event.returnValue = '';
}
function beforeNavigate(event) {
  if (!dirtyEditors.size || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.('a[href]');
  if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
  const url = new URL(link.href, location.href);
  if (url.pathname === location.pathname && url.search === location.search) return;
  if (!window.confirm('Discard unsaved settings changes?')) {
    event.preventDefault();
    event.stopPropagation();
  }
}
export function useSettingsDirty(isDirty) {
  useEffect(() => {
    if (!isDirty) return;
    const owner = {};
    dirtyEditors.add(owner);
    if (!installed) {
      window.addEventListener('beforeunload', beforeUnload);
      document.addEventListener('click', beforeNavigate, true);
      installed = true;
    }
    return () => {
      dirtyEditors.delete(owner);
      if (!dirtyEditors.size) {
        window.removeEventListener('beforeunload', beforeUnload);
        document.removeEventListener('click', beforeNavigate, true);
        installed = false;
      }
    };
  }, [isDirty]);
}
export default function useSettingsDraft(initial) {
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const dirty = Object.keys(draft).some(key => draft[key] !== baseline[key]);
  useSettingsDirty(dirty);
  return { draft, setDraft, baseline, dirty,
    reset: () => setDraft(baseline),
    accept: saved => { setBaseline(saved); setDraft(saved); },
    changes: keys => Object.fromEntries(keys.filter(key => draft[key] !== baseline[key]).map(key => [key, draft[key]])),
  };
}
