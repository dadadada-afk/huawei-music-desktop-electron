package huawei

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Writer serializes mutations for one account. Every success is read back;
// uncertain creation is recorded before sending and is never blindly retried.
type Writer struct {
	mu         sync.Mutex
	client     *Client
	session    *Session
	pending    func(bool) error
	unresolved func() (bool, error)
	loadIntent func() (*CreationIntent, error)
	saveIntent func(*CreationIntent) error
}

type CreationIntent struct {
	Title    string
	Baseline []string
	ID       string
	Tracks   []string
}

func (w *Writer) WithCreationJournal(load func() (*CreationIntent, error), save func(*CreationIntent) error) *Writer {
	w.loadIntent, w.saveIntent = load, save
	return w
}
func (w *Writer) reconcileCreation(ctx context.Context, intent *CreationIntent) (string, error) {
	list, err := w.client.Playlists(ctx, w.session)
	if err != nil {
		return "", errors.New("creation readback unavailable")
	}
	baseline := make(map[string]bool)
	for _, id := range intent.Baseline {
		baseline[id] = true
	}
	var candidates []Playlist
	for _, p := range list {
		if p.Kind == "owned" && !baseline[p.ID] && p.Title == intent.Title && (intent.ID == "" || intent.ID == p.ID) {
			candidates = append(candidates, p)
		}
	}
	if len(candidates) != 1 {
		return "", errors.New("creation remains unresolved; no resend")
	}
	id := candidates[0].ID
	seen := make(map[string]bool)
	for start := 0; start < 10000; {
		page, err := w.client.PlaylistDetail(ctx, w.session, candidates[0], start, 50)
		if err != nil {
			return "", errors.New("creation tracks unreadable")
		}
		for _, track := range page.Tracks {
			seen[track.ID] = true
		}
		if !page.More {
			break
		}
		if page.Next <= start {
			return "", errors.New("creation tracks did not advance")
		}
		start = page.Next
	}
	for _, track := range intent.Tracks {
		if !seen[track] {
			return "", errors.New("created playlist contents differ")
		}
	}
	if err := w.saveIntent(nil); err != nil {
		return id, errors.New("creation journal cleanup failed")
	}
	return id, nil
}

