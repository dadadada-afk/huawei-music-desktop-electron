package huawei

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type expiryTransport func(*http.Request) (*http.Response, error)

func (f expiryTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestSessionExpiryClassification(t *testing.T) {
	for _, test := range []struct {
		status                 int
		body                   string
		authenticated, expired bool
	}{
		{401, `{}`, true, true},
		{401, `{}`, false, false},
		{403, `{}`, true, false},
		{503, `{}`, true, false},
		{200, `{"result":{"resultCode":"990006"}}`, true, false},
		{200, `{"result":{"resultCode":"expired","resultMessage":"token has expired"}}`, true, true},
		{200, `{"result":{"resultCode":"expired","resultMessage":"会话已过期"}}`, false, false},
		{200, `{"result":{"resultCode":"000000","resultMessage":"token has expired"}}`, true, false},
	} {
		c := newClient(expiryTransport(func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: test.status, Body: io.NopCloser(strings.NewReader(test.body)), Header: make(http.Header)}, nil
		}))
		token := ""
		if test.authenticated {
			token = "synthetic"
		}
		headers, _ := musicHeaders(token, time.Now())
		var out envelope
		err := c.post(context.Background(), MusicEndpoint, "test", "application/json", nil, headers, &out, true)
		if SessionExpired(err) != test.expired {
			t.Fatalf("classification HTTP %d body %s", test.status, test.body)
		}
	}
	if SessionExpired(errors.New("network failed")) {
		t.Fatal("network classified as expired")
	}
}
func TestCoverAlternates(t *testing.T) {
	track, ok := normalize([]byte(`{"contentID":"a","contentName":"song","picture":{"bigImgURL":"https://unsafe.invalid/a","middleImgURL":"https://fixture.dbankcdn.cn/m","smallImgURL":"https://fixture.dbankcdn.cn/s"},"coverUrl":"https://fixture.dbankcdn.cn/c"}`))
	if !ok || len(track.CoverURLs) != 3 || track.CoverURL != "https://fixture.dbankcdn.cn/m" {
		t.Fatal("missing safe cover alternatives", track)
	}
}
