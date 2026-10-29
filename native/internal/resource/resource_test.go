package resource

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type transport func(*http.Request) (*http.Response, error)

func (t transport) RoundTrip(r *http.Request) (*http.Response, error) { return t(r) }
func TestRangesAndRedirectBoundary(t *testing.T) {
	calls := 0
	c := newClient(transport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
			t.Fatal("credentials sent to CDN")
		}
		return &http.Response{StatusCode: 206, Header: http.Header{"Content-Range": {"bytes 10-13/100"}}, Body: io.NopCloser(strings.NewReader("data"))}, nil
	}), func(s string) bool { return strings.HasPrefix(s, "https://trusted.invalid/") })
	chunk, err := c.Range(context.Background(), "https://trusted.invalid/audio", 10, 4)
	if err != nil || chunk.Total != 100 || string(chunk.Bytes) != "data" {
		t.Fatal("range failed")
	}
	if _, err = c.Range(context.Background(), "http://localhost/audio", 0, 4); err == nil || calls != 1 {
		t.Fatal("unsafe URL requested")
	}
	c.http.Transport = transport(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": {"https://evil.invalid/?secret=x"}}, Body: io.NopCloser(strings.NewReader(""))}, nil
	})
	if _, err = c.Range(context.Background(), "https://trusted.invalid/audio", 0, 4); err == nil || strings.Contains(err.Error(), "secret") || calls != 2 {
		t.Fatal("redirect followed or leaked")
	}
}
func TestBadContentRangeRejected(t *testing.T) {
	for _, value := range []string{"bytes 0-3/100", "bytes 10-999/1000", "bytes 10-13/*", "bytes 10-13/12"} {
		c := newClient(transport(func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 206, Header: http.Header{"Content-Range": {value}}, Body: io.NopCloser(strings.NewReader("data"))}, nil
		}), func(string) bool { return true })
		if _, err := c.Range(context.Background(), "https://fixture.invalid", 10, 4); err == nil {
			t.Fatal("bad range accepted")
		}
	}
}

func TestTruncatedInitialProbeRejected(t *testing.T) {
	c := newClient(transport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, ContentLength: 100, Body: io.NopCloser(strings.NewReader("x")), Header: make(http.Header)}, nil
	}), func(string) bool { return true })
	if _, err := c.Range(context.Background(), "https://fixture.invalid", 0, 4); err == nil {
		t.Fatal("truncated probe accepted")
	}
}
