import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TrackTable, formatDuration } from './components';
import { mergeFavoritesPage } from './favorites-pagination.mjs';
import type { LibraryContext } from './pages';
import type { Track } from '../shared/types';

const PAGE = 50;

type SortBy = 'default' | 'title' | 'artist' | 'duration';

// Filtering and sorting run on the pages already loaded, never on the server: 收藏 has no search
// endpoint, so pretending to search the whole library would be a lie. The hint says so.
function shape(list: Track[], query: string, sortBy: SortBy): Track[] {
  const needle = query.trim().toLowerCase();
  const matched = needle
    ? list.filter(track => track.title.toLowerCase().includes(needle)
      || track.artists.some(artist => artist.name.toLowerCase().includes(needle))
      || (track.album?.title ?? '').toLowerCase().includes(needle))
    : list;
  if (sortBy === 'default') return matched;
  const sorted = [...matched];
  if (sortBy === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  else if (sortBy === 'artist') sorted.sort((a, b) => (a.artists[0]?.name ?? '').localeCompare(b.artists[0]?.name ?? '', 'zh-CN'));
  else sorted.sort((a, b) => (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0));
  return sorted;
}

// Kept mounted for the current account: navigation must not reset pagination or scroll position.
export function FavoritesPage({ ctx, active }: { ctx: LibraryContext; active: boolean }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [countError, setCountError] = useState(false);
  const [error, setError] = useState('');
  const [cacheHint, setCacheHint] = useState('');
  const [filling, setFilling] = useState(false);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const sentinel = useRef<HTMLDivElement | null>(null);
  const container = useRef<HTMLElement | null>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const data = useRef({ tracks: [] as Track[], hasMore: false, nextStart: 0 });
  const requestId = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  const fillingRef = useRef(false);
  const scrollPosition = useRef(0);
  const refreshPending = useRef(false);
  const retryAction = useRef({ refresh: false, append: false });
  const seenChange = useRef(ctx.favoriteChange?.revision ?? 0);

  async function count(epoch = requestId.current) {
    setCounting(true); setCountError(false);
    try {
      const result = await window.desktop.music.favoritesSummary();
      if (!mounted.current || epoch !== requestId.current) return;
      if (result.ok) setTotal(result.data.total);
      else setCountError(true);
    } catch { if (mounted.current && epoch === requestId.current) setCountError(true); }
    finally { if (mounted.current && epoch === requestId.current) setCounting(false); }
  }

  async function load(refresh = false, append = false): Promise<boolean> {
    if (pending.current || (append && !data.current.hasMore)) return false;
    const epoch = refresh ? ++requestId.current : requestId.current;
    pending.current = true; setLoading(true); setError('');
    retryAction.current = { refresh, append };
    if (refresh) { setTotal(null); setCountError(false); }
    try {
      const result = await window.desktop.music.favorites({ start: append ? data.current.nextStart : 0, limit: PAGE, refresh });
      if (!mounted.current || epoch !== requestId.current) return false;
      if (!result.ok) { setError(result.error.message); return false; }
      const page = result.data;
      const next = mergeFavoritesPage(append ? data.current.tracks : [], page);
      data.current = next;
      setTracks(next.tracks); setHasMore(next.hasMore); setLoaded(true); setCacheHint(page.cacheHint ?? '');
      for (const track of page.tracks) ctxRef.current.setFavoriteState(track.id, true);
      if (page.total !== undefined) setTotal(page.total);
      // A terminal unique page is also count evidence, but a stalled/repeated page is not.
      if (!page.hasMore) setTotal(page.total ?? next.tracks.length);
      else if (append && !next.hasMore) {
        retryAction.current = { refresh: true, append: false };
        setError('服务端没有返回新的收藏，已暂停加载；请刷新核对。');
        return false;
      }
      if (!append && page.hasMore && !page.cacheHint) void count(epoch);
      return true;
    } catch {
      if (mounted.current && epoch === requestId.current) setError('读取收藏失败；已加载内容保留，请重试。');
      return false;
    } finally {
      if (mounted.current && epoch === requestId.current) {
        pending.current = false; setLoading(false);
        if (refreshPending.current) { refreshPending.current = false; void load(true); }
      }
    }
  }

  useEffect(() => {
    const revision = ctx.favoriteChange?.revision ?? 0;
    if (revision === seenChange.current) return;
    seenChange.current = revision;
    fillingRef.current = false; setFilling(false);
    if (pending.current) refreshPending.current = true;
    else void load(true);
  }, [ctx.favoriteChange]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; requestId.current++; pending.current = false; fillingRef.current = false; };
  }, []);

  useLayoutEffect(() => {
    const scrollRoot = container.current?.closest<HTMLElement>('.main-content');
    if (!scrollRoot || !active) return;
    scrollRoot.scrollTop = scrollPosition.current;
    const remember = () => { scrollPosition.current = scrollRoot.scrollTop; };
    scrollRoot.addEventListener('scroll', remember, { passive: true });
    return () => scrollRoot.removeEventListener('scroll', remember);
  }, [active]);

  useEffect(() => {
    if (!active || !sentinel.current || !hasMore || loading || error || filling || cacheHint) return;
    const root = container.current?.closest('.main-content');
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void load(false, true);
    }, { root, rootMargin: '0px 0px 320px 0px', threshold: 0 });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [active, hasMore, loading, error, filling, cacheHint]);

  async function playAll() {
    if (pending.current || fillingRef.current) return;
    fillingRef.current = true; setFilling(true);
    const epoch = requestId.current;
    try {
      while (data.current.hasMore && fillingRef.current && mounted.current && epoch === requestId.current) {
        if (!await load(false, true)) return;
      }
      if (fillingRef.current && mounted.current && epoch === requestId.current && data.current.tracks.length) {
        ctxRef.current.play(data.current.tracks, 0);
      }
    } finally { fillingRef.current = false; if (mounted.current) setFilling(false); }
  }

  const visible = shape(tracks, query, sortBy);
  const pickedTracks = tracks.filter(track => picked.has(track.id));

  async function removePicked() {
    const targets = pickedTracks;
    if (!targets.length) return;
    for (const track of targets) ctxRef.current.toggleFavorite(track, false);
    setPicked(new Set());
  }

  /**
   * Exports exactly what is on screen right now — the filtered/sorted view — because that is what
   * the user is looking at when they press the button. Album/artist names are joined with " / " so a
   * multi-artist track stays one CSV row.
   */
  async function exportList() {
    if (!visible.length) return;
    const rows = visible.map(track => [
      track.title,
      track.artists.map(artist => artist.name).join(' / '),
      track.album?.title ?? '',
      formatDuration(track.durationSeconds),
      track.durationSeconds ?? '',
    ] as (string | number)[]);
    const stamp = new Date().toLocaleDateString('zh-CN').replaceAll('/', '-');
    const result = await window.desktop.export.list({
      suggestedName: `我的收藏 ${stamp}`,
      headers: ['曲名', '艺人', '专辑', '时长', '时长（秒）'],
      rows,
    }).catch(() => null);
    if (!result) { ctxRef.current.notice('导出失败，请重试。'); return; }
    if (!result.ok) { ctxRef.current.notice(result.error.message); return; }
    if (result.data.canceled) { ctxRef.current.notice('已取消导出。'); return; }
    ctxRef.current.notice(`已导出 ${rows.length} 首到 ${result.data.path}`);
  }

  function enqueuePicked() {
    for (const track of pickedTracks) ctxRef.current.enqueue(track);
    ctxRef.current.notice(`已把 ${pickedTracks.length} 首加入队列。`);
    setPicked(new Set());
  }

  return <section ref={container} className="library favorites-library" aria-label="收藏歌曲" hidden={!active}>
    <div className="library-head">
      <div className="collection-count" aria-live="polite">
        <strong>{total === null ? '我的收藏' : `共 ${total.toLocaleString('zh-CN')} 首收藏`}</strong>
        <span>{loaded ? `已加载 ${tracks.length.toLocaleString('zh-CN')} 首` : loading ? '正在读取首批歌曲…' : '尚未读取'}{counting ? ' · 正在统计总数…' : ''}</span>
        {countError && <button className="text-button" onClick={() => void count()}>总数统计失败，重试</button>}
      </div>
      <div className="head-actions">
        {tracks.length > 0 && <button className="text-button" onClick={() => void playAll()} disabled={loading || filling}>
          {filling ? `正在准备 ${data.current.tracks.length} 首…` : '播放全部'}
        </button>}
        {filling && <button className="ghost" onClick={() => { fillingRef.current = false; setFilling(false); }}>取消准备</button>}
        {tracks.length > 0 && <button className="ghost" disabled={loading} onClick={() => void exportList()}>导出清单</button>}
        <button className="ghost" disabled={loading || filling} onClick={() => void load(true)}>刷新收藏</button>
      </div>
    </div>
    {cacheHint && <p className="collection-warning" role="status">{cacheHint}</p>}
    {error && <div className="collection-error" role="alert"><span>{error}</span><button className="ghost" onClick={() => void load(retryAction.current.refresh, retryAction.current.append)}>重试加载收藏</button></div>}
    <div className="list-toolbar">
      <input className="list-filter" aria-label="在收藏中筛选" value={query} maxLength={60}
        placeholder="在已加载的收藏里筛选歌名 / 歌手 / 专辑" onChange={event => setQuery(event.target.value)} />
      <select aria-label="排序方式" value={sortBy} onChange={event => setSortBy(event.target.value as SortBy)}>
        <option value="default">按添加顺序</option>
        <option value="title">按歌名</option>
        <option value="artist">按歌手</option>
        <option value="duration">按时长</option>
      </select>
      {query.trim() && <span className="hint">筛出 {visible.length} / 已加载 {tracks.length} 首</span>}
    </div>
    {picked.size > 0 && <div className="bulk-bar" role="region" aria-label="批量操作">
      <span>已选 {picked.size} 首</span>
      <button className="ghost" onClick={enqueuePicked}>加入队列</button>
      <button className="ghost danger" onClick={() => void removePicked()}>取消收藏</button>
      <button className="text-button" onClick={() => setPicked(new Set())}>清除选择</button>
    </div>}
    <TrackTable tracks={visible} actions={ctx} selection={{ ids: picked, onChange: setPicked }}
      emptyText={query.trim() ? '已加载的收藏里没有匹配项。' : loaded ? '还没有收藏歌曲，可以搜索后添加收藏。' : loading ? '正在读取收藏…' : '收藏未能读取，请重试。'} />
    <div ref={sentinel} className="collection-end" aria-live="polite">
      {hasMore ? <>
        <span>{loading ? '正在加载下一批歌曲…' : error ? '加载已暂停' : cacheHint ? '离线缓存，仅显示已有内容' : '继续向下滚动以加载下一批'}</span>
        <button className="ghost" disabled={loading || filling} onClick={() => void load(false, true)}>加载更多收藏</button>
      </> : loaded && tracks.length > 0 ? <span>已加载全部收藏</span> : null}
    </div>
  </section>;
}
