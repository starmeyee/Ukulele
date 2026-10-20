'use client';

import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  CURRICULUM_LESSONS,
  CURRICULUM_STAGES,
  LessonConfig,
} from '@/lib/curriculum-data';
import {
  MUSICAL_GLOSSARY,
  BEGINNER_SONGBOOK,
  CHORD_LIBRARY,
  STRUMMING_PATTERNS,
} from '@/lib/ukulele-theory';
import {ukuleleAudio} from '@/lib/audio-engine';
import InteractiveUkuleleStage from '@/components/InteractiveUkuleleStage';
import UkuleleTuner from '@/components/UkuleleTuner';
import AiUkuleleTutor from '@/components/AiUkuleleTutor';
import AiChordSuggester from '@/components/AiChordSuggester';
import {
  auth,
  onAuthStateChanged,
  signInWithGooglePopup,
  signInWithGoogleRedirect,
  checkRedirectResult,
  parseFirebaseAuthError,
  signOutLearner,
  fetchOrCreateCloudLearnerProgress,
  syncCloudLearnerProgress,
  logCloudPracticeSession,
  User,
} from '@/lib/firebase';
import {
  Check,
  Lock,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Compass,
  Music,
  Award,
  Flame,
  Hand,
  Sparkles,
  Ear,
  Radio,
  Waves,
  LogIn,
  LogOut,
  Cloud,
  AlertCircle,
} from 'lucide-react';

interface PracticeLogItem {
  id: string;
  date: string;
  lessonNumber: number;
  lessonTitle: string;
  minutes: number;
}

interface PersistedLearnerState {
  currentLessonNumber: number;
  completedLessonNumbers: number[];
  knownDifficulties: string[];
  practiceMinutesTotal: number;
  practiceLogs: PracticeLogItem[];
  dailyStreakCount: number;
  bestStreakCount: number;
  lastPracticeIsoDate: string | null;
  practicedIsoDates: string[];
}

const STORAGE_KEY = 'koa_strum_ukulele_progress_v1';

function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readSavedProgress(): Partial<PersistedLearnerState> {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as Partial<PersistedLearnerState>;
    }
  } catch {
    // Ignore storage read errors
  }
  return {};
}

/**
 * Shortens long lesson objectives to a single crisp sentence (max ~20 words)
 * while keeping the exact meaning intact.
 */
function formatShortObjective(lesson: LessonConfig): string {
  if (lesson.number === 1) {
    return 'Discover how your ukulele’s hollow body, soundhole, and bridge turn string vibrations into warm acoustic sound.';
  }
  const words = lesson.objective.split(/\s+/);
  if (words.length <= 20) return lesson.objective;
  return `${words.slice(0, 19).join(' ').replace(/[.,;:]$/, '')}.`;
}

/**
 * Splits a lesson title like "Meet Your Ukulele: Body, Soundhole & Bridge"
 * into a clean H1 ("Meet your ukulele") and subtitle ("Body, soundhole & bridge").
 */
function splitLessonHeading(rawTitle: string): {
  heading: string;
  subtitle: string | null;
} {
  if (rawTitle.includes(':')) {
    const [left, right] = rawTitle.split(':');
    const cleanLeft =
      left.trim().toLowerCase() === 'meet your ukulele'
        ? 'Meet your ukulele'
        : left.trim();
    const cleanRight =
      right.trim().toLowerCase() === 'body, soundhole & bridge'
        ? 'Body, soundhole & bridge'
        : right.trim();
    return {heading: cleanLeft, subtitle: cleanRight};
  }
  return {heading: rawTitle, subtitle: null};
}

