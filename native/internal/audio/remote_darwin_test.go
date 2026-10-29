//go:build darwin && cgo

package audio

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// The public URL and every request still pass the production CDN allowlist.
// Only this test transport redirects the socket to a synthetic TLS server.
func TestRemoteRangePlayback(t *testing.T) {
	dir := os.Getenv("HWMUSIC_AUDIO_FIXTURES")
	if dir == "" {
		t.Skip("synthetic audio fixture directory required")
	}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(dir, filepath.Base(r.URL.Path)))
	}))
	defer server.Close()
	transport := server.Client().Transport.(*http.Transport).Clone()
	transport.TLSClientConfig.ServerName = "example.com"
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String())
	}
	original := http.DefaultTransport
	http.DefaultTransport = transport
	defer func() { http.DefaultTransport = original; transport.CloseIdleConnections() }()
	for _, name := range []string{"tone.mp3", "tone.flac"} {
		t.Run(name, func(t *testing.T) {
			p, err := OpenRemote(context.Background(), "https://fixture.dbankcdn.cn/"+name)
			if err != nil {
				t.Fatal(err)
			}
			defer p.Close()
			ready := await(t, p, func(s State) bool { return s.Ready && s.Duration > 3 })
			p.Play()
			await(t, p, func(s State) bool { return s.Position > .2 })
			p.Pause()
			if err := p.Seek(ready.Duration - .4); err != nil {
				t.Fatal(err)
			}
			await(t, p, func(s State) bool { return s.Position > ready.Duration-.5 })
			p.Play()
			await(t, p, func(s State) bool { return s.Ended })
			start := time.Now()
			p.Close()
			if time.Since(start) > time.Second {
				t.Fatal("close waited on uncancelled network")
			}
		})
	}
}
