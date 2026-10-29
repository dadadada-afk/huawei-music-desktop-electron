package main

import (
	"context"
	"errors"
	"strings"

	"github.com/vivaui/viva/app"
	"github.com/vivaui/viva/ui"
	"huawei-music-desktop/native/internal/huawei"
)

type browserRequest struct {
	ctx    context.Context
	url    string
	result chan string
}
type browserState struct {
	browserRequests []browserRequest
	browserPending  *browserRequest
}

var pasteCallbackID = tree.ID(shell, "paste-login-callback")

func (m *model) browserAuthorize(ctx context.Context, attempt *huawei.Attempt) (string, error) {
	r := browserRequest{ctx: ctx, url: attempt.AuthorizeURL(), result: make(chan string, 1)}
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return "", errors.New("application closed")
	}
	m.browserRequests = append(m.browserRequests, r)
	m.mu.Unlock()
	m.requestUpdate()
	select {
	case raw := <-r.result:
		if raw == "" {
			return "", errors.New("browser unavailable")
		}
		return raw, nil
	case <-ctx.Done():
		return "", errors.New("authorization cancelled")
	}
}
func (m *model) applyBrowser() {
	m.mu.Lock()
	requests := m.browserRequests
	m.browserRequests = nil
	m.mu.Unlock()
	for _, r := range requests {
		if r.ctx.Err() != nil {
			continue
		}
		if err := app.OpenURL(r.url); err != nil {
			r.result <- ""
			continue
		}
		m.browserPending = &r
	}
	if m.browserPending != nil && m.browserPending.ctx.Err() != nil {
		m.browserPending = nil
	}
}
func (m *model) paintBrowser(c *ui.Canvas, size ui.Size) {
	modalFocus(c, browserDialogScope, pasteCallbackID, cancelID)
	defer c.PopFocusScope()
	c.PushLayer(5)
	defer c.PopLayer()
	c.Fill(rect(0, 0, size.Width, size.Height), color(0x16181c, .35))
	c.Block(rect(0, 0, size.Width, size.Height))
	b := rect(size.Width/2-270, size.Height/2-130, 540, 260)
	m.panel(c, b, 18, 1)
	m.text(c, "在默认浏览器完成华为授权", rect(b.X+24, b.Y+24, 490, 34), 22, 600, m.ink())
	m.text(c, "授权完成后复制 hms://redirect_uri 回调链接。", rect(b.X+24, b.Y+82, 490, 28), 13, 400, m.secondary())
	m.text(c, "点击下方按钮粘贴；链接仅用于本次登录，不保存。", rect(b.X+24, b.Y+116, 490, 28), 13, 400, m.secondary())
	if m.pill(c, pasteCallbackID, rect(b.X+24, b.Y+184, 180, 36), "粘贴授权回调", true) {
		raw, err := app.ClipboardText()
		raw = strings.TrimSpace(raw)
		if err != nil || len(raw) > 16384 || !huawei.IsCallback(raw) {
			m.status = "剪贴板不是有效的华为授权回调"
		} else {
			select {
			case m.browserPending.result <- raw:
				m.browserPending = nil
			default:
			}
		}
	}
	if m.pill(c, cancelID, rect(b.X+402, b.Y+184, 110, 36), "取消登录", false) {
		m.cancelLogin()
		m.browserPending = nil
	}
}
