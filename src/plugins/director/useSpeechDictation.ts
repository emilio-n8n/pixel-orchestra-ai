/**
 * Voice dictation for the prompt bar (spec D.3).
 *
 * Thin wrapper over the Web Speech API: the browser owns recognition, we only
 * own the lifecycle (start/stop, interim text, unsupported browsers). The hook
 * is deliberately defensive — Safari and Firefox ship no implementation, and
 * a missing API must degrade to a disabled button, never an exception.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { UI_LABELS } from "@/lib/ui/labels";

/** Minimal shape of the vendor-prefixed SpeechRecognition surface. */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechDictation(onText: (text: string, isFinal: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<SpeechRecognitionLike | null>(null);
  const supported = recognitionCtor() !== null;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => {
    const rec = ref.current;
    ref.current = null;
    setListening(false);
    setInterim("");
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      /* already stopped */
    }
  }, []);

  const start = useCallback(() => {
    if (listening) return;
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError(UI_LABELS.library.dicteeIndispo);
      return;
    }
    setError(null);
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finals = "";
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finals += text;
        else partial += text;
      }
      setInterim(partial);
      if (finals) onTextRef.current(finals, true);
    };
    rec.onerror = (e) => {
      if (e.error && e.error !== "aborted") setError(UI_LABELS.library.dicteeIndispo);
      stop();
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    ref.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      ref.current = null;
    }
  }, [listening, stop]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Never leave the mic hot when the panel unmounts.
  useEffect(() => stop, [stop]);

  return { supported, listening, interim, error, start, stop, toggle };
}
