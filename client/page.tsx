import { useState } from 'react'
import { useAction, useLive, useTranslate } from '@chatluna/ui-client/client'
import {
  Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription,
  CardFooter, CardHeader, CardTitle, EmptyState, Field, FieldGroup, FieldLabel,
  FilterChips, Input, PageHeader, Skeleton
} from '@chatluna/ui-kit'
import type { MixResult } from '../src/types'

function MixPreview({ result }: { result?: MixResult }) {
  const t = useTranslate('emojis')
  const [failed, setFailed] = useState(false)
  if (!result) return <EmptyState title={t('previewEmpty')} hint={t('previewEmptyHint')} />
  if (result.kind === 'invalid') return <Alert variant="destructive"><AlertTitle>{t('invalid')}</AlertTitle><AlertDescription>{t(`inputErrors.${result.reason}`)}</AlertDescription></Alert>
  if (result.kind === 'missing') return <EmptyState title={t('missing')} hint={`${result.left} + ${result.right} · ${t('missingHint')}`} />
  if (result.kind === 'unavailable') return <EmptyState title={t('unavailable')} hint={t('unavailableHint')} />
  return (
    <div className="flex flex-col items-center gap-4">
      {failed ? (
        <Alert variant="destructive"><AlertTitle>{t('imageError')}</AlertTitle><AlertDescription>{t('imageErrorHint')}</AlertDescription></Alert>
      ) : (
        <img className="size-56 max-w-full object-contain" src={result.image.url} alt={`${result.left} + ${result.right}`} width={224} height={224} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      )}
      <a className="text-sm underline underline-offset-4" href={result.image.url} target="_blank" rel="noreferrer">{t('openImage')}</a>
      <p className="text-muted-foreground">{t('command')} <code className="font-mono">emoji {result.left}{result.right}</code></p>
    </div>
  )
}

