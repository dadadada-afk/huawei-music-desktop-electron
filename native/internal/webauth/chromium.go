package webauth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"huawei-music-desktop/native/internal/huawei"
)

// ChromiumAuthorize owns a disposable browser profile and its loopback CDP
// connection. Credentials and navigation URLs never reach logs or disk in our app.
func ChromiumAuthorize(ctx context.Context, attempt *huawei.Attempt) (string, error) {
	return chromiumAuthorize(ctx, attempt.AuthorizeURL(), false)
}
func chromiumAuthorize(ctx context.Context, authorizeURL string, headless bool) (string, error) {
	binary := browserBinary()
	if binary == "" {
		return "", errors.New("compatible authorization browser not installed")
	}
	dir, err := os.MkdirTemp("", "hwmusic-auth-")
	if err != nil {
		return "", errors.New("temporary browser profile unavailable")
	}
	defer os.RemoveAll(dir)
	args := []string{"--user-data-dir=" + dir, "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--no-first-run", "--no-default-browser-check", "--disable-sync", "--disable-background-networking", "--disable-extensions", "--incognito", "--app=about:blank"}
	if headless {
		args = append(args, "--headless=new")
	}
	cmd := exec.CommandContext(ctx, binary, args...)
	if err = cmd.Start(); err != nil {
		return "", errors.New("authorization browser failed to start")
	}
	exited := make(chan struct{})
	go func() { _ = cmd.Wait(); close(exited) }()
	defer func() { _ = cmd.Process.Kill(); <-exited }()
	var port string
	deadline := time.NewTimer(15 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(50 * time.Millisecond)
	defer tick.Stop()
wait:
	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-exited:
			return "", errors.New("authorization browser closed")
		case <-deadline.C:
			return "", errors.New("authorization browser startup timed out")
		case <-tick.C:
			data, err := os.ReadFile(filepath.Join(dir, "DevToolsActivePort"))
			if err == nil {
				parts := strings.Split(string(data), "\n")
				if len(parts) > 1 {
					port = parts[0]
					break wait
				}
			}
		}
	}
	for _, r := range port {
		if r < '0' || r > '9' {
			return "", errors.New("invalid browser endpoint")
		}
	}
	transport := &http.Transport{Proxy: nil}
	defer transport.CloseIdleConnections()
	client := &http.Client{Timeout: 3 * time.Second, Transport: transport}
	endpoint := ""
	for endpoint == "" {
		req, _ := http.NewRequestWithContext(ctx, "GET", "http://127.0.0.1:"+port+"/json/list", nil)
		res, e := client.Do(req)
		if e == nil {
			var targets []struct{ Type, WebSocketDebuggerURL string }
			e = json.NewDecoder(http.MaxBytesReader(nil, res.Body, 1024*1024)).Decode(&targets)
			res.Body.Close()
			if e == nil {
				for _, t := range targets {
					if t.Type == "page" {
						endpoint = t.WebSocketDebuggerURL
						break
					}
				}
			}
		}
		if endpoint != "" {
			break
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-exited:
			return "", errors.New("authorization browser closed")
		case <-deadline.C:
			return "", errors.New("browser target unavailable")
		case <-tick.C:
		}
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "ws" || u.Host != "127.0.0.1:"+port {
		return "", errors.New("browser target rejected")
	}
	conn, _, err := (&websocket.Dialer{Proxy: nil, HandshakeTimeout: 3 * time.Second}).DialContext(ctx, endpoint, nil)
	if err != nil {
		return "", errors.New("browser connection failed")
	}
	defer conn.Close()
	defer func() {
		_ = conn.SetWriteDeadline(time.Now().Add(time.Second))
		_ = conn.WriteJSON(map[string]any{"id": 999999, "method": "Browser.close"})
	}()
	conn.SetReadLimit(2 * 1024 * 1024)
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()
	id := 0
	send := func(method string, params any) error {
		id++
		return conn.WriteJSON(map[string]any{"id": id, "method": method, "params": params})
	}
	for _, command := range []struct {
		method string
		params any
	}{
		{"Page.enable", map[string]any{}},
		{"Network.enable", map[string]any{}},
		{"Browser.setDownloadBehavior", map[string]any{"behavior": "deny"}},
		{"Fetch.enable", map[string]any{"patterns": []any{map[string]any{"urlPattern": "*", "requestStage": "Response"}}}},
		{"Page.navigate", map[string]any{"url": authorizeURL}},
	} {
		if send(command.method, command.params) != nil {
			return "", errors.New("browser setup failed")
		}
	}
	for {
		var event struct {
			Method string
			Params json.RawMessage
			ID     int
			Error  *struct{ Code int }
		}
		if conn.ReadJSON(&event) != nil {
			if ctx.Err() != nil {
				return "", ctx.Err()
			}
			return "", errors.New("authorization browser closed")
		}
		if event.Error != nil && event.ID != 3 {
			return "", errors.New("browser authorization control failed")
		}
		if callback := callbackFromEvent(event.Method, event.Params); callback != "" {
			return callback, nil
		}
		if event.Method == "Fetch.requestPaused" {
			var p struct{ RequestID string }
			if json.Unmarshal(event.Params, &p) == nil {
				if send("Fetch.continueRequest", map[string]any{"requestId": p.RequestID}) != nil {
					return "", errors.New("browser navigation interrupted")
				}
			}
		}
	}
}

func callbackFromEvent(method string, data []byte) string {
	var p struct {
		URL     string `json:"url"`
		Request struct {
			URL string `json:"url"`
		} `json:"request"`
		Headers []struct{ Name, Value string } `json:"responseHeaders"`
	}
	if json.Unmarshal(data, &p) != nil {
		return ""
	}
	if method == "Fetch.requestPaused" {
		for _, h := range p.Headers {
			if strings.EqualFold(h.Name, "location") && huawei.IsCallback(h.Value) {
				return h.Value
			}
		}
		if huawei.IsCallback(p.Request.URL) {
			return p.Request.URL
		}
	}
	if method == "Page.frameRequestedNavigation" && huawei.IsCallback(p.URL) {
		return p.URL
	}
	return ""
}
func browserBinary() string {
	if explicit := os.Getenv("HWMUSIC_AUTH_BROWSER"); explicit != "" {
		if info, err := os.Stat(explicit); err == nil && !info.IsDir() {
			return explicit
		}
		return ""
	}
	var paths []string
	if runtime.GOOS == "windows" {
		for _, base := range []string{os.Getenv("PROGRAMFILES"), os.Getenv("PROGRAMFILES(X86)"), os.Getenv("LOCALAPPDATA")} {
			if base != "" {
				paths = append(paths, filepath.Join(base, "Microsoft/Edge/Application/msedge.exe"), filepath.Join(base, "Google/Chrome/Application/chrome.exe"))
			}
		}
	}
	if runtime.GOOS == "darwin" {
		paths = []string{"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Helium.app/Contents/MacOS/Helium"}
	}
	for _, p := range paths {
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return p
		}
	}
	for _, name := range []string{"chromium", "chromium-browser", "google-chrome", "microsoft-edge"} {
		if p, err := exec.LookPath(name); err == nil {
			return p
		}
	}
	return ""
}
