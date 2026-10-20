'use client';

import React, {useState} from 'react';
import {ukuleleAudio} from '@/lib/audio-engine';
import type {
  ChordSuggestionResponse,
  SuggestedChordItem,
} from '@/app/api/chord-suggester/route';
import {Play, Volume2, RefreshCw} from 'lucide-react';

interface AiChordSuggesterProps {
  onSelectChordOnFretboard?: (chordId: string) => void;
}

const INITIAL_SUGGESTION: ChordSuggestionResponse = {
  title: 'Golden Hour Island Sunshine',
  feelingMatch:
    'Built around bright Major harmonies (C, G, and F) with a touch of warm A Minor, this is the quintessential uplifting ukulele progression.',
  recommendedBpm: 80,
  strummingTip:
    'Play with the Island Strum: Down – Down-Up – Up-Down-Up (D - D U - U D U).',
  provider: 'Koa Harmony Engine',
  chords: [
    {
      id: 'C',
      fullName: 'C Major',
      frets: [0, 0, 0, 3],
      fingers: [0, 0, 0, 3],
      whyItFits:
        'Bright, open, and joyful home chord (0-0-0-3)—played with just one finger.',
    },
    {
      id: 'G',
      fullName: 'G Major',
      frets: [0, 2, 3, 2],
      fingers: [0, 1, 3, 2],
      whyItFits: 'Adds uplifting, energetic forward momentum (0-2-3-2).',
    },
    {
      id: 'Am',
      fullName: 'A Minor',
      frets: [2, 0, 0, 0],
      fingers: [2, 0, 0, 0],
      whyItFits: 'Provides a touch of warm heart (2-0-0-0) so the harmony feels rich.',
    },
    {
      id: 'F',
      fullName: 'F Major',
      frets: [2, 0, 1, 0],
      fingers: [2, 0, 1, 0],
      whyItFits: 'Lifts the progression into a sunny chorus before returning home to C.',
    },
  ],
};

const QUICK_MOOD_PRESETS = [
  {label: 'Happy & Sunny', prompt: 'happy, sunny, uplifting island vibe'},
  {label: 'Sad & Emotional', prompt: 'sad, emotional, melancholic rainy evening'},
  {label: 'Simple (1 Finger)', prompt: 'simple, easy beginner chords with 1 finger'},
];

