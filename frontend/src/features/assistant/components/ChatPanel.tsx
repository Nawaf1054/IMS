/** Assistant chat (AI-1): conversation, suggested questions and the sources behind each answer. */
import { ArrowUpIcon, CircleAlertIcon, DatabaseIcon, SparklesIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Panel } from '@/components/common/Panel'
import { Button } from '@/components/ui/button'
import { isApiError } from '@/lib/api-client'

import { useAiQuota, useChat } from '../api/queries'
import { type AssistantMessage, type ChatTurn, MAX_CHAT_TURNS, MAX_MESSAGE_LENGTH } from '../types'

type Entry =
  | { id: number; kind: 'user'; content: string }
  | { id: number; kind: 'assistant'; message: AssistantMessage }
  | { id: number; kind: 'error'; title: string; detail: string; retry: boolean }

const SUGGESTIONS = ['Which products sold least this month?', 'What’s running low?', 'Revenue by category last week', 'Best-selling tools in September']

/** The assistant's sparkle avatar next to its messages. */
function AssistantAvatar() {
  return (
    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
      <SparklesIcon className="size-[15px]" strokeWidth={1.8} />
    </span>
  )
}

/** AI-1: natural-language questions answered through read-only tools. */
export function ChatPanel() {
  const chat = useChat()
  const { data: quota } = useAiQuota()
  const [entries, setEntries] = useState<Entry[]>([])
  const [draft, setDraft] = useState('')
  const nextId = useRef(1)
  const endRef = useRef<HTMLDivElement>(null)
  const exhausted = quota?.remaining === 0

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [entries.length, chat.isPending])

  const ask = (question: string, history: Entry[]) => {
    const text = question.trim()
    if (!text || chat.isPending || exhausted) return
    const withQuestion: Entry[] = [...history, { id: nextId.current++, kind: 'user', content: text }]
    setEntries(withQuestion)
    setDraft('')
    // The backend takes the most recent turns only (it drops a leading assistant turn itself).
    const turns: ChatTurn[] = withQuestion
      .flatMap((e): ChatTurn[] =>
        e.kind === 'user' ? [{ role: 'user', content: e.content }] : e.kind === 'assistant' ? [{ role: 'assistant', content: e.message.content }] : [],
      )
      .slice(-MAX_CHAT_TURNS)
    chat.mutate(turns, {
      onSuccess: ({ message }) => setEntries((all) => [...all, { id: nextId.current++, kind: 'assistant', message }]),
      onError: (error) =>
        setEntries((all) => [
          ...all,
          isApiError(error, 'RATE_LIMITED')
            ? { id: nextId.current++, kind: 'error', title: 'Hourly limit reached', detail: `${error.message} The limit resets within the hour.`, retry: false }
            : {
                id: nextId.current++,
                kind: 'error',
                title: 'The AI service isn’t responding',
                detail: 'Your question wasn’t counted against your limit. Dashboard, invoices and stock keep working as normal.',
                retry: true,
              },
        ]),
    })
  }

  const retry = () => {
    const withoutError = entries.filter((e, i) => !(i === entries.length - 1 && e.kind === 'error'))
    const lastQuestion = [...withoutError].reverse().find((e) => e.kind === 'user')
    if (lastQuestion?.kind !== 'user') return
    ask(lastQuestion.content, withoutError.slice(0, withoutError.lastIndexOf(lastQuestion)))
  }

  return (
    <Panel aria-label="Chat" className="flex min-h-[640px] flex-col xl:min-h-[760px]">
      <div aria-live="polite" className="flex flex-1 flex-col gap-[18px] p-5">
        {entries.length === 0 && (
          <div className="m-auto flex max-w-sm flex-col items-center gap-2 text-center">
            <AssistantAvatar />
            <strong className="font-semibold">Ask about sales, stock or products</strong>
            <span className="text-[13px] text-muted-foreground">Answers use live IMS data through read-only tools. The assistant can’t change records.</span>
          </div>
        )}
        {entries.map((entry) =>
          entry.kind === 'user' ? (
            <div key={entry.id} className="max-w-[78%] self-end rounded-[12px_12px_4px_12px] bg-muted px-3.5 py-2.5">
              {entry.content}
            </div>
          ) : entry.kind === 'assistant' ? (
            <div key={entry.id} className="flex max-w-[92%] gap-3">
              <AssistantAvatar />
              <div className="flex min-w-0 flex-col gap-2.5 pt-1">
                <p className="leading-[22px] whitespace-pre-line">{entry.message.content}</p>
                {entry.message.rows.length > 0 && (
                  <div className="overflow-hidden rounded-lg border">
                    {entry.message.rows.map((row, i) => (
                      <div key={`${i}-${row.label}`} className="flex justify-between gap-4 border-b px-3 py-2 text-[13px] last:border-b-0">
                        <span>{row.label}</span>
                        <span className="whitespace-nowrap text-subtle-foreground">{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {entry.message.sources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Data used</span>
                    {entry.message.sources.map((source) => (
                      <span
                        key={source.label}
                        title={`Read-only tool: ${source.tool}`}
                        className="inline-flex h-[22px] items-center gap-[5px] rounded-md border bg-subtle px-2 text-[11px] text-subtle-foreground"
                      >
                        <DatabaseIcon className="size-[11px]" aria-hidden="true" />
                        {source.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div key={entry.id} role="alert" className="flex max-w-[92%] gap-3 rounded-[10px] border border-danger-line bg-danger-soft px-3.5 py-3">
              <CircleAlertIcon className="mt-px size-[18px] shrink-0 text-danger" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <strong className="font-semibold text-danger">{entry.title}</strong>
                <span className="text-[13px] text-subtle-foreground">{entry.detail}</span>
                {entry.retry && (
                  <Button variant="outline" size="sm" className="mt-1.5 self-start" onClick={retry}>
                    Try again
                  </Button>
                )}
              </div>
            </div>
          ),
        )}
        {chat.isPending && (
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
            <AssistantAvatar />
            Looking up sales and stock data…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-col gap-2.5 border-t px-4 py-3.5">
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              disabled={exhausted || chat.isPending}
              onClick={() => ask(question, entries)}
              className="h-[30px] rounded-full border bg-card px-3 text-[13px] text-subtle-foreground hover:bg-muted disabled:opacity-50"
            >
              {question}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            ask(draft, entries)
          }}
        >
          <label className="flex flex-1">
            <span className="sr-only">Ask about sales, stock or products</span>
            <textarea
              rows={1}
              value={draft}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={exhausted}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  ask(draft, entries)
                }
              }}
              placeholder={exhausted ? 'You’ve used all your requests this hour.' : 'Ask about sales, stock or products…'}
              className="field-sizing-content max-h-[140px] min-h-11 w-full resize-none rounded-[10px] border bg-subtle px-3.5 py-[11px] leading-5 outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/25 disabled:opacity-60"
            />
          </label>
          <Button type="submit" size="icon-lg" className="rounded-[10px]" aria-label="Send" disabled={exhausted || !draft.trim() || chat.isPending}>
            <ArrowUpIcon className="size-[18px]" />
          </Button>
        </form>
      </div>
    </Panel>
  )
}
