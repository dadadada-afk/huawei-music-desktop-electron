package huawei

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
)

func TestFavoriteRequiresReadback(t *testing.T) {
	for _, updated := range []bool{false, true} {
		t.Run(map[bool]string{true: "confirmed", false: "false-success"}[updated], func(t *testing.T) {
			writes := 0
			c := newClient(transportFunc(func(r *http.Request) (*http.Response, error) {
				if strings.HasSuffix(r.URL.Path, "/exist") {
					exist := "0"
					if updated && writes > 0 {
						exist = "1"
					}
					return response(`{"result":{"resultCode":"000000"},"exist":"`+exist+`"}`, 200), nil
				}
				if !strings.HasSuffix(r.URL.Path, "/favorite/create") {
					t.Fatal("wrong mutation endpoint")
				}
				writes++
				return response(`{"result":{"resultCode":"000000"}}`, 200), nil
			}))
			err := NewWriter(c, &Session{token: "fixture", snsUserID: "fixture"}, nil, nil).SetFavorite(context.Background(), "track", true)
			if (err == nil) != updated || writes != 1 {
				t.Fatal("favorite accepted without matching readback")
			}
		})
	}
}
func TestDescriptionMissingFieldIsNotEmptySuccess(t *testing.T) {
	c := newClient(transportFunc(func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "/simple/all") {
			return response(`{"result":{"resultCode":"000000"},"favoriteInfos":[{"contentID":"owned","contentName":"Fixture","contentType":5}]}`, 200), nil
		}
		return response(`{"result":{"resultCode":"000000"}}`, 200), nil
	}))
	if err := NewWriter(c, &Session{token: "fixture", snsUserID: "fixture"}, nil, nil).UpdateDescription(context.Background(), "owned", ""); err == nil {
		t.Fatal("missing description counted as confirmation")
	}
}
func TestDeleteRejectsNonOwnedAndUsesPlaylistEndpoint(t *testing.T) {
	for _, owned := range []bool{false, true} {
		writes := 0
		c := newClient(transportFunc(func(r *http.Request) (*http.Response, error) {
			if strings.HasSuffix(r.URL.Path, "/simple/all") {
				kind := "4"
				if owned {
					kind = "5"
				}
				items := `[{"contentID":"list","contentName":"Fixture","contentType":` + kind + `}]`
				if writes > 0 {
					items = `[]`
				}
				return response(`{"result":{"resultCode":"000000"},"favoriteInfos":`+items+`}`, 200), nil
			}
			if !strings.HasSuffix(r.URL.Path, "/playlist/delete") {
				t.Fatal("wrong delete endpoint")
			}
			writes++
			return response(`{"result":{"resultCode":"000000"}}`, 200), nil
		}))
		err := NewWriter(c, &Session{token: "fixture", snsUserID: "fixture"}, nil, nil).DeletePlaylist(context.Background(), "list")
		if (err == nil) != owned || writes != map[bool]int{true: 1, false: 0}[owned] {
			t.Fatal("ownership/delete check failed")
		}
	}
}
func TestUncertainCreationSurvivesWriterRestart(t *testing.T) {
	pending, writes := false, 0
	c := newClient(transportFunc(func(r *http.Request) (*http.Response, error) {
		if strings.HasSuffix(r.URL.Path, "/simple/all") {
			return response(`{"result":{"resultCode":"000000"},"favoriteInfos":[]}`, 200), nil
		}
		if !pending {
			t.Fatal("write sent before journal")
		}
		writes++
		return nil, errors.New("synthetic connection loss")
	}))
	for range 2 {
		w := NewWriter(c, &Session{token: "fixture", snsUserID: "fixture"}, func(v bool) error { pending = v; return nil }, func() (bool, error) { return pending, nil })
		if _, err := w.CreatePlaylist(context.Background(), "Fixture", []string{"track"}); err == nil {
			t.Fatal("unconfirmed creation accepted")
		}
	}
	if writes != 1 || !pending {
		t.Fatal("uncertain creation retried")
	}
}

func TestCreationJournalReconcilesAfterLostResponse(t *testing.T) {
	var intent *CreationIntent
	writes := 0
	readable := false
	c := newClient(transportFunc(func(r *http.Request) (*http.Response, error) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/simple/all"):
			items := `[]`
			if writes > 0 && readable {
				items = `[{"contentID":"created","contentName":"Fixture","contentType":5}]`
			}
			return response(`{"result":{"resultCode":"000000"},"favoriteInfos":`+items+`}`, 200), nil
		case strings.HasSuffix(r.URL.Path, "/playlist/create"):
			if intent == nil {
				t.Fatal("missing persisted intent")
			}
			writes++
			return nil, errors.New("synthetic lost response")
		case strings.HasSuffix(r.URL.Path, "/playlist/detail/all"):
			return response(`{"result":{"resultCode":"000000"},"playListInfoEx":{"playListSongInfoList":[{"songCode":"track","songName":"Fixture"}]}}`, 200), nil
		}
		t.Fatal("unexpected route")
		return nil, nil
	}))
	newWriter := func() *Writer {
		return NewWriter(c, &Session{token: "fixture", snsUserID: "fixture"}, nil, nil).WithCreationJournal(func() (*CreationIntent, error) { return intent, nil }, func(v *CreationIntent) error { intent = v; return nil })
	}
	if _, err := newWriter().CreatePlaylist(context.Background(), "Fixture", []string{"track"}); err == nil || intent == nil {
		t.Fatal("lost response not retained")
	}
	readable = true
	id, err := newWriter().CreatePlaylist(context.Background(), "Different request", []string{"other"})
	if err != nil || id != "created" || writes != 1 || intent != nil {
		t.Fatal("reconciliation resent or did not verify original operation")
	}
}