export default function AiChordSuggester({
  onSelectChordOnFretboard,
}: AiChordSuggesterProps) {
  const [moodInput, setMoodInput] = useState<string>('');
  const [suggestion, setSuggestion] =
    useState<ChordSuggestionResponse>(INITIAL_SUGGESTION);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [playingChordIndex, setPlayingChordIndex] = useState<number | null>(null);

  const fetchChordSuggestions = async (customPrompt?: string) => {
    const query = (customPrompt ?? moodInput).trim();
    if (!query || isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/chord-suggester', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({prompt: query}),
      });
      const data = (await res.json()) as ChordSuggestionResponse;
      if (data && Array.isArray(data.chords) && data.chords.length > 0) {
        setSuggestion(data);
        if (onSelectChordOnFretboard) {
          onSelectChordOnFretboard(data.chords[0].id);
        }
      }
    } catch {
      // Keep current suggestion if network fails
    } finally {
      setIsLoading(false);
    }
  };

  const playFullProgression = () => {
    suggestion.chords.forEach((chord, idx) => {
      setTimeout(() => {
        setPlayingChordIndex(idx);
        ukuleleAudio.strumChord(chord.frets, 'D');
        if (onSelectChordOnFretboard) {
          onSelectChordOnFretboard(chord.id);
        }
        if (idx === suggestion.chords.length - 1) {
          setTimeout(() => setPlayingChordIndex(null), 900);
        }
      }, idx * 950);
    });
  };

  const renderChordMiniDiagram = (chord: SuggestedChordItem) => (
    <svg
      viewBox="0 0 120 142"
      className="w-24 h-28 shrink-0 bg-[#14181A] rounded-[16px] p-1.5"
      aria-label={`${chord.fullName} diagram`}
    >
      {['G', 'C', 'E', 'A'].map((lbl, i) => {
        const x = 22 + i * 25;
        const fretVal = chord.frets[i];
        return (
          <g key={lbl}>
            <text
              x={x}
              y="13"
              textAnchor="middle"
              fontSize="10"
              fontWeight="bold"
              fill="#FFF7E8"
              className="font-dm-mono"
            >
              {lbl}
            </text>
            {fretVal === 0 && (
              <circle
                cx={x}
                cy="22"
                r="3.5"
                fill="none"
                stroke="#3DB9A5"
                strokeWidth="1.8"
              />
            )}
          </g>
        );
      })}

      <rect x="20" y="29" width="79" height="4" fill="#FFF7E8" />

      {[0, 1, 2, 3].map((i) => (
        <line
          key={i}
          x1={22 + i * 25}
          y1="31"
          x2={22 + i * 25}
          y2="131"
          stroke="#E4EFE7"
          strokeOpacity="0.6"
          strokeWidth={i === 1 ? 2 : 1.4}
        />
      ))}

      {[1, 2, 3, 4].map((f) => (
        <line
          key={f}
          x1="22"
          y1={31 + f * 25}
          x2="97"
          y2={31 + f * 25}
          stroke="#3F5C62"
          strokeWidth="1.4"
        />
      ))}

      {chord.frets.map((fretVal, strIdx) => {
        if (fretVal <= 0 || fretVal > 4) return null;
        const x = 22 + strIdx * 25;
        const y = 31 + (fretVal - 0.5) * 25;
        const fingerNum = chord.fingers[strIdx];
        return (
          <g key={strIdx}>
            <circle
              cx={x}
              cy={y}
              r="8.5"
              fill="#FFC857"
              stroke="#12343B"
              strokeWidth="1.2"
            />
            <text
              x={x}
              y={y + 3.5}
              textAnchor="middle"
              fill="#12343B"
              fontSize="10"
              fontWeight="bold"
              className="font-dm-mono"
            >
              {fingerNum > 0 ? fingerNum : fretVal}
            </text>
          </g>
        );
      })}
    </svg>
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="text-[14px] font-semibold text-[#3F5C62]">
            Chord &amp; Mood Explorer
          </div>
          <h2 className="font-fraunces text-[26px] md:text-[32px] font-bold text-[#12343B] mt-1">
            Describe a feeling, get ukulele chords
          </h2>
          <p className="text-[18px] text-[#3F5C62] mt-1">
            Type a mood like “happy”, “sad”, “simple”, or “jazzy” to hear a matching progression.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchChordSuggestions();
          }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto lg:min-w-[380px]"
        >
          <input
            type="text"
            value={moodInput}
            onChange={(e) => setMoodInput(e.target.value)}
            placeholder="e.g. happy, sad, simple, jazzy…"
            className="min-w-0 flex-1 bg-[#FFFCF5] rounded-full px-4 py-3 text-[16px] text-[#12343B] placeholder:text-[#3F5C62] ring-1 ring-[#12343B]/20 focus:outline-none focus:ring-2 focus:ring-[#12343B] min-h-[48px]"
          />
          <button
            type="submit"
            disabled={isLoading || !moodInput.trim()}
            className="px-5 py-3 bg-[#12343B] disabled:opacity-50 text-[#FFF7E8] rounded-full text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 min-h-[48px] koa-focus"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Finding…</span>
              </>
            ) : (
              <span>Suggest chords</span>
            )}
          </button>
        </form>
      </div>

      {/* Max 3 Quick Feeling Presets */}
      <div className="flex flex-wrap items-center gap-2.5">
        {QUICK_MOOD_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              setMoodInput(preset.label);
              fetchChordSuggestions(preset.prompt);
            }}
            className="px-4 py-2 rounded-full bg-[#E4EFE7] hover:bg-[#FFC857]/40 text-[15px] font-semibold text-[#12343B] transition-colors koa-focus"
          >
            {preset.label}
          </button>
        ))}

        <button
          type="button"
          onClick={playFullProgression}
          className="w-full sm:w-auto sm:ml-auto px-5 py-2.5 bg-[#12343B] text-[#FFF7E8] rounded-full text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors min-h-[44px] koa-focus"
        >
          <Play className="w-4 h-4 fill-current text-[#FFC857]" />
          <span>Play {suggestion.chords.map((c) => c.id).join(' – ')}</span>
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="font-fraunces text-[22px] font-bold text-[#12343B]">
          {suggestion.title}
        </h3>
        <p className="text-[16px] text-[#3F5C62]">
          {suggestion.feelingMatch} · {suggestion.strummingTip}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {suggestion.chords.map((chord, idx) => {
          const isPlaying = playingChordIndex === idx;
          return (
            <div
              key={`${chord.id}-${idx}`}
              className={`p-5 rounded-[24px] bg-[#FFFCF5] koa-shadow transition-all flex flex-col justify-between gap-4 ${
                isPlaying ? 'ring-2 ring-[#FFC857]' : 'ring-1 ring-[#12343B]/12'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-dm-mono text-[18px] font-bold text-[#12343B]">
                    {chord.fullName} ({chord.frets.join('-')})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      ukuleleAudio.strumChord(chord.frets, 'D');
                      if (onSelectChordOnFretboard) {
                        onSelectChordOnFretboard(chord.id);
                      }
                    }}
                    className="px-3 py-1.5 rounded-full bg-[#E4EFE7] text-[#12343B] text-[14px] font-semibold flex items-center gap-1.5 koa-focus"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>Hear</span>
                  </button>
                </div>

                <div className="flex items-start gap-3">
                  {renderChordMiniDiagram(chord)}
                  <p className="text-[15px] text-[#3F5C62] leading-snug">
                    {chord.whyItFits}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