export default function UkuleleAcademyPage() {
  // 4 Merged Top-Level Destinations: Lessons, Tuner, Songbook, Progress
  const [activeNav, setActiveNav] = useState<
    'lessons' | 'tuner' | 'songbook' | 'progress'
  >('lessons');

  // Inside "Lessons", toggle between the active lesson and the 44-lesson path overview
  const [showLessonPathBrowser, setShowLessonPathBrowser] =
    useState<boolean>(false);

  // Persisted learner state
  const [currentLessonNumber, setCurrentLessonNumber] = useState<number>(() => {
    const saved = readSavedProgress();
    return typeof saved.currentLessonNumber === 'number'
      ? saved.currentLessonNumber
      : 1;
  });
  const [completedLessonNumbers, setCompletedLessonNumbers] = useState<number[]>(
    () => {
      const saved = readSavedProgress();
      return Array.isArray(saved.completedLessonNumbers)
        ? saved.completedLessonNumbers
        : [];
    }
  );
  const [knownDifficulties, setKnownDifficulties] = useState<string[]>(() => {
    const saved = readSavedProgress();
    return Array.isArray(saved.knownDifficulties) ? saved.knownDifficulties : [];
  });
  const [practiceMinutesTotal, setPracticeMinutesTotal] = useState<number>(() => {
    const saved = readSavedProgress();
    return typeof saved.practiceMinutesTotal === 'number'
      ? saved.practiceMinutesTotal
      : 0;
  });
  const [practiceLogs, setPracticeLogs] = useState<PracticeLogItem[]>(() => {
    const saved = readSavedProgress();
    return Array.isArray(saved.practiceLogs) ? saved.practiceLogs : [];
  });

  // Daily Practice Streak state
  const [dailyStreakCount, setDailyStreakCount] = useState<number>(() => {
    const saved = readSavedProgress();
    return typeof saved.dailyStreakCount === 'number'
      ? saved.dailyStreakCount
      : 1;
  });
  const [bestStreakCount, setBestStreakCount] = useState<number>(() => {
    const saved = readSavedProgress();
    return typeof saved.bestStreakCount === 'number' ? saved.bestStreakCount : 1;
  });
  const [lastPracticeIsoDate, setLastPracticeIsoDate] = useState<string | null>(
    () => {
      const saved = readSavedProgress();
      return typeof saved.lastPracticeIsoDate === 'string'
        ? saved.lastPracticeIsoDate
        : getTodayIsoDate();
    }
  );
  const [practicedIsoDates, setPracticedIsoDates] = useState<string[]>(() => {
    const saved = readSavedProgress();
    return Array.isArray(saved.practicedIsoDates) &&
      saved.practicedIsoDates.length > 0
      ? saved.practicedIsoDates
      : [getTodayIsoDate()];
  });

  // Per-lesson interactive state
  const [activityCountsByLesson, setActivityCountsByLesson] = useState<
    Record<number, number>
  >({});
  const [selectedCheckpointOption, setSelectedCheckpointOption] = useState<
    number | null
  >(null);
  const [checkpointPassedByLesson, setCheckpointPassedByLesson] = useState<
    Record<number, boolean>
  >(() => {
    const saved = readSavedProgress();
    const map: Record<number, boolean> = {};
    if (Array.isArray(saved.completedLessonNumbers)) {
      saved.completedLessonNumbers.forEach((n) => {
        map[n] = true;
      });
    }
    return map;
  });
  const [showCheckpointHint, setShowCheckpointHint] = useState<boolean>(false);

  // Concept section state: inline vocabulary popover & 5-stage sound wave animation
  const [openTermPopoverId, setOpenTermPopoverId] = useState<string | null>(null);
  const [activeSoundWaveStep, setActiveSoundWaveStep] = useState<number>(0);
  const conceptSectionRef = useRef<HTMLElement | null>(null);
  const hasAnimatedConceptRef = useRef<boolean>(false);

  // Try it section state: 1-minute timer & collapsible troubleshooting row
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(60);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [timerFinishedOnce, setTimerFinishedOnce] = useState<boolean>(false);
  const [isMistakeExpanded, setIsMistakeExpanded] = useState<boolean>(false);

  // Quiz & Complete sunburst celebration state
  const [showQuizSunburst, setShowQuizSunburst] = useState<boolean>(false);
  const [showCompleteCelebration, setShowCompleteCelebration] =
    useState<boolean>(false);

  // Floating Koa Tutor Drawer state & context
  const [isTutorOpen, setIsTutorOpen] = useState<boolean>(false);
  const [tutorPrefilledPrompt, setTutorPrefilledPrompt] = useState<string | null>(
    null
  );
  const [selectedHotspotName, setSelectedHotspotName] = useState<string | null>(
    null
  );
  const [wrongQuizAnswerText, setWrongQuizAnswerText] = useState<string | null>(
    null
  );

  // External chord sync from AI Chord Suggester
  const [externalChordId, setExternalChordId] = useState<string | null>(null);

  // Curriculum stage filter inside Lessons path view
  const [selectedStageFilter, setSelectedStageFilter] = useState<number | 'all'>(
    'all'
  );

  // Firebase Auth & Cloud Database Sync state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [isCloudHydrated, setIsCloudHydrated] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<
    'idle' | 'syncing' | 'saved' | 'error'
  >('idle');
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);

  // Check for returning redirect sign-in results on initial mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if the user had actively initiated a redirect sign-in
    let wasRedirectActive = false;
    try {
      wasRedirectActive = Boolean(sessionStorage.getItem('koa_auth_redirect_active'));
    } catch {
      // Ignore
    }

    checkRedirectResult()
      .then((user) => {
        if (user) {
          setCurrentUser(user);
        }
      })
      .catch((err) => {
        // Only surface redirect errors if the user actually initiated a sign-in redirect,
        // preventing false warning banners on regular page visits or refreshes
        if (wasRedirectActive) {
          const msg = parseFirebaseAuthError(err);
          setAuthErrorMsg(msg);
        }
      });
  }, []);

  // Listen to Firebase Auth state and load/create cloud learner profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);
      setAuthErrorMsg(null);

      if (!user) {
        setIsCloudHydrated(false);
        setCloudSyncStatus('idle');
        return;
      }

      setCloudSyncStatus('syncing');
      try {
        const localSaved = readSavedProgress();
        const fallback = {
          currentLessonNumber:
            typeof localSaved.currentLessonNumber === 'number'
              ? localSaved.currentLessonNumber
              : 1,
          completedLessonNumbers: Array.isArray(localSaved.completedLessonNumbers)
            ? localSaved.completedLessonNumbers
            : [],
          knownDifficulties: Array.isArray(localSaved.knownDifficulties)
            ? localSaved.knownDifficulties
            : [],
          practiceMinutesTotal:
            typeof localSaved.practiceMinutesTotal === 'number'
              ? localSaved.practiceMinutesTotal
              : 0,
          dailyStreakCount:
            typeof localSaved.dailyStreakCount === 'number'
              ? localSaved.dailyStreakCount
              : 1,
          bestStreakCount:
            typeof localSaved.bestStreakCount === 'number'
              ? localSaved.bestStreakCount
              : 1,
          lastPracticeIsoDate:
            typeof localSaved.lastPracticeIsoDate === 'string'
              ? localSaved.lastPracticeIsoDate
              : getTodayIsoDate(),
          practicedIsoDates:
            Array.isArray(localSaved.practicedIsoDates) &&
            localSaved.practicedIsoDates.length > 0
              ? localSaved.practicedIsoDates
              : [getTodayIsoDate()],
        };

        const {progress: cloudProg, sessions: cloudSessions} =
          await fetchOrCreateCloudLearnerProgress(user, fallback);

        // Merge completed lessons & practiced dates from local and cloud so nothing is lost
        const mergedCompleted = Array.from(
          new Set([
            ...fallback.completedLessonNumbers,
            ...(cloudProg.completedLessonNumbers || []),
          ])
        );
        const mergedDates = Array.from(
          new Set([
            ...fallback.practicedIsoDates,
            ...(cloudProg.practicedIsoDates || []),
          ])
        ).slice(-30);
        const mergedDifficulties = Array.from(
          new Set([
            ...fallback.knownDifficulties,
            ...(cloudProg.knownDifficulties || []),
          ])
        );

        const nextLessonNum = Math.max(
          fallback.currentLessonNumber,
          cloudProg.currentLessonNumber || 1
        );
        const nextMinutes = Math.max(
          fallback.practiceMinutesTotal,
          cloudProg.practiceMinutesTotal || 0
        );
        const nextDailyStreak = Math.max(
          fallback.dailyStreakCount,
          cloudProg.dailyStreakCount || 1
        );
        const nextBestStreak = Math.max(
          fallback.bestStreakCount,
          cloudProg.bestStreakCount || 1,
          nextDailyStreak
        );
        const nextLastDate =
          cloudProg.lastPracticeIsoDate || fallback.lastPracticeIsoDate;

        setCurrentLessonNumber(nextLessonNum);
        setCompletedLessonNumbers(mergedCompleted);
        setKnownDifficulties(mergedDifficulties);
        setPracticeMinutesTotal(nextMinutes);
        setDailyStreakCount(nextDailyStreak);
        setBestStreakCount(nextBestStreak);
        setLastPracticeIsoDate(nextLastDate);
        setPracticedIsoDates(mergedDates);

        // Mark completed lessons as passed in checkpoint map
        setCheckpointPassedByLesson((prev) => {
          const updated = {...prev};
          mergedCompleted.forEach((n) => {
            updated[n] = true;
          });
          return updated;
        });

        if (cloudSessions.length > 0) {
          setPracticeLogs(
            cloudSessions.map((s) => ({
              id: s.id,
              date: s.date,
              lessonNumber: s.lessonNumber,
              lessonTitle: s.lessonTitle,
              minutes: s.minutes,
            }))
          );
        }

        setIsCloudHydrated(true);
        setCloudSyncStatus('saved');
      } catch (err) {
        console.error('Failed to load cloud learner profile:', err);
        setCloudSyncStatus('error');
      }
    });

    return () => unsubscribe();
  }, []);

  // Automatically sync learner progress and streak to Firestore when signed in
  useEffect(() => {
    if (!currentUser || !isCloudHydrated) return;

    const timer = setTimeout(async () => {
      setCloudSyncStatus('syncing');
      try {
        await syncCloudLearnerProgress(currentUser, {
          currentLessonNumber,
          completedLessonNumbers,
          knownDifficulties,
          practiceMinutesTotal,
          dailyStreakCount,
          bestStreakCount,
          lastPracticeIsoDate: lastPracticeIsoDate || getTodayIsoDate(),
          practicedIsoDates,
        });
        setCloudSyncStatus('saved');
      } catch (err) {
        console.error('Failed to sync progress to Firestore:', err);
        setCloudSyncStatus('error');
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [
    currentUser,
    isCloudHydrated,
    currentLessonNumber,
    completedLessonNumbers,
    knownDifficulties,
    practiceMinutesTotal,
    dailyStreakCount,
    bestStreakCount,
    lastPracticeIsoDate,
    practicedIsoDates,
  ]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthErrorMsg(null);
    try {
      await signInWithGooglePopup();
    } catch (err: unknown) {
      const errObj = err as {message?: string; code?: string};
      if (errObj?.message === 'POPUP_BLOCKED_REDIRECTING') {
        // Redirecting to Google OAuth, keep state active
        return;
      }
      if (errObj?.code === 'auth/popup-closed-by-user') {
        setIsSigningIn(false);
        return;
      }
      const msg = parseFirebaseAuthError(err);
      setAuthErrorMsg(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setAuthErrorMsg(null);
    try {
      await signOutLearner();
    } catch {
      // Ignore sign-out errors
    }
  };

  // Record daily streak activity
  const recordDailyStreakActivity = useCallback(() => {
    const today = getTodayIsoDate();
    const yesterday = getYesterdayIsoDate();

    setPracticedIsoDates((prev) =>
      prev.includes(today) ? prev : [...prev.slice(-13), today]
    );

    setLastPracticeIsoDate((prevLastDate) => {
      if (prevLastDate === today) {
        return prevLastDate;
      }
      setDailyStreakCount((prevStreak) => {
        const nextStreak =
          prevLastDate === yesterday ? prevStreak + 1 : Math.max(1, prevStreak);
        setBestStreakCount((prevBest) => Math.max(prevBest, nextStreak));
        return nextStreak;
      });
      return today;
    });
  }, []);

  // Persist state to localStorage
  useEffect(() => {
    try {
      const toSave: PersistedLearnerState = {
        currentLessonNumber,
        completedLessonNumbers,
        knownDifficulties,
        practiceMinutesTotal,
        practiceLogs,
        dailyStreakCount,
        bestStreakCount,
        lastPracticeIsoDate,
        practicedIsoDates,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // Ignore storage quota errors
    }
  }, [
    currentLessonNumber,
    completedLessonNumbers,
    knownDifficulties,
    practiceMinutesTotal,
    practiceLogs,
    dailyStreakCount,
    bestStreakCount,
    lastPracticeIsoDate,
    practicedIsoDates,
  ]);

  const currentLesson: LessonConfig =
    CURRICULUM_LESSONS.find((l) => l.number === currentLessonNumber) ||
    CURRICULUM_LESSONS[0];

  const activateLessonState = (lessonNum: number) => {
    const targetLesson =
      CURRICULUM_LESSONS.find((l) => l.number === lessonNum) ||
      CURRICULUM_LESSONS[0];
    setCurrentLessonNumber(lessonNum);
    setSelectedCheckpointOption(
      checkpointPassedByLesson[lessonNum]
        ? targetLesson.checkpoint.correctIndex
        : null
    );
    setShowCheckpointHint(false);
    setIsTimerRunning(false);
    setTimerFinishedOnce(false);
    setTimerSecondsLeft(targetLesson.practicalExercise.recommendedSeconds);
    setIsMistakeExpanded(false);
    setExternalChordId(null);
    setWrongQuizAnswerText(null);
    setShowLessonPathBrowser(false);
  };

  // IntersectionObserver for Concept section: animates String -> Bridge -> Body -> Soundhole -> Ear once on scroll
  useEffect(() => {
    if (activeNav !== 'lessons' || showLessonPathBrowser) return;
    const el = conceptSectionRef.current;
    if (!el || hasAnimatedConceptRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !hasAnimatedConceptRef.current) {
          hasAnimatedConceptRef.current = true;
          [0, 1, 2, 3, 4].forEach((stepIdx) => {
            setTimeout(() => {
              setActiveSoundWaveStep(stepIdx);
            }, stepIdx * 650);
          });
        }
      },
      {threshold: 0.35}
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [activeNav, showLessonPathBrowser, currentLesson.id]);

  // 1-Minute Practice Timer Countdown
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          setTimerFinishedOnce(true);
          ukuleleAudio.strumChord([0, 0, 0, 3], 'D');
          setPracticeMinutesTotal((m) => m + 1);
          recordDailyStreakActivity();
          setActivityCountsByLesson((counts) => ({
            ...counts,
            [currentLesson.number]: (counts[currentLesson.number] || 0) + 1,
          }));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, currentLesson.number, recordDailyStreakActivity]);

  const handleRecordActivity = useCallback(
    (_actionLabel: string) => {
      recordDailyStreakActivity();
      setActivityCountsByLesson((prev) => ({
        ...prev,
        [currentLesson.number]: (prev[currentLesson.number] || 0) + 1,
      }));
    },
    [currentLesson.number, recordDailyStreakActivity]
  );

  const currentActivityCount = activityCountsByLesson[currentLesson.number] || 0;
  const hasAttemptedActivity = currentActivityCount >= 1;
  const hasPassedCheckpoint = Boolean(checkpointPassedByLesson[currentLesson.number]);
  const isLessonCompleted = completedLessonNumbers.includes(currentLesson.number);
  const canMarkLessonComplete = hasAttemptedActivity && hasPassedCheckpoint;

  const handleSelectCheckpointOption = (idx: number) => {
    setSelectedCheckpointOption(idx);
    if (idx === currentLesson.checkpoint.correctIndex) {
      setCheckpointPassedByLesson((prev) => ({
        ...prev,
        [currentLesson.number]: true,
      }));
      setWrongQuizAnswerText(null);
      setShowQuizSunburst(true);
      setTimeout(() => setShowQuizSunburst(false), 850);
      ukuleleAudio.strumChord([0, 0, 0, 3], 'D');
    } else {
      setWrongQuizAnswerText(currentLesson.checkpoint.options[idx]);
      ukuleleAudio.playString(3, 0, {volume: 0.2});
    }
  };

  const handleCompleteLesson = () => {
    if (!canMarkLessonComplete) return;

    // Celebratory strum & sunburst ring burst
    ukuleleAudio.strumChord([0, 0, 0, 3], 'D');
    setShowCompleteCelebration(true);
    recordDailyStreakActivity();

    if (!completedLessonNumbers.includes(currentLesson.number)) {
      const newSessionItem: PracticeLogItem = {
        id: `log-${Date.now()}`,
        date: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        lessonNumber: currentLesson.number,
        lessonTitle: currentLesson.title,
        minutes: currentLesson.durationMinutes,
      };
      setCompletedLessonNumbers((prev) => [...prev, currentLesson.number]);
      setPracticeMinutesTotal((prev) => prev + currentLesson.durationMinutes);
      setPracticeLogs((prev) => [newSessionItem, ...prev.slice(0, 29)]);

      if (currentUser && isCloudHydrated) {
        logCloudPracticeSession(currentUser, newSessionItem).catch((err) => {
          console.error('Failed to log practice session to Firestore:', err);
        });
      }
    }

    setTimeout(() => {
      setShowCompleteCelebration(false);
      if (currentLesson.number < CURRICULUM_LESSONS.length) {
        activateLessonState(currentLesson.number + 1);
        window.scrollTo({top: 0, behavior: 'smooth'});
      }
    }, 900);
  };

  const handleToggleDifficulty = (topic: string) => {
    setKnownDifficulties((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const jumpToLesson = (lessonNum: number) => {
    activateLessonState(lessonNum);
    setActiveNav('lessons');
    setShowLessonPathBrowser(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const nextRecommendedLesson =
    CURRICULUM_LESSONS.find((l) => !completedLessonNumbers.includes(l.number)) ||
    CURRICULUM_LESSONS[0];

  const lessonGlossaryTerms = MUSICAL_GLOSSARY.filter((g) =>
    currentLesson.newTerms.includes(g.id)
  );
  const primaryGlossaryTerm = lessonGlossaryTerms[0] || MUSICAL_GLOSSARY[0];

  const {heading: lessonMainHeading, subtitle: lessonSubtitle} =
    splitLessonHeading(currentLesson.title);

  const courseCompletionPct = Math.max(
    2,
    Math.round(
      (Math.max(completedLessonNumbers.length, currentLesson.number) /
        CURRICULUM_LESSONS.length) *
        100
    )
  );

  // Build last 7 days for the Daily Practice Streak strip
  const last7DaysStrip = Array.from({length: 7}, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - idx));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const iso = `${year}-${month}-${day}`;
    const dayLabel = d.toLocaleDateString('en-US', {weekday: 'short'});
    return {
      iso,
      dayLabel,
      isToday: idx === 6,
      practiced: practicedIsoDates.includes(iso),
    };
  });

  // Four-String Divider Motif (4 parallel 2px hairlines with 4px gap)
  const renderFourStringDivider = () => (
    <div
      className="w-full max-w-[680px] mx-auto flex flex-col gap-[4px] py-2"
      aria-hidden="true"
    >
      {[0, 1, 2, 3].map((s) => (
        <div key={s} className="h-[2px] w-full bg-[#12343B]/12 rounded-full" />
      ))}
    </div>
  );

  // Render inline dotted-underline vocabulary trigger inside the first concept paragraph
  const renderParagraphWithInlineVocab = (paragraph: string, index: number) => {
    if (index !== 0 || !primaryGlossaryTerm) {
      return (
        <p
          key={index}
          className={`text-[#12343B] leading-relaxed ${
            index === 0 ? 'text-[19px] sm:text-[20px] font-medium' : 'text-[17px] sm:text-[18px]'
          } ${
            activeSoundWaveStep === index + 1
              ? 'bg-[#FFC857]/20 rounded-xl px-3 py-1.5 transition-colors duration-300'
              : ''
          }`}
        >
          {paragraph}
        </p>
      );
    }

    const regex = new RegExp(`\\b(${primaryGlossaryTerm.term}s?)\\b`, 'i');
    const match = paragraph.match(regex);

    if (!match || match.index === undefined) {
      return (
        <p
          key={index}
          className="text-[20px] font-medium text-[#12343B] leading-relaxed"
        >
          {paragraph}{' '}
          <button
            type="button"
            onClick={() =>
              setOpenTermPopoverId(
                openTermPopoverId === primaryGlossaryTerm.id
                  ? null
                  : primaryGlossaryTerm.id
              )
            }
            className="inline font-semibold text-[#12343B] border-b-2 border-dotted border-[#12343B] hover:bg-[#FFC857]/30 px-1 rounded koa-focus"
          >
            ({primaryGlossaryTerm.term})
          </button>
        </p>
      );
    }

    const before = paragraph.slice(0, match.index);
    const matchedWord = match[0];
    const after = paragraph.slice(match.index + matchedWord.length);

    return (
      <p
        key={index}
        className="text-[20px] font-medium text-[#12343B] leading-relaxed"
      >
        {before}
        <button
          type="button"
          onClick={() =>
            setOpenTermPopoverId(
              openTermPopoverId === primaryGlossaryTerm.id
                ? null
                : primaryGlossaryTerm.id
            )
          }
          className="inline font-bold text-[#12343B] border-b-2 border-dotted border-[#12343B] hover:bg-[#FFC857]/35 px-0.5 rounded transition-colors koa-focus"
        >
          {matchedWord}
        </button>
        {after}
      </p>
    );
  };

  const totalTimerSec = currentLesson.practicalExercise.recommendedSeconds || 60;
  const timerProgressFraction = timerSecondsLeft / totalTimerSec;
  const ringCircumference = 2 * Math.PI * 52;
  const ringDashOffset = ringCircumference * (1 - timerProgressFraction);

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-clip flex flex-col bg-[#FFF7E8] text-[#12343B] pb-28 md:pb-16">
      {/* Accessible Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-full focus:bg-[#12343B] focus:text-[#FFF7E8]"
      >
        Skip to main content
      </a>

      {/* ==================== 5.1 FLOATING GLASS PILL NAVIGATION (1st allowed glass surface) ==================== */}
      <div className="sticky top-2 sm:top-3 z-30 px-3 sm:px-6 pt-2 sm:pt-3">
        <header className="max-w-[1100px] mx-auto koa-glass rounded-full px-3.5 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 koa-shadow">
          {/* Wordmark on the left */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('lessons');
              setShowLessonPathBrowser(false);
            }}
            className="font-fraunces text-[18px] sm:text-[22px] font-bold tracking-tight text-[#12343B] whitespace-nowrap shrink-0 koa-focus rounded-full px-1.5 sm:px-2"
          >
            Ukulele Academy
          </a>

          {/* 4 Centered Links: Lessons, Tuner, Songbook, Progress */}
          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-8 text-[16px] font-semibold"
          >
            {(
              [
                {id: 'lessons', label: 'Lessons'},
                {id: 'tuner', label: 'Tuner'},
                {id: 'songbook', label: 'Songbook'},
                {id: 'progress', label: 'Progress'},
              ] as const
            ).map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveNav(item.id);
                    if (item.id === 'lessons') {
                      setShowLessonPathBrowser(false);
                    }
                  }}
                  className={`relative py-1 transition-colors koa-focus rounded-lg px-2 ${
                    isActive
                      ? 'text-[#12343B]'
                      : 'text-[#3F5C62] hover:text-[#12343B]'
                  }`}
                >
                  <span>{item.label}</span>
                  {/* Sunshine Fret Dot beneath active link */}
                  {isActive && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rounded-full bg-[#FFC857]"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Context Action: Browse All 44 Lessons + Account Cloud Sync */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 min-w-0">
            {activeNav === 'lessons' && (
              <button
                type="button"
                onClick={() => setShowLessonPathBrowser((v) => !v)}
                className="text-[13px] sm:text-[15px] font-semibold text-[#3F5C62] hover:text-[#12343B] transition-colors px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full hover:bg-[#12343B]/5 whitespace-nowrap koa-focus"
              >
                {showLessonPathBrowser ? (
                  <>
                    <span className="sm:hidden">← L{currentLesson.number}</span>
                    <span className="hidden sm:inline">
                      Back to Lesson {currentLesson.number}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="sm:hidden">All 44</span>
                    <span className="hidden sm:inline">All 44 lessons</span>
                  </>
                )}
              </button>
            )}

            {isAuthReady && (
              <>
                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => setActiveNav('progress')}
                    className="inline-flex items-center gap-1.5 sm:gap-2 text-[13px] sm:text-[14px] font-semibold text-[#12343B] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-[#E4EFE7] hover:bg-[#3DB9A5]/25 transition-colors whitespace-nowrap koa-focus"
                    title="Account & Cloud Synced Progress"
                  >
                    <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FF7A59] fill-current shrink-0" />
                    <span>{dailyStreakCount}d</span>
                    <span className="hidden sm:inline text-[#3F5C62]">·</span>
                    <span className="hidden sm:inline truncate max-w-[110px]">
                      {currentUser.displayName?.split(' ')[0] || 'Account'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isSigningIn}
                    className={`inline-flex items-center gap-1.5 text-[13px] sm:text-[14px] font-semibold text-[#12343B] px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-[#E4EFE7] hover:bg-[#FFC857]/60 transition-colors whitespace-nowrap koa-focus ${
                      isSigningIn ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                    title="Sign in with Google to save your streak and progress in the cloud"
                  >
                    {isSigningIn ? (
                      <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-[#12343B] border-t-transparent rounded-full animate-spin shrink-0" />
                    ) : (
                      <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#12343B] shrink-0" />
                    )}
                    <span className="sm:hidden">{isSigningIn ? 'Connecting...' : 'Sign in'}</span>
                    <span className="hidden sm:inline">{isSigningIn ? 'Connecting...' : 'Save streak'}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </header>
      </div>

      {/* Global Auth Alert Notification Banner */}
      {authErrorMsg && (
        <div className="max-w-[1100px] w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="bg-[#FF7A59]/15 border border-[#FF7A59]/35 rounded-2xl px-4 py-3 flex items-start justify-between gap-3 text-[#12343B] shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-[#FF7A59] shrink-0 mt-0.5" />
              <div className="text-[13px] sm:text-[14px] leading-relaxed">
                <span className="font-bold text-[#FF7A59]">Sign-in Alert: </span>
                <span>{authErrorMsg}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAuthErrorMsg(null)}
              className="text-[#3F5C62] hover:text-[#12343B] text-[13px] font-bold px-2 py-0.5 rounded-full hover:bg-black/5 shrink-0"
              aria-label="Dismiss error notification"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ==================== MAIN CONTENT ==================== */}
      <main
        id="main-content"
        className="flex-1 w-full max-w-[1100px] mx-auto px-4 sm:px-6 pt-6 sm:pt-8 md:pt-12 min-w-0"
      >
        {/* ==================== DESTINATION 1: LESSONS (LESSON PAGE OR 44-LESSON PATH) ==================== */}
        {activeNav === 'lessons' && !showLessonPathBrowser && (
          <div>
            {/* ==================== 5.2 LESSON HEADER ==================== */}
            <header className="max-w-[680px] mx-auto mb-8 md:mb-10">
              {/* Previous lesson small text link above eyebrow (hidden on Lesson 1) */}
              {currentLesson.number > 1 && (
                <button
                  type="button"
                  onClick={() => jumpToLesson(currentLesson.number - 1)}
                  className="mb-2 inline-block text-[15px] font-semibold text-[#3F5C62] hover:text-[#12343B] underline underline-offset-4 koa-focus rounded"
                >
                  ← Previous lesson
                </button>
              )}

              {/* Eyebrow in Figtree 14px/600, Ink Soft #3F5C62 */}
              <div className="text-[14px] font-semibold text-[#3F5C62]">
                Stage {currentLesson.stageId} · Lesson {currentLesson.number} of{' '}
                {CURRICULUM_LESSONS.length} · {currentLesson.durationMinutes} min
              </div>

              {/* H1 Fraunces 48-56px desktop / 34px mobile */}
              <h1 className="font-fraunces text-[34px] md:text-[52px] font-bold text-[#12343B] leading-[1.1] tracking-tight mt-2">
                {lessonMainHeading}
              </h1>

              {lessonSubtitle && (
                <p className="font-fraunces text-[22px] md:text-[28px] font-semibold text-[#3F5C62] leading-snug mt-1">
                  {lessonSubtitle}
                </p>
              )}

              {/* One-sentence objective (20 words max) */}
              <p className="text-[18px] text-[#3F5C62] mt-3 leading-relaxed">
                {formatShortObjective(currentLesson)}
              </p>

              {/* Four-String Progress Meter directly under objective */}
              <div
                className="mt-5 flex flex-col gap-[4px]"
                role="progressbar"
                aria-valuenow={currentLesson.number}
                aria-valuemin={1}
                aria-valuemax={CURRICULUM_LESSONS.length}
                aria-label={`Lesson ${currentLesson.number} of ${CURRICULUM_LESSONS.length}`}
              >
                {[0, 1, 2, 3].map((strIdx) => (
                  <div
                    key={strIdx}
                    className="h-[2px] w-full bg-[#12343B]/12 rounded-full overflow-hidden"
                  >
                    <div
                      className="h-full bg-[#FFC857] transition-all duration-500"
                      style={{width: `${courseCompletionPct}%`}}
                    />
                  </div>
                ))}
              </div>
            </header>

            {/* ==================== 5.3 STAGE: THE HERO ==================== */}
            <section aria-label="Interactive Ukulele Stage">
              <InteractiveUkuleleStage
                key={currentLesson.id}
                lesson={currentLesson}
                activityCount={currentActivityCount}
                onRecordActivity={handleRecordActivity}
                externalChordId={externalChordId}
                onSelectChordExternal={(chordId) => setExternalChordId(chordId)}
                onHotspotSelectChange={(partName) => setSelectedHotspotName(partName)}
              />
            </section>

            {/* Section Spacing: 72px mobile / 120px desktop */}
            <div className="my-[72px] md:my-[120px]">
              {renderFourStringDivider()}
            </div>

            {/* ==================== 5.4 HOW IT WORKS (CONCEPT) ==================== */}
            <section
              ref={conceptSectionRef}
              className="max-w-[680px] mx-auto space-y-6"
            >
              <h2 className="font-fraunces text-[26px] md:text-[32px] font-bold text-[#12343B] leading-tight">
                How your ukulele makes sound
              </h2>

              {/* Interactive Sound Path Visual: String -> Bridge -> Body -> Soundhole -> Ear */}
              <div
                className="py-4 px-2.5 sm:py-5 sm:px-4 rounded-[24px] bg-[#E4EFE7]/65 grid grid-cols-5 sm:flex sm:items-center sm:justify-between gap-1 sm:gap-2 w-full"
                aria-label="Sound travel path from string to ear"
              >
                {(
                  [
                    {label: 'String', icon: Waves},
                    {label: 'Bridge', icon: Radio},
                    {label: 'Body', icon: Music},
                    {label: 'Soundhole', icon: Sparkles},
                    {label: 'Ear', icon: Ear},
                  ] as const
                ).map((node, idx) => {
                  const IconComponent = node.icon;
                  const isLit = activeSoundWaveStep >= idx;
                  return (
                    <React.Fragment key={node.label}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSoundWaveStep(idx);
                          ukuleleAudio.playString(
                            ((idx % 4) + 1) as 1 | 2 | 3 | 4,
                            0
                          );
                        }}
                        className="flex flex-col items-center gap-1 sm:gap-1.5 min-w-0 sm:min-w-[72px] koa-focus rounded-xl p-1 sm:p-1.5"
                      >
                        <span
                          className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-300 ${
                            isLit
                              ? 'bg-[#FFC857] text-[#12343B] scale-105 shadow-xs'
                              : 'bg-[#FFF7E8] text-[#3F5C62]'
                          }`}
                        >
                          <IconComponent className="w-4 h-4 sm:w-5 sm:h-5" />
                        </span>
                        <span className="text-[11px] sm:text-[14px] font-semibold text-[#12343B] truncate max-w-full">
                          {node.label}
                        </span>
                      </button>

                      {idx < 4 && (
                        <div
                          className={`hidden sm:block h-[2px] flex-1 min-w-[12px] transition-colors duration-300 ${
                            activeSoundWaveStep > idx
                              ? 'bg-[#3DB9A5]'
                              : 'bg-[#12343B]/15'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Three Short Concept Paragraphs with Inline Vocabulary Popover */}
              <div className="space-y-4">
                {currentLesson.plainExplanation.map((para, idx) =>
                  renderParagraphWithInlineVocab(para, idx)
                )}
              </div>

              {/* Inline Vocabulary Popover when term is clicked */}
              {openTermPopoverId && primaryGlossaryTerm && (
                <div
                  role="region"
                  aria-label={`Definition of ${primaryGlossaryTerm.term}`}
                  className="p-5 rounded-[24px] bg-[#FFFCF5] koa-shadow space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-fraunces text-[20px] font-bold text-[#12343B]">
                      {primaryGlossaryTerm.term}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenTermPopoverId(null)}
                      className="text-[14px] font-semibold text-[#3F5C62] hover:text-[#12343B] koa-focus rounded px-2"
                    >
                      Close
                    </button>
                  </div>
                  <p className="text-[16px] text-[#12343B]">
                    {primaryGlossaryTerm.plainDefinition}
                  </p>
                  <p className="text-[15px] text-[#3F5C62]">
                    <strong className="text-[#12343B]">Everyday analogy:</strong>{' '}
                    {primaryGlossaryTerm.everydayAnalogy}
                  </p>
                </div>
              )}

              {/* Ghost link "Explain it simpler" opens Koa drawer prefilled */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setTutorPrefilledPrompt(
                      `Can you explain "${currentLesson.title}" even simpler using a quick everyday analogy?`
                    );
                    setIsTutorOpen(true);
                  }}
                  className="text-[16px] font-semibold text-[#3F5C62] hover:text-[#12343B] underline underline-offset-4 transition-colors koa-focus rounded py-1"
                >
                  Explain it simpler →
                </button>
              </div>
            </section>

            {/* Section Spacing */}
            <div className="my-[72px] md:my-[120px]">
              {renderFourStringDivider()}
            </div>

            {/* ==================== 5.5 HOLD IT (POSTURE: 3 EQUAL TILES IN A ROW) ==================== */}
            <section className="max-w-[920px] mx-auto space-y-8">
              <div className="max-w-[680px] mx-auto">
                <h2 className="font-fraunces text-[26px] md:text-[32px] font-bold text-[#12343B] leading-tight">
                  Hold it with zero tension
                </h2>
                <p className="text-[18px] text-[#3F5C62] mt-2">
                  Cradle the ukulele lightly against your body so your fingers stay free to move.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    num: '1',
                    title: 'Right forearm cradle',
                    sentence:
                      'Hug the lower curve of the black body gently against your chest with your right forearm.',
                    icon: Hand,
                  },
                  {
                    num: '2',
                    title: '10-o’clock neck angle',
                    sentence:
                      'Tilt the headstock slightly upward toward your left shoulder so your wrist stays relaxed.',
                    icon: Compass,
                  },
                  {
                    num: '3',
                    title: 'Relaxed thumb pad',
                    sentence:
                      'Rest your left thumb pad lightly behind the neck with a small breathing gap under your palm.',
                    icon: Sparkles,
                  },
                ].map((tile) => {
                  const TileIcon = tile.icon;
                  return (
                    <div
                      key={tile.num}
                      className="rounded-[24px] bg-[#FFFCF5] p-6 koa-shadow flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-fraunces text-[36px] font-bold text-[#12343B] leading-none">
                          {tile.num}
                        </span>
                        <TileIcon className="w-6 h-6 text-[#3F5C62]" />
                      </div>
                      <div>
                        <h3 className="text-[19px] font-bold text-[#12343B]">
                          {tile.title}
                        </h3>
                        <p className="text-[16px] text-[#3F5C62] mt-1.5 leading-relaxed">
                          {tile.sentence}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section Spacing */}
            <div className="my-[72px] md:my-[120px]">
              {renderFourStringDivider()}
            </div>

            {/* ==================== 5.6 TRY IT (HANDS-ON EXERCISE & 1-MINUTE TIMER) ==================== */}
            <section className="max-w-[680px] mx-auto space-y-8">
              <div>
                <h2 className="font-fraunces text-[26px] md:text-[32px] font-bold text-[#12343B] leading-tight">
                  {currentLesson.practicalExercise.title}
                </h2>
                <p className="text-[18px] text-[#3F5C62] mt-2">
                  Try these three steps right now with your ukulele in your hands.
                </p>
              </div>

              {/* Numbered List with Large Fraunces Numerals */}
              <ol className="space-y-6">
                {currentLesson.practicalExercise.steps.map((stepText, idx) => (
                  <li key={idx} className="flex items-start gap-5">
                    <span className="font-fraunces text-[32px] font-bold text-[#12343B] leading-none pt-1 shrink-0">
                      {idx + 1}
                    </span>
                    <p className="text-[18px] text-[#12343B] leading-relaxed">
                      {stepText}
                    </p>
                  </li>
                ))}
              </ol>

              {/* 1-Minute Practice Timer: Outlined Button or DM Mono 40px Draining Ring */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-6">
                {!isTimerRunning && !timerFinishedOnce && (
                  <button
                    type="button"
                    onClick={() => {
                      setTimerSecondsLeft(totalTimerSec);
                      setIsTimerRunning(true);
                      handleRecordActivity('Started 1-minute timer');
                    }}
                    className="px-7 py-3.5 rounded-full border-2 border-[#12343B] text-[#12343B] hover:bg-[#12343B] hover:text-[#FFF7E8] text-[17px] font-bold transition-colors min-h-[52px] w-fit koa-focus"
                  >
                    Start 1-minute timer
                  </button>
                )}

                {isTimerRunning && (
                  <div className="flex items-center gap-6">
                    <div className="relative w-32 h-32 flex items-center justify-center">
                      <svg
                        viewBox="0 0 120 120"
                        className="w-full h-full -rotate-90"
                      >
                        <circle
                          cx="60"
                          cy="60"
                          r="52"
                          fill="none"
                          stroke="rgba(18, 52, 59, 0.14)"
                          strokeWidth="5"
                        />
                        <circle
                          cx="60"
                          cy="60"
                          r="52"
                          fill="none"
                          stroke="#FFC857"
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={ringCircumference}
                          strokeDashoffset={ringDashOffset}
                          className="transition-all duration-700"
                        />
                      </svg>
                      <span className="absolute font-dm-mono text-[40px] font-medium text-[#12343B]">
                        {timerSecondsLeft}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsTimerRunning(false)}
                      className="px-5 py-2.5 rounded-full border border-[#12343B]/30 text-[15px] font-semibold text-[#3F5C62] hover:text-[#12343B] koa-focus"
                    >
                      Pause
                    </button>
                  </div>
                )}

                {timerFinishedOnce && !isTimerRunning && (
                  <div className="inline-flex items-center gap-3 px-5 py-3 rounded-full bg-[#E4EFE7] text-[#12343B]">
                    <span className="w-7 h-7 rounded-full bg-[#3DB9A5] flex items-center justify-center">
                      <Check className="w-4 h-4 text-[#12343B] stroke-[3]" />
                    </span>
                    <span className="text-[18px] font-bold">
                      Nice, you felt it.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTimerFinishedOnce(false);
                        setTimerSecondsLeft(totalTimerSec);
                      }}
                      className="ml-2 text-[14px] font-semibold text-[#3F5C62] underline koa-focus rounded"
                    >
                      Restart
                    </button>
                  </div>
                )}
              </div>

              {/* Single Collapsed Row: "Sounds quiet or muffled?" (No nested boxes) */}
              <div className="pt-4 border-t border-[#12343B]/12">
                <button
                  type="button"
                  onClick={() => setIsMistakeExpanded((v) => !v)}
                  className="w-full py-2 flex items-center justify-between text-left text-[17px] font-semibold text-[#12343B] koa-focus rounded-lg"
                >
                  <span>Sounds quiet or muffled?</span>
                  {isMistakeExpanded ? (
                    <ChevronUp className="w-5 h-5 text-[#3F5C62]" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-[#3F5C62]" />
                  )}
                </button>

                {isMistakeExpanded && (
                  <div className="mt-4 space-y-4 text-[17px] text-[#12343B] leading-relaxed">
                    <p>
                      <strong className="font-bold">Watch out for: </strong>
                      <span className="text-[#3F5C62]">
                        {currentLesson.commonMistake.symptom}
                      </span>
                    </p>
                    <p>
                      <strong className="font-bold">Why it happens: </strong>
                      <span className="text-[#3F5C62]">
                        {currentLesson.commonMistake.whyItHappens}
                      </span>
                    </p>
                    <div className="pl-4 border-l-4 border-[#3DB9A5]">
                      <strong className="font-bold block">
                        Teacher’s quick fix
                      </strong>
                      <span>{currentLesson.commonMistake.quickFix}</span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Section Spacing */}
            <div className="my-[72px] md:my-[120px]">
              {renderFourStringDivider()}
            </div>

            {/* ==================== 5.7 CHECK (QUIZ) ==================== */}
            <section className="max-w-[680px] mx-auto space-y-6">
              <h2 className="font-fraunces text-[28px] font-bold text-[#12343B] leading-snug">
                {currentLesson.checkpoint.question}
              </h2>

              {/* Four Answer Tiles on Paper #FFFCF5 Surface */}
              <div className="space-y-3.5">
                {currentLesson.checkpoint.options.map((optionText, idx) => {
                  const isSelected = selectedCheckpointOption === idx;
                  const isCorrect = idx === currentLesson.checkpoint.correctIndex;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectCheckpointOption(idx)}
                      className={`relative w-full min-h-[56px] p-4 sm:p-5 rounded-[24px] text-left text-[18px] transition-all flex items-center justify-between gap-4 koa-focus ${
                        isSelected
                          ? isCorrect
                            ? 'bg-[#3DB9A5] text-[#12343B] font-bold border-2 border-[#12343B] koa-shadow'
                            : 'bg-[#FFC857]/35 text-[#12343B] font-medium border-2 border-[#12343B]'
                          : 'bg-[#FFFCF5] text-[#12343B] border-2 border-[#12343B]/20 hover:-translate-y-[2px] koa-shadow'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        {/* Radio / Tick indicator */}
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 ${
                            isSelected
                              ? 'border-[#12343B] bg-[#12343B] text-[#FFF7E8]'
                              : 'border-[#12343B]/40'
                          }`}
                        >
                          {isSelected && isCorrect ? (
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          ) : isSelected ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-[#FFC857]" />
                          ) : null}
                        </span>
                        <span>{optionText}</span>
                      </div>

                      {/* Sunburst Ring Burst on Correct Tile */}
                      {isSelected && isCorrect && showQuizSunburst && (
                        <svg
                          viewBox="-30 -30 60 60"
                          className="w-12 h-12 animate-sunburst-burst pointer-events-none shrink-0"
                          aria-hidden="true"
                        >
                          {Array.from({length: 12}, (_, i) => (
                            <polygon
                              key={i}
                              points="0,-24 -3,-18 3,-18"
                              fill="#12343B"
                              transform={`rotate(${i * 30})`}
                            />
                          ))}
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Feedback Message (Never Red, Never "Wrong") */}
              {selectedCheckpointOption !== null && (
                <div
                  className={`p-5 rounded-[24px] text-[17px] leading-relaxed ${
                    selectedCheckpointOption ===
                    currentLesson.checkpoint.correctIndex
                      ? 'bg-[#E4EFE7] text-[#12343B]'
                      : 'bg-[#FFC857]/30 text-[#12343B]'
                  }`}
                >
                  {selectedCheckpointOption ===
                  currentLesson.checkpoint.correctIndex ? (
                    <p>{currentLesson.checkpoint.explanation}</p>
                  ) : (
                    <p>
                      <strong className="font-bold">
                        Close. Look at the soundhole again.{' '}
                      </strong>
                      {currentLesson.checkpoint.hint}
                    </p>
                  )}
                </div>
              )}

              {/* Quiet Text Links: "Need a hint?" and "Mark Tricky" */}
              <div className="flex items-center justify-between pt-2 text-[15px]">
                <button
                  type="button"
                  onClick={() => setShowCheckpointHint((v) => !v)}
                  className="font-semibold text-[#3F5C62] hover:text-[#12343B] underline underline-offset-4 koa-focus rounded py-1"
                >
                  {showCheckpointHint ? 'Hide hint' : 'Need a hint?'}
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleDifficulty(currentLesson.title)}
                  className="font-semibold text-[#3F5C62] hover:text-[#12343B] underline underline-offset-4 koa-focus rounded py-1"
                >
                  {knownDifficulties.includes(currentLesson.title)
                    ? 'Marked tricky ✓'
                    : 'Mark tricky'}
                </button>
              </div>

              {showCheckpointHint && (
                <p className="text-[16px] text-[#3F5C62] leading-relaxed">
                  {currentLesson.checkpoint.hint}
                </p>
              )}
            </section>

            {/* Section Spacing */}
            <div className="my-[72px] md:my-[120px]">
              {renderFourStringDivider()}
            </div>

            {/* ==================== 5.8 COMPLETE (THE SINGLE CORAL ELEMENT WHEN UNLOCKED) ==================== */}
            <section className="max-w-[680px] mx-auto text-center space-y-4">
              <div className="relative inline-block w-full sm:w-auto">
                <button
                  type="button"
                  disabled={!canMarkLessonComplete}
                  onClick={handleCompleteLesson}
                  className={`w-full sm:w-auto px-5 sm:px-8 py-4 rounded-full text-[16px] sm:text-[18px] font-bold flex items-center justify-center gap-2.5 sm:gap-3 min-h-[56px] transition-all koa-focus ${
                    canMarkLessonComplete
                      ? 'bg-[#FF7A59] hover:bg-[#F26A47] text-[#12343B] koa-shadow scale-100 hover:scale-[1.02]'
                      : 'bg-[#E4EFE7] text-[#12343B]/65 cursor-not-allowed'
                  }`}
                >
                  {!canMarkLessonComplete && <Lock className="w-5 h-5 shrink-0" />}
                  <span>Complete lesson and continue</span>
                </button>

                {showCompleteCelebration && (
                  <svg
                    viewBox="-40 -40 80 80"
                    className="absolute inset-0 m-auto w-24 h-24 animate-sunburst-burst pointer-events-none"
                    aria-hidden="true"
                  >
                    {Array.from({length: 16}, (_, i) => (
                      <polygon
                        key={i}
                        points="0,-34 -3.5,-26 3.5,-26"
                        fill="#FFC857"
                        transform={`rotate(${i * 22.5})`}
                      />
                    ))}
                  </svg>
                )}
              </div>

              {/* Unlock status line with two small dots (Explore, Check) */}
              <div className="flex flex-wrap items-center justify-center gap-4 text-[15px] text-[#3F5C62]">
                <span>
                  {canMarkLessonComplete
                    ? `Ready for Lesson ${Math.min(CURRICULUM_LESSONS.length, currentLesson.number + 1)}`
                    : 'Do the activity and the quiz to unlock'}
                </span>

                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        hasAttemptedActivity
                          ? 'bg-[#3DB9A5]'
                          : 'bg-[#12343B]/20'
                      }`}
                    />
                    <span className="text-[#12343B] font-medium">Explore</span>
                  </span>

                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        hasPassedCheckpoint
                          ? 'bg-[#3DB9A5]'
                          : 'bg-[#12343B]/20'
                      }`}
                    />
                    <span className="text-[#12343B] font-medium">Check</span>
                  </span>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ==================== 44-LESSON PATH BROWSER (INSIDE LESSONS) ==================== */}
        {activeNav === 'lessons' && showLessonPathBrowser && (
          <div className="space-y-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div className="text-[14px] font-semibold text-[#3F5C62]">
                  8 Stages · 44 Progressive Lessons
                </div>
                <h1 className="font-fraunces text-[34px] md:text-[48px] font-bold text-[#12343B] mt-1">
                  Your learning path
                </h1>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStageFilter('all')}
                  className={`px-4 py-2 rounded-full text-[15px] font-semibold koa-focus ${
                    selectedStageFilter === 'all'
                      ? 'bg-[#12343B] text-[#FFF7E8]'
                      : 'bg-[#E4EFE7] text-[#12343B]'
                  }`}
                >
                  All stages
                </button>
                {CURRICULUM_STAGES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStageFilter(st.id)}
                    className={`px-3.5 py-2 rounded-full text-[15px] font-semibold koa-focus ${
                      selectedStageFilter === st.id
                        ? 'bg-[#12343B] text-[#FFF7E8]'
                        : 'bg-[#E4EFE7] text-[#12343B]'
                    }`}
                  >
                    Stage {st.id}
                  </button>
                ))}
              </div>
            </div>

            {CURRICULUM_STAGES.filter(
              (st) => selectedStageFilter === 'all' || selectedStageFilter === st.id
            ).map((stage) => {
              const stageLessons = CURRICULUM_LESSONS.filter(
                (l) => l.stageId === stage.id
              );
              return (
                <section key={stage.id} className="space-y-4">
                  <div>
                    <div className="text-[14px] font-semibold text-[#3F5C62]">
                      {stage.milestoneBadge}
                    </div>
                    <h2 className="font-fraunces text-[26px] font-bold text-[#12343B]">
                      {stage.title}
                    </h2>
                    <p className="text-[16px] text-[#3F5C62]">{stage.subtitle}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stageLessons.map((lesson) => {
                      const isDone = completedLessonNumbers.includes(lesson.number);
                      const isCurrent = currentLessonNumber === lesson.number;
                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => jumpToLesson(lesson.number)}
                          className={`p-5 rounded-[24px] bg-[#FFFCF5] text-left koa-shadow transition-all flex flex-col justify-between gap-3 koa-focus ${
                            isCurrent
                              ? 'ring-2 ring-[#12343B]'
                              : 'hover:-translate-y-0.5'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between text-[14px] font-semibold text-[#3F5C62]">
                              <span>
                                Lesson {lesson.number} · {lesson.durationMinutes} min
                              </span>
                              {isDone && (
                                <span className="w-6 h-6 rounded-full bg-[#3DB9A5] flex items-center justify-center">
                                  <Check className="w-3.5 h-3.5 text-[#12343B] stroke-[3]" />
                                </span>
                              )}
                            </div>
                            <h3 className="font-fraunces text-[20px] font-bold text-[#12343B] mt-1">
                              {lesson.title}
                            </h3>
                            <p className="text-[15px] text-[#3F5C62] mt-1 line-clamp-2">
                              {lesson.objective}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* ==================== DESTINATION 2: TUNER & CHORD STUDIO ==================== */}
        {activeNav === 'tuner' && (
          <div className="space-y-16">
            <UkuleleTuner />

            {renderFourStringDivider()}

            <AiChordSuggester
              onSelectChordOnFretboard={(chordId) => {
                setExternalChordId(chordId);
              }}
            />
          </div>
        )}

        {/* ==================== DESTINATION 3: SONGBOOK ==================== */}
        {activeNav === 'songbook' && (
          <div className="space-y-10">
            <div>
              <div className="text-[14px] font-semibold text-[#3F5C62]">
                Beginner Ukulele Songbook
              </div>
              <h1 className="font-fraunces text-[34px] md:text-[48px] font-bold text-[#12343B] mt-1">
                Play real songs
              </h1>
              <p className="text-[18px] text-[#3F5C62] mt-1">
                Tap any measure to hear its chord, or open the song on the interactive stage.
              </p>
            </div>

            <div className="space-y-8">
              {BEGINNER_SONGBOOK.map((song) => {
                const pattern =
                  STRUMMING_PATTERNS[song.strummingPatternId] ||
                  STRUMMING_PATTERNS['down-4'];
                return (
                  <section
                    key={song.id}
                    className="rounded-[32px] p-6 sm:p-8 koa-shadow space-y-5"
                    style={{
                      background:
                        'linear-gradient(180deg, #E4EFE7 0%, #FFF7E8 100%)',
                    }}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="text-[14px] font-semibold text-[#3F5C62]">
                          Stage {song.stageUnlocked} · Chords:{' '}
                          <span className="font-dm-mono">
                            {song.chordsUsed.join(', ')}
                          </span>
                        </div>
                        <h2 className="font-fraunces text-[26px] font-bold text-[#12343B] mt-0.5">
                          {song.title}
                        </h2>
                        <p className="text-[16px] text-[#3F5C62] mt-1">
                          {song.description} · Strum: {pattern.subtitle}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const matchingLesson = CURRICULUM_LESSONS.find(
                            (l) => l.visualConfig.songId === song.id
                          );
                          jumpToLesson(matchingLesson ? matchingLesson.number : 19);
                        }}
                        className="px-6 py-3 rounded-full bg-[#12343B] text-[#FFF7E8] text-[15px] font-semibold shrink-0 min-h-[48px] koa-focus"
                      >
                        Open in stage →
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                      {song.measures.map((m, idx) => {
                        const chordObj = CHORD_LIBRARY[m.chord] || CHORD_LIBRARY.C;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => ukuleleAudio.strumChord(chordObj.frets, 'D')}
                            className="p-4 rounded-[24px] bg-[#FFFCF5] text-left koa-shadow hover:-translate-y-0.5 transition-all koa-focus"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-dm-mono text-[14px] font-bold px-2.5 py-0.5 rounded-full bg-[#FFC857] text-[#12343B]">
                                {m.chord} ({chordObj.frets.join('-')})
                              </span>
                              <span className="font-dm-mono text-[14px] text-[#3F5C62]">
                                {m.beats} beats
                              </span>
                            </div>
                            <div className="text-[17px] font-medium text-[#12343B]">
                              {m.lyrics}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== DESTINATION 4: PROGRESS & DAILY PRACTICE STREAK ==================== */}
        {activeNav === 'progress' && (
          <div className="space-y-12">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <div className="text-[14px] font-semibold text-[#3F5C62]">
                  Your Musical Journey
                </div>
                <h1 className="font-fraunces text-[34px] md:text-[48px] font-bold text-[#12343B] mt-1">
                  Daily streak &amp; progress
                </h1>
              </div>

              {/* Account & Cloud Database Sync Bar */}
              <div className="p-4 rounded-[24px] bg-[#FFFCF5] koa-shadow flex flex-wrap items-center justify-between gap-4">
                {currentUser ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#3DB9A5]/25 text-[#12343B] font-fraunces font-bold text-[18px] flex items-center justify-center">
                        {(currentUser.displayName || currentUser.email || 'U')
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="text-[15px] font-bold text-[#12343B] flex items-center gap-2">
                          <span>
                            {currentUser.displayName || 'Ukulele Learner'}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[13px] font-semibold px-2.5 py-0.5 rounded-full bg-[#3DB9A5]/20 text-[#12343B]">
                            <Cloud className="w-3.5 h-3.5 text-[#3DB9A5]" />
                            {cloudSyncStatus === 'syncing'
                              ? 'Syncing...'
                              : cloudSyncStatus === 'error'
                                ? 'Sync error'
                                : 'Cloud synced'}
                          </span>
                        </div>
                        <div className="text-[14px] text-[#3F5C62]">
                          {currentUser.email || 'Connected to Firebase Cloud DB'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#E4EFE7] hover:bg-[#12343B]/10 text-[#12343B] text-[14px] font-semibold transition-colors koa-focus"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign out</span>
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                    <div>
                      <div className="text-[16px] font-bold text-[#12343B]">
                        Back up your streak &amp; lessons across devices
                      </div>
                      <p className="text-[14px] text-[#3F5C62]">
                        Sign in with your Google account to save your daily streak, completed lessons, and practice logs to the cloud database.
                      </p>
                      {authErrorMsg && (
                        <p className="text-[14px] font-semibold text-[#FF7A59] mt-1">
                          {authErrorMsg}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isSigningIn}
                      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#12343B] text-[#FFF7E8] text-[15px] font-semibold shrink-0 min-h-[44px] koa-focus ${
                        isSigningIn ? 'opacity-70 cursor-not-allowed' : ''
                      }`}
                    >
                      {isSigningIn ? (
                        <div className="w-4 h-4 border-2 border-[#FFF7E8] border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : (
                        <LogIn className="w-4 h-4" />
                      )}
                      <span>{isSigningIn ? 'Connecting to Google...' : 'Sign in with Google'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* GAMIFIED DAILY PRACTICE STREAK HERO CARD */}
            <section
              className="rounded-[32px] p-6 sm:p-8 koa-shadow flex flex-col lg:flex-row lg:items-center justify-between gap-8"
              style={{
                background: 'linear-gradient(180deg, #E4EFE7 0%, #FFF7E8 100%)',
              }}
              aria-label="Daily Practice Streak"
            >
              <div className="space-y-3 max-w-xl">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FFFCF5] text-[14px] font-semibold text-[#12343B]">
                  <Flame className="w-4 h-4 text-[#FF7A59] fill-current" />
                  <span>Daily Practice Streak</span>
                </div>

                <div className="flex items-baseline gap-4">
                  <span className="font-fraunces text-[48px] sm:text-[56px] font-bold text-[#12343B] leading-none">
                    {dailyStreakCount} {dailyStreakCount === 1 ? 'day' : 'days'}
                  </span>
                  <span className="text-[16px] font-semibold text-[#3F5C62]">
                    Best streak: {bestStreakCount}{' '}
                    {bestStreakCount === 1 ? 'day' : 'days'}
                  </span>
                </div>

                <p className="text-[18px] text-[#12343B]">
                  Even five minutes a day builds lasting finger memory. Pluck a string, run a 1-minute timer, or complete a lesson to keep your streak glowing.
                </p>
              </div>

              {/* 7-Day Streak Calendar Strip */}
              <div className="flex flex-col items-stretch sm:items-start lg:items-end gap-4 w-full lg:w-auto">
                <div className="grid grid-cols-7 gap-1.5 sm:gap-3 w-full">
                  {last7DaysStrip.map((dayItem) => (
                    <div
                      key={dayItem.iso}
                      className="flex flex-col items-center gap-1.5 sm:gap-2 bg-[#FFFCF5] px-1.5 py-2.5 sm:px-3 sm:py-3 rounded-[16px] sm:rounded-[20px] koa-shadow min-w-0"
                    >
                      <span className="text-[11px] sm:text-[14px] font-semibold text-[#3F5C62] truncate max-w-full">
                        {dayItem.dayLabel}
                      </span>
                      <span
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center ${
                          dayItem.practiced
                            ? 'bg-[#3DB9A5] text-[#12343B]'
                            : dayItem.isToday
                              ? 'bg-[#FFC857] text-[#12343B]'
                              : 'bg-[#E4EFE7] text-[#3F5C62]'
                        }`}
                        aria-label={
                          dayItem.practiced ? 'Practiced' : 'Not yet practiced'
                        }
                      >
                        {dayItem.practiced ? (
                          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-[#12343B]/30" />
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => jumpToLesson(nextRecommendedLesson.number)}
                  className="w-full sm:w-auto text-center px-6 py-3 rounded-full bg-[#FF7A59] hover:bg-[#F26A47] text-[#12343B] text-[16px] font-bold transition-colors koa-focus"
                >
                  Continue Lesson {nextRecommendedLesson.number} →
                </button>
              </div>
            </section>

            {/* 3 Clean Progress Summary Tiles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-[24px] bg-[#FFFCF5] koa-shadow">
                <div className="text-[15px] font-semibold text-[#3F5C62]">
                  Lessons completed
                </div>
                <div className="font-fraunces text-[36px] font-bold text-[#12343B] mt-1">
                  {completedLessonNumbers.length} of {CURRICULUM_LESSONS.length}
                </div>
                <p className="text-[15px] text-[#3F5C62] mt-1">
                  {Math.round(
                    (completedLessonNumbers.length / CURRICULUM_LESSONS.length) *
                      100
                  )}
                  % of curriculum finished
                </p>
              </div>

              <div className="p-6 rounded-[24px] bg-[#FFFCF5] koa-shadow">
                <div className="text-[15px] font-semibold text-[#3F5C62]">
                  Practice time
                </div>
                <div className="font-fraunces text-[36px] font-bold text-[#12343B] mt-1">
                  {practiceMinutesTotal} min
                </div>
                <p className="text-[15px] text-[#3F5C62] mt-1">
                  Logged across lessons and 1-minute timers
                </p>
              </div>

              <div className="p-6 rounded-[24px] bg-[#FFFCF5] koa-shadow">
                <div className="text-[15px] font-semibold text-[#3F5C62]">
                  Marked for review
                </div>
                <div className="font-fraunces text-[36px] font-bold text-[#12343B] mt-1">
                  {knownDifficulties.length}
                </div>
                <p className="text-[15px] text-[#3F5C62] mt-1">
                  {knownDifficulties.length === 0
                    ? 'No tricky lessons flagged yet'
                    : knownDifficulties.join(', ')}
                </p>
              </div>
            </div>

            {/* Stage Badges */}
            <section className="space-y-4">
              <h2 className="font-fraunces text-[26px] font-bold text-[#12343B]">
                Stage milestones
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {CURRICULUM_STAGES.map((stage) => {
                  const stageLessons = CURRICULUM_LESSONS.filter(
                    (l) => l.stageId === stage.id
                  );
                  const doneCount = stageLessons.filter((l) =>
                    completedLessonNumbers.includes(l.number)
                  ).length;
                  const isUnlocked = doneCount === stageLessons.length;

                  return (
                    <div
                      key={stage.id}
                      className={`p-5 rounded-[24px] koa-shadow ${
                        isUnlocked ? 'bg-[#3DB9A5]/25' : 'bg-[#FFFCF5]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Award className="w-5 h-5 text-[#12343B]" />
                        <span className="text-[14px] font-semibold text-[#3F5C62]">
                          {doneCount}/{stageLessons.length}
                        </span>
                      </div>
                      <div className="font-fraunces text-[19px] font-bold text-[#12343B]">
                        {stage.milestoneBadge}
                      </div>
                      <div className="text-[15px] text-[#3F5C62] mt-0.5">
                        {stage.title}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Recent Practice Sessions Log (Synced with Firestore /learners/{uid}/sessions) */}
            <section className="space-y-4">
              <h2 className="font-fraunces text-[26px] font-bold text-[#12343B]">
                Recent practice sessions
              </h2>
              {practiceLogs.length === 0 ? (
                <div className="p-6 rounded-[24px] bg-[#FFFCF5] koa-shadow text-[16px] text-[#3F5C62]">
                  Complete your first lesson to log a practice session here.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {practiceLogs.slice(0, 8).map((log) => (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => jumpToLesson(log.lessonNumber)}
                      className="p-5 rounded-[24px] bg-[#FFFCF5] koa-shadow text-left flex items-center justify-between gap-4 hover:-translate-y-0.5 transition-all koa-focus"
                    >
                      <div>
                        <div className="text-[14px] font-semibold text-[#3F5C62]">
                          Lesson {log.lessonNumber} · {log.date}
                        </div>
                        <div className="font-fraunces text-[18px] font-bold text-[#12343B] mt-0.5">
                          {log.lessonTitle}
                        </div>
                      </div>
                      <span className="font-dm-mono text-[14px] font-bold px-3 py-1 rounded-full bg-[#E4EFE7] text-[#12343B] shrink-0">
                        {log.minutes} min
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* ==================== 5.9 FLOATING KOA TUTOR BUTTON & DRAWER ==================== */}
      <AiUkuleleTutor
        lesson={currentLesson}
        completedLessonNumbers={completedLessonNumbers}
        knownDifficulties={knownDifficulties}
        activityCount={currentActivityCount}
        selectedHotspotName={selectedHotspotName}
        wrongQuizAnswerText={wrongQuizAnswerText}
        isOpen={isTutorOpen}
        onOpen={() => setIsTutorOpen(true)}
        onClose={() => setIsTutorOpen(false)}
        prefilledPrompt={tutorPrefilledPrompt}
        onClearPrefilledPrompt={() => setTutorPrefilledPrompt(null)}
      />

      {/* ==================== DEVELOPER ATTRIBUTION FOOTER ==================== */}
      <footer className="w-full max-w-[1100px] mx-auto px-4 sm:px-6 mt-24 pt-8 pb-6 border-t border-[#12343B]/12 flex flex-col sm:flex-row items-center justify-between gap-3 text-[15px] text-[#3F5C62]">
        <div className="flex items-center gap-2">
          <span className="font-fraunces font-bold text-[#12343B]">
            Ukulele Academy
          </span>
        </div>
        <div>
          Designed and Developed by{' '}
          <a
            href="https://wa.me/918102783645"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-[#12343B] underline underline-offset-4 decoration-[#FFC857] decoration-2 hover:bg-[#FFC857]/30 px-1 rounded transition-colors koa-focus"
            title="Chat with Utkarsh on WhatsApp (8102783645)"
          >
            Utkarsh
          </a>
        </div>
      </footer>

      {/* ==================== MOBILE GLASS BOTTOM TAB BAR (4 ITEMS) ==================== */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 koa-glass grid grid-cols-4 items-center h-16 px-2 pb-[env(safe-area-inset-bottom)]"
      >
        {(
          [
            {id: 'lessons', label: 'Lessons', icon: BookOpen},
            {id: 'tuner', label: 'Tuner', icon: Compass},
            {id: 'songbook', label: 'Songbook', icon: Music},
            {id: 'progress', label: 'Progress', icon: Flame},
          ] as const
        ).map((item) => {
          const NavIcon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveNav(item.id);
                if (item.id === 'lessons') {
                  setShowLessonPathBrowser(false);
                }
              }}
              className={`flex flex-col items-center justify-center min-h-[48px] koa-focus rounded-xl ${
                isActive ? 'text-[#12343B] font-bold' : 'text-[#3F5C62]'
              }`}
            >
              <NavIcon className="w-5 h-5" />
              <span className="text-[14px] mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