export function EmojisPage() {
  const t = useTranslate('emojis')
  const status = useLive('emojis.status')
  const [left, setLeft] = useState('😀')
  const [right, setRight] = useState('🔥')
  const [selection, setSelection] = useState<'left' | 'right'>('left')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [requestError, setRequestError] = useState(false)
  const catalog = useLive('emojis.catalog', { query, page })
  const mix = useAction('emojis.mix', { onError: () => setRequestError(true) })
  const update = useAction('emojis.update', { onError: () => setRequestError(true) })
  const input = `${left} ${right}`
  const result = mix.variables?.input === input ? mix.data : undefined
  const data = status.data
  const error = status.error ?? catalog.error
  const busy = update.pending || data?.updating
  const date = (value: string | undefined) => value ? new Date(value).toLocaleString() : t('notChecked')

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-5 p-(--page-gutter) text-sm leading-6">
      <PageHeader title={t('title')} description={t('description')} actions={
        <Button variant="outline" disabled={busy || update.offline} onClick={() => { setRequestError(false); void update({}) }}>
          {busy ? t('updating') : t('update')}
        </Button>
      } />
      {(error || requestError) && <Alert variant="destructive"><AlertTitle>{t('requestError')}</AlertTitle>{error && <AlertDescription>{error}</AlertDescription>}</Alert>}
      {mix.offline && <Alert><AlertTitle>{t('offline')}</AlertTitle></Alert>}
      {data?.error && <Alert variant="destructive"><AlertTitle>{t('updateFailed')}</AlertTitle><AlertDescription>{t(`errors.${data.error}`)} {data.ready ? t('cachedHint') : t('noCacheHint')}</AlertDescription></Alert>}
      {!busy && update.data && update.data.kind !== 'failed' && <p role="status" className="text-muted-foreground">{t(update.data.kind)}</p>}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('inputTitle')}</CardTitle><CardDescription>{t('inputDescription')}</CardDescription></CardHeader>
          <CardContent>
            <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); setRequestError(false); void mix({ input }) }}>
              <FieldGroup className="sm:flex-row">
                <Field data-invalid={result?.kind === 'invalid' || undefined}>
                  <FieldLabel htmlFor="emojis-left">{t('left')}</FieldLabel>
                  <Input id="emojis-left" value={left} maxLength={60} onChange={(event) => setLeft(event.target.value)} onFocus={() => setSelection('left')} aria-invalid={result?.kind === 'invalid'} />
                </Field>
                <Field data-invalid={result?.kind === 'invalid' || undefined}>
                  <FieldLabel htmlFor="emojis-right">{t('right')}</FieldLabel>
                  <Input id="emojis-right" value={right} maxLength={60} onChange={(event) => setRight(event.target.value)} onFocus={() => setSelection('right')} aria-invalid={result?.kind === 'invalid'} />
                </Field>
              </FieldGroup>
              <Button type="submit" disabled={mix.pending || mix.offline || !data?.ready}>{mix.pending ? t('composing') : t('compose')}</Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <span className="text-muted-foreground">{t('examples')}</span>
            {[['😀', '🔥'], ['❤️', '🔥'], ['🐱', '🐶']].map(([a, b]) => (
              <Button key={`${a}${b}`} variant="outline" size="sm" onClick={() => { setLeft(a); setRight(b) }}>{a} + {b}</Button>
            ))}
          </CardFooter>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('preview')}</CardTitle><CardDescription>{t('previewHint')}</CardDescription></CardHeader>
          <CardContent className="flex min-h-64 flex-col justify-center" aria-live="polite" aria-busy={mix.pending}>
            {mix.pending ? <Skeleton className="mx-auto size-56" /> : <MixPreview key={`${input}:${result?.kind === 'found' ? result.image.url : result?.kind}`} result={result} />}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>{t('catalog')}</CardTitle><CardDescription>{t('catalogHint')}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field className="min-w-40 flex-1">
              <FieldLabel htmlFor="emojis-search">{t('search')}</FieldLabel>
              <Input id="emojis-search" value={query} maxLength={128} placeholder={t('searchPlaceholder')} onChange={(event) => { setQuery(event.target.value); setPage(1) }} />
            </Field>
            <FilterChips<'left' | 'right'> label={t('selection')} value={selection} onChange={setSelection} options={[{ value: 'left', label: t('left') }, { value: 'right', label: t('right') }]} />
          </div>
          {catalog.status === 'loading' ? <Skeleton className="h-48 w-full" /> : !data?.ready ? (
            <EmptyState title={t('unavailable')} hint={t('unavailableHint')} />
          ) : !catalog.data?.items.length ? (
            <EmptyState art="search" title={t('catalogEmpty')} hint={t('catalogEmptyHint')} />
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-12">
              {catalog.data.items.map((item) => (
                <Button key={item.id} variant="outline" className="h-14" title={`${item.emoji} · ${item.name} · ${item.id}`} aria-label={`${t(selection)}: ${item.emoji} ${item.name}`} onClick={() => {
                  if (selection === 'left') setLeft(item.emoji)
                  else setRight(item.emoji)
                  setSelection(selection === 'left' ? 'right' : 'left')
                }}><span className="text-2xl leading-none">{item.emoji}</span></Button>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-3">
          <p className="text-muted-foreground">{t('total')} {catalog.data?.total ?? 0} · {t('page')} {catalog.data?.page ?? 1} / {catalog.data?.pages ?? 1}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!catalog.data || catalog.data.page <= 1} onClick={() => setPage((catalog.data?.page ?? 1) - 1)}>{t('previous')}</Button>
            <Button variant="outline" size="sm" disabled={!catalog.data || catalog.data.page >= catalog.data.pages} onClick={() => setPage((catalog.data?.page ?? 1) + 1)}>{t('next')}</Button>
          </div>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t('status')}</CardTitle><CardDescription>{t('statusHint')}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {status.status === 'loading' ? <Skeleton className="h-16 w-full" /> : <>
            <div><Badge variant="secondary">{data?.updating ? t('updating') : data?.ready ? t('ready') : t('notReady')}</Badge></div>
            <p className="text-muted-foreground">{t('updatedAt')} · {date(data?.updatedAt)}</p>
            <p className="text-muted-foreground">{t('checkedAt')} · {date(data?.checkedAt)}</p>
          </>}
        </CardContent>
      </Card>
    </div>
  )
}