func NewWriter(c *Client, s *Session, pending func(bool) error, unresolved func() (bool, error)) *Writer {
	return &Writer{client: c, session: s, pending: pending, unresolved: unresolved}
}
func (w *Writer) Favorite(ctx context.Context, id string) (bool, error) {
	if !validID(id) {
		return false, errors.New("invalid track ID")
	}
	if w.session == nil {
		return false, errors.New("music session missing")
	}
	headers, err := musicHeaders(w.session.token, time.Now())
	if err != nil {
		return false, err
	}
	var result struct {
		Exist string `json:"exist"`
	}
	err = w.client.request(ctx, http.MethodGet, MusicEndpoint+"/music-userbehavior-service/v1/service/favorite/simple/exist?"+url.Values{"contentType": {"1"}, "contentID": {id}}.Encode(), "favorite status", "application/json", nil, headers, &result, true)
	if err != nil {
		return false, err
	}
	if result.Exist != "0" && result.Exist != "1" {
		return false, errors.New("unknown favorite state")
	}
	return result.Exist == "1", nil
}
func (w *Writer) SetFavorite(ctx context.Context, id string, target bool) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	old, err := w.Favorite(ctx, id)
	if err != nil {
		return err
	}
	if old == target {
		return nil
	}
	action := "delete"
	if target {
		action = "create"
	}
	var result envelope
	writeErr := w.client.musicPost(ctx, w.session, "/music-userbehavior-service/v1/service/favorite/"+action, "favorite write", struct {
		Type string `json:"contentType"`
		ID   string `json:"contentID"`
	}{"1", id}, &result)
	actual, err := w.Favorite(ctx, id)
	if err == nil && actual == target {
		return nil
	}
	if writeErr != nil {
		return errors.New("favorite result unconfirmed; refresh before retry")
	}
	return errors.New("favorite readback failed")
}
func (w *Writer) owned(ctx context.Context, id string) error {
	if !validID(id) {
		return errors.New("invalid playlist ID")
	}
	list, err := w.client.Playlists(ctx, w.session)
	if err != nil {
		return err
	}
	for _, p := range list {
		if p.ID == id && p.Kind == "owned" {
			return nil
		}
	}
	return errors.New("playlist is not owned by this account")
}
func (w *Writer) DeletePlaylist(ctx context.Context, id string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.owned(ctx, id); err != nil {
		return err
	}
	var result envelope
	writeErr := w.client.musicPost(ctx, w.session, "/music-userbehavior-service/v1/service/playlist/delete", "playlist delete", struct {
		ID string `json:"playListID"`
	}{id}, &result)
	list, err := w.client.Playlists(ctx, w.session)
	if err != nil {
		return errors.New("playlist deletion unconfirmed")
	}
	for _, p := range list {
		if p.ID == id {
			return errors.New("playlist remains after deletion")
		}
	}
	_ = writeErr
	return nil
}
func (w *Writer) UpdateDescription(ctx context.Context, id, description string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if len([]rune(description)) > 200 {
		return errors.New("description too long")
	}
	if err := w.owned(ctx, id); err != nil {
		return err
	}
	var result envelope
	writeErr := w.client.musicPost(ctx, w.session, "/music-userbehavior-service/v1/service/playlist/update", "playlist description", struct {
		Action      string `json:"actionType"`
		Description string `json:"listDesc"`
		ID          string `json:"playListID"`
	}{"1", description, id}, &result)
	headers, err := musicHeaders(w.session.token, time.Now())
	if err != nil {
		return err
	}
	var readback struct {
		Detail struct {
			Info struct {
				Description *string `json:"listDesc"`
				Alt         *string `json:"description"`
			} `json:"playListInfo"`
		} `json:"playListInfoEx"`
	}
	err = w.client.request(ctx, http.MethodGet, MusicEndpoint+"/music-userbehavior-service/v1/service/playlist/detail/all?"+url.Values{"playListID": {id}, "start": {"0"}, "limit": {"1"}}.Encode(), "description readback", "application/json", nil, headers, &readback, true)
	if err != nil {
		return errors.New("description readback failed")
	}
	info := readback.Detail.Info
	if (info.Description != nil && *info.Description == description) || (info.Alt != nil && *info.Alt == description) {
		return nil
	}
	_ = writeErr
	return errors.New("description update unconfirmed")
}
func (w *Writer) CreatePlaylist(ctx context.Context, title string, ids []string) (string, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	title = strings.TrimSpace(title)
	if title == "" || len([]rune(title)) > 60 || len(ids) == 0 || len(ids) > 200 {
		return "", errors.New("invalid playlist contents")
	}
	for _, id := range ids {
		if !validID(id) {
			return "", errors.New("invalid track ID")
		}
	}
	if w.loadIntent != nil && w.saveIntent != nil {
		intent, err := w.loadIntent()
		if err != nil {
			return "", errors.New("creation journal unreadable")
		}
		if intent != nil {
			return w.reconcileCreation(ctx, intent)
		}
		list, err := w.client.Playlists(ctx, w.session)
		if err != nil {
			return "", err
		}
		intent = &CreationIntent{Title: title, Tracks: append([]string(nil), ids...)}
		for _, p := range list {
			intent.Baseline = append(intent.Baseline, p.ID)
		}
		if err := w.saveIntent(intent); err != nil {
			return "", errors.New("cannot persist creation intent")
		}
		var result struct {
			ID  string `json:"playListID"`
			Alt string `json:"playlistID"`
		}
		_ = w.client.musicPost(ctx, w.session, "/music-userbehavior-service/v1/service/playlist/create", "playlist create", struct {
			Time  string   `json:"createTime"`
			Title string   `json:"playListName"`
			IDs   []string `json:"songCodes"`
			Share string   `json:"shareFlag"`
		}{time.Now().UTC().Format("20060102150405"), title, ids, "0"}, &result)
		intent.ID = first(result.ID, result.Alt)
		if err := w.saveIntent(intent); err != nil {
			return "", errors.New("creation result journal failed")
		}
		return w.reconcileCreation(ctx, intent)
	}
	if w.pending == nil || w.unresolved == nil {
		return "", errors.New("creation journal unavailable")
	}
	blocked, err := w.unresolved()
	if err != nil || blocked {
		return "", errors.New("previous creation unresolved; verify library before retry")
	}
	if _, err = w.client.Playlists(ctx, w.session); err != nil {
		return "", err
	}
	if err = w.pending(true); err != nil {
		return "", errors.New("cannot persist creation intent")
	}
	var result struct {
		ID string `json:"playListID"`
	}
	err = w.client.musicPost(ctx, w.session, "/music-userbehavior-service/v1/service/playlist/create", "playlist create", struct {
		Time  string   `json:"createTime"`
		Title string   `json:"playListName"`
		IDs   []string `json:"songCodes"`
		Share string   `json:"shareFlag"`
	}{time.Now().UTC().Format("20060102150405"), title, ids, "0"}, &result)
	if err != nil || !validID(result.ID) {
		return "", errors.New("playlist creation unresolved; no automatic retry")
	}
	page, err := w.client.PlaylistDetail(ctx, w.session, Playlist{ID: result.ID, Kind: "owned"}, 0, 50)
	if err != nil {
		return "", errors.New("created playlist readback failed")
	}
	if len(page.Tracks) == 0 {
		return "", errors.New("created playlist has no readable tracks")
	}
	if err = w.pending(false); err != nil {
		return result.ID, errors.New("playlist created; journal cleanup failed")
	}
	return result.ID, nil
}

func (w *Writer) ReportHistory(ctx context.Context, track Track, listened int) error {
	if listened < 1 || !validID(track.ID) {
		return errors.New("invalid listening report")
	}
	var result json.RawMessage
	duration := 0.0
	if track.Duration != nil {
		duration = *track.Duration
	}
	return w.client.musicPost(ctx, w.session, "/music-userbehavior-service/v1/service/recentlyplayed/create", "history report", struct {
		Entries []map[string]any `json:"createRecentPlayInfos"`
	}{[]map[string]any{{"songCode": track.ID, "contentCode": track.ID, "contentType": "1", "songName": track.Title, "listenType": "1", "duration": listened, "createTime": time.Now().UTC().Format("20060102150405"), "playCount": 1, "songDuration": duration}}}, &result)
}
