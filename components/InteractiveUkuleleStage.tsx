'use client';

import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  UKULELE_STRINGS,
  UKULELE_ANATOMY,
  CHORD_LIBRARY,
  STRUMMING_PATTERNS,
  BEGINNER_SONGBOOK,
  getNoteFrequency,
  getNoteNameAtFret,
  AnatomyPart,
} from '@/lib/ukulele-theory';
import {UKULELE_ASSET_CONFIG} from '@/lib/ukulele-asset-config';
import {ukuleleAudio} from '@/lib/audio-engine';
import {LessonConfig} from '@/lib/curriculum-data';
import {
  Volume2,
  VolumeX,
  Play,
  Square,
  ArrowDown,
  ArrowUp,
  Check,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface InteractiveUkuleleStageProps {
  lesson: LessonConfig;
  activityCount: number;
  onRecordActivity: (actionLabel: string) => void;
  externalChordId?: string | null;
  onSelectChordExternal?: (chordId: string) => void;
  onHotspotSelectChange?: (partName: string | null) => void;
}

export default function InteractiveUkuleleStage({
  lesson,
  activityCount,
  onRecordActivity,
  externalChordId,
  onSelectChordExternal,
  onHotspotSelectChange,
}: InteractiveUkuleleStageProps) {
  const initialTab = externalChordId
    ? 'fretboard'
    : lesson.visualMode === 'anatomy' || lesson.visualMode === 'posture'
      ? 'anatomy'
      : lesson.visualMode === 'strumming'
        ? 'rhythm'
        : lesson.visualMode === 'song' || lesson.visualMode === 'tab'
          ? 'song-tab'
          : 'fretboard';

  const [stageTab, setStageTab] = useState<
    'anatomy' | 'fretboard' | 'rhythm' | 'song-tab'
  >(initialTab);

  // Anatomy Hotspot state: null when closed so popover only opens on selection
  const [selectedAnatomy, setSelectedAnatomy] = useState<AnatomyPart | null>(null);
  const [foundPartIds, setFoundPartIds] = useState<string[]>([]);
  const [showBeginnerTip, setShowBeginnerTip] = useState<boolean>(false);
  const [isPulseIdle, setIsPulseIdle] = useState<boolean>(false);
  const [hoveredHotspotId, setHoveredHotspotId] = useState<string | null>(null);

  // Playable Strings state
  const [hasPluckedOnce, setHasPluckedOnce] = useState<boolean>(false);
  const [isPointerDraggingStrings, setIsPointerDraggingStrings] =
    useState<boolean>(false);
  const [vibratingStrings, setVibratingStrings] = useState<Record<number, boolean>>({});
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Desktop subtle pointer parallax (±6px)
  const [parallax, setParallax] = useState<{x: number; y: number}>({x: 0, y: 0});

  // Fretboard & Chords state
  const [activeChordId, setActiveChordId] = useState<string>(
    externalChordId || lesson.visualConfig.activeChordId || 'C'
  );
  const [tappedSpot, setTappedSpot] = useState<{
    stringNum: 4 | 3 | 2 | 1;
    fret: number;
    noteName: string;
    freq: number;
  } | null>(null);
  const [speedMultiplier, setSpeedMultiplier] = useState<0.5 | 0.75 | 1.0>(1.0);

  // Rhythm & Strumming state
  const [activePatternId, setActivePatternId] = useState<string>(
    lesson.visualConfig.strummingPatternId || 'down-4'
  );
  const [bpm, setBpm] = useState<number>(
    lesson.visualConfig.strummingPatternId &&
      STRUMMING_PATTERNS[lesson.visualConfig.strummingPatternId]
      ? STRUMMING_PATTERNS[lesson.visualConfig.strummingPatternId].recommendedBpm
      : 72
  );
  const [isRhythmPlaying, setIsRhythmPlaying] = useState<boolean>(false);
  const [currentBeatStep, setCurrentBeatStep] = useState<number>(-1);
  const [includeMetronomeClick, setIncludeMetronomeClick] = useState<boolean>(true);

  // Song & Tab Player state
  const [activeSongId, setActiveSongId] = useState<string>(
    lesson.visualConfig.songId || 'row-your-boat'
  );
  const [activeMeasureIdx, setActiveMeasureIdx] = useState<number>(0);
  const [activeTabNoteIdx, setActiveTabNoteIdx] = useState<number>(0);
  const [isSongAutoPlaying, setIsSongAutoPlaying] = useState<boolean>(false);

  const rhythmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const songIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Stop hotspot pulsing after 6 seconds idle
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPulseIdle(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, []);

  const triggerStringVibration = useCallback((stringNum: 4 | 3 | 2 | 1) => {
    setVibratingStrings((prev) => ({...prev, [stringNum]: true}));
    setTimeout(() => {
      setVibratingStrings((prev) => ({...prev, [stringNum]: false}));
    }, 1400);
  }, []);

  const handlePluckOpenString = useCallback(
    (stringNum: 4 | 3 | 2 | 1) => {
      setHasPluckedOnce(true);
      ukuleleAudio.playString(stringNum, 0, {
        onTrigger: triggerStringVibration,
      });
      onRecordActivity(`Plucked String ${stringNum}`);
    },
    [onRecordActivity, triggerStringVibration]
  );

  // Keyboard 1-4 plays strings 1-4; Esc closes popover
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Escape' && selectedAnatomy) {
        setSelectedAnatomy(null);
        onHotspotSelectChange?.(null);
      } else if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
        const strNum = Number(e.key) as 1 | 2 | 3 | 4;
        handlePluckOpenString(strNum);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnatomy, handlePluckOpenString, onHotspotSelectChange]);

  // Global pointer up to end drag-strumming
  useEffect(() => {
    const endDrag = () => setIsPointerDraggingStrings(false);
    window.addEventListener('pointerup', endDrag);
    return () => window.removeEventListener('pointerup', endDrag);
  }, []);

  const resolvedChordId = externalChordId || activeChordId;
  const currentChord =
    CHORD_LIBRARY[resolvedChordId] ||
    CHORD_LIBRARY[activeChordId] ||
    CHORD_LIBRARY.C;
  const activeFrets: [number, number, number, number] = currentChord.frets;
  const activeFingers: [number, number, number, number] = currentChord.fingers;

  const handleSelectHotspot = (partId: string) => {
    const part = UKULELE_ANATOMY.find((a) => a.id === partId);
    if (!part) return;

    setSelectedAnatomy(part);
    setShowBeginnerTip(false);
    onHotspotSelectChange?.(part.name);

    if (!foundPartIds.includes(part.id)) {
      setFoundPartIds((prev) => [...prev, part.id]);
    }

    // Play a gentle note or chord matching the part
    if (part.id === 'body' || part.id === 'soundhole') {
      ukuleleAudio.strumChord([0, 0, 0, 3], 'D', {
        onStringTrigger: triggerStringVibration,
      });
    } else {
      const strNum = (((partId.length % 4) + 1) as 1 | 2 | 3 | 4) || 4;
      ukuleleAudio.playString(strNum, 0, {
        onTrigger: triggerStringVibration,
      });
    }

    onRecordActivity(`Explored ${part.name}`);
  };

  const handlePluckStringAtFret = (stringNum: 4 | 3 | 2 | 1, fret: number) => {
    setHasPluckedOnce(true);
    ukuleleAudio.playString(stringNum, fret, {
      onTrigger: triggerStringVibration,
    });

    const noteName = getNoteNameAtFret(stringNum, fret);
    const freq = Math.round(getNoteFrequency(stringNum, fret) * 10) / 10;
    setTappedSpot({stringNum, fret, noteName, freq});

    onRecordActivity(`Tapped String ${stringNum} at Fret ${fret} (${noteName})`);
  };

  const handleStrum = (direction: 'D' | 'U') => {
    setHasPluckedOnce(true);
    ukuleleAudio.strumChord(activeFrets, direction, {
      speedMultiplier,
      onStringTrigger: triggerStringVibration,
    });
    onRecordActivity(
      `Strummed ${currentChord.fullName} (${direction === 'D' ? 'Down' : 'Up'})`
    );
  };

  const handleSelectChord = (chordId: string) => {
    setActiveChordId(chordId);
    if (onSelectChordExternal) {
      onSelectChordExternal(chordId);
    }
    const chord = CHORD_LIBRARY[chordId];
    if (chord) {
      ukuleleAudio.strumChord(chord.frets, 'D', {
        speedMultiplier,
        onStringTrigger: triggerStringVibration,
      });
      onRecordActivity(`Switched to ${chord.fullName} chord`);
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    ukuleleAudio.setMuted(next);
  };

  // Rhythm Sequencer Loop
  const currentPattern =
    STRUMMING_PATTERNS[activePatternId] || STRUMMING_PATTERNS['down-4'];

  useEffect(() => {
    if (!isRhythmPlaying) {
      if (rhythmIntervalRef.current) clearInterval(rhythmIntervalRef.current);
      return;
    }

    const effectiveBpm = bpm * speedMultiplier;
    const eighthNoteMs = (60 / effectiveBpm / 2) * 1000;
    let stepIndex = 0;

    const runStep = () => {
      const steps = currentPattern.steps;
      const step = steps[stepIndex % steps.length];
      setCurrentBeatStep(stepIndex % steps.length);

      const isNumberBeat = step.label !== '&';
      if (includeMetronomeClick && isNumberBeat) {
        ukuleleAudio.playMetronomeTick(step.label === '1');
      }

      if (step.action === 'D') {
        ukuleleAudio.strumChord(activeFrets, 'D', {
          speedMultiplier: 1.0,
          volume: step.accent ? 0.3 : 0.22,
          onStringTrigger: triggerStringVibration,
        });
      } else if (step.action === 'U') {
        ukuleleAudio.strumChord(activeFrets, 'U', {
          speedMultiplier: 1.0,
          volume: step.accent ? 0.26 : 0.19,
          onStringTrigger: triggerStringVibration,
        });
      }

      stepIndex++;
    };

    runStep();
    rhythmIntervalRef.current = setInterval(runStep, eighthNoteMs);

    return () => {
      if (rhythmIntervalRef.current) clearInterval(rhythmIntervalRef.current);
    };
  }, [
    isRhythmPlaying,
    bpm,
    speedMultiplier,
    currentPattern,
    activeFrets,
    includeMetronomeClick,
    triggerStringVibration,
  ]);

  // Song Auto-Player Loop
  const currentSong =
    BEGINNER_SONGBOOK.find((s) => s.id === activeSongId) || BEGINNER_SONGBOOK[0];

  useEffect(() => {
    if (!isSongAutoPlaying) {
      if (songIntervalRef.current) clearInterval(songIntervalRef.current);
      return;
    }

    const measureDurationMs = (60 / (bpm * speedMultiplier)) * 1000 * 2.4;
    let mIdx = 0;

    const playMeasure = () => {
      const measure = currentSong.measures[mIdx % currentSong.measures.length];
      setActiveMeasureIdx(mIdx % currentSong.measures.length);
      setActiveChordId(measure.chord);
      const chordObj = CHORD_LIBRARY[measure.chord] || CHORD_LIBRARY.C;
      ukuleleAudio.strumChord(chordObj.frets, 'D', {
        speedMultiplier,
        onStringTrigger: triggerStringVibration,
      });
      onRecordActivity(`Played measure "${measure.lyrics}" (${measure.chord})`);
      mIdx = (mIdx + 1) % currentSong.measures.length;
    };

    playMeasure();
    songIntervalRef.current = setInterval(playMeasure, measureDurationMs);

    return () => {
      if (songIntervalRef.current) clearInterval(songIntervalRef.current);
    };
  }, [
    isSongAutoPlaying,
    bpm,
    speedMultiplier,
    currentSong,
    triggerStringVibration,
    onRecordActivity,
  ]);

  const hasFoundTier1 = foundPartIds.some((id) =>
    ['body', 'soundhole', 'bridge-saddle'].includes(id)
  );
  const completedDotsCount = Math.min(4, Math.max(foundPartIds.length, activityCount));

  // Generate 36 sunburst rosette triangles around (630, 180)
  const rosetteTriangles = Array.from({length: 36}, (_, idx) => {
    const angleDeg = idx * 10;
    return angleDeg;
  });

  // Render the high-craft layered SVG of the learner's matte-black soprano ukulele
  const renderLayeredBlackUkuleleSvg = () => (
    <svg
      viewBox="0 0 1000 360"
      className="w-full h-full select-none overflow-visible"
      role="img"
      aria-label={UKULELE_ASSET_CONFIG.altText}
    >
      <defs>
        {/* Matte charcoal body gradient with subtle upper-left warmth */}
        <linearGradient id="sopranoBlackBody" x1="12%" y1="8%" x2="88%" y2="92%">
          <stop offset="0%" stopColor="#262B2E" />
          <stop offset="42%" stopColor="#171B1D" />
          <stop offset="100%" stopColor="#0E1113" />
        </linearGradient>

        {/* Soft upper-left highlight on matte body */}
        <radialGradient id="bodyUpperHighlight" cx="30%" cy="22%" r="55%">
          <stop offset="0%" stopColor="#FFF7E8" stopOpacity="0.11" />
          <stop offset="100%" stopColor="#FFF7E8" stopOpacity="0" />
        </radialGradient>

        {/* Deep soundhole acoustic interior gradient */}
        <radialGradient id="soundholeDepth" cx="45%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#1B2224" />
          <stop offset="70%" stopColor="#0D1113" />
          <stop offset="100%" stopColor="#07090A" />
        </radialGradient>

        {/* Dark fingerboard gradient */}
        <linearGradient id="darkFretboard" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#202527" />
          <stop offset="50%" stopColor="#15191B" />
          <stop offset="100%" stopColor="#101315" />
        </linearGradient>
      </defs>

      {/* 1. Elliptical Contact Shadow underneath the ukulele */}
      <ellipse
        cx="535"
        cy="318"
        rx="410"
        ry="24"
        fill="rgba(18, 52, 59, 0.14)"
        style={{
          transform: `translate3d(${parallax.x * -0.5}px, ${parallax.y * -0.5}px, 0)`,
          transition: 'transform 120ms ease-out',
        }}
      />

      {/* 2. Main Instrument Layer */}
      <g
        style={{
          transform: `translate3d(${parallax.x}px, ${parallax.y}px, 0)`,
          transition: 'transform 120ms ease-out',
        }}
      >
        {/* Two Geared Tuners on Top & Two on Bottom of Headstock with Black Buttons */}
        {[
          {postX: 88, postYTop: 102, btnYTop: 74, postYBot: 258, btnYBot: 286},
          {postX: 138, postYTop: 106, btnYTop: 78, postYBot: 254, btnYBot: 282},
        ].map((tuner, idx) => (
          <g key={idx}>
            {/* Top metal shaft */}
            <rect
              x={tuner.postX - 3}
              y={tuner.btnYTop + 6}
              width="6"
              height="26"
              rx="2"
              fill="#B8C2C4"
            />
            {/* Top matte black oval button */}
            <ellipse
              cx={tuner.postX}
              cy={tuner.btnYTop}
              rx="15"
              ry="8"
              fill="#161A1C"
              stroke="#3F5C62"
              strokeWidth="1.5"
            />
            {/* Bottom metal shaft */}
            <rect
              x={tuner.postX - 3}
              y={tuner.postYBot - 4}
              width="6"
              height="26"
              rx="2"
              fill="#B8C2C4"
            />
            {/* Bottom matte black oval button */}
            <ellipse
              cx={tuner.postX}
              cy={tuner.btnYBot}
              rx="15"
              ry="8"
              fill="#161A1C"
              stroke="#3F5C62"
              strokeWidth="1.5"
            />
          </g>
        ))}

        {/* Soprano Crown Headstock */}
        <path
          d="M 38 118 C 52 114, 152 124, 184 134 L 192 140 L 192 220 L 184 226 C 152 236, 52 246, 38 242 C 28 210, 32 192, 24 180 C 32 168, 28 150, 38 118 Z"
          fill="url(#sopranoBlackBody)"
          stroke="#2E383B"
          strokeWidth="2"
        />

        {/* 4 White-Ringed Tuner Posts on Headstock Face */}
        {[
          {cx: 88, cy: 144},
          {cx: 138, cy: 147},
          {cx: 88, cy: 216},
          {cx: 138, cy: 213},
        ].map((post, i) => (
          <g key={i}>
            <circle cx={post.cx} cy={post.cy} r="7" fill="#E4EFE7" />
            <circle cx={post.cx} cy={post.cy} r="3.5" fill="#262B2E" />
          </g>
        ))}

        {/* Soprano Figure-8 Matte Black Body */}
        <path
          d="M 538 122
             C 562 52, 648 44, 694 94
             C 716 118, 742 116, 770 84
             C 818 28, 938 42, 946 180
             C 938 318, 818 332, 770 276
             C 742 244, 716 242, 694 266
             C 648 316, 562 308, 538 238
             Z"
          fill="url(#sopranoBlackBody)"
          stroke="#2C3538"
          strokeWidth="2.5"
        />

        {/* Soft Upper-Left Highlight on Matte Body */}
        <path
          d="M 538 122
             C 562 52, 648 44, 694 94
             C 716 118, 742 116, 770 84
             C 818 28, 938 42, 946 180
             C 938 240, 800 220, 538 180 Z"
          fill="url(#bodyUpperHighlight)"
        />

        {/* Subtle Fine Wood Grain Lines across Matte Body */}
        {[92, 118, 146, 174, 206, 234, 262].map((yLine, idx) => (
          <path
            key={idx}
            d={`M 565 ${yLine} Q 750 ${yLine + (idx % 2 === 0 ? 4 : -4)} 925 ${yLine}`}
            stroke="#FFF7E8"
            strokeOpacity="0.025"
            strokeWidth="1"
            fill="none"
          />
        ))}

        {/* Carved Triangle 'Sunburst' Rosette around Soundhole (36 triangles) */}
        <g transform="translate(630, 180)">
          <circle
            cx="0"
            cy="0"
            r="60"
            fill="none"
            stroke="#E4EFE7"
            strokeOpacity="0.35"
            strokeWidth="1"
          />
          {rosetteTriangles.map((deg) => (
            <polygon
              key={deg}
              points="0,-57 -2.8,-50 2.8,-50"
              fill="#E4EFE7"
              fillOpacity="0.72"
              transform={`rotate(${deg})`}
            />
          ))}
          <circle
            cx="0"
            cy="0"
            r="48"
            fill="none"
            stroke="#E4EFE7"
            strokeOpacity="0.35"
            strokeWidth="1"
          />
        </g>

        {/* Deep Soundhole */}
        <circle
          cx="630"
          cy="180"
          r="46"
          fill="url(#soundholeDepth)"
          stroke="#262B2E"
          strokeWidth="2.5"
        />

        {/* Dark Fretboard & Neck extending from Nut (x=192) over Body (x=592) */}
        <rect
          x="192"
          y="140"
          width="400"
          height="80"
          rx="3"
          fill="url(#darkFretboard)"
          stroke="#2C3538"
          strokeWidth="2"
        />

        {/* White Nut (x=186..194) */}
        <rect
          x="186"
          y="140"
          width="8"
          height="80"
          rx="2"
          fill="#FFF7E8"
          stroke="#3F5C62"
          strokeWidth="1"
        />

        {/* 12 Silver Frets + White Fret Dots strictly at Frets 5, 7, and 10 */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((fretNum) => {
          const fretX = 192 + fretNum * 32;
          const prevFretX = 192 + (fretNum - 1) * 32;
          const centerSpaceX = (fretX + prevFretX) / 2;
          const hasWhiteFretDot = fretNum === 5 || fretNum === 7 || fretNum === 10;

          return (
            <g key={fretNum}>
              <line
                x1={fretX}
                y1="141"
                x2={fretX}
                y2="219"
                stroke="#B8C2C4"
                strokeWidth="2"
                strokeOpacity="0.85"
              />
              {hasWhiteFretDot && (
                <circle
                  cx={centerSpaceX}
                  cy="180"
                  r="5.5"
                  fill="#FFF7E8"
                  fillOpacity="0.92"
                />
              )}
            </g>
          );
        })}

        {/* Dark Bridge with Two Pearl Dots and White Saddle */}
        <g>
          {/* Dark Tie-Bar Bridge */}
          <rect
            x="814"
            y="128"
            width="34"
            height="104"
            rx="6"
            fill="#14181A"
            stroke="#2E383B"
            strokeWidth="2"
          />
          {/* Two Pearl Dots on Bridge */}
          <circle cx="834" cy="140" r="4" fill="#FFF7E8" fillOpacity="0.9" />
          <circle cx="834" cy="220" r="4" fill="#FFF7E8" fillOpacity="0.9" />
          {/* White Saddle */}
          <rect
            x="820"
            y="140"
            width="6"
            height="80"
            rx="2"
            fill="#FFF7E8"
          />
        </g>

        {/* Strings fanning from Nut to Headstock Posts */}
        <line x1="186" y1="152" x2="88" y2="144" stroke="#FFF7E8" strokeWidth="1.6" strokeOpacity="0.75" />
        <line x1="186" y1="171" x2="138" y2="147" stroke="#FFF7E8" strokeWidth="2.2" strokeOpacity="0.75" />
        <line x1="186" y1="189" x2="138" y2="213" stroke="#FFF7E8" strokeWidth="1.8" strokeOpacity="0.75" />
        <line x1="186" y1="208" x2="88" y2="216" stroke="#FFF7E8" strokeWidth="1.4" strokeOpacity="0.75" />

        {/* 4 Playable White Nylon Strings (Nut x=192 to Saddle x=822) */}
        {UKULELE_ASSET_CONFIG.strings.map((str) => {
          const yCoord = (str.yPct / 100) * 360;
          const xStart = (str.nutXPct / 100) * 1000;
          const xEnd = (str.saddleXPct / 100) * 1000;
          const isVibrating = Boolean(vibratingStrings[str.stringNumber]);

          return (
            <g key={str.stringNumber}>
              {/* Visible White Nylon String with Faint Highlight */}
              <g className={isVibrating ? 'animate-string-pluck' : ''}>
                <line
                  x1={xStart}
                  y1={yCoord}
                  x2={xEnd}
                  y2={yCoord}
                  stroke={isVibrating ? '#FFC857' : '#FFF7E8'}
                  strokeWidth={isVibrating ? str.strokeWidthPx + 1.2 : str.strokeWidthPx}
                  strokeLinecap="round"
                />
                <line
                  x1={xStart}
                  y1={yCoord - 0.6}
                  x2={xEnd}
                  y2={yCoord - 0.6}
                  stroke="#FFFCF5"
                  strokeWidth="0.6"
                  strokeOpacity="0.7"
                />
              </g>

              {/* 32px-tall Invisible Hit Area for Pointer Down & Drag Strumming */}
              <rect
                x={xStart}
                y={yCoord - 16}
                width={xEnd - xStart}
                height="32"
                fill="transparent"
                className="cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setIsPointerDraggingStrings(true);
                  handlePluckOpenString(str.stringNumber);
                }}
                onPointerEnter={() => {
                  if (isPointerDraggingStrings) {
                    handlePluckOpenString(str.stringNumber);
                  }
                }}
              />

              {/* Tiny String Letter Chip (G C E A) near Nut shown after first pluck */}
              {hasPluckedOnce && (
                <g transform={`translate(${xStart - 22}, ${yCoord})`}>
                  <rect
                    x="-11"
                    y="-9"
                    width="22"
                    height="18"
                    rx="9"
                    fill="#FFFCF5"
                    stroke="rgba(18, 52, 59, 0.2)"
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    fill="#12343B"
                    fontSize="11"
                    fontWeight="700"
                    className="font-dm-mono"
                  >
                    {str.letter}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );

  return (
    <div className="space-y-6">
      {/* ==================== HERO STAGE (32px RADIUS, SAGE-TO-CREAM, MIN-H 70VH DESKTOP) ==================== */}
      <div
        onClick={() => {
          if (selectedAnatomy) {
            setSelectedAnatomy(null);
            onHotspotSelectChange?.(null);
          }
        }}
        onPointerMove={(e) => {
          if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / rect.width - 0.5;
            const relY = (e.clientY - rect.top) / rect.height - 0.5;
            setParallax({x: relX * 10, y: relY * 10});
          }
        }}
        onPointerLeave={() => setParallax({x: 0, y: 0})}
        className="relative w-full max-w-[1100px] mx-auto rounded-[32px] md:min-h-[70vh] p-5 sm:p-8 flex flex-col justify-between koa-shadow overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #E4EFE7 0%, #FFF7E8 100%)',
        }}
      >
        {/* Stage Top Row: ONLY 1 instruction line + 4 progress dots on left, tiny mute icon on right */}
        <div className="relative z-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-[16px] font-medium text-[#12343B]">
              {stageTab === 'anatomy'
                ? 'Tap the glowing parts to explore'
                : stageTab === 'fretboard'
                  ? 'Tap any fret or drag across the strings to play'
                  : stageTab === 'rhythm'
                    ? 'Tap any beat or play the groove'
                    : 'Tap any measure or tab note to play along'}
            </span>

            {/* Four-String Progress Dots (fill Sunshine #FFC857 as 4 parts/actions are found) */}
            <div
              className="flex items-center gap-1.5"
              aria-label={`${completedDotsCount} of 4 exploration steps completed`}
            >
              {[0, 1, 2, 3].map((dotIdx) => {
                const isFilled = dotIdx < completedDotsCount;
                return (
                  <span
                    key={dotIdx}
                    className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                      isFilled
                        ? 'bg-[#FFC857] ring-1 ring-[#12343B]/30'
                        : 'bg-[#12343B]/20'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Tiny Mute/Unmute Icon (Only Chrome in Stage) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className="w-11 h-11 rounded-full flex items-center justify-center text-[#12343B] hover:bg-[#12343B]/10 transition-colors koa-focus"
            title={isMuted ? 'Unmute ukulele audio' : 'Mute ukulele audio'}
            aria-label={isMuted ? 'Unmute ukulele audio' : 'Mute ukulele audio'}
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-[#3F5C62]" />
            ) : (
              <Volume2 className="w-5 h-5 text-[#12343B]" />
            )}
          </button>
        </div>

        {/* ==================== MODE 1: HERO SOPRANO UKULELE & HOTSPOTS ==================== */}
        {stageTab === 'anatomy' && (
          <div className="relative my-auto py-3 sm:py-8 flex flex-col items-center justify-center w-full min-w-0">
            {/* Ukulele Container: fills width on mobile and ~88% of stage width on desktop */}
            <div className="relative w-full md:w-[88%] mx-auto aspect-[1000/360]">
              {renderLayeredBlackUkuleleSvg()}

              {/* Unnumbered Tiered Hotspots Layer */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  transform: `translate3d(${parallax.x * 1.3}px, ${parallax.y * 1.3}px, 0)`,
                  transition: 'transform 120ms ease-out',
                }}
              >
                {UKULELE_ASSET_CONFIG.hotspots.map((spot) => {
                  // Tier 2 dots appear only after the first Tier 1 part is found
                  if (spot.tier === 2 && !hasFoundTier1) {
                    return null;
                  }

                  const partData = UKULELE_ANATOMY.find((a) => a.id === spot.id);
                  if (!partData) return null;

                  const isFound = foundPartIds.includes(spot.id);
                  const isSelected = selectedAnatomy?.id === spot.id;
                  const isHovered = hoveredHotspotId === spot.id;
                  const shouldPulse =
                    spot.tier === 1 && !isFound && !isSelected && !isPulseIdle;

                  return (
                    <div
                      key={spot.id}
                      style={{
                        left: `${spot.xPct}%`,
                        top: `${spot.yPct}%`,
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                    >
                      <button
                        type="button"
                        aria-label={`Inspect ${partData.name}`}
                        aria-pressed={isSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectHotspot(spot.id);
                        }}
                        onMouseEnter={() => setHoveredHotspotId(spot.id)}
                        onMouseLeave={() => setHoveredHotspotId(null)}
                        onFocus={() => setHoveredHotspotId(spot.id)}
                        onBlur={() => setHoveredHotspotId(null)}
                        className="relative w-12 h-12 flex items-center justify-center rounded-full koa-focus group"
                      >
                        {/* 36px Pulsing Ring for Tier 1 unfound hotspots */}
                        {shouldPulse && (
                          <span
                            className="absolute w-9 h-9 rounded-full bg-[#FFC857]/60 animate-hotspot-pulse pointer-events-none"
                            aria-hidden="true"
                          />
                        )}

                        {/* Slowly rotating ring of tiny triangles for Soundhole hotspot */}
                        {spot.isRosetteHotspot && !isFound && (
                          <svg
                            viewBox="-24 -24 48 48"
                            className="absolute w-10 h-10 animate-rosette-spin pointer-events-none"
                            aria-hidden="true"
                          >
                            {Array.from({length: 12}, (_, i) => (
                              <polygon
                                key={i}
                                points="0,-21 -2,-17 2,-17"
                                fill="#FFC857"
                                transform={`rotate(${i * 30})`}
                              />
                            ))}
                          </svg>
                        )}

                        {/* 20px Visual Hotspot Dot */}
                        <span
                          className={`relative w-5 h-5 rounded-full flex items-center justify-center transition-transform duration-200 ${
                            isSelected
                              ? 'bg-[#FFC857] ring-3 ring-[#12343B] scale-115'
                              : isFound
                                ? 'bg-[#3DB9A5] ring-2 ring-[#FFFCF5]'
                                : spot.tier === 1
                                  ? 'bg-[#FFC857] ring-2 ring-[#12343B]/50 group-hover:scale-110'
                                  : 'bg-[#12343B]/45 ring-1 ring-[#FFFCF5]/60 group-hover:bg-[#FFC857]'
                          }`}
                        >
                          {isFound && (
                            <Check
                              className="w-3 h-3 text-[#12343B] stroke-[3]"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                      </button>

                      {/* Small Glass Label Chip on Hover, Focus, or Select */}
                      {(isHovered || isSelected) && (
                        <div className="hidden sm:block absolute left-1/2 -translate-x-1/2 -top-9 px-3 py-1 rounded-full koa-glass text-[14px] font-semibold text-[#12343B] whitespace-nowrap pointer-events-none shadow-sm">
                          {partData.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected-Part Glass Popover (2nd allowed glass surface) */}
            {selectedAnatomy && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="z-30 mt-4 md:mt-0 md:absolute md:bottom-4 md:right-4 w-full md:max-w-[390px] rounded-[24px] koa-glass p-6 koa-shadow transition-all"
                role="region"
                aria-label={`Details for ${selectedAnatomy.name}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-semibold text-[#3F5C62]">
                      {selectedAnatomy.plainTitle}
                    </div>
                    <h3 className="font-fraunces text-[24px] font-bold text-[#12343B] leading-tight mt-0.5">
                      {selectedAnatomy.name}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAnatomy(null);
                      onHotspotSelectChange?.(null);
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[#3F5C62] hover:text-[#12343B] hover:bg-[#12343B]/10 koa-focus shrink-0"
                    aria-label="Close part details"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* "What it is" as one muted line under the name */}
                <p className="text-[15px] text-[#3F5C62] mt-1.5">
                  {selectedAnatomy.whatItIs}
                </p>

                {/* "What it does" as the main 18px text */}
                <p className="text-[18px] text-[#12343B] leading-relaxed mt-3">
                  {selectedAnatomy.whatItDoes}
                </p>

                {/* Collapsible Beginner Tip with a Sunshine dot (no yellow box) */}
                <div className="mt-4 pt-3 border-t border-[#12343B]/12">
                  <button
                    type="button"
                    onClick={() => setShowBeginnerTip((v) => !v)}
                    className="flex items-center justify-between w-full text-left text-[15px] font-semibold text-[#12343B] koa-focus rounded-lg py-1"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full bg-[#FFC857]"
                        aria-hidden="true"
                      />
                      <span>Beginner tip</span>
                    </span>
                    {showBeginnerTip ? (
                      <ChevronUp className="w-4 h-4 text-[#3F5C62]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#3F5C62]" />
                    )}
                  </button>

                  {showBeginnerTip && (
                    <p className="text-[16px] text-[#3F5C62] mt-2 leading-relaxed">
                      {selectedAnatomy.beginnerTip}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== MODE 2: INTERACTIVE FRETBOARD & CHORD LAB ==================== */}
        {stageTab === 'fretboard' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-auto py-4 space-y-6"
          >
            {/* Chord Switcher Pills + Strum Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {Object.values(CHORD_LIBRARY).map((chord) => {
                  const isSelected = currentChord.id === chord.id;
                  return (
                    <button
                      key={chord.id}
                      type="button"
                      onClick={() => handleSelectChord(chord.id)}
                      className={`px-4 py-2 rounded-full text-[15px] font-semibold transition-all min-h-[44px] koa-focus ${
                        isSelected
                          ? 'bg-[#12343B] text-[#FFF7E8] shadow-sm'
                          : 'bg-[#FFFCF5] text-[#12343B] hover:bg-[#FFC857]/30'
                      }`}
                    >
                      {chord.name}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleStrum('D')}
                  className="flex-1 sm:flex-initial justify-center px-4 sm:px-5 py-2.5 rounded-full bg-[#12343B] text-[#FFF7E8] text-[15px] font-semibold flex items-center gap-2 min-h-[44px] koa-focus"
                >
                  <ArrowDown className="w-4 h-4 text-[#FFC857] shrink-0" />
                  <span>Strum {currentChord.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStrum('U')}
                  className="px-4 py-2.5 rounded-full bg-[#FFFCF5] text-[#12343B] text-[15px] font-semibold flex items-center justify-center gap-1.5 min-h-[44px] koa-focus"
                >
                  <ArrowUp className="w-4 h-4 shrink-0" />
                  <span>Up</span>
                </button>
              </div>
            </div>

            {/* Interactive Matte-Black Fretboard Grid + Vertical Chord Diagram */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center min-w-0 w-full">
              <div className="lg:col-span-8 min-w-0 w-full max-w-full bg-[#121618] rounded-[24px] p-3.5 sm:p-5 koa-shadow overflow-x-auto">
                <div className="min-w-[520px] sm:min-w-[600px]">
                  <div className="grid grid-cols-10 text-center text-[14px] text-[#E4EFE7]/80 mb-2 font-dm-mono">
                    <div>String</div>
                    <div>Open</div>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((f) => (
                      <div key={f}>
                        Fret {f}
                        {f === 5 || f === 7 ? ' •' : ''}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[16px] overflow-hidden border border-[#3F5C62]/40 bg-[#171C1E]">
                    {UKULELE_STRINGS.map((str, rowIdx) => {
                      const chordFretForString = activeFrets[rowIdx];
                      const chordFingerForString = activeFingers[rowIdx];
                      const isVibrating = Boolean(vibratingStrings[str.stringNumber]);

                      return (
                        <div
                          key={str.stringNumber}
                          className="grid grid-cols-10 items-center relative border-b border-[#3F5C62]/25 last:border-b-0 h-14"
                        >
                          {/* Continuous Nylon String Line */}
                          <div
                            className={`absolute left-[10%] right-0 pointer-events-none ${
                              isVibrating
                                ? 'bg-[#FFC857] animate-string-pluck'
                                : 'bg-[#FFF7E8]/85'
                            }`}
                            style={{
                              height:
                                str.stringNumber === 3
                                  ? '3px'
                                  : str.stringNumber === 2
                                    ? '2.4px'
                                    : '1.8px',
                            }}
                          />

                          {/* String Label */}
                          <button
                            type="button"
                            onClick={() =>
                              handlePluckStringAtFret(
                                str.stringNumber,
                                chordFretForString
                              )
                            }
                            className="z-10 h-full bg-[#101416] text-[#FFF7E8] font-dm-mono text-[14px] font-medium flex items-center justify-center border-r border-[#3F5C62]/40 koa-focus"
                          >
                            {str.shortName} ({str.stringNumber})
                          </button>

                          {/* Open String (0) + White Nut */}
                          <button
                            type="button"
                            onClick={() => handlePluckStringAtFret(str.stringNumber, 0)}
                            className="z-10 h-full flex items-center justify-center border-r-[6px] border-[#FFF7E8] bg-[#14181A] hover:bg-[#1E2427] koa-focus"
                            aria-label={`Play open ${str.shortName} string`}
                          >
                            {chordFretForString === 0 && (
                              <span className="w-7 h-7 rounded-full bg-[#3DB9A5] text-[#12343B] font-dm-mono text-[14px] font-bold flex items-center justify-center">
                                0
                              </span>
                            )}
                          </button>

                          {/* Frets 1..8 */}
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((fretNum) => {
                            const isChordFingerHere = chordFretForString === fretNum;
                            const isTappedHere =
                              tappedSpot?.stringNum === str.stringNumber &&
                              tappedSpot.fret === fretNum;

                            return (
                              <button
                                key={fretNum}
                                type="button"
                                onClick={() =>
                                  handlePluckStringAtFret(str.stringNumber, fretNum)
                                }
                                className="z-10 h-full flex items-center justify-end pr-2 border-r-2 border-[#B8C2C4]/70 hover:bg-[#FFF7E8]/10 transition-colors relative koa-focus"
                                aria-label={`String ${str.shortName} Fret ${fretNum}, note ${getNoteNameAtFret(str.stringNumber, fretNum)}`}
                              >
                                {rowIdx === 1 && (fretNum === 5 || fretNum === 7) && (
                                  <span className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#FFF7E8]/60 pointer-events-none" />
                                )}

                                {isTappedHere && !isChordFingerHere && (
                                  <span className="w-8 h-8 rounded-full bg-[#FFC857] text-[#12343B] font-dm-mono text-[13px] font-bold flex items-center justify-center animate-dot-ripple">
                                    {tappedSpot.noteName}
                                  </span>
                                )}

                                {isChordFingerHere && (
                                  <span
                                    style={{animationDelay: `${rowIdx * 120}ms`}}
                                    className="w-8 h-8 rounded-full bg-[#FFC857] text-[#12343B] ring-2 ring-[#FFFCF5] font-dm-mono text-[14px] font-bold flex items-center justify-center animate-dot-ripple"
                                  >
                                    {chordFingerForString > 0
                                      ? chordFingerForString
                                      : fretNum}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Chord Diagram Summary */}
              <div className="lg:col-span-4 flex flex-col justify-between gap-4">
                <div className="flex items-center gap-4">
                  <svg
                    viewBox="0 0 130 155"
                    className="w-28 h-36 shrink-0 bg-[#14181A] rounded-[20px] p-2.5 koa-shadow"
                    aria-label={`${currentChord.fullName} chord chart`}
                  >
                    {['G', 'C', 'E', 'A'].map((lbl, i) => {
                      const x = 25 + i * 26;
                      const fretVal = activeFrets[i];
                      return (
                        <g key={lbl}>
                          <text
                            x={x}
                            y="14"
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="bold"
                            fill="#FFF7E8"
                            className="font-dm-mono"
                          >
                            {lbl}
                          </text>
                          {fretVal === 0 && (
                            <circle
                              cx={x}
                              cy="24"
                              r="4"
                              fill="none"
                              stroke="#3DB9A5"
                              strokeWidth="2"
                            />
                          )}
                        </g>
                      );
                    })}
                    <rect x="23" y="32" width="82" height="5" fill="#FFF7E8" />
                    {[0, 1, 2, 3].map((i) => (
                      <line
                        key={i}
                        x1={25 + i * 26}
                        y1="34"
                        x2={25 + i * 26}
                        y2="142"
                        stroke="#E4EFE7"
                        strokeOpacity="0.6"
                        strokeWidth="1.5"
                      />
                    ))}
                    {[1, 2, 3, 4].map((f) => (
                      <line
                        key={f}
                        x1="25"
                        y1={35 + f * 26}
                        x2="103"
                        y2={35 + f * 26}
                        stroke="#3F5C62"
                        strokeWidth="1.5"
                      />
                    ))}
                    {activeFrets.map((fretVal, strIdx) => {
                      if (fretVal <= 0 || fretVal > 4) return null;
                      const x = 25 + strIdx * 26;
                      const y = 35 + (fretVal - 0.5) * 26;
                      const fingerNum = activeFingers[strIdx];
                      return (
                        <g key={strIdx}>
                          <circle
                            cx={x}
                            cy={y}
                            r="9"
                            fill="#FFC857"
                            stroke="#12343B"
                            strokeWidth="1.5"
                          />
                          <text
                            x={x}
                            y={y + 4}
                            textAnchor="middle"
                            fill="#12343B"
                            fontSize="11"
                            fontWeight="bold"
                            className="font-dm-mono"
                          >
                            {fingerNum > 0 ? fingerNum : fretVal}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  <div>
                    <h3 className="font-fraunces text-[24px] font-bold text-[#12343B]">
                      {currentChord.fullName}
                    </h3>
                    <p className="font-dm-mono text-[15px] text-[#3F5C62]">
                      Frets: {currentChord.frets.join(' – ')}
                    </p>
                    <p className="text-[16px] text-[#12343B] mt-2 leading-snug">
                      {currentChord.moodDescription}
                    </p>
                  </div>
                </div>

                {tappedSpot && (
                  <p className="text-[15px] text-[#3F5C62] font-dm-mono">
                    Last played: String {tappedSpot.stringNum} · Fret {tappedSpot.fret} (
                    {tappedSpot.noteName}, {tappedSpot.freq} Hz)
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== MODE 3: STRUM & RHYTHM SEQUENCER ==================== */}
        {stageTab === 'rhythm' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-auto py-4 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {Object.values(STRUMMING_PATTERNS).map((pat) => (
                  <button
                    key={pat.id}
                    type="button"
                    onClick={() => {
                      setActivePatternId(pat.id);
                      setBpm(pat.recommendedBpm);
                      onRecordActivity(`Selected rhythm pattern: ${pat.name}`);
                    }}
                    className={`px-4 py-2 rounded-full text-[15px] font-semibold min-h-[44px] koa-focus ${
                      activePatternId === pat.id
                        ? 'bg-[#12343B] text-[#FFF7E8]'
                        : 'bg-[#FFFCF5] text-[#12343B]'
                    }`}
                  >
                    {pat.name}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIncludeMetronomeClick((v) => !v)}
                  className="px-4 py-2 rounded-full bg-[#FFFCF5] text-[#12343B] text-[15px] font-semibold min-h-[44px] koa-focus"
                >
                  Click: {includeMetronomeClick ? 'On' : 'Off'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = !isRhythmPlaying;
                    setIsRhythmPlaying(next);
                    if (next) {
                      onRecordActivity(`Started Rhythm Visualizer (${currentPattern.name})`);
                    }
                  }}
                  className="px-5 py-2.5 rounded-full bg-[#12343B] text-[#FFF7E8] text-[15px] font-semibold flex items-center gap-2 min-h-[44px] koa-focus"
                >
                  {isRhythmPlaying ? (
                    <>
                      <Square className="w-4 h-4 fill-current" />
                      <span>Stop Groove</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current text-[#FFC857]" />
                      <span>Play Groove</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div
              className={`grid gap-2.5 sm:gap-3 ${
                currentPattern.steps.length === 6
                  ? 'grid-cols-3 sm:grid-cols-6'
                  : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-8'
              }`}
            >
              {currentPattern.steps.map((step, idx) => {
                const isActive = currentBeatStep === idx;
                const isDown = step.action === 'D';
                const isUp = step.action === 'U';

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCurrentBeatStep(idx);
                      if (isDown) handleStrum('D');
                      else if (isUp) handleStrum('U');
                      else {
                        ukuleleAudio.playMetronomeTick(false);
                        onRecordActivity('Practiced Ghost Strum Beat');
                      }
                    }}
                    className={`p-4 rounded-[24px] flex flex-col items-center justify-between min-h-[120px] transition-all koa-focus ${
                      isActive
                        ? 'bg-[#12343B] text-[#FFF7E8] scale-105 koa-shadow'
                        : 'bg-[#FFFCF5] text-[#12343B]'
                    }`}
                  >
                    <span className="font-dm-mono text-[15px] font-bold">
                      Beat {step.label}
                    </span>
                    <div className="my-2 flex flex-col items-center">
                      {isDown && <ArrowDown className="w-6 h-6 text-[#FFC857]" />}
                      {isUp && <ArrowUp className="w-6 h-6 text-[#3DB9A5]" />}
                      <span className="text-[14px] font-semibold mt-1">
                        {isDown ? 'DOWN' : isUp ? 'UP' : 'Air'}
                      </span>
                    </div>
                    <span
                      className={`text-[14px] ${
                        isActive ? 'text-[#E4EFE7]' : 'text-[#3F5C62]'
                      }`}
                    >
                      {step.coaching}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== MODE 4: SONG & TAB PLAYER ==================== */}
        {stageTab === 'song-tab' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-auto py-4 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {BEGINNER_SONGBOOK.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setActiveSongId(s.id);
                      setActiveMeasureIdx(0);
                      setActiveTabNoteIdx(0);
                      setIsSongAutoPlaying(false);
                      onRecordActivity(`Opened song: ${s.title}`);
                    }}
                    className={`px-4 py-2 rounded-full text-[15px] font-semibold min-h-[44px] koa-focus ${
                      activeSongId === s.id
                        ? 'bg-[#12343B] text-[#FFF7E8]'
                        : 'bg-[#FFFCF5] text-[#12343B]'
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsSongAutoPlaying((v) => !v)}
                className="px-5 py-2.5 rounded-full bg-[#12343B] text-[#FFF7E8] text-[15px] font-semibold flex items-center gap-2 min-h-[44px] koa-focus"
              >
                {isSongAutoPlaying ? (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span>Pause Play-Along</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current text-[#FFC857]" />
                    <span>Auto Play-Along</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {currentSong.measures.map((m, idx) => {
                const isCurrent = activeMeasureIdx === idx;
                const chordInfo = CHORD_LIBRARY[m.chord] || CHORD_LIBRARY.C;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActiveMeasureIdx(idx);
                      setActiveChordId(m.chord);
                      ukuleleAudio.strumChord(chordInfo.frets, 'D', {
                        speedMultiplier,
                        onStringTrigger: triggerStringVibration,
                      });
                      onRecordActivity(`Played measure "${m.lyrics}" (${m.chord})`);
                    }}
                    className={`p-4 rounded-[24px] text-left transition-all koa-focus ${
                      isCurrent
                        ? 'bg-[#12343B] text-[#FFF7E8] koa-shadow'
                        : 'bg-[#FFFCF5] text-[#12343B]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-dm-mono text-[15px] font-bold px-2.5 py-0.5 rounded-full bg-[#FFC857] text-[#12343B]">
                        {m.chord} ({chordInfo.frets.join('-')})
                      </span>
                      <span className="font-dm-mono text-[14px] opacity-80">
                        {m.beats} beats
                      </span>
                    </div>
                    <p className="text-[17px] font-medium">{m.lyrics}</p>
                  </button>
                );
              })}
            </div>

            {currentSong.melodyTab && (
              <div className="w-full min-w-0 max-w-full bg-[#14181A] rounded-[24px] p-3.5 sm:p-4 overflow-x-auto text-[#FFF7E8] font-dm-mono">
                <div className="min-w-[500px] sm:min-w-[600px] space-y-2">
                  {([1, 2, 3, 4] as const).map((strNum) => {
                    const strName =
                      strNum === 1 ? 'A' : strNum === 2 ? 'E' : strNum === 3 ? 'C' : 'G';
                    return (
                      <div key={strNum} className="flex items-center relative h-8">
                        <span className="w-12 text-[14px] font-bold shrink-0">
                          {strName}
                        </span>
                        <div className="flex-1 h-[1.5px] bg-[#3F5C62] relative flex items-center justify-around">
                          {currentSong.melodyTab!.map((tabNote, nIdx) => {
                            const isOnThisString = tabNote.string === strNum;
                            const isCurrentNote = activeTabNoteIdx === nIdx;
                            return (
                              <div
                                key={nIdx}
                                className="w-9 flex items-center justify-center"
                              >
                                {isOnThisString ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveTabNoteIdx(nIdx);
                                      handlePluckStringAtFret(
                                        tabNote.string,
                                        tabNote.fret
                                      );
                                    }}
                                    className={`w-7 h-7 rounded-full text-[14px] font-bold flex items-center justify-center ${
                                      isCurrentNote
                                        ? 'bg-[#FFC857] text-[#12343B]'
                                        : 'bg-[#262B2E] text-[#FFF7E8]'
                                    }`}
                                  >
                                    {tabNote.fret}
                                  </button>
                                ) : (
                                  <span className="text-[#3F5C62] text-[14px]">-</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quiet Subtle Footer Hint inside Stage */}
        <div className="relative z-10 flex items-center justify-between text-[14px] text-[#3F5C62]">
          <span>
            {hasPluckedOnce
              ? 'Strings tuned G4 · C4 · E4 · A4 (keys 1–4 also pluck strings)'
              : 'Tip: Drag across the white nylon strings to strum your ukulele'}
          </span>
        </div>
      </div>

      {/* ==================== PROGRESSIVE DISCLOSURE CONTROLS UNDER STAGE ==================== */}
      {/* Shown only on multi-mode lessons or when externalChordId is active; hidden on pure anatomy lessons unless user switches */}
      {(lesson.visualMode !== 'anatomy' || externalChordId || stageTab !== 'anatomy') && (
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-3 w-full">
          <div className="grid grid-cols-2 sm:inline-flex items-center gap-1.5 sm:gap-1 p-1.5 rounded-[22px] sm:rounded-full bg-[#E4EFE7] w-full sm:w-auto">
            {(
              [
                {id: 'anatomy', label: 'Ukulele & Parts'},
                {id: 'fretboard', label: 'Fretboard & Chords'},
                {id: 'rhythm', label: 'Strum & Rhythm'},
                {id: 'song-tab', label: 'Song & Tab'},
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStageTab(tab.id)}
                className={`px-3 sm:px-4 py-2 rounded-full text-[13px] sm:text-[15px] font-semibold transition-colors min-h-[42px] text-center koa-focus ${
                  stageTab === tab.id
                    ? 'bg-[#12343B] text-[#FFF7E8]'
                    : 'text-[#12343B] hover:bg-[#12343B]/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Speed controls appear ONLY in Strum and Tab modes */}
          {(stageTab === 'rhythm' || stageTab === 'song-tab') && (
            <div className="inline-flex items-center justify-center gap-1 p-1.5 rounded-full bg-[#E4EFE7] font-dm-mono self-center">
              {([0.5, 0.75, 1.0] as const).map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setSpeedMultiplier(spd)}
                  className={`px-3.5 py-1.5 rounded-full text-[14px] font-medium transition-colors min-h-[40px] koa-focus ${
                    speedMultiplier === spd
                      ? 'bg-[#12343B] text-[#FFF7E8]'
                      : 'text-[#12343B] hover:bg-[#12343B]/10'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
