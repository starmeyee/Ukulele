'use client';

import React, {useState, useRef, useEffect, useCallback} from 'react';
import {LessonConfig} from '@/lib/curriculum-data';
import {MessageCircle, Send, X} from 'lucide-react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AiUkuleleTutorProps {
  lesson: LessonConfig;
  completedLessonNumbers: number[];
  knownDifficulties: string[];
  activityCount: number;
  selectedHotspotName?: string | null;
  wrongQuizAnswerText?: string | null;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  prefilledPrompt?: string | null;
  onClearPrefilledPrompt?: () => void;
}

export default function AiUkuleleTutor({
  lesson,
  completedLessonNumbers,
  knownDifficulties,
  activityCount,
  selectedHotspotName,
  wrongQuizAnswerText,
  isOpen,
  onOpen,
  onClose,
  prefilledPrompt,
  onClearPrefilledPrompt,
}: AiUkuleleTutorProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Aloha! I'm **Koa**. We're on **Lesson ${lesson.number}: ${lesson.title}**. Tap a starter below or ask me anything in plain English.`,
    },
  ]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const triggerBtnRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isOpen]);

  const sendTutorMessage = useCallback(
    async (textToSend: string, explainDifferently: boolean = false) => {
      const trimmed = textToSend.trim();
      if (!trimmed || isLoading) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);

      try {
        const extraContextNotes = [
          selectedHotspotName ? `Selected ukulele part: ${selectedHotspotName}` : '',
          wrongQuizAnswerText
            ? `Learner recently chose quiz option: "${wrongQuizAnswerText}"`
            : '',
        ]
          .filter(Boolean)
          .join(' | ');

        const response = await fetch('/api/tutor', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            message: extraContextNotes
              ? `${trimmed}\n[Context: ${extraContextNotes}]`
              : trimmed,
            explainDifferently,
            context: {
              currentLessonNumber: lesson.number,
              currentLessonTitle: lesson.title,
              currentStageTitle: lesson.stageTitle,
              learningObjective: lesson.objective,
              plainExplanation: lesson.plainExplanation,
              activeChord: lesson.visualConfig.activeChordId,
              secondaryChord: lesson.visualConfig.secondaryChordId,
              strummingPattern: lesson.visualConfig.strummingPatternId,
              practicalExerciseTitle: lesson.practicalExercise.title,
              practicalExerciseSteps: lesson.practicalExercise.steps,
              commonMistakeSymptom: lesson.commonMistake.symptom,
              commonMistakeFix: lesson.commonMistake.quickFix,
              checkpointQuestion: lesson.checkpoint.question,
              checkpointHint: lesson.checkpoint.hint,
              completedLessonNumbers,
              knownDifficulties,
              activityProgressText: `${activityCount} of ${lesson.interactiveActivity.requiredActionsCount} interactive steps completed`,
            },
            history: messages.slice(-8).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        const data = await response.json();
        const replyText =
          data.reply ||
          'Let’s take this one small step at a time. Focus on pressing just behind the metal fret wire with your curled fingertip!';

        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: replyText,
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: `Here is a simple tip for **${lesson.title}**: ${lesson.commonMistake.quickFix}`,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [
      activityCount,
      completedLessonNumbers,
      isLoading,
      knownDifficulties,
      lesson,
      messages,
      selectedHotspotName,
      wrongQuizAnswerText,
    ]
  );

  // Handle prefilled prompt from "Explain it simpler" link
  useEffect(() => {
    if (isOpen && prefilledPrompt) {
      const promptToRun = prefilledPrompt;
      queueMicrotask(() => {
        onClearPrefilledPrompt?.();
        sendTutorMessage(promptToRun, true);
      });
    }
  }, [isOpen, prefilledPrompt, onClearPrefilledPrompt, sendTutorMessage]);

  // Keyboard shortcuts: 'K' opens, 'Esc' closes, focus management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (!isOpen && !isTyping && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        onOpen();
        setTimeout(() => inputRef.current?.focus(), 80);
      } else if (isOpen && e.key === 'Escape') {
        e.preventDefault();
        onClose();
        setTimeout(() => triggerBtnRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onOpen, onClose]);

  const renderFormattedContent = (text: string) => {
    const paragraphs = text.split('\n\n').filter(Boolean);
    return (
      <div className="space-y-2.5 text-[16px] leading-relaxed">
        {paragraphs.map((para, i) => {
          const formattedParts = para.split(/(\*\*.*?\*\*)/g).map((part, idx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={idx} className="font-semibold text-[#12343B]">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return <span key={idx}>{part}</span>;
          });
          return <p key={i}>{formattedParts}</p>;
        })}
      </div>
    );
  };

  return (
    <>
      {/* Floating Ask Koa Button: Pill on Desktop, 56px Circle on Mobile. Ink background, Cream text, Lagoon dot */}
      <button
        ref={triggerBtnRef}
        type="button"
        onClick={() => {
          onOpen();
          setTimeout(() => inputRef.current?.focus(), 80);
        }}
        aria-label="Ask Koa Tutor (Shortcut: K)"
        className="fixed bottom-24 md:bottom-7 right-4 sm:right-7 z-40 h-14 w-14 md:w-auto md:px-5 rounded-full bg-[#12343B] text-[#FFF7E8] koa-shadow flex items-center justify-center gap-2.5 hover:scale-[1.03] transition-transform koa-focus"
      >
        <span
          className="w-2.5 h-2.5 rounded-full bg-[#3DB9A5] shrink-0"
          aria-hidden="true"
        />
        <MessageCircle className="w-5 h-5 shrink-0" />
        <span className="hidden md:inline text-[16px] font-semibold">Ask Koa</span>
      </button>

      {/* Right-Side Drawer (420px Desktop) / 85vh Bottom Sheet (Mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#12343B]/35 backdrop-blur-[2px] flex justify-end items-end md:items-stretch"
          onClick={onClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="koa-drawer-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full md:w-[420px] h-[85vh] md:h-full bg-[#FFFCF5] rounded-t-[32px] md:rounded-none md:rounded-l-[32px] koa-shadow flex flex-col overflow-hidden"
          >
            {/* Glass Header (3rd allowed glass surface) */}
            <div className="koa-glass px-6 py-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-[#3DB9A5]"
                    aria-hidden="true"
                  />
                  <h2
                    id="koa-drawer-title"
                    className="font-fraunces text-[22px] font-bold text-[#12343B]"
                  >
                    Ask Koa
                  </h2>
                </div>
                <div className="mt-1 inline-block px-3 py-0.5 rounded-full bg-[#E4EFE7] text-[14px] font-medium text-[#12343B]">
                  Lesson {lesson.number} · {lesson.title.split(':')[0]}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  setTimeout(() => triggerBtnRef.current?.focus(), 50);
                }}
                className="w-11 h-11 rounded-full flex items-center justify-center text-[#12343B] hover:bg-[#12343B]/10 transition-colors koa-focus"
                aria-label="Close Ask Koa drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Max 3 Starter Chips */}
            <div className="px-6 py-3 bg-[#FFF7E8] flex flex-wrap gap-2 border-b border-[#12343B]/12">
              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  sendTutorMessage(
                    `I still don't understand "${lesson.title}". Can you explain it in a simpler way with an everyday analogy?`,
                    true
                  )
                }
                className="px-3.5 py-1.5 rounded-full bg-[#FFFCF5] hover:bg-[#FFC857]/35 text-[14px] font-semibold text-[#12343B] transition-colors koa-focus"
              >
                I still don’t understand
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  sendTutorMessage(
                    `Why does my string buzz or sound muted in Lesson ${lesson.number}?`
                  )
                }
                className="px-3.5 py-1.5 rounded-full bg-[#FFFCF5] hover:bg-[#FFC857]/35 text-[14px] font-semibold text-[#12343B] transition-colors koa-focus"
              >
                Why does my string buzz?
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  sendTutorMessage(
                    `Give me a gentle hint for Lesson ${lesson.number} without spoiling the answer.`
                  )
                }
                className="px-3.5 py-1.5 rounded-full bg-[#FFFCF5] hover:bg-[#FFC857]/35 text-[14px] font-semibold text-[#12343B] transition-colors koa-focus"
              >
                Give me a hint
              </button>
            </div>

            {/* Conversation Feed */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-[24px] px-4 py-3.5 ${
                      msg.role === 'user'
                        ? 'bg-[#12343B] text-[#FFF7E8]'
                        : 'bg-[#FFF7E8] text-[#12343B]'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="text-[16px] leading-relaxed">{msg.content}</p>
                    ) : (
                      renderFormattedContent(msg.content)
                    )}
                  </div>
                </div>
              ))}

              {/* Typing Indicator */}
              {isLoading && (
                <div className="inline-flex items-center gap-2 px-4 py-3 rounded-[24px] bg-[#FFF7E8] text-[#3F5C62] text-[15px]">
                  <span className="w-2 h-2 rounded-full bg-[#3DB9A5] animate-ping" />
                  <span>Koa is typing…</span>
                </div>
              )}
            </div>

            {/* Pinned Input at Bottom: Send button is the ONE Sunset Coral #FF7A59 element while drawer is open */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendTutorMessage(input, false);
              }}
              className="p-4 bg-[#FFF7E8] border-t border-[#12343B]/12 flex items-center gap-2.5"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Koa a question…"
                className="min-w-0 flex-1 bg-[#FFFCF5] rounded-full px-4 py-3 text-[16px] text-[#12343B] placeholder:text-[#3F5C62] focus:outline-none ring-1 ring-[#12343B]/20 focus:ring-2 focus:ring-[#12343B] min-h-[48px]"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="px-4 sm:px-5 py-3 rounded-full bg-[#FF7A59] hover:bg-[#F26A47] disabled:bg-[#E4EFE7] disabled:text-[#3F5C62] text-[#12343B] text-[15px] sm:text-[16px] font-bold flex items-center gap-1.5 transition-colors min-h-[48px] shrink-0 koa-focus"
              >
                <span>Send</span>
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
